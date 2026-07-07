import React, { useEffect, useState } from "react";
import { useAppStore } from "../stores/useAppStore";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  BarChart3,
  RotateCw,
  Info,
  Power,
  ShieldAlert
} from "lucide-react";

export const Popup: React.FC = () => {
  const {
    snapshot,
    isRefreshing,
    forceRefresh,
    fetchCurrentState,
  } = useAppStore();

  const [timeDiffText, setTimeDiffText] = useState("just now");

  useEffect(() => {
    fetchCurrentState();
  }, [fetchCurrentState]);

  // Auto-hide popup when window loses focus (user clicks outside).
  // Uses a 300ms debounce to avoid the macOS tray click-release race condition.
  useEffect(() => {
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleBlur = () => {
      hideTimeout = setTimeout(() => {
        // Confirm focus is actually lost before hiding
        if (!document.hasFocus()) {
          invoke("hide_popup").catch(console.error);
        }
      }, 300);
    };

    const handleFocus = () => {
      // Cancel pending hide if focus returns quickly (tray re-focus)
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, []);

  // Compute live relative time elapsed text
  useEffect(() => {
    if (!snapshot?.last_updated) return;
    const updateText = () => {
      const elapsed = Math.floor((Date.now() - new Date(snapshot.last_updated).getTime()) / 1000);
      if (elapsed < 10) setTimeDiffText("just now");
      else if (elapsed < 60) setTimeDiffText(`${elapsed}s ago`);
      else setTimeDiffText(`${Math.floor(elapsed / 60)}m ago`);
    };
    updateText();
    const timer = setInterval(updateText, 5000);
    return () => clearInterval(timer);
  }, [snapshot?.last_updated]);

  const handleOpenDashboard = async () => {
    try { await invoke("open_dashboard_window"); } catch (err) { console.error(err); }
  };

  const handleOpenClaude = async () => {
    try { await openUrl("https://claude.ai"); } catch (err) { console.error(err); }
  };

  const handleQuit = async () => {
    try {
      const process = await import("@tauri-apps/plugin-process");
      await process.exit(0);
    } catch (err) { console.error(err); }
  };

  const fiveHour = snapshot?.five_hour_utilization ?? 0;
  const sevenDay = snapshot?.seven_day_utilization ?? 0;
  const plan = snapshot?.plan && snapshot.plan !== "unknown" ? snapshot.plan : "pro";
  const status = snapshot?.status ?? "unauthenticated";

  // The progress bar color — warm coral/orange matching the reference
  const barColor = "#d4764e";
  const trackColor = "rgba(180,180,175,0.35)";

  return (
    // Outer wrapper: fully transparent, only provides spacing for the arrow
    <div style={{ background: "transparent", width: "100%", height: "100%", padding: "6px 0 0 0" }}>

      {/* Arrow pointing up */}
      <div style={{
        position: "absolute",
        top: 0,
        left: "50%",
        transform: "translateX(-50%) rotate(45deg)",
        width: 14,
        height: 14,
        background: "#2c2c2e",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        zIndex: 0,
      }} />

      {/* Main card */}
      <div style={{
        position: "relative",
        zIndex: 1,
        background: "#2c2c2e",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        padding: "16px 18px 24px 18px", // Added 24px bottom padding for extra spacing
        color: "#e5e5e5",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
        fontSize: 13,
        display: "flex",
        flexDirection: "column" as const,
        gap: 0,
        overflowY: "auto",
        userSelect: "none" as const,
        height: "calc(100% - 8px)",
      }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#f5f5f5", letterSpacing: -0.2 }}>Claude</div>
            <div style={{ fontSize: 11, color: "#8e8e93", marginTop: 1 }}>
              Updated {isRefreshing ? "updating..." : timeDiffText}
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#8e8e93", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
            {plan === "max" ? "Max" : plan === "pro" ? "Pro" : plan.toUpperCase()}
          </div>
        </div>

        {status === "unauthenticated" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "24px 16px", textAlign: "center" as const }}>
            <ShieldAlert style={{ width: 32, height: 32, color: "#ff6b6b", marginBottom: 8 }} />
            <div style={{ fontWeight: 600, fontSize: 13, color: "#e5e5e5" }}>Session Expired</div>
            <div style={{ fontSize: 11, color: "#8e8e93", marginTop: 4, lineHeight: 1.4 }}>
              Please log in to Claude Code in your terminal, or enter a custom token in Settings.
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, gap: 12 }}>

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

            {/* Session */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#f5f5f5", marginBottom: 6 }}>Session</div>
              <div style={{ width: "100%", height: 5, borderRadius: 3, background: trackColor, overflow: "hidden" }}>
                <div style={{ width: `${fiveHour}%`, height: "100%", borderRadius: 3, background: barColor, transition: "width 0.5s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8e8e93", marginTop: 4 }}>
                <span>{fiveHour}% used</span>
                <span>Resets in {snapshot?.five_hour_reset_in ?? "N/A"}</span>
              </div>
            </div>

            {/* Weekly */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#f5f5f5", marginBottom: 6 }}>Weekly</div>
              <div style={{ width: "100%", height: 5, borderRadius: 3, background: trackColor, overflow: "hidden" }}>
                <div style={{ width: `${sevenDay}%`, height: "100%", borderRadius: 3, background: barColor, transition: "width 0.5s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8e8e93", marginTop: 4 }}>
                <span>{sevenDay}% used</span>
                <span>Resets in {snapshot?.seven_day_reset_in ?? "N/A"}</span>
              </div>
            </div>

            {/* Antigravity Quota Section */}
            {snapshot?.antigravity_quota ? (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#f5f5f5" }}>Antigravity</div>
                    <div style={{ fontSize: 10, color: "#8e8e93", marginTop: 1 }}>
                      {snapshot.antigravity_quota.email}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#8e8e93", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
                    Gemini
                  </div>
                </div>

                {snapshot.antigravity_quota.models.map((model) => (
                  <div key={model.model_id}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#f5f5f5", marginBottom: 6 }}>
                      {model.label}
                    </div>
                    <div style={{ width: "100%", height: 5, borderRadius: 3, background: trackColor, overflow: "hidden" }}>
                      <div style={{ width: `${model.used_percent}%`, height: "100%", borderRadius: 3, background: barColor, transition: "width 0.5s ease" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8e8e93", marginTop: 4 }}>
                      <span>{model.used_percent}% used</span>
                      <span>Resets in {model.time_until_reset ?? "N/A"}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "8px 0" }} />

        {/* Action items */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 1 }}>
          <MenuItem icon={<BarChart3 style={{ width: 16, height: 16 }} />} label="Open Dashboard" onClick={handleOpenDashboard} />
          <MenuItem icon={<RotateCw style={{ width: 16, height: 16, ...(isRefreshing ? { animation: "spin 1s linear infinite" } : {}) }} />} label="Refresh" onClick={() => forceRefresh()} disabled={isRefreshing} />
          <MenuItem icon={<Info style={{ width: 16, height: 16 }} />} label="About Claude Usage Menu" onClick={handleOpenClaude} />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "6px 0" }} />

        {/* Quit */}
        <MenuItem icon={<Power style={{ width: 16, height: 16 }} />} label="Quit" onClick={handleQuit} />

      </div>
    </div>
  );
};

// Simple menu item component matching the reference style
const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }> = ({ icon, label, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      width: "100%",
      padding: "6px 4px",
      background: "transparent",
      border: "none",
      borderRadius: 6,
      color: disabled ? "#555" : "#d1d1d6",
      fontSize: 13,
      fontWeight: 500,
      fontFamily: "inherit",
      cursor: disabled ? "default" : "pointer",
      textAlign: "left" as const,
      opacity: disabled ? 0.5 : 1,
      transition: "background 0.15s",
    }}
    onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
  >
    <span style={{ color: "#8e8e93", display: "flex", alignItems: "center" }}>{icon}</span>
    {label}
  </button>
);
