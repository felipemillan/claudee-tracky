use serde::{Serialize, Deserialize};
use std::fs;
use std::process::{Command, Stdio};
use std::io::Write;
use std::time::Duration;
use tokio::time::sleep;
use crate::config::log_msg;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AntigravityModelQuota {
    pub label: String,
    pub model_id: String,
    pub remaining_percent: u32,
    pub used_percent: u32,
    pub is_exhausted: bool,
    pub time_until_reset: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AntigravityQuotaSnapshot {
    pub email: String,
    pub plan_label: String,
    pub models: Vec<AntigravityModelQuota>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct GoogleOAuthCreds {
    access_token: String,
    refresh_token: String,
    scope: String,
    token_type: String,
    id_token: String,
    expiry_date: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientModelConfig {
    label: Option<String>,
    model_or_alias: Option<ModelOrAlias>,
    quota_info: Option<RawQuotaInfo>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelOrAlias {
    model: Option<String>,
    alias: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawQuotaInfo {
    remaining_fraction: Option<f64>,
    reset_time: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CascadeModelConfigData {
    client_model_configs: Option<Vec<ClientModelConfig>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserStatus {
    cascade_model_config_data: Option<CascadeModelConfigData>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetUserStatusResponse {
    user_status: Option<UserStatus>,
    cascade_model_config_data: Option<CascadeModelConfigData>,
}

fn encode_varint(mut value: u64) -> Vec<u8> {
    let mut buf = Vec::new();
    while value >= 0x80 {
        buf.push((value & 0x7F) as u8 | 0x80);
        value >>= 7;
    }
    buf.push(value as u8);
    buf
}

fn encode_string_field(field_number: u32, value: &str) -> Vec<u8> {
    let key = (field_number << 3) | 2;
    let mut buf = encode_varint(key as u64);
    let bytes = value.as_bytes();
    buf.extend_from_slice(&encode_varint(bytes.len() as u64));
    buf.extend_from_slice(bytes);
    buf
}

fn build_metadata(api_key: &str) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend(encode_string_field(1, "antigravity"));
    out.extend(encode_string_field(3, api_key));
    out.extend(encode_string_field(4, "en-US"));
    out.extend(encode_string_field(5, "macOS"));
    out.extend(encode_string_field(7, "0.0.0"));
    out.extend(encode_string_field(12, "google.antigravity"));
    out.extend(encode_string_field(17, "/Applications/Antigravity IDE.app/Contents/Resources/app/extensions/antigravity"));
    out.extend(encode_string_field(24, "usagewatcher"));
    out.extend(encode_string_field(25, "menubar"));
    out
}

fn find_free_port() -> Option<u16> {
    std::net::TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|listener| listener.local_addr().ok())
        .map(|addr| addr.port())
}

fn format_reset_time_str(resets_at_str: &str) -> Option<String> {
    let resets_at = chrono::DateTime::parse_from_rfc3339(resets_at_str)
        .ok()?
        .with_timezone(&chrono::Utc);
    let now = chrono::Utc::now();
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

async fn get_google_creds() -> Result<(String, String, String, u64, String), String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    
    // Load active email from google_accounts.json if it exists
    let accounts_path = home.join(".gemini").join("google_accounts.json");
    let mut email = "Gemini Account".to_string();
    if accounts_path.exists() {
        if let Ok(content) = fs::read_to_string(&accounts_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(active) = json.get("active").and_then(|v| v.as_str()) {
                    email = active.to_string();
                }
            }
        }
    }
    
    let creds_path = home.join(".gemini").join("oauth_creds.json");
    if !creds_path.exists() {
        return Err("Google OAuth credentials file (~/.gemini/oauth_creds.json) not found".to_string());
    }
    
    let content = fs::read_to_string(&creds_path)
        .map_err(|e| format!("Failed to read oauth_creds.json: {}", e))?;
        
    let creds: GoogleOAuthCreds = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse oauth_creds.json: {}", e))?;
    
    Ok((
        creds.access_token,
        creds.refresh_token,
        creds.token_type,
        creds.expiry_date / 1000,
        email,
    ))
}

pub async fn fetch_antigravity_quota() -> Option<AntigravityQuotaSnapshot> {
    match fetch_antigravity_quota_inner().await {
        Ok(snapshot) => Some(snapshot),
        Err(e) => {
            log_msg("warn", &format!("Failed to fetch Antigravity quota: {}", e));
            None
        }
    }
}

async fn fetch_antigravity_quota_inner() -> Result<AntigravityQuotaSnapshot, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    
    // 1. Load local OAuth creds for fallback and email extraction
    let (access_token, refresh_token, token_type, expiry_sec, email) = get_google_creds().await?;
    
    // 2. Try to query already running servers (spawned by Antigravity IDE)
    let running_servers = get_running_servers();
    log_msg("debug", &format!("Found {} running Antigravity language server processes.", running_servers.len()));
    
    for server in running_servers {
        log_msg("debug", &format!("Attempting to query running server (PID {}) on ports {:?}", server.pid, server.ports));
        for port in server.ports {
            let status_url = format!("https://127.0.0.1:{}/exa.language_server_pb.LanguageServerService/GetUserStatus", port);
            let extension_path = "/Applications/Antigravity IDE.app/Contents/Resources/app/extensions/antigravity";
            let status_payload = serde_json::json!({
                "metadata": {
                    "ideName": "antigravity",
                    "locale": "en-US",
                    "os": "macOS",
                    "ideVersion": "0.0.0",
                    "extensionName": "google.antigravity",
                    "extensionPath": extension_path,
                    "deviceFingerprint": "usagewatcher",
                    "triggerId": "menubar"
                }
            });
            
            let client = match reqwest::Client::builder()
                .danger_accept_invalid_certs(true)
                .timeout(Duration::from_millis(800))
                .build()
            {
                Ok(c) => c,
                Err(_) => continue,
            };
            
            let res = client.post(&status_url)
                .header("Content-Type", "application/json")
                .header("Connect-Protocol-Version", "1")
                .header("x-codeium-csrf-token", &server.csrf_token)
                .json(&status_payload)
                .send()
                .await;
                
            if let Ok(response) = res {
                let status_code = response.status();
                if status_code.is_success() {
                    if let Ok(body_text) = response.text().await {
                        if let Ok(parsed) = serde_json::from_str::<GetUserStatusResponse>(&body_text) {
                            let config_data = parsed.cascade_model_config_data
                                .as_ref()
                                .or(parsed.user_status.as_ref().and_then(|us| us.cascade_model_config_data.as_ref()));
                            if let Some(cfg) = config_data {
                                if cfg.client_model_configs.is_some() {
                                    log_msg("info", &format!("Successfully retrieved quota from running server PID {} on port {}", server.pid, port));
                                    return parse_user_status_response(parsed, email);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    log_msg("info", "No active running language server returned valid quota config. Spawning fallback instance...");
    
    // 3. Fallback: Spawning language server
    let port = find_free_port().ok_or("No free TCP port available")?;
    let csrf_token = format!("{:x}", chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0));
    
    let ls_path = "/Applications/Antigravity IDE.app/Contents/Resources/app/extensions/antigravity/bin/language_server_macos_arm";
    if !std::path::Path::new(ls_path).exists() {
        return Err("Antigravity IDE language server binary not found".to_string());
    }
    
    let gemini_dir = home.join(".gemini").to_string_lossy().to_string();
    
    log_msg("debug", &format!("Spawning Antigravity language server on port {}...", port));
    
    let log_file = fs::File::create(home.join(".gemini").join("antigravity_ls.log"))
        .map_err(|e| format!("Failed to create LS log file: {}", e))?;
    let err_file = log_file.try_clone().unwrap();

    let mut child = Command::new(ls_path)
        .arg("-https_server_port")
        .arg(port.to_string())
        .arg("-enable_lsp=false")
        .arg("-csrf_token")
        .arg(&csrf_token)
        .arg("-cloud_code_endpoint")
        .arg("https://daily-cloudcode-pa.googleapis.com")
        .arg("-gemini_dir")
        .arg(&gemini_dir)
        .arg("-app_data_dir")
        .arg("antigravity-ide")
        .stdin(Stdio::piped())
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(err_file))
        .spawn()
        .map_err(|e| format!("Failed to spawn language server process: {}", e))?;
        
    // Write handshake metadata to stdin
    let metadata_bytes = build_metadata(&access_token);
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(&metadata_bytes).map_err(|e| format!("Failed to write metadata to stdin: {}", e))?;
        stdin.flush().map_err(|e| format!("Failed to flush stdin: {}", e))?;
    }
    
    // 4. Poll GetStatus until ready
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_millis(500))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
        
    let get_status_url = format!("https://127.0.0.1:{}/exa.language_server_pb.LanguageServerService/GetStatus", port);
    let mut ready = false;
    for _ in 0..15 {
        let res = client.post(&get_status_url)
            .header("Content-Type", "application/json")
            .header("Connect-Protocol-Version", "1")
            .header("x-codeium-csrf-token", &csrf_token)
            .json(&serde_json::json!({}))
            .send()
            .await;
            
        if let Ok(resp) = res {
            if resp.status().is_success() {
                ready = true;
                break;
            }
        }
        sleep(Duration::from_millis(150)).await;
    }
    
    if !ready {
        let _ = child.kill();
        return Err("Language server failed to respond on GetStatus".to_string());
    }
    
    // 5. Send SaveOAuthTokenInfo
    let save_url = format!("https://127.0.0.1:{}/exa.language_server_pb.LanguageServerService/SaveOAuthTokenInfo", port);
    let expiry_date_str = chrono::DateTime::from_timestamp(expiry_sec as i64, 0)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default();
        
    let save_payload = serde_json::json!({
        "tokenInfo": {
            "accessToken": access_token,
            "tokenType": token_type,
            "refreshToken": refresh_token,
            "expiry": expiry_date_str
        }
    });
    
    let res = client.post(&save_url)
        .header("Content-Type", "application/json")
        .header("Connect-Protocol-Version", "1")
        .header("x-codeium-csrf-token", &csrf_token)
        .json(&save_payload)
        .send()
        .await;
        
    if let Err(e) = res {
        let _ = child.kill();
        return Err(format!("Failed to save OAuth token info: {}", e));
    }
    
    // 6. GetUserStatus with retry loop
    let status_url = format!("https://127.0.0.1:{}/exa.language_server_pb.LanguageServerService/GetUserStatus", port);
    let extension_path = "/Applications/Antigravity IDE.app/Contents/Resources/app/extensions/antigravity";
    let status_payload = serde_json::json!({
        "metadata": {
            "ideName": "antigravity",
            "apiKey": access_token,
            "locale": "en-US",
            "os": "macOS",
            "ideVersion": "0.0.0",
            "extensionName": "google.antigravity",
            "extensionPath": extension_path,
            "deviceFingerprint": "usagewatcher",
            "triggerId": "menubar"
        }
    });
    
    let mut status_data: Option<GetUserStatusResponse> = None;
    let mut last_err = String::new();
    
    for attempt in 1..=20 {
        let res = client.post(&status_url)
            .header("Content-Type", "application/json")
            .header("Connect-Protocol-Version", "1")
            .header("x-codeium-csrf-token", &csrf_token)
            .json(&status_payload)
            .send()
            .await;
            
        let response = match res {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("Failed to send GetUserStatus: {}", e);
                sleep(Duration::from_millis(200)).await;
                continue;
            }
        };
        
        let status_code = response.status();
        let body_text = response.text().await.unwrap_or_default();
        
        if status_code.is_success() {
            match serde_json::from_str::<GetUserStatusResponse>(&body_text) {
                Ok(parsed) => {
                    status_data = Some(parsed);
                    break;
                }
                Err(e) => {
                    last_err = format!("Failed to parse response JSON: {}. Body: {}", e, body_text);
                }
            }
        } else {
            last_err = format!("HTTP {}: {}", status_code, body_text);
            if body_text.contains("GetCascadeModelConfigData() is nil") {
                log_msg("debug", &format!("Language server still loading Cascade Model Config from Google (attempt {}/20)...", attempt));
            }
        }
        sleep(Duration::from_millis(200)).await;
    }
    
    // Shutdown server
    let _ = child.kill();
    let _ = child.wait();
    
    let status_data = status_data.ok_or_else(|| format!("GetUserStatus failed. Last error: {}", last_err))?;
    parse_user_status_response(status_data, email)
}

struct RunningServer {
    pid: String,
    csrf_token: String,
    ports: Vec<u16>,
}

fn get_running_servers() -> Vec<RunningServer> {
    let mut servers = Vec::new();
    
    let output = match Command::new("ps")
        .args(&["-ww", "-ax", "-o", "pid,command"])
        .output()
    {
        Ok(out) => String::from_utf8_lossy(&out.stdout).into_owned(),
        Err(_) => return servers,
    };
    
    for line in output.lines() {
        if line.contains("language_server_macos_arm") && line.contains("--csrf_token") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 {
                continue;
            }
            let pid = parts[0].to_string();
            
            let cmdline = parts[1..].join(" ");
            let token_prefix = "--csrf_token";
            if let Some(pos) = cmdline.find(token_prefix) {
                let sub = &cmdline[pos + token_prefix.len()..];
                if let Some(token) = sub.split_whitespace().next() {
                    let ports = get_ports_for_pid(&pid);
                    servers.push(RunningServer {
                        pid,
                        csrf_token: token.to_string(),
                        ports,
                    });
                }
            }
        }
    }
    
    servers
}

fn get_ports_for_pid(pid: &str) -> Vec<u16> {
    let mut ports = Vec::new();
    
    let output = match Command::new("lsof")
        .args(&["-a", "-i", "-P", "-n", "-p", pid])
        .output()
    {
        Ok(out) => String::from_utf8_lossy(&out.stdout).into_owned(),
        Err(_) => return ports,
    };
    
    for line in output.lines() {
        if line.contains("(LISTEN)") {
            if let Some(pos) = line.find("127.0.0.1:") {
                let sub = &line[pos + "127.0.0.1:".len()..];
                if let Some(port_str) = sub.split_whitespace().next() {
                    if let Ok(port) = port_str.parse::<u16>() {
                        if !ports.contains(&port) {
                            ports.push(port);
                        }
                    }
                }
            }
        }
    }
    
    ports
}

fn parse_user_status_response(status_data: GetUserStatusResponse, email: String) -> Result<AntigravityQuotaSnapshot, String> {
    let config_data = status_data.cascade_model_config_data
        .or_else(|| status_data.user_status.and_then(|us| us.cascade_model_config_data))
        .ok_or_else(|| "Missing cascadeModelConfigData in GetUserStatus response".to_string())?;
        
    let mut models = Vec::new();
    if let Some(configs) = config_data.client_model_configs {
        for config in configs {
            let label = config.label.unwrap_or_else(|| "Unknown Gemini Model".to_string());
            
            let quota = match config.quota_info {
                Some(q) => q,
                None => continue,
            };
            
            let model_id = config.model_or_alias
                .and_then(|m| m.model.or(m.alias))
                .unwrap_or_else(|| "gemini-model".to_string());
                
            let remaining_fraction = quota.remaining_fraction.unwrap_or(1.0);
            let remaining_percent = (remaining_fraction * 100.0).round() as u32;
            let used_percent = 100 - remaining_percent.min(100);
            let is_exhausted = remaining_percent == 0;
            
            let time_until_reset = quota.reset_time.and_then(|rt| format_reset_time_str(&rt));
            
            models.push(AntigravityModelQuota {
                label,
                model_id,
                remaining_percent,
                used_percent,
                is_exhausted,
                time_until_reset,
            });
        }
    }
    
    Ok(AntigravityQuotaSnapshot {
        email,
        plan_label: "Gemini Pro / Max".to_string(),
        models,
    })
}
