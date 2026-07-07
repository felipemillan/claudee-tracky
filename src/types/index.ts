export interface Settings {
  refresh_interval: number;
  thresholds: number[];
  theme: "light" | "dark" | "system";
  autostart: boolean;
  minimize_to_tray: boolean;
  notifications_enabled: boolean;
  custom_token: string | null;
}

export interface AntigravityModelQuota {
  label: string;
  model_id: string;
  remaining_percent: number;
  used_percent: number;
  is_exhausted: boolean;
  time_until_reset: string | null;
}

export interface AntigravityQuotaSnapshot {
  email: string;
  plan_label: string;
  models: AntigravityModelQuota[];
}

export interface UsageSnapshot {
  five_hour_utilization: number;
  seven_day_utilization: number;
  seven_day_sonnet_utilization: number | null;
  five_hour_reset_in: string | null;
  seven_day_reset_in: string | null;
  plan: string;
  last_updated: string;
  status: "active" | "offline" | "unauthenticated" | "error" | "rate_limited";
  error_message: string | null;
  spend_used: number;
  spend_limit: number;
  spend_percent: number;
  antigravity_quota: AntigravityQuotaSnapshot | null;
}

export interface HistoryEntry {
  timestamp: string;
  five_hour_utilization: number;
  seven_day_utilization: number;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}
