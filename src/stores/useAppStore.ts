import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { Settings, UsageSnapshot, HistoryEntry, LogEntry } from "../types";

interface AppState {
  snapshot: UsageSnapshot | null;
  history: HistoryEntry[];
  settings: Settings | null;
  logs: LogEntry[];
  isRefreshing: boolean;
  
  // Actions
  setSnapshot: (snapshot: UsageSnapshot) => void;
  setHistory: (history: HistoryEntry[]) => void;
  setIsRefreshing: (isRefreshing: boolean) => void;
  setLogs: (logs: LogEntry[]) => void;
  
  fetchSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<void>;
  fetchHistory: () => Promise<HistoryEntry[]>;
  clearHistory: () => Promise<void>;
  fetchLogs: () => Promise<LogEntry[]>;
  forceRefresh: () => Promise<void>;
  fetchCurrentState: () => Promise<UsageSnapshot | null>;
  exportCsv: (filePath: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  snapshot: null,
  history: [],
  settings: null,
  logs: [],
  isRefreshing: false,

  setSnapshot: (snapshot) => set({ snapshot }),
  setHistory: (history) => set({ history }),
  setIsRefreshing: (isRefreshing) => set({ isRefreshing }),
  setLogs: (logs) => set({ logs }),

  fetchSettings: async () => {
    try {
      const settings = await invoke<Settings>("get_app_settings");
      set({ settings });
      return settings;
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      throw error;
    }
  },

  saveSettings: async (newSettings) => {
    try {
      await invoke("save_app_settings", { settings: newSettings });
      set({ settings: newSettings });
    } catch (error) {
      console.error("Failed to save settings:", error);
      throw error;
    }
  },

  fetchHistory: async () => {
    try {
      const history = await invoke<HistoryEntry[]>("get_usage_history");
      set({ history });
      return history;
    } catch (error) {
      console.error("Failed to fetch history:", error);
      throw error;
    }
  },

  clearHistory: async () => {
    try {
      await invoke("clear_usage_history");
      set({ history: [] });
    } catch (error) {
      console.error("Failed to clear history:", error);
      throw error;
    }
  },

  fetchLogs: async () => {
    try {
      const logs = await invoke<LogEntry[]>("get_app_logs");
      set({ logs });
      return logs;
    } catch (error) {
      console.error("Failed to fetch logs:", error);
      throw error;
    }
  },

  forceRefresh: async () => {
    try {
      set({ isRefreshing: true });
      await invoke("force_refresh_usage");
    } catch (error) {
      set({ isRefreshing: false });
      console.error("Failed to force refresh:", error);
      throw error;
    }
  },

  fetchCurrentState: async () => {
    try {
      const snapshot = await invoke<UsageSnapshot | null>("get_current_snapshot_state");
      if (snapshot) {
        set({ snapshot });
      }
      return snapshot;
    } catch (error) {
      console.error("Failed to fetch current snapshot state:", error);
      return null;
    }
  },

  exportCsv: async (filePath) => {
    try {
      await invoke("export_history_to_csv", { filePath });
    } catch (error) {
      console.error("Failed to export history CSV:", error);
      throw error;
    }
  }
}));
