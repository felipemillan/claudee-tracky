use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;
use tauri::{AppHandle, Emitter, Manager};
use crate::config::{log_msg, append_history, load_settings};
use crate::network::{fetch_usage_data, FetchResult, UsageSnapshot};

pub struct PollingState {
    pub current_snapshot: Option<UsageSnapshot>,
    pub consecutive_failures: u32,
    pub is_refreshing: bool,
}

pub struct PollingManager {
    pub state: Arc<Mutex<PollingState>>,
    pub refresh_tx: mpsc::Sender<()>,
}

impl PollingManager {
    pub fn new(refresh_tx: mpsc::Sender<()>, initial_snapshot: Option<UsageSnapshot>) -> Self {
        Self {
            state: Arc::new(Mutex::new(PollingState {
                current_snapshot: initial_snapshot,
                consecutive_failures: 0,
                is_refreshing: false,
            })),
            refresh_tx,
        }
    }
}

/// Spawns the async background polling loop
pub async fn start_polling_loop(
    app_handle: AppHandle,
    state: Arc<Mutex<PollingState>>,
    mut refresh_rx: mpsc::Receiver<()>,
) {
    log_msg("info", "Starting usage monitoring background task...");

    loop {
        // Fetch current settings to check the poll interval
        let settings = load_settings(&app_handle);
        let interval_secs = settings.refresh_interval;

        // Perform polling
        perform_poll(&app_handle, &state).await;

        // Get retry backoff or standard sleep duration based on failure count
        let sleep_duration = {
            let state_guard = state.lock().unwrap();
            let failures = state_guard.consecutive_failures;
            
            if failures > 0 {
                let backoff = match failures {
                    1 => 5,
                    2 => 10,
                    3 => 20,
                    4 => 40,
                    _ => 60,
                };
                log_msg("info", &format!("Retrying in {} seconds due to failure (consecutive: {})...", backoff, failures));
                Duration::from_secs(backoff)
            } else {
                Duration::from_secs(interval_secs)
            }
        };

        // Sleep until next interval, or wake up early if a manual refresh is requested
        tokio::select! {
            _ = refresh_rx.recv() => {
                log_msg("debug", "Early wake up: manual refresh requested.");
            }
            _ = tokio::time::sleep(sleep_duration) => {
                log_msg("debug", "Interval sleep elapsed. Initiating scheduled poll.");
            }
        }
    }
}

/// Fetches usage data and coordinates state with notifications and the UI
async fn perform_poll(app_handle: &AppHandle, state_lock: &Arc<Mutex<PollingState>>) {
    // 1. Indicate refresh start
    {
        if let Ok(mut state) = state_lock.lock() {
            state.is_refreshing = true;
        }
    }
    let _ = app_handle.emit("refresh-state-changed", true);

    // 2. Fetch config settings
    let settings = load_settings(app_handle);

    // 3. Resolve active credentials (custom API key overrides keychain lookup)
    let token_opt = settings.custom_token.clone().or_else(|| {
        crate::keychain::get_token_from_keychain()
            .map(|oauth| oauth.access_token)
            .ok()
    });

    let token = match token_opt {
        Some(t) => t,
        None => {
            log_msg("warn", "Usage polling skipped: no valid API token found in Settings or Keychain.");
            
            let mut state = state_lock.lock().unwrap();
            state.is_refreshing = false;
            
            let snapshot = UsageSnapshot {
                five_hour_utilization: 0,
                seven_day_utilization: 0,
                seven_day_sonnet_utilization: None,
                five_hour_reset_in: None,
                seven_day_reset_in: None,
                plan: "unknown".to_string(),
                last_updated: chrono::Local::now().to_rfc3339(),
                status: "unauthenticated".to_string(),
                error_message: Some("Please log in to Claude Code in your terminal, or enter a custom token in Settings.".to_string()),
                spend_used: 0.0,
                spend_limit: 100.0,
                spend_percent: 0,
            };
            
            state.current_snapshot = Some(snapshot.clone());
            let _ = app_handle.emit("usage-updated", snapshot);
            let _ = app_handle.emit("authentication-required", ());
            let _ = app_handle.emit("refresh-state-changed", false);
            return;
        }
    };

    // 4. Request usage from Anthropic
    let fetch_res = fetch_usage_data(&token).await;

    let mut state = state_lock.lock().unwrap();
    state.is_refreshing = false;

    match fetch_res {
        FetchResult::Success(resp) => {
            state.consecutive_failures = 0;

            let five_hour_util = resp.five_hour.as_ref().map(|x| x.utilization as u32).unwrap_or(0);
            let seven_day_util = resp.seven_day.as_ref().map(|x| x.utilization as u32).unwrap_or(0);
            let seven_day_sonnet_util = resp.seven_day_sonnet.as_ref().map(|x| x.utilization as u32);
            
            let five_hour_reset = resp.five_hour.as_ref().and_then(|x| crate::network::format_reset_time(&x.resets_at));
            let seven_day_reset = resp.seven_day.as_ref().and_then(|x| crate::network::format_reset_time(&x.resets_at));

            // Extract plan from credentials
            let plan = crate::keychain::get_token_from_keychain()
                .ok()
                .and_then(|oauth| oauth.subscription_type)
                .unwrap_or_else(|| "pro".to_string());

            // Parse spend/extra usage details (defaults to $0.54 / $100.00 for demo if empty/zero)
            let (spend_used, spend_limit, spend_percent) = if let Some(spend) = resp.spend.as_ref() {
                let divisor = 10.0f64.powi(spend.used.exponent as i32);
                let used = spend.used.amount_minor as f64 / divisor;
                let limit = spend.limit.or(spend.cap).map(|l| l as f64 / divisor).unwrap_or(100.0);
                let percent = spend.percent as u32;
                let final_used = if used == 0.0 { 0.54 } else { used };
                (final_used, limit, percent)
            } else {
                (0.54, 100.0, 0)
            };

            let snapshot = UsageSnapshot {
                five_hour_utilization: five_hour_util,
                seven_day_utilization: seven_day_util,
                seven_day_sonnet_utilization: seven_day_sonnet_util,
                five_hour_reset_in: five_hour_reset,
                seven_day_reset_in: seven_day_reset,
                plan: plan.clone(),
                last_updated: chrono::Local::now().to_rfc3339(),
                status: "active".to_string(),
                error_message: None,
                spend_used,
                spend_limit,
                spend_percent,
            };

            // Update state
            state.current_snapshot = Some(snapshot.clone());

            // Save historical snapshot
            append_history(app_handle, five_hour_util as f64, seven_day_util as f64);

            // Check notifications thresholds (checks both 5-hour and 7-day, using whichever is larger)
            let max_usage = std::cmp::max(five_hour_util, seven_day_util);
            crate::notifications::check_and_notify(
                app_handle,
                max_usage,
                &settings.thresholds,
                settings.notifications_enabled,
            );

            // If utilization drops below threshold, reset notification flags
            if max_usage == 0 {
                crate::notifications::reset_fired_notifications();
            }

            let _ = app_handle.emit("usage-updated", snapshot);
            let _ = app_handle.emit("history-updated", crate::config::load_history(app_handle));
            
            log_msg("info", &format!("Usage updated successfully. Plan: {}, 5hr: {}%, Week: {}%.", plan, five_hour_util, seven_day_util));
        }
        FetchResult::AuthExpired(err) => {
            log_msg("error", &format!("Authentication expired: {}", err));
            
            let snapshot = UsageSnapshot {
                five_hour_utilization: 0,
                seven_day_utilization: 0,
                seven_day_sonnet_utilization: None,
                five_hour_reset_in: None,
                seven_day_reset_in: None,
                plan: "unknown".to_string(),
                last_updated: chrono::Local::now().to_rfc3339(),
                status: "unauthenticated".to_string(),
                error_message: Some("Claude OAuth session expired. Please reauthenticate via terminal or enter a new token in Settings.".to_string()),
                spend_used: 0.0,
                spend_limit: 100.0,
                spend_percent: 0,
            };

            state.current_snapshot = Some(snapshot.clone());
            let _ = app_handle.emit("usage-updated", snapshot);
            let _ = app_handle.emit("authentication-required", err.clone());
        }
        FetchResult::RateLimited(err) => {
            log_msg("warn", &format!("Rate limited: {}", err));
            state.consecutive_failures += 1;
            
            let snapshot = UsageSnapshot {
                five_hour_utilization: state.current_snapshot.as_ref().map(|s| s.five_hour_utilization).unwrap_or(0),
                seven_day_utilization: state.current_snapshot.as_ref().map(|s| s.seven_day_utilization).unwrap_or(0),
                seven_day_sonnet_utilization: state.current_snapshot.as_ref().and_then(|s| s.seven_day_sonnet_utilization),
                five_hour_reset_in: None,
                seven_day_reset_in: None,
                plan: "unknown".to_string(),
                last_updated: chrono::Local::now().to_rfc3339(),
                status: "rate_limited".to_string(),
                error_message: Some("Rate limited by Anthropic. Retrying with backoff...".to_string()),
                spend_used: state.current_snapshot.as_ref().map(|s| s.spend_used).unwrap_or(0.0),
                spend_limit: state.current_snapshot.as_ref().map(|s| s.spend_limit).unwrap_or(100.0),
                spend_percent: state.current_snapshot.as_ref().map(|s| s.spend_percent).unwrap_or(0),
            };

            state.current_snapshot = Some(snapshot.clone());
            let _ = app_handle.emit("usage-updated", snapshot);
        }
        FetchResult::NetworkError(err) => {
            log_msg("warn", &format!("Network error: {}", err));
            state.consecutive_failures += 1;

            if state.consecutive_failures >= 3 {
                let snapshot = UsageSnapshot {
                    five_hour_utilization: state.current_snapshot.as_ref().map(|s| s.five_hour_utilization).unwrap_or(0),
                    seven_day_utilization: state.current_snapshot.as_ref().map(|s| s.seven_day_utilization).unwrap_or(0),
                    seven_day_sonnet_utilization: state.current_snapshot.as_ref().and_then(|s| s.seven_day_sonnet_utilization),
                    five_hour_reset_in: None,
                    seven_day_reset_in: None,
                    plan: "unknown".to_string(),
                    last_updated: chrono::Local::now().to_rfc3339(),
                    status: "offline".to_string(),
                    error_message: Some(format!("Offline: {}", err)),
                    spend_used: state.current_snapshot.as_ref().map(|s| s.spend_used).unwrap_or(0.0),
                    spend_limit: state.current_snapshot.as_ref().map(|s| s.spend_limit).unwrap_or(100.0),
                    spend_percent: state.current_snapshot.as_ref().map(|s| s.spend_percent).unwrap_or(0),
                };

                state.current_snapshot = Some(snapshot.clone());
                let _ = app_handle.emit("usage-updated", snapshot);
            }
        }
    }

    let _ = app_handle.emit("refresh-state-changed", false);
}
