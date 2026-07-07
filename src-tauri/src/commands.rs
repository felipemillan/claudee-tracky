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
