use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;
use crate::config::log_msg;

// Keeps track of which thresholds have fired during this usage block.
static FIRED_THRESHOLDS: Mutex<Vec<u32>> = Mutex::new(Vec::new());

/// Evaluates the current usage percentage and fires alerts for any newly breached thresholds.
pub fn check_and_notify(app: &AppHandle, percentage: u32, thresholds: &[u32], enabled: bool) {
    if !enabled {
        return;
    }

    let mut fired = match FIRED_THRESHOLDS.lock() {
        Ok(guard) => guard,
        Err(_) => return, // Ignore mutex poisoning in background threads
    };

    // If usage drops (e.g. usage was reset), remove higher thresholds from the fired list
    fired.retain(|&t| t <= percentage);

    for &threshold in thresholds {
        if percentage >= threshold && !fired.contains(&threshold) {
            fired.push(threshold);
            
            log_msg("info", &format!("Usage threshold breached ({}% >= {}%). Triggering system notification.", percentage, threshold));
            
            let message = if threshold >= 100 {
                "You have reached 100% of your Claude Code usage limit!".to_string()
            } else {
                format!("Your Claude Code usage has reached {}% of your limit.", threshold)
            };

            // Trigger OS-level notification
            let _ = app.notification()
                .builder()
                .title("Claude Code Usage")
                .body(&message)
                .show();

            // Notify frontend
            let _ = app.emit("notification-fired", threshold);
        }
    }
}

/// Reset the fired notifications record manually (e.g. when usage reset is detected)
pub fn reset_fired_notifications() {
    if let Ok(mut fired) = FIRED_THRESHOLDS.lock() {
        fired.clear();
        log_msg("debug", "Usage reset detected: notification history cleared.");
    }
}
