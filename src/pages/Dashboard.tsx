import React, { useState, useEffect, useMemo } from "react";
import { useAppStore } from "../stores/useAppStore";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  LayoutDashboard,
  History,
  Settings as SettingsIcon,
  FileText,
  RefreshCw,
  Download,
  Trash2,
  AlertTriangle,
  Info,
  Clock,
  Sparkles,
  ExternalLink,
  Lock,
  Eye,
  EyeOff,
  Moon,
  Sun,
  Laptop
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";

import { invoke } from "@tauri-apps/api/core";

type Tab = "overview" | "history" | "analytics" | "settings" | "logs" | "about";

export const Dashboard: React.FC = () => {
  const {
    snapshot,
    history,
    settings,
    logs,
    isRefreshing,
    fetchSettings,
    saveSettings,
    fetchHistory,
    clearHistory,
    fetchLogs,
    forceRefresh,
    fetchCurrentState,
    exportCsv
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showToken, setShowToken] = useState(false);
  const [logFilter, setLogFilter] = useState<string>("all");
  const [logSearch, setLogSearch] = useState<string>("");
  const [analytics, setAnalytics] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Local settings form state
  const [formInterval, setFormInterval] = useState<number>(30);
  const [formThresholds, setFormThresholds] = useState<number[]>([75, 80, 90, 95, 100]);
  const [formTheme, setFormTheme] = useState<"light" | "dark" | "system">("system");
  const [formAutostart, setFormAutostart] = useState(false);
  const [formMinimize, setFormMinimize] = useState(true);
  const [formNotifyEnabled, setFormNotifyEnabled] = useState(true);
  const [formCustomToken, setFormCustomToken] = useState("");

  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchAnalyticsData = async () => {
    try {
      setLoadingAnalytics(true);
      const res = await invoke("get_claude_cli_analytics");
      setAnalytics(res);
    } catch (err) {
      console.error("Failed to load Claude CLI analytics:", err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // Load configuration data on mount
  useEffect(() => {
    fetchSettings().then((s) => {
      setFormInterval(s.refresh_interval);
      setFormThresholds(s.thresholds);
      setFormTheme(s.theme);
      setFormAutostart(s.autostart);
      setFormMinimize(s.minimize_to_tray);
      setFormNotifyEnabled(s.notifications_enabled);
      setFormCustomToken(s.custom_token || "");
    });
    fetchHistory();
    fetchCurrentState();
    fetchLogs();
    fetchAnalyticsData();

    // Set theme class
    const updateTheme = (theme: "light" | "dark" | "system") => {
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      if (theme === "system") {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        root.classList.add(isDark ? "dark" : "light");
      } else {
        root.classList.add(theme);
      }
    };

    updateTheme(settings?.theme || "system");

    // Dynamic log poller
    const logInterval = setInterval(() => {
      fetchLogs();
      fetchCurrentState();
    }, 5000);

    const analyticsInterval = setInterval(() => {
      fetchAnalyticsData();
    }, 15000);

    return () => {
      clearInterval(logInterval);
      clearInterval(analyticsInterval);
    };
  }, [fetchSettings, fetchHistory, fetchCurrentState, fetchLogs, settings?.theme]);

  // Handle theme changes
  useEffect(() => {
    if (settings?.theme) {
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      if (settings.theme === "system") {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        root.classList.add(isDark ? "dark" : "light");
      } else {
        root.classList.add(settings.theme);
      }
    }
  }, [settings?.theme]);

  // Save Settings handler
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSettings({
        refresh_interval: formInterval,
        thresholds: formThresholds,
        theme: formTheme,
        autostart: formAutostart,
        minimize_to_tray: formMinimize,
        notifications_enabled: formNotifyEnabled,
        custom_token: formCustomToken.trim() === "" ? null : formCustomToken.trim()
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      fetchCurrentState(); // trigger update
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  const handleExportCsv = async () => {
    try {
      const filePath = await save({
        filters: [{
          name: "CSV Files",
          extensions: ["csv"]
        }],
        defaultPath: "claudee_usage_history.csv"
      });

      if (filePath) {
        await exportCsv(filePath);
      }
    } catch (err) {
      console.error("Failed to export CSV:", err);
    }
  };

  const toggleThreshold = (val: number) => {
    if (formThresholds.includes(val)) {
      setFormThresholds(formThresholds.filter((t) => t !== val));
    } else {
      setFormThresholds([...formThresholds, val].sort((a, b) => a - b));
    }
  };

  // Stats computation
  const stats = useMemo(() => {
    if (history.length === 0) return { avg5h: 0, avg7d: 0, peak5h: 0, peak7d: 0 };
    const total5h = history.reduce((sum, h) => sum + h.five_hour_utilization, 0);
    const total7d = history.reduce((sum, h) => sum + h.seven_day_utilization, 0);
    const peak5h = Math.max(...history.map((h) => h.five_hour_utilization));
    const peak7d = Math.max(...history.map((h) => h.seven_day_utilization));
    return {
      avg5h: Math.round(total5h / history.length),
      avg7d: Math.round(total7d / history.length),
      peak5h,
      peak7d
    };
  }, [history]);

  // Logs computation
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesLevel = logFilter === "all" || log.level.toLowerCase() === logFilter;
      const matchesSearch = log.message.toLowerCase().includes(logSearch.toLowerCase()) || 
                            log.level.toLowerCase().includes(logSearch.toLowerCase());
      return matchesLevel && matchesSearch;
    });
  }, [logs, logFilter, logSearch]);

  // Chart data formatting
  const chartData = useMemo(() => {
    return history.map((entry) => {
      const date = new Date(entry.timestamp);
      return {
        ...entry,
        timeLabel: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        dateLabel: date.toLocaleDateString([], { month: "short", day: "numeric" }),
      };
    });
  }, [history]);



  const handleOpenClaude = async () => {
    await openUrl("https://claude.ai");
  };

  const handleOpenConsole = async () => {
    await openUrl("https://console.anthropic.com/settings/usage");
  };

  const getTabStyle = (tab: Tab) => {
    const isActive = activeTab === tab;
    return {
      display: "flex",
      alignItems: "center",
      gap: 12,
      width: "100%",
      padding: "8px 12px",
      fontSize: 12,
      fontWeight: 600,
      borderRadius: 8,
      transition: "all 0.15s",
      backgroundColor: isActive ? "var(--accent-color-light)" : "transparent",
      color: isActive ? "var(--accent-color)" : "var(--text-secondary)",
      border: isActive ? "1px solid rgba(212, 118, 78, 0.2)" : "1px solid transparent",
      cursor: "pointer",
    };
  };

  return (
    <div className="flex w-full h-full font-sans select-none overflow-hidden" style={{ backgroundColor: "var(--background-color)", color: "var(--text-primary)" }}>
      {/* Sidebar */}
      <div className="w-56 flex flex-col justify-between p-4" style={{ backgroundColor: "var(--sidebar-bg-color)", borderRight: "1px solid var(--border-color)" }}>
        <div>
          <div className="flex items-center gap-2 px-2 py-3 mb-6" style={{ borderBottom: "1px solid var(--border-color)" }}>
            <Sparkles className="w-5 h-5 animate-pulse" color="var(--accent-color)" />
            <h1 className="font-bold text-sm tracking-wider uppercase" style={{ backgroundImage: "linear-gradient(to right, var(--accent-color), #e29875)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Claudee Tracky
            </h1>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("overview")}
              style={getTabStyle("overview")}
              className="hover:bg-zinc-800/20 hover:text-zinc-200"
            >
              <LayoutDashboard className="w-4 h-4" color={activeTab === "overview" ? "var(--accent-color)" : "var(--text-secondary)"} />
              Overview
            </button>
            <button
              onClick={() => setActiveTab("history")}
              style={getTabStyle("history")}
              className="hover:bg-zinc-800/20 hover:text-zinc-200"
            >
              <History className="w-4 h-4" color={activeTab === "history" ? "var(--accent-color)" : "var(--text-secondary)"} />
              Usage History
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              style={getTabStyle("analytics")}
              className="hover:bg-zinc-800/20 hover:text-zinc-200"
            >
              <Sparkles className="w-4 h-4" color={activeTab === "analytics" ? "var(--accent-color)" : "var(--text-secondary)"} />
              Claude CLI Insights
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              style={getTabStyle("settings")}
              className="hover:bg-zinc-800/20 hover:text-zinc-200"
            >
              <SettingsIcon className="w-4 h-4" color={activeTab === "settings" ? "var(--accent-color)" : "var(--text-secondary)"} />
              Settings
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              style={getTabStyle("logs")}
              className="hover:bg-zinc-800/20 hover:text-zinc-200"
            >
              <FileText className="w-4 h-4" color={activeTab === "logs" ? "var(--accent-color)" : "var(--text-secondary)"} />
              App Logs
            </button>
          </nav>
        </div>

        <div className="pt-4 px-2 text-[10px] text-zinc-500" style={{ borderTop: "1px solid var(--border-color)" }}>
          <button 
            onClick={() => setActiveTab("about")}
            className="flex items-center gap-2 hover:text-zinc-300 transition-colors w-full text-left py-1"
            style={{ color: "var(--text-secondary)" }}
          >
            <Info className="w-3.5 h-3.5" color="var(--text-secondary)" />
            <span>Version 0.1.0 (Tauri v2)</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col h-full overflow-y-auto" style={{ backgroundColor: "var(--background-color)" }}>
        {/* Top Header */}
        <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border-color)" }}>
          <h2 className="text-base font-bold capitalize tracking-wide" style={{ color: "var(--text-primary)" }}>
            {activeTab === "analytics" ? "Claude CLI Insights" : activeTab}
          </h2>
          <div className="flex items-center gap-3">
            {isRefreshing && (
              <span className="text-[10px] animate-pulse flex items-center gap-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>
                <RefreshCw className="w-3 h-3 animate-spin" color="var(--text-secondary)" />
                Updating metrics...
              </span>
            )}
            <button
              onClick={() => forceRefresh()}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1.5 disabled:opacity-50 text-xs font-semibold rounded-lg hover:opacity-90 active:opacity-80 transition-all text-white cursor-pointer"
              style={{ backgroundColor: "var(--accent-color)" }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} color="#fff" />
              Refresh
            </button>
          </div>
        </header>

        {/* Content Screens */}
        <main className="flex-grow p-6">
          
          {/* TAB: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Status Warning Banner */}
              {snapshot?.status === "unauthenticated" && (
                <div className="flex items-start gap-3 bg-red-950/30 border border-red-800/40 rounded-xl p-4 text-xs text-red-300">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
                  <div>
                    <h4 className="font-bold text-red-200 mb-0.5">Authentication Expired</h4>
                    <p className="leading-normal">
                      The application was unable to fetch usage statistics because the Claude session is expired.
                      Please open your terminal and log back in using <code className="bg-red-900/30 px-1 py-0.5 rounded font-mono text-red-200">claude</code>. Alternatively, paste a custom API token in the settings panel.
                    </p>
                  </div>
                </div>
              )}

              {/* Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl p-4 flex flex-col justify-between" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                    <span>5h Usage (Session)</span>
                    <Clock className="w-4 h-4" color="var(--accent-color)" />
                  </div>
                  <div className="my-4">
                    <span className="text-3xl font-extrabold tracking-tight">
                      {snapshot?.five_hour_utilization ?? 0}%
                    </span>
                  </div>
                  <div className="text-[10px] font-mono flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                    <span>Resets in:</span>
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{snapshot?.five_hour_reset_in ?? "N/A"}</span>
                  </div>
                </div>

                <div className="rounded-xl p-4 flex flex-col justify-between" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                    <span>7d Usage (Weekly Limit)</span>
                    <Clock className="w-4 h-4" color="var(--accent-color)" />
                  </div>
                  <div className="my-4">
                    <span className="text-3xl font-extrabold tracking-tight">
                      {snapshot?.seven_day_utilization ?? 0}%
                    </span>
                  </div>
                  <div className="text-[10px] font-mono flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                    <span>Resets in:</span>
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{snapshot?.seven_day_reset_in ?? "N/A"}</span>
                  </div>
                </div>

                <div className="rounded-xl p-4 flex flex-col justify-between" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                    <span>Account Profile</span>
                    <Sparkles className="w-4 h-4" color="var(--accent-color)" />
                  </div>
                  <div className="my-4">
                    <span className="text-xl font-bold tracking-tight block">
                      Claude {snapshot?.plan ? (snapshot.plan === "max" ? "Max" : snapshot.plan === "pro" ? "Pro" : snapshot.plan.toUpperCase()) : "PRO"}
                    </span>
                    <span className="text-[10px] mt-1 block" style={{ color: "var(--text-secondary)" }}>
                      Status: <span className="font-semibold capitalize text-emerald-500">{snapshot?.status ?? "Checking"}</span>
                    </span>
                  </div>
                  <div className="text-[10px] flex items-center gap-1.5 pt-2.5" style={{ borderTop: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
                    <span>Last Update:</span>
                    <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                      {snapshot?.last_updated ? new Date(snapshot.last_updated).toLocaleTimeString() : "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress bars details */}
              <div className="rounded-xl p-5 space-y-5" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                <h3 className="font-bold text-xs uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Usage Bars</h3>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>5h Usage Limit</span>
                    <span className="font-mono">{snapshot?.five_hour_utilization ?? 0}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--divider-color)" }}>
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${snapshot?.five_hour_utilization ?? 0}%`, backgroundColor: "var(--accent-color)" }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>7d Usage Limit</span>
                    <span className="font-mono">{snapshot?.seven_day_utilization ?? 0}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--divider-color)" }}>
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${snapshot?.seven_day_utilization ?? 0}%`, backgroundColor: "var(--accent-color)" }}
                    />
                  </div>
                </div>
              </div>

              {/* Antigravity (Gemini) details */}
              {snapshot?.antigravity_quota && (
                <div className="rounded-xl p-5 space-y-5" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                  <div className="flex justify-between items-center pb-2 mb-2" style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400" style={{ color: "var(--text-secondary)" }}>
                      Antigravity Model Quotas
                    </h3>
                    <span className="text-[10px] font-mono text-zinc-500" style={{ color: "var(--text-secondary)" }}>
                      {snapshot.antigravity_quota.email}
                    </span>
                  </div>

                  {snapshot.antigravity_quota.models.map((model) => (
                    <div key={model.model_id} className="space-y-2">
                      <div className="flex justify-between text-xs font-semibold">
                        <span>{model.label}</span>
                        <span className="font-mono">{model.used_percent}% used</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--divider-color)" }}>
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${model.used_percent}%`, backgroundColor: "var(--accent-color)" }}
                        />
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono text-right" style={{ color: "var(--text-secondary)" }}>
                        Resets in: {model.time_until_reset ?? "N/A"}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action shortcuts */}
              <div className="flex gap-4">
                <button
                  onClick={handleOpenClaude}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-all cursor-pointer"
                  style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                >
                  <ExternalLink className="w-4 h-4" color="var(--accent-color)" />
                  Open Claude Chat Website
                </button>
                <button
                  onClick={handleOpenConsole}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-all cursor-pointer"
                  style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                >
                  <ExternalLink className="w-4 h-4" color="var(--accent-color)" />
                  Anthropic Console Billing & Usage
                </button>
              </div>
            </div>
          )}

          {/* TAB: HISTORY */}
          {activeTab === "history" && (
            <div className="space-y-6">
              {/* Stats overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: "var(--text-secondary)" }}>Avg 5h Usage</span>
                  <span className="text-xl font-bold font-mono mt-1 block">{stats.avg5h}%</span>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: "var(--text-secondary)" }}>Avg Weekly Usage</span>
                  <span className="text-xl font-bold font-mono mt-1 block">{stats.avg7d}%</span>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: "var(--text-secondary)" }}>Peak 5h Usage</span>
                  <span className="text-xl font-bold font-mono mt-1 block" style={{ color: "var(--accent-color)" }}>{stats.peak5h}%</span>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: "var(--text-secondary)" }}>Peak Weekly Usage</span>
                  <span className="text-xl font-bold font-mono mt-1 block" style={{ color: "var(--accent-color)" }}>{stats.peak7d}%</span>
                </div>
              </div>

              {/* Chart */}
              <div className="rounded-xl p-5 h-80 flex flex-col justify-between" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Usage Snapshots</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={handleExportCsv}
                      disabled={history.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50 text-xs font-semibold rounded-lg hover:opacity-95 transition-all text-white cursor-pointer"
                      style={{ backgroundColor: "var(--accent-color)" }}
                    >
                      <Download className="w-3.5 h-3.5" color="#fff" />
                      Export CSV
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Are you sure you want to clear your usage history? This cannot be undone.")) {
                          clearHistory();
                        }
                      }}
                      disabled={history.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 disabled:opacity-50 border border-red-900/30 hover:border-red-900/40 text-xs font-semibold rounded-lg text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      Clear History
                    </button>
                  </div>
                </div>

                <div className="flex-grow w-full h-full text-xs font-mono">
                  {history.length === 0 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500">
                      <History className="w-8 h-8 mb-2 opacity-50" />
                      <span>No history snapshots recorded yet. Polling will gather data.</span>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="90%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="color5h" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#d4764e" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#d4764e" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="color7d" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8a8880" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#8a8880" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                        <XAxis dataKey="timeLabel" stroke="var(--text-secondary)" fontSize={10} />
                        <YAxis stroke="var(--text-secondary)" fontSize={10} domain={[0, 100]} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: "var(--card-bg-color)", borderColor: "var(--border-color)", borderRadius: 8, color: "var(--text-primary)" }}
                          labelFormatter={(label, items) => {
                            if (items && items[0]) {
                              return `${items[0].payload.dateLabel} - ${label}`;
                            }
                            return label;
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                        <Area type="monotone" name="5hr utilization" dataKey="five_hour_utilization" stroke="#d4764e" fillOpacity={1} fill="url(#color5h)" strokeWidth={2} />
                        <Area type="monotone" name="7day utilization" dataKey="seven_day_utilization" stroke="#8a8880" fillOpacity={1} fill="url(#color7d)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: ANALYTICS */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              {loadingAnalytics && !analytics ? (
                <div className="flex flex-col items-center justify-center p-12" style={{ color: "var(--text-secondary)" }}>
                  <RefreshCw className="w-8 h-8 animate-spin mb-3" color="var(--accent-color)" />
                  <span className="text-xs font-semibold">Scanning Claude CLI configuration & project histories...</span>
                </div>
              ) : !analytics ? (
                <div className="flex flex-col items-center justify-center p-12 rounded-xl text-center" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                  <Sparkles className="w-10 h-10 mb-3" color="var(--text-secondary)" />
                  <h4 className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>No Claude CLI Configuration Found</h4>
                  <p className="text-xs max-w-sm leading-normal" style={{ color: "var(--text-secondary)" }}>
                    Could not find a <code className="px-1 py-0.5 rounded" style={{ backgroundColor: "var(--background-color)", color: "var(--text-primary)" }}>~/.claude/</code> configuration directory on your machine.
                    Make sure you have installed and executed the Claude Code CLI.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-xl p-4 flex flex-col justify-between" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Total CLI Projects</div>
                      <div className="text-3xl font-extrabold tracking-tight my-2" style={{ color: "var(--accent-color)" }}>
                        {analytics.total_projects}
                      </div>
                      <div className="text-[10px] font-mono" style={{ color: "var(--text-secondary)" }}>Tracked directories in Claude history</div>
                    </div>
                    <div className="rounded-xl p-4 flex flex-col justify-between" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Total Chat Sessions</div>
                      <div className="text-3xl font-extrabold tracking-tight my-2" style={{ color: "var(--accent-color)" }}>
                        {analytics.total_sessions}
                      </div>
                      <div className="text-[10px] font-mono" style={{ color: "var(--text-secondary)" }}>Total sessions executed (.jsonl logs)</div>
                    </div>
                    <div className="rounded-xl p-4 flex flex-col justify-between" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Active Todos/Tasks</div>
                      <div className="text-3xl font-extrabold tracking-tight my-2" style={{ color: "var(--accent-color)" }}>
                        {analytics.total_todos}
                      </div>
                      <div className="text-[10px] font-mono" style={{ color: "var(--text-secondary)" }}>Pending todo items across workspaces</div>
                    </div>
                  </div>

                  {/* Main Grid: Projects & Todos */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Projects Table */}
                    <div className="lg:col-span-2 rounded-xl p-5 flex flex-col h-[400px]" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                      <h3 className="font-bold text-xs uppercase tracking-wider pb-2 mb-3" style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
                        Workspace History Breakdown
                      </h3>
                      <div className="flex-grow overflow-y-auto pr-1">
                        {analytics.active_projects.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-zinc-500">
                            No project directories logged yet.
                          </div>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
                                <th className="pb-2 font-medium">Project Name</th>
                                <th className="pb-2 font-medium">Sessions</th>
                                <th className="pb-2 font-medium">Last Active</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analytics.active_projects.map((project: any, idx: number) => (
                                <tr key={idx} className="hover:bg-zinc-800/10" style={{ borderBottom: "1px solid var(--divider-color)" }}>
                                  <td className="py-2.5 font-semibold">
                                    <div className="truncate max-w-[200px]" title={project.path}>
                                      {project.name}
                                    </div>
                                    <div className="text-[10px] font-mono truncate max-w-[220px]" style={{ color: "var(--text-secondary)" }}>
                                      {project.path}
                                    </div>
                                  </td>
                                  <td className="py-2.5 font-mono">{project.session_count}</td>
                                  <td className="py-2.5">
                                    {project.last_active === "Unknown" ? "Unknown" : new Date(project.last_active).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    {/* Right Hand: Todos & Config */}
                    <div className="space-y-6">
                      {/* Active Todos */}
                      <div className="rounded-xl p-5 flex flex-col h-[200px] overflow-hidden" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                        <h3 className="font-bold text-xs uppercase tracking-wider pb-2 mb-3" style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
                          Active Todos
                        </h3>
                        <div className="flex-grow overflow-y-auto space-y-1.5 pr-1">
                          {analytics.recent_todos.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-zinc-500 text-center">
                              No active todo tasks found in ~/.claude/todos/
                            </div>
                          ) : (
                            analytics.recent_todos.map((todo: string, idx: number) => (
                              <div key={idx} className="flex items-start gap-2 text-xs leading-tight">
                                <span className="shrink-0 select-none" style={{ color: "var(--accent-color)" }}>▪</span>
                                <span className="font-mono">{todo.replace(/^[\s-*]+/, "")}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Global Settings */}
                      <div className="rounded-xl p-5 h-[176px] overflow-hidden flex flex-col" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                        <h3 className="font-bold text-xs uppercase tracking-wider pb-2 mb-3" style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
                          Claude Global Settings
                        </h3>
                        <div className="flex-grow overflow-y-auto space-y-2 pr-1" style={{ color: "var(--text-secondary)" }}>
                          {analytics.global_settings ? (
                            <div className="grid grid-cols-2 gap-y-2 gap-x-1">
                              <div>Primary Model:</div>
                              <div className="font-mono truncate" style={{ color: "var(--text-primary)" }}>
                                {analytics.global_settings.model || "Default"}
                              </div>
                              <div>Default Editor:</div>
                              <div className="font-mono truncate" style={{ color: "var(--text-primary)" }}>
                                {analytics.global_settings.editor || "N/A"}
                              </div>
                              <div>Auto Commit:</div>
                              <div className="font-mono" style={{ color: "var(--text-primary)" }}>
                                {analytics.global_settings.autoCommit === true ? "Enabled" : "Disabled"}
                              </div>
                              <div>Theme Style:</div>
                              <div className="font-mono capitalize" style={{ color: "var(--text-primary)" }}>
                                {analytics.global_settings.theme || "System"}
                              </div>
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center text-xs text-zinc-500">
                              No global settings file found.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}          {/* TAB: SETTINGS */}
          {activeTab === "settings" && (
            <form onSubmit={handleSaveSettings} className="space-y-6 max-w-xl">
              {/* Form Save Status */}
              {saveSuccess && (
                <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-xl p-3 text-xs text-emerald-400 font-semibold">
                  Settings saved successfully! Polling loop has been updated.
                </div>
              )}

              {/* SECTION: GENERAL */}
              <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                <h3 className="font-bold text-xs uppercase tracking-wider pb-2 mb-3" style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>General Settings</h3>
                
                {/* Refresh Interval */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold block">Polling Interval</label>
                    <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>How often the app polls Claude usage from Anthropic</span>
                  </div>
                  <select
                    value={formInterval}
                    onChange={(e) => setFormInterval(Number(e.target.value))}
                    className="rounded-lg text-xs p-1.5 w-32 focus:outline-none transition-all"
                    style={{ backgroundColor: "var(--background-color)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                  >
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>60 seconds</option>
                    <option value={120}>2 minutes</option>
                    <option value={300}>5 minutes</option>
                  </select>
                </div>

                {/* Autostart */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <label className="text-xs font-semibold block">Start at Login</label>
                    <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>Launch Claudee Tracky automatically when you sign in</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formAutostart}
                    onChange={(e) => setFormAutostart(e.target.checked)}
                    className="w-4 h-4 cursor-pointer"
                    style={{ accentColor: "var(--accent-color)" }}
                  />
                </div>

                {/* Minimize to Tray */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <label className="text-xs font-semibold block">Launch Minimized</label>
                    <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>Start application hidden in system tray (no window displayed)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formMinimize}
                    onChange={(e) => setFormMinimize(e.target.checked)}
                    className="w-4 h-4 cursor-pointer"
                    style={{ accentColor: "var(--accent-color)" }}
                  />
                </div>
              </div>

              {/* SECTION: NOTIFICATIONS */}
              <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                <h3 className="font-bold text-xs uppercase tracking-wider pb-2 mb-3" style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>Notifications</h3>
                
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="text-xs font-semibold block">Desktop Alerts</label>
                    <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>Enable native alerts when threshold limits are breached</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formNotifyEnabled}
                    onChange={(e) => setFormNotifyEnabled(e.target.checked)}
                    className="w-4 h-4 cursor-pointer"
                    style={{ accentColor: "var(--accent-color)" }}
                  />
                </div>

                {formNotifyEnabled && (
                  <div className="pt-2">
                    <span className="text-xs font-semibold block mb-2" style={{ color: "var(--text-secondary)" }}>Notify at Thresholds:</span>
                    <div className="flex flex-wrap gap-4">
                      {[75, 80, 90, 95, 100].map((t) => (
                        <label key={t} className="flex items-center gap-2 text-xs font-mono cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                          <input
                            type="checkbox"
                            checked={formThresholds.includes(t)}
                            onChange={() => toggleThreshold(t)}
                            className="w-3.5 h-3.5"
                            style={{ accentColor: "var(--accent-color)" }}
                          />
                          {t}%
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: AUTHENTICATION */}
              <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                <h3 className="font-bold text-xs uppercase tracking-wider pb-2 mb-3" style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>Authentication (Custom API Key)</h3>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-baseline">
                    <label className="text-xs font-semibold flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" color="var(--accent-color)" />
                      Custom Anthropic Token / API Key
                    </label>
                  </div>
                  <span className="text-[10px] block leading-normal" style={{ color: "var(--text-secondary)" }}>
                    By default, the application reads the OAuth access token from your system Keychain (configured by Claude Code CLI).
                    If you are on Windows/Linux or want to override it, paste your custom token here.
                  </span>
                  
                  <div className="relative flex items-center">
                    <input
                      type={showToken ? "text" : "password"}
                      value={formCustomToken}
                      onChange={(e) => setFormCustomToken(e.target.value)}
                      placeholder="OAuth AccessToken (sk-ant-oat...) or Custom API Key (sk-ant-api...)"
                      className="rounded-lg text-xs px-3 py-2 w-full pr-10 focus:outline-none font-mono"
                      style={{ backgroundColor: "var(--background-color)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 hover:opacity-85 transition-opacity"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION: APPEARANCE */}
              <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                <h3 className="font-bold text-xs uppercase tracking-wider pb-2 mb-3" style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>Theme</h3>
                <div className="flex gap-4">
                  {[
                    { id: "light", label: "Light", icon: <Sun className="w-4 h-4" /> },
                    { id: "dark", label: "Dark", icon: <Moon className="w-4 h-4" /> },
                    { id: "system", label: "System", icon: <Laptop className="w-4 h-4" /> }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormTheme(t.id as any)}
                      className="flex items-center gap-2 px-4 py-2 border rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      style={
                        formTheme === t.id
                          ? { backgroundColor: "var(--accent-color)", borderColor: "var(--accent-color)", color: "#fff" }
                          : { backgroundColor: "var(--background-color)", borderColor: "var(--border-color)", color: "var(--text-secondary)" }
                      }
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Reset configuration to application defaults?")) {
                      setFormInterval(30);
                      setFormThresholds([75, 80, 90, 95, 100]);
                      setFormTheme("system");
                      setFormAutostart(false);
                      setFormMinimize(true);
                      setFormNotifyEnabled(true);
                      setFormCustomToken("");
                    }
                  }}
                  className="px-4 py-2 border text-xs font-semibold rounded-lg hover:opacity-85 transition-all cursor-pointer"
                  style={{ backgroundColor: "transparent", borderColor: "var(--border-color)", color: "var(--text-secondary)" }}
                >
                  Reset Defaults
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 hover:opacity-95 text-xs font-semibold rounded-lg text-white shadow-md transition-all cursor-pointer"
                  style={{ backgroundColor: "var(--accent-color)" }}
                >
                  Save Settings
                </button>
              </div>
            </form>
          )}

          {/* TAB: LOGS */}
          {activeTab === "logs" && (
            <div className="space-y-4 h-[calc(100vh-160px)] flex flex-col justify-between">
              {/* Log Controls */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search logs..."
                    className="rounded-lg text-xs px-3 py-1.5 w-full focus:outline-none"
                    style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                  />
                </div>

                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto">
                  {["all", "info", "warn", "error", "debug"].map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setLogFilter(lvl)}
                      className="px-3 py-1 border text-[10px] font-semibold rounded-md capitalize transition-all cursor-pointer"
                      style={{
                        backgroundColor: logFilter === lvl ? "var(--accent-color-light)" : "var(--card-bg-color)",
                        borderColor: logFilter === lvl ? "var(--accent-color)" : "var(--border-color)",
                        color: logFilter === lvl ? "var(--accent-color)" : "var(--text-secondary)"
                      }}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logs Panel */}
              <div className="flex-grow border rounded-xl p-4 overflow-y-auto font-mono text-[10px] leading-relaxed shadow-inner" style={{ backgroundColor: "var(--sidebar-bg-color)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}>
                {filteredLogs.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500">
                    <span>No logs matching selected filters.</span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredLogs.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-2 pb-1" style={{ borderBottom: "1px solid var(--divider-color)" }}>
                        <span className="select-all shrink-0" style={{ color: "var(--text-secondary)" }}>
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="font-bold uppercase shrink-0 w-12" style={
                          log.level === "error" ? { color: "var(--destructive-color, #ef4444)" } :
                          log.level === "warn" ? { color: "#f59e0b" } :
                          log.level === "debug" ? { color: "var(--text-secondary)" } :
                          { color: "var(--accent-color)" }
                        }>
                          [{log.level}]
                        </span>
                        <span className="break-all select-all">
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: ABOUT */}
          {activeTab === "about" && (
            <div className="space-y-6 max-w-xl">
              <div className="rounded-xl p-6 space-y-4" style={{ backgroundColor: "var(--card-bg-color)", border: "1px solid var(--border-color)" }}>
                <div className="flex items-center gap-3">
                  <Sparkles className="w-8 h-8 animate-pulse" color="var(--accent-color)" />
                  <div>
                    <h2 className="text-lg font-bold" style={{ backgroundImage: "linear-gradient(to right, var(--accent-color), #e29875)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                      Claudee Tracky
                    </h2>
                    <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>Version 0.1.0 (Production Build)</p>
                  </div>
                </div>

                <p className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  Claudee Tracky is a native-feeling, ultra-lightweight, cross-platform system tray application built with Tauri v2, Rust, React, and TypeScript.
                  It monitors Claude Code CLI usage in the background, providing status updates and alerts so that developers know exactly how much of their five-hour and weekly usage blocks remain.
                </p>

                <div className="pt-4 space-y-2 text-xs" style={{ borderTop: "1px solid var(--border-color)" }}>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-secondary)" }}>Backend Core:</span>
                    <span className="font-mono">Tauri v2 + Rust (Tokio)</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-secondary)" }}>Frontend Stack:</span>
                    <span className="font-mono">React + TS + TailwindCSS v4 + Zustand</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-secondary)" }}>Secure Storage:</span>
                    <span className="font-mono">macOS Keychain / Windows Credential Manager</span>
                  </div>
                </div>

                <div className="pt-4 text-[10px] leading-normal" style={{ borderTop: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
                  <p>Developed to replace heavy electron-based wrappers with a performance-first native layer.</p>
                  <p className="mt-1">All telemetry is disabled. Configuration and tokens are stored locally on your machine and never transmitted to external servers.</p>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};
