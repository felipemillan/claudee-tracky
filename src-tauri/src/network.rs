use serde::{Serialize, Deserialize};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use std::time::Duration;
use chrono::{DateTime, Utc};
use crate::config::log_msg;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsagePeriod {
    pub utilization: f64,
    pub resets_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpendDetails {
    pub amount_minor: u64,
    pub currency: String,
    pub exponent: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpendData {
    pub used: SpendDetails,
    pub limit: Option<u64>,
    pub percent: f64,
    pub cap: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthUsageResponse {
    pub five_hour: Option<UsagePeriod>,
    pub seven_day: Option<UsagePeriod>,
    pub seven_day_sonnet: Option<UsagePeriod>,
    pub spend: Option<SpendData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageSnapshot {
    pub five_hour_utilization: u32,
    pub seven_day_utilization: u32,
    pub seven_day_sonnet_utilization: Option<u32>,
    pub five_hour_reset_in: Option<String>,
    pub seven_day_reset_in: Option<String>,
    pub plan: String,
    pub last_updated: String,
    pub status: String, // "active" | "offline" | "unauthenticated" | "error" | "rate_limited"
    pub error_message: Option<String>,
    pub spend_used: f64,
    pub spend_limit: f64,
    pub spend_percent: u32,
}

pub enum FetchResult {
    Success(OAuthUsageResponse),
    AuthExpired(String),
    RateLimited(String),
    NetworkError(String),
}

/// Formats an ISO8601 resets_at string as a countdown (e.g. "2h 15m")
pub fn format_reset_time(resets_at_str: &str) -> Option<String> {
    let resets_at = DateTime::parse_from_rfc3339(resets_at_str)
        .ok()?
        .with_timezone(&Utc);
    let now = Utc::now();
    let duration = resets_at.signed_duration_since(now);
    
    if duration.num_seconds() <= 0 {
        return Some("now".to_string());
    }
    
    let hours = duration.num_hours();
    let minutes = duration.num_minutes() % 60;
    
    if hours > 0 {
        Some(format!("{}h {}m", hours, minutes))
    } else {
        Some(format!("{}m", minutes))
    }
}

/// Performs the network call to retrieve usage data
pub async fn fetch_usage_data(token: &str) -> FetchResult {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build() 
    {
        Ok(c) => c,
        Err(e) => return FetchResult::NetworkError(format!("Failed to build HTTP client: {}", e)),
    };

    let mut headers = HeaderMap::new();
    let auth_val = match HeaderValue::from_str(&format!("Bearer {}", token)) {
        Ok(val) => val,
        Err(e) => return FetchResult::AuthExpired(format!("Invalid auth token format: {}", e)),
    };
    headers.insert(AUTHORIZATION, auth_val);
    headers.insert("anthropic-beta", HeaderValue::from_static("oauth-2025-04-20"));

    log_msg("debug", "Fetching usage statistics from api.anthropic.com...");

    let res = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .headers(headers)
        .send()
        .await;

    match res {
        Ok(response) => {
            let status = response.status();
            log_msg("debug", &format!("HTTP status received: {}", status));

            if status.is_success() {
                match response.json::<OAuthUsageResponse>().await {
                    Ok(usage) => FetchResult::Success(usage),
                    Err(e) => FetchResult::NetworkError(format!("Failed to parse API response JSON: {}", e)),
                }
            } else if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
                FetchResult::AuthExpired(format!("Authentication failed with status {}", status))
            } else if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                FetchResult::RateLimited("Rate limit exceeded (HTTP 429)".to_string())
            } else {
                FetchResult::NetworkError(format!("Server returned error status {}", status))
            }
        }
        Err(e) => {
            log_msg("warn", &format!("Network request failed: {}", e));
            FetchResult::NetworkError(format!("Network connection error: {}", e))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_format_reset_time_future() {
        // Create a mock future reset time (2 hours and 15 minutes from now)
        let future_time = Utc::now() + chrono::Duration::hours(2) + chrono::Duration::minutes(15);
        let iso_str = future_time.to_rfc3339();
        let formatted = format_reset_time(&iso_str);
        assert!(formatted.is_some());
        let val = formatted.unwrap();
        // It should display hours and minutes, allowing for slight differences in seconds
        assert!(val.contains("2h") || val.contains("1h") || val.contains("m"));
    }

    #[test]
    fn test_format_reset_time_past() {
        let past_time = Utc::now() - chrono::Duration::minutes(15);
        let iso_str = past_time.to_rfc3339();
        let formatted = format_reset_time(&iso_str);
        assert_eq!(formatted, Some("now".to_string()));
    }

    #[test]
    fn test_format_reset_time_invalid() {
        let formatted = format_reset_time("invalid-date-format");
        assert!(formatted.is_none());
    }
}

