use tauri::{AppHandle, Manager, State};
use crate::config::{Settings, HistoryEntry, LogEntry, load_settings, save_settings, load_history, save_history, get_logs};
use crate::polling::PollingManager;
use crate::network::UsageSnapshot;

#[tauri::command]
pub async fn get_app_settings(app: AppHandle) -> Result<Settings, String> {
    Ok(load_settings(&app))
}

#[tauri::command]
pub async fn save_app_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    save_settings(&app, &settings)?;
    // If settings are saved, wake up the polling thread to pick up the new interval immediately
    Ok(())
}

#[tauri::command]
pub async fn get_usage_history(app: AppHandle) -> Result<Vec<HistoryEntry>, String> {
    Ok(load_history(&app))
}

#[tauri::command]
pub async fn clear_usage_history(app: AppHandle) -> Result<(), String> {
    save_history(&app, &Vec::new())?;
    Ok(())
}

#[tauri::command]
pub async fn get_app_logs() -> Result<Vec<LogEntry>, String> {
    Ok(get_logs())
}

#[tauri::command]
pub async fn force_refresh_usage(state: State<'_, PollingManager>) -> Result<(), String> {
    state.refresh_tx.send(())
        .await
        .map_err(|e| format!("Failed to trigger manual refresh: {}", e))
}

#[tauri::command]
pub async fn get_current_snapshot_state(state: State<'_, PollingManager>) -> Result<Option<UsageSnapshot>, String> {
    if let Ok(guard) = state.state.lock() {
        Ok(guard.current_snapshot.clone())
    } else {
        Err("Failed to lock polling state".to_string())
    }
}

#[tauri::command]
pub async fn export_history_to_csv(app: AppHandle, file_path: String) -> Result<(), String> {
    let history = load_history(&app);
    let mut csv_content = "Timestamp,5-Hour Utilization %,7-Day Utilization %\n".to_string();
    
    for entry in history {
        csv_content.push_str(&format!(
            "{},{},{}\n",
            entry.timestamp,
            entry.five_hour_utilization,
            entry.seven_day_utilization
        ));
    }

    std::fs::write(&file_path, csv_content)
        .map_err(|e| format!("Failed to write CSV file: {}", e))?;
    
    crate::config::log_msg("info", &format!("Successfully exported usage history CSV to: {}", file_path));
    Ok(())
}

#[tauri::command]
pub async fn open_dashboard_window(app: AppHandle) -> Result<(), String> {
    crate::tray::open_dashboard_window(&app);
    Ok(())
}

#[tauri::command]
pub async fn hide_popup(app: AppHandle) -> Result<(), String> {
    if let Some(popup) = app.get_webview_window("popup") {
        let _ = popup.hide();
    }
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProjectAnalytics {
    pub name: String,
    pub path: String,
    pub session_count: usize,
    pub last_active: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClaudeCliAnalytics {
    pub total_projects: usize,
    pub total_sessions: usize,
    pub total_todos: usize,
    pub active_projects: Vec<ProjectAnalytics>,
    pub global_settings: Option<serde_json::Value>,
    pub recent_todos: Vec<String>,
}

#[tauri::command]
pub async fn get_claude_cli_analytics(app: AppHandle) -> Result<Option<ClaudeCliAnalytics>, String> {
    let home = match std::env::var("HOME").map(std::path::PathBuf::from) {
        Ok(h) => h,
        Err(_) => match app.path().home_dir() {
            Ok(h) => h,
            Err(_) => return Ok(None),
        }
    };

    let claude_dir = home.join(".claude");
    if !claude_dir.exists() {
        return Ok(None);
    }

    // 1. Read global settings
    let settings_file = claude_dir.join("settings.json");
    let global_settings = if settings_file.exists() {
        std::fs::read_to_string(&settings_file)
            .ok()
            .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
    } else {
        None
    };

    // 2. Scan projects
    let projects_dir = claude_dir.join("projects");
    let mut active_projects = Vec::new();
    let mut total_sessions = 0;

    if projects_dir.exists() && projects_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&projects_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let folder_name = path.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("");
                    
                    // Decode the folder name back to a path (e.g. -Users-name-proj -> /Users/name/proj)
                    let decoded_path = if folder_name.starts_with('-') {
                        folder_name.replace('-', "/")
                    } else {
                        folder_name.to_string()
                    };

                    let project_name = std::path::Path::new(&decoded_path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(folder_name)
                        .to_string();

                    // Count session files (.jsonl)
                    let mut session_count = 0;
                    let mut latest_mod_time = chrono::DateTime::<chrono::Utc>::MIN_UTC;

                    if let Ok(files) = std::fs::read_dir(&path) {
                        for file_entry in files.flatten() {
                            let file_path = file_entry.path();
                            if file_path.is_file() && file_path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                                session_count += 1;
                                if let Ok(metadata) = file_entry.metadata() {
                                    if let Ok(modified) = metadata.modified() {
                                        let datetime: chrono::DateTime<chrono::Utc> = modified.into();
                                        if datetime > latest_mod_time {
                                            latest_mod_time = datetime;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    total_sessions += session_count;

                    let last_active_str = if latest_mod_time == chrono::DateTime::<chrono::Utc>::MIN_UTC {
                        "Unknown".to_string()
                    } else {
                        latest_mod_time.with_timezone(&chrono::Local).to_rfc3339()
                    };

                    active_projects.push(ProjectAnalytics {
                        name: project_name,
                        path: decoded_path,
                        session_count,
                        last_active: last_active_str,
                    });
                }
            }
        }
    }

    // Sort projects by recency of edits
    active_projects.sort_by(|a, b| b.last_active.cmp(&a.last_active));

    // 3. Scan Todos/Tasks
    let todos_dir = claude_dir.join("todos");
    let mut total_todos = 0;
    let mut recent_todos = Vec::new();

    if todos_dir.exists() && todos_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&todos_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        // Extract lines that look like task items
                        for line in content.lines() {
                            let trimmed = line.trim();
                            if !trimmed.is_empty() {
                                total_todos += 1;
                                if recent_todos.len() < 15 {
                                    recent_todos.push(trimmed.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(Some(ClaudeCliAnalytics {
        total_projects: active_projects.len(),
        total_sessions,
        total_todos,
        active_projects,
        global_settings,
        recent_todos,
    }))
}

