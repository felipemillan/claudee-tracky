import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./stores/useAppStore";
import { Popup } from "./pages/Popup";
import { Dashboard } from "./pages/Dashboard";
import { UsageSnapshot, HistoryEntry } from "./types";

function App() {
  const [label, setLabel] = useState<string>("main");
  const { setSnapshot, setHistory, setIsRefreshing } = useAppStore();

  useEffect(() => {
    // 1. Resolve active window label from Tauri
    try {
      const win = getCurrentWindow();
      setLabel(win.label);
    } catch (err) {
      console.warn("Tauri context not detected (running in browser mode). Defaulting to Dashboard view.", err);
    }

    // 2. Set up event synchronization from Rust background thread
    let unlistenUsage: () => void;
    let unlistenHistory: () => void;
    let unlistenRefresh: () => void;

    const setupListeners = async () => {
      try {
        unlistenUsage = await listen<UsageSnapshot>("usage-updated", (event) => {
          setSnapshot(event.payload);
        });

        unlistenHistory = await listen<HistoryEntry[]>("history-updated", (event) => {
          setHistory(event.payload);
        });

        unlistenRefresh = await listen<boolean>("refresh-state-changed", (event) => {
          setIsRefreshing(event.payload);
        });
      } catch (err) {
        console.error("Failed to setup Tauri event listeners:", err);
      }
    };

    setupListeners();

    // Cleanup listeners on unmount
    return () => {
      if (unlistenUsage) unlistenUsage();
      if (unlistenHistory) unlistenHistory();
      if (unlistenRefresh) unlistenRefresh();
    };
  }, [setSnapshot, setHistory, setIsRefreshing]);

  // Route layout based on Tauri window label
  if (label === "popup") {
    return <Popup />;
  }

  return <Dashboard />;
}

export default App;
