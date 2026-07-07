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

  const getUsageBarColor = (percent: number) => {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 75) return "bg-amber-500";
    return "bg-emerald-500";
  };

  const handleOpenClaude = async () => {
    await openUrl("https://claude.ai");
  };

  const handleOpenConsole = async () => {
    await openUrl("https://console.anthropic.com/settings/usage");
  };

  return (
    <div className="flex w-full h-full bg-zinc-950 text-zinc-100 dark:bg-zinc-950 dark:text-zinc-100 light:bg-zinc-50 light:text-zinc-900 overflow-hidden font-sans select-none">
      {/* Sidebar */}
      <div className="w-56 border-r border-zinc-800 dark:border-zinc-800 light:border-zinc-200 flex flex-col justify-between p-4 bg-zinc-900/50 dark:bg-zinc-900/50 light:bg-zinc-100/50">
        <div>
          <div className="flex items-center gap-2 px-2 py-3 border-b border-zinc-800 dark:border-zinc-800 light:border-zinc-200 mb-6">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h1 className="font-bold text-sm tracking-wider uppercase bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Claudee Tracky
            </h1>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-3 w-full px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "overview"
                  ? "bg-zinc-800 dark:bg-zinc-800 light:bg-zinc-200 text-white dark:text-white light:text-black shadow-md border border-zinc-700/50 dark:border-zinc-700/50 light:border-zinc-300"
                  : "text-zinc-400 hover:bg-zinc-900/40 dark:hover:bg-zinc-900/40 light:hover:bg-zinc-200/50 hover:text-zinc-200"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-indigo-400" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-3 w-full px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "history"
                  ? "bg-zinc-800 dark:bg-zinc-800 light:bg-zinc-200 text-white dark:text-white light:text-black shadow-md border border-zinc-700/50 dark:border-zinc-700/50 light:border-zinc-300"
                  : "text-zinc-400 hover:bg-zinc-900/40 dark:hover:bg-zinc-900/40 light:hover:bg-zinc-200/50 hover:text-zinc-200"
              }`}
            >
              <History className="w-4 h-4 text-cyan-400" />
              Usage History
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-3 w-full px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "analytics"
                  ? "bg-zinc-800 dark:bg-zinc-800 light:bg-zinc-200 text-white dark:text-white light:text-black shadow-md border border-zinc-700/50 dark:border-zinc-700/50 light:border-zinc-300"
                  : "text-zinc-400 hover:bg-zinc-900/40 dark:hover:bg-zinc-900/40 light:hover:bg-zinc-200/50 hover:text-zinc-200"
              }`}
            >
              <Sparkles className="w-4 h-4 text-purple-400" />
              Claude CLI Insights
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-3 w-full px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "settings"
                  ? "bg-zinc-800 dark:bg-zinc-800 light:bg-zinc-200 text-white dark:text-white light:text-black shadow-md border border-zinc-700/50 dark:border-zinc-700/50 light:border-zinc-300"
                  : "text-zinc-400 hover:bg-zinc-900/40 dark:hover:bg-zinc-900/40 light:hover:bg-zinc-200/50 hover:text-zinc-200"
              }`}
            >
              <SettingsIcon className="w-4 h-4 text-amber-400" />
              Settings
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`flex items-center gap-3 w-full px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "logs"
                  ? "bg-zinc-800 dark:bg-zinc-800 light:bg-zinc-200 text-white dark:text-white light:text-black shadow-md border border-zinc-700/50 dark:border-zinc-700/50 light:border-zinc-300"
                  : "text-zinc-400 hover:bg-zinc-900/40 dark:hover:bg-zinc-900/40 light:hover:bg-zinc-200/50 hover:text-zinc-200"
              }`}
            >
              <FileText className="w-4 h-4 text-rose-400" />
              App Logs
            </button>
          </nav>
        </div>

        <div className="border-t border-zinc-800 dark:border-zinc-800 light:border-zinc-200 pt-4 px-2 text-[10px] text-zinc-500">
          <button 
            onClick={() => setActiveTab("about")}
            className="flex items-center gap-2 hover:text-zinc-300 transition-colors w-full text-left py-1"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Version 0.1.0 (Tauri v2)</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col h-full bg-zinc-950/20 dark:bg-zinc-950/20 light:bg-white overflow-y-auto">
        {/* Top Header */}
        <header className="flex items-center justify-between border-b border-zinc-800 dark:border-zinc-800 light:border-zinc-200 px-6 py-4">
          <h2 className="text-base font-bold capitalize tracking-wide text-zinc-200 dark:text-zinc-200 light:text-zinc-800">
            {activeTab}
          </h2>
          <div className="flex items-center gap-3">
            {isRefreshing && (
              <span className="text-[10px] text-zinc-400 animate-pulse flex items-center gap-1.5 font-medium">
                <RefreshCw className="w-3 h-3 animate-spin text-zinc-400" />
                Updating metrics...
              </span>
            )}
            <button
              onClick={() => forceRefresh()}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-xs font-semibold rounded-lg transition-colors text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
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
                <div className="bg-zinc-900/40 dark:bg-zinc-900/40 light:bg-zinc-100 border border-zinc-800/50 dark:border-zinc-800/50 light:border-zinc-200 rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                    <span>5h Usage (Session)</span>
                    <Clock className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="my-4">
                    <span className="text-3xl font-extrabold tracking-tight">
                      {snapshot?.five_hour_utilization ?? 0}%
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                    <span>Resets in:</span>
                    <span className="text-zinc-300 font-semibold">{snapshot?.five_hour_reset_in ?? "N/A"}</span>
                  </div>
                </div>

                <div className="bg-zinc-900/40 dark:bg-zinc-900/40 light:bg-zinc-100 border border-zinc-800/50 dark:border-zinc-800/50 light:border-zinc-200 rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                    <span>7d Usage (Weekly Limit)</span>
                    <Clock className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="my-4">
                    <span className="text-3xl font-extrabold tracking-tight">
                      {snapshot?.seven_day_utilization ?? 0}%
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                    <span>Resets in:</span>
                    <span className="text-zinc-300 font-semibold">{snapshot?.seven_day_reset_in ?? "N/A"}</span>
                  </div>
                </div>

                <div className="bg-zinc-900/40 dark:bg-zinc-900/40 light:bg-zinc-100 border border-zinc-800/50 dark:border-zinc-800/50 light:border-zinc-200 rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                    <span>Account Profile</span>
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="my-4">
                    <span className="text-xl font-bold tracking-tight block">
                      Claude {snapshot?.plan ? snapshot.plan.toUpperCase() : "PRO"}
                    </span>
                    <span className="text-[10px] text-zinc-400 mt-1 block">
                      Status: <span className="text-emerald-400 font-semibold capitalize">{snapshot?.status ?? "Checking"}</span>
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 border-t border-zinc-800/50 dark:border-zinc-800/50 light:border-zinc-200 pt-2.5">
                    <span>Last Update:</span>
                    <span className="font-mono text-zinc-400">
                      {snapshot?.last_updated ? new Date(snapshot.last_updated).toLocaleTimeString() : "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress bars details */}
              <div className="bg-zinc-900/25 dark:bg-zinc-900/25 light:bg-zinc-50 border border-zinc-800/50 dark:border-zinc-800/50 light:border-zinc-200 rounded-xl p-5 space-y-5">
                <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400 mb-2">Usage Bars</h3>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>5h Usage Limit</span>
                    <span className="font-mono">{snapshot?.five_hour_utilization ?? 0}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-zinc-800 dark:bg-zinc-800 light:bg-zinc-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${getUsageBarColor(snapshot?.five_hour_utilization ?? 0)}`}
                      style={{ width: `${snapshot?.five_hour_utilization ?? 0}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>7d Usage Limit</span>
                    <span className="font-mono">{snapshot?.seven_day_utilization ?? 0}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-zinc-800 dark:bg-zinc-800 light:bg-zinc-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${getUsageBarColor(snapshot?.seven_day_utilization ?? 0)}`}
                      style={{ width: `${snapshot?.seven_day_utilization ?? 0}%` }}
                    />
                  </div>
                </div>

                {snapshot?.seven_day_sonnet_utilization !== null && (
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>Sonnet Model Limit</span>
                      <span className="font-mono">{snapshot?.seven_day_sonnet_utilization ?? 0}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-zinc-800 dark:bg-zinc-800 light:bg-zinc-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${getUsageBarColor(snapshot?.seven_day_sonnet_utilization ?? 0)}`}
                        style={{ width: `${snapshot?.seven_day_sonnet_utilization ?? 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action shortcuts */}
              <div className="flex gap-4">
                <button
                  onClick={handleOpenClaude}
                  className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-lg text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-indigo-400" />
                  Open Claude Chat Website
                </button>
                <button
                  onClick={handleOpenConsole}
                  className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-lg text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-cyan-400" />
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
                <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-3 text-center">
                  <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block">Avg 5h Usage</span>
                  <span className="text-xl font-bold font-mono text-zinc-200 mt-1 block">{stats.avg5h}%</span>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-3 text-center">
                  <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block">Avg Weekly Usage</span>
                  <span className="text-xl font-bold font-mono text-zinc-200 mt-1 block">{stats.avg7d}%</span>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-3 text-center">
                  <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block">Peak 5h Usage</span>
                  <span className="text-xl font-bold font-mono text-rose-400 mt-1 block">{stats.peak5h}%</span>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-3 text-center">
                  <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block">Peak Weekly Usage</span>
                  <span className="text-xl font-bold font-mono text-rose-400 mt-1 block">{stats.peak7d}%</span>
                </div>
              </div>

              {/* Chart */}
              <div className="bg-zinc-900/25 border border-zinc-800/50 rounded-xl p-5 h-80 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400">Usage Snapshots</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={handleExportCsv}
                      disabled={history.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-800 hover:border-zinc-700 text-xs font-semibold rounded-lg text-zinc-300 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
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
                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="color7d" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="timeLabel" stroke="#71717a" fontSize={10} />
                        <YAxis stroke="#71717a" fontSize={10} domain={[0, 100]} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: 8, color: "#fff" }}
                          labelFormatter={(label, items) => {
                            if (items && items[0]) {
                              return `${items[0].payload.dateLabel} - ${label}`;
                            }
                            return label;
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                        <Area type="monotone" name="5hr utilization" dataKey="five_hour_utilization" stroke="#818cf8" fillOpacity={1} fill="url(#color5h)" strokeWidth={2} />
                        <Area type="monotone" name="7day utilization" dataKey="seven_day_utilization" stroke="#06b6d4" fillOpacity={1} fill="url(#color7d)" strokeWidth={2} />
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
                <div className="flex flex-col items-center justify-center p-12 text-zinc-400">
                  <RefreshCw className="w-8 h-8 animate-spin mb-3 text-purple-400" />
                  <span className="text-xs font-semibold">Scanning Claude CLI configuration & project histories...</span>
                </div>
              ) : !analytics ? (
                <div className="flex flex-col items-center justify-center p-12 bg-zinc-900/25 border border-zinc-800/50 rounded-xl text-center">
                  <Sparkles className="w-10 h-10 text-zinc-600 mb-3" />
                  <h4 className="font-bold text-zinc-300 mb-1">No Claude CLI Configuration Found</h4>
                  <p className="text-xs text-zinc-500 max-w-sm leading-normal">
                    Could not find a <code className="bg-zinc-900 px-1 py-0.5 rounded text-zinc-300">~/.claude/</code> configuration directory on your machine.
                    Make sure you have installed and executed the Claude Code CLI.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4 flex flex-col justify-between">
                      <div className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">Total CLI Projects</div>
                      <div className="text-3xl font-extrabold tracking-tight my-2 text-purple-400">
                        {analytics.total_projects}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">Tracked directories in Claude history</div>
                    </div>
                    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4 flex flex-col justify-between">
                      <div className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">Total Chat Sessions</div>
                      <div className="text-3xl font-extrabold tracking-tight my-2 text-indigo-400">
                        {analytics.total_sessions}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">Total sessions executed (.jsonl logs)</div>
                    </div>
                    <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-4 flex flex-col justify-between">
                      <div className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">Active Todos/Tasks</div>
                      <div className="text-3xl font-extrabold tracking-tight my-2 text-amber-400">
                        {analytics.total_todos}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">Pending todo items across workspaces</div>
                    </div>
                  </div>

                  {/* Main Grid: Projects & Todos */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Projects Table */}
                    <div className="lg:col-span-2 bg-zinc-900/25 border border-zinc-800/50 rounded-xl p-5 flex flex-col h-[400px]">
                      <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400 border-b border-zinc-850 pb-2 mb-3">
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
                              <tr className="text-zinc-500 border-b border-zinc-850">
                                <th className="pb-2 font-medium">Project Name</th>
                                <th className="pb-2 font-medium">Sessions</th>
                                <th className="pb-2 font-medium">Last Active</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analytics.active_projects.map((project: any, idx: number) => (
                                <tr key={idx} className="border-b border-zinc-900 hover:bg-zinc-900/20">
                                  <td className="py-2.5 font-semibold text-zinc-300">
                                    <div className="truncate max-w-[200px]" title={project.path}>
                                      {project.name}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 font-mono truncate max-w-[220px]">
                                      {project.path}
                                    </div>
                                  </td>
                                  <td className="py-2.5 font-mono text-zinc-400">{project.session_count}</td>
                                  <td className="py-2.5 text-zinc-400">
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
                      <div className="bg-zinc-900/25 border border-zinc-800/50 rounded-xl p-5 flex flex-col h-[200px] overflow-hidden">
                        <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400 border-b border-zinc-850 pb-2 mb-3">
                          Active Todos
                        </h3>
                        <div className="flex-grow overflow-y-auto space-y-1.5 pr-1">
                          {analytics.recent_todos.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-zinc-500 text-center">
                              No active todo tasks found in ~/.claude/todos/
                            </div>
                          ) : (
                            analytics.recent_todos.map((todo: string, idx: number) => (
                              <div key={idx} className="flex items-start gap-2 text-xs text-zinc-300 leading-tight">
                                <span className="text-amber-500 shrink-0 select-none">▪</span>
                                <span className="font-mono">{todo.replace(/^[\s-*]+/, "")}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Global Settings */}
                      <div className="bg-zinc-900/25 border border-zinc-800/50 rounded-xl p-5 h-[176px] overflow-hidden flex flex-col">
                        <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400 border-b border-zinc-850 pb-2 mb-3">
                          Claude Global Settings
                        </h3>
                        <div className="flex-grow overflow-y-auto space-y-2 pr-1 text-zinc-400">
                          {analytics.global_settings ? (
                            <div className="grid grid-cols-2 gap-y-2 gap-x-1">
                              <div>Primary Model:</div>
                              <div className="font-mono text-zinc-200 truncate">
                                {analytics.global_settings.model || "Default"}
                              </div>
                              <div>Default Editor:</div>
                              <div className="font-mono text-zinc-200 truncate">
                                {analytics.global_settings.editor || "N/A"}
                              </div>
                              <div>Auto Commit:</div>
                              <div className="font-mono text-zinc-200">
                                {analytics.global_settings.autoCommit === true ? "Enabled" : "Disabled"}
                              </div>
                              <div>Theme Style:</div>
                              <div className="font-mono text-zinc-200 capitalize">
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
          )}

          {/* TAB: SETTINGS */}
          {activeTab === "settings" && (
            <form onSubmit={handleSaveSettings} className="space-y-6 max-w-xl">
              {/* Form Save Status */}
              {saveSuccess && (
                <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-xl p-3 text-xs text-emerald-400 font-semibold">
                  Settings saved successfully! Polling loop has been updated.
                </div>
              )}

              {/* SECTION: GENERAL */}
              <div className="bg-zinc-900/25 border border-zinc-800/50 rounded-xl p-5 space-y-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400 border-b border-zinc-850 pb-2 mb-3">General Settings</h3>
                
                {/* Refresh Interval */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-zinc-200 block">Polling Interval</label>
                    <span className="text-[10px] text-zinc-500">How often the app polls Claude usage from Anthropic</span>
                  </div>
                  <select
                    value={formInterval}
                    onChange={(e) => setFormInterval(Number(e.target.value))}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg text-xs p-1.5 w-32 focus:border-indigo-500 focus:outline-none"
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
                    <label className="text-xs font-semibold text-zinc-200 block">Start at Login</label>
                    <span className="text-[10px] text-zinc-500">Launch Claudee Tracky automatically when you sign in</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formAutostart}
                    onChange={(e) => setFormAutostart(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 bg-zinc-900 border-zinc-800 rounded focus:ring-indigo-500"
                  />
                </div>

                {/* Minimize to Tray */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <label className="text-xs font-semibold text-zinc-200 block">Launch Minimized</label>
                    <span className="text-[10px] text-zinc-500">Start application hidden in system tray (no window displayed)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formMinimize}
                    onChange={(e) => setFormMinimize(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 bg-zinc-900 border-zinc-800 rounded focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* SECTION: NOTIFICATIONS */}
              <div className="bg-zinc-900/25 border border-zinc-800/50 rounded-xl p-5 space-y-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400 border-b border-zinc-850 pb-2 mb-3">Notifications</h3>
                
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-200 block">Desktop Alerts</label>
                    <span className="text-[10px] text-zinc-500">Enable native alerts when threshold limits are breached</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formNotifyEnabled}
                    onChange={(e) => setFormNotifyEnabled(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 bg-zinc-900 border-zinc-800 rounded focus:ring-indigo-500"
                  />
                </div>

                {formNotifyEnabled && (
                  <div className="pt-2">
                    <span className="text-xs font-semibold text-zinc-300 block mb-2">Notify at Thresholds:</span>
                    <div className="flex flex-wrap gap-4">
                      {[75, 80, 90, 95, 100].map((t) => (
                        <label key={t} className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
                          <input
                            type="checkbox"
                            checked={formThresholds.includes(t)}
                            onChange={() => toggleThreshold(t)}
                            className="w-3.5 h-3.5 text-indigo-600 bg-zinc-900 border-zinc-800 rounded"
                          />
                          {t}%
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: AUTHENTICATION */}
              <div className="bg-zinc-900/25 border border-zinc-800/50 rounded-xl p-5 space-y-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400 border-b border-zinc-850 pb-2 mb-3">Authentication (Custom API Key)</h3>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-baseline">
                    <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-indigo-400" />
                      Custom Anthropic Token / API Key
                    </label>
                  </div>
                  <span className="text-[10px] text-zinc-500 block leading-normal">
                    By default, the application reads the OAuth access token from your system Keychain (configured by Claude Code CLI).
                    If you are on Windows/Linux or want to override it, paste your custom token here.
                  </span>
                  
                  <div className="relative flex items-center">
                    <input
                      type={showToken ? "text" : "password"}
                      value={formCustomToken}
                      onChange={(e) => setFormCustomToken(e.target.value)}
                      placeholder="OAuth AccessToken (sk-ant-oat...) or Custom API Key (sk-ant-api...)"
                      className="bg-zinc-900 border border-zinc-800 rounded-lg text-xs px-3 py-2 w-full pr-10 focus:border-indigo-500 focus:outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 text-zinc-500 hover:text-zinc-300"
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION: APPEARANCE */}
              <div className="bg-zinc-900/25 border border-zinc-800/50 rounded-xl p-5 space-y-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400 border-b border-zinc-850 pb-2 mb-3">Theme</h3>
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
                      className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-xs font-semibold transition-all ${
                        formTheme === t.id
                          ? "bg-indigo-650 border-indigo-500 text-white shadow-md"
                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
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
                  className="px-4 py-2 border border-zinc-800 hover:bg-zinc-900 text-xs font-semibold rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Reset Defaults
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-750 active:bg-indigo-800 text-xs font-semibold rounded-lg text-white shadow-md transition-colors"
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
                    className="bg-zinc-900 border border-zinc-800 rounded-lg text-xs px-3 py-1.5 w-full focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto">
                  {["all", "info", "warn", "error", "debug"].map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setLogFilter(lvl)}
                      className={`px-3 py-1 border text-[10px] font-semibold rounded-md capitalize transition-all ${
                        logFilter === lvl
                          ? "bg-zinc-800 border-zinc-700 text-white font-bold"
                          : "bg-zinc-900 border-zinc-850 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logs Panel */}
              <div className="flex-grow bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 overflow-y-auto font-mono text-[10px] leading-relaxed shadow-inner">
                {filteredLogs.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500">
                    <span>No logs matching selected filters.</span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredLogs.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-2 border-b border-zinc-900/50 pb-1">
                        <span className="text-zinc-600 select-all shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={`font-bold uppercase shrink-0 w-12 ${
                          log.level === "error" ? "text-red-400" :
                          log.level === "warn" ? "text-amber-400" :
                          log.level === "debug" ? "text-zinc-500" :
                          "text-indigo-400"
                        }`}>
                          [{log.level}]
                        </span>
                        <span className="text-zinc-300 break-all select-all">
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
              <div className="bg-zinc-900/25 border border-zinc-800/50 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-8 h-8 text-indigo-400 animate-pulse" />
                  <div>
                    <h2 className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                      Claudee Tracky
                    </h2>
                    <p className="text-[10px] text-zinc-500">Version 0.1.0 (Production Build)</p>
                  </div>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed">
                  Claudee Tracky is a native-feeling, ultra-lightweight, cross-platform system tray application built with Tauri v2, Rust, React, and TypeScript.
                  It monitors Claude Code CLI usage in the background, providing status updates and alerts so that developers know exactly how much of their five-hour and weekly usage blocks remain.
                </p>

                <div className="border-t border-zinc-800/60 pt-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Backend Core:</span>
                    <span className="font-mono text-zinc-300">Tauri v2 + Rust (Tokio)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Frontend Stack:</span>
                    <span className="font-mono text-zinc-300">React + TS + TailwindCSS v4 + Zustand</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Secure Storage:</span>
                    <span className="font-mono text-zinc-300">macOS Keychain / Windows Credential Manager</span>
                  </div>
                </div>

                <div className="border-t border-zinc-800/60 pt-4 text-[10px] text-zinc-500 leading-normal">
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
