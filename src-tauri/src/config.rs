use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};
use chrono::Local;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub refresh_interval: u64, // in seconds: 15, 30, 60, 120, 300
    pub thresholds: Vec<u32>,   // percentages: e.g. [75, 80, 90, 95, 100]
    pub theme: String,          // "light" | "dark" | "system"
    pub autostart: bool,
    pub minimize_to_tray: bool,
    pub notifications_enabled: bool,
    pub custom_token: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            refresh_interval: 30,
            thresholds: vec![75, 80, 90, 95, 100],
            theme: "system".to_string(),
            autostart: false,
            minimize_to_tray: true,
            notifications_enabled: true,
            custom_token: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub timestamp: String, // ISO 8601 string
    pub five_hour_utilization: f64,
    pub seven_day_utilization: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

static LOGS: OnceLock<Mutex<Vec<LogEntry>>> = OnceLock::new();

/// Log a message to the in-memory log buffer and standard error/output
pub fn log_msg(level: &str, message: &str) {
    let timestamp = Local::now().to_rfc3339();
    println!("[{}][{}] {}", timestamp, level.to_uppercase(), message);

    let logs_mutex = LOGS.get_or_init(|| Mutex::new(Vec::new()));
    if let Ok(mut logs) = logs_mutex.lock() {
        logs.push(LogEntry {
            timestamp,
            level: level.to_string(),
            message: message.to_string(),
        });
        if logs.len() > 300 {
            logs.remove(0); // keep last 300 logs
        }
    }
}

/// Retrieve all logs from the buffer
pub fn get_logs() -> Vec<LogEntry> {
    let logs_mutex = LOGS.get_or_init(|| Mutex::new(Vec::new()));
    if let Ok(logs) = logs_mutex.lock() {
        logs.clone()
    } else {
        Vec::new()
    }
}

/// Gets the application configuration path
fn get_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create app config dir: {}", e))?;
    }
    Ok(dir)
}

/// Loads Settings from the settings.json file
pub fn load_settings(app: &AppHandle) -> Settings {
    let dir = match get_config_dir(app) {
        Ok(d) => d,
        Err(e) => {
            log_msg("error", &format!("Cannot get config path: {}", e));
            return Settings::default();
        }
    };
    let file_path = dir.join("settings.json");
    if !file_path.exists() {
        let default_settings = Settings::default();
        let _ = save_settings(app, &default_settings);
        return default_settings;
    }

    match fs::read_to_string(&file_path) {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(settings) => settings,
            Err(e) => {
                log_msg("error", &format!("Failed to parse settings.json: {}. Resetting to default.", e));
                Settings::default()
            }
        },
        Err(e) => {
            log_msg("error", &format!("Failed to read settings.json: {}. Using default.", e));
            Settings::default()
        }
    }
}

/// Saves Settings to the settings.json file
pub fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let dir = get_config_dir(app)?;
    let file_path = dir.join("settings.json");
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write settings.json: {}", e))?;
    Ok(())
}

/// Loads usage history from the history.json file
pub fn load_history(app: &AppHandle) -> Vec<HistoryEntry> {
    let dir = match get_config_dir(app) {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };
    let file_path = dir.join("history.json");
    if !file_path.exists() {
        return Vec::new();
    }

    match fs::read_to_string(&file_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| Vec::new()),
        Err(_) => Vec::new(),
    }
}

/// Saves usage history to the history.json file
pub fn save_history(app: &AppHandle, history: &[HistoryEntry]) -> Result<(), String> {
    let dir = get_config_dir(app)?;
    let file_path = dir.join("history.json");
    let content = serde_json::to_string_pretty(history)
        .map_err(|e| format!("Failed to serialize history: {}", e))?;
    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write history.json: {}", e))?;
    Ok(())
}

/// Appends a new entry to the history file, keeping it capped at 500 entries.
pub fn append_history(app: &AppHandle, five_hour: f64, seven_day: f64) {
    let mut history = load_history(app);
    history.push(HistoryEntry {
        timestamp: Local::now().to_rfc3339(),
        five_hour_utilization: five_hour,
        seven_day_utilization: seven_day,
    });

    if history.len() > 500 {
        history.remove(0);
    }

    if let Err(e) = save_history(app, &history) {
        log_msg("error", &format!("Failed to save history: {}", e));
    }
}
