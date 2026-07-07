use serde::Deserialize;
use keyring::Entry;
use std::env;

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeAiOauth {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<u64>,
    pub subscription_type: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KeychainPayload {
    pub claude_ai_oauth: Option<ClaudeAiOauth>,
}

/// Resolves the current system username.
fn get_system_username() -> String {
    env::var("USER")
        .or_else(|_| env::var("USERNAME"))
        .unwrap_or_else(|_| "admin".to_string())
}

/// Attempts to retrieve the Claude Code OAuth credentials from the system keyring.
pub fn get_token_from_keychain() -> Result<ClaudeAiOauth, String> {
    let service = "Claude Code-credentials";
    let username = get_system_username();

    // 1. Try with dynamic system username
    let entry = Entry::new(service, &username);
    let password_res = match entry {
        Ok(e) => e.get_password(),
        Err(e) => Err(e),
    };

    let password = match password_res {
        Ok(pw) => pw,
        Err(err) => {
            // 2. Fallback to "admin"
            if username != "admin" {
                match Entry::new(service, "admin").and_then(|e| e.get_password()) {
                    Ok(pw) => pw,
                    Err(_) => return Err(format!("Keychain entry not found for user {} or admin: {}", username, err)),
                }
            } else {
                return Err(format!("Keychain entry not found for user {}: {}", username, err));
            }
        }
    };

    // Parse the JSON payload
    let payload: KeychainPayload = serde_json::from_str(&password)
        .map_err(|e| format!("Failed to parse keychain credentials JSON: {}", e))?;

    match payload.claude_ai_oauth {
        Some(oauth) => {
            if oauth.access_token.trim().is_empty() {
                Err("OAuth access token in keychain is empty".to_string())
            } else {
                Ok(oauth)
            }
        }
        None => Err("No 'claudeAiOauth' section found in keychain payload".to_string()),
    }
}
