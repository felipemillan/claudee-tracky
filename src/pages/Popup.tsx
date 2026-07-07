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
        padding: "16px 18px",
        color: "#e5e5e5",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
        fontSize: 13,
        display: "flex",
        flexDirection: "column" as const,
        gap: 0,
        userSelect: "none" as const,
        height: "calc(100% - 8px)",
      }}>

        {/* 2 Columns container */}
        <div style={{ flex: 1, display: "flex", flexDirection: "row" as const, gap: 20, minHeight: 0 }}>
          
          {/* Left Column: Claude */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
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

            <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

            {status === "unauthenticated" ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "16px 8px", textAlign: "center" as const }}>
                <ShieldAlert style={{ width: 28, height: 28, color: "#ff6b6b", marginBottom: 6 }} />
                <div style={{ fontWeight: 600, fontSize: 12, color: "#e5e5e5" }}>Session Expired</div>
                <div style={{ fontSize: 10, color: "#8e8e93", marginTop: 4, lineHeight: 1.3 }}>
                  Please log in to Claude Code in terminal or enter custom token in Settings.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                {/* Session */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#f5f5f5", marginBottom: 6 }}>Session</div>
                  <div style={{ width: "100%", height: 5, borderRadius: 3, background: trackColor, overflow: "hidden" }}>
                    <div style={{ width: `${fiveHour}%`, height: "100%", borderRadius: 3, background: barColor, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8e8e93", marginTop: 4 }}>
                    <span>{fiveHour}% used</span>
                    <span>Resets in {snapshot?.five_hour_reset_in ?? "N/A"}</span>
                  </div>
                </div>

                {/* Weekly */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#f5f5f5", marginBottom: 6 }}>Weekly</div>
                  <div style={{ width: "100%", height: 5, borderRadius: 3, background: trackColor, overflow: "hidden" }}>
                    <div style={{ width: `${sevenDay}%`, height: "100%", borderRadius: 3, background: barColor, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8e8e93", marginTop: 4 }}>
                    <span>{sevenDay}% used</span>
                    <span>Resets in {snapshot?.seven_day_reset_in ?? "N/A"}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Vertical Separator */}
          <div style={{ width: 1, background: "rgba(255,255,255,0.06)", alignSelf: "stretch" }} />

          {/* Right Column: Antigravity */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, gap: 12, minHeight: 0 }}>
            {snapshot?.antigravity_quota ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#f5f5f5", letterSpacing: -0.2 }}>Antigravity</div>
                    <div style={{ fontSize: 10, color: "#8e8e93", marginTop: 1, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {snapshot.antigravity_quota.email}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#8e8e93", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
                    Gemini
                  </div>
                </div>

                <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

                <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, gap: 12, overflowY: "auto", paddingRight: 4 }}>
                  {snapshot.antigravity_quota.models.map((model) => (
                    <div key={model.model_id}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#f5f5f5", marginBottom: 5 }}>
                        {model.label}
                      </div>
                      <div style={{ width: "100%", height: 5, borderRadius: 3, background: trackColor, overflow: "hidden" }}>
                        <div style={{ width: `${model.used_percent}%`, height: "100%", borderRadius: 3, background: barColor, transition: "width 0.5s ease" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8e8e93", marginTop: 4 }}>
                        <span>{model.used_percent}% used</span>
                        <span>Resets in {model.time_until_reset ?? "N/A"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", opacity: 0.5, textAlign: "center" as const, padding: "16px 8px" }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>Antigravity Offline</div>
                <div style={{ fontSize: 10, marginTop: 4, lineHeight: 1.3 }}>Open Antigravity IDE to view Gemini quota.</div>
              </div>
            )}
          </div>

        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "14px 0 10px 0" }} />

        {/* Action Button Row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <MenuItemButton icon={<BarChart3 style={{ width: 14, height: 14 }} />} label="Dashboard" onClick={handleOpenDashboard} />
            <MenuItemButton icon={<RotateCw style={{ width: 14, height: 14, ...(isRefreshing ? { animation: "spin 1s linear infinite" } : {}) }} />} label="Refresh" onClick={() => forceRefresh()} disabled={isRefreshing} />
            <MenuItemButton icon={<Info style={{ width: 14, height: 14 }} />} label="About" onClick={handleOpenClaude} />
          </div>
          <MenuItemButton icon={<Power style={{ width: 14, height: 14 }} />} label="Quit" onClick={handleQuit} variant="danger" />
        </div>

      </div>
    </div>
  );
};

// Clean button for action items
const MenuItemButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "normal" | "danger";
}> = ({ icon, label, onClick, disabled, variant = "normal" }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const baseBg = "rgba(255,255,255,0.03)";
  const hoverBg = variant === "danger" ? "rgba(255, 107, 107, 0.15)" : "rgba(255,255,255,0.07)";
  const activeColor = variant === "danger" ? "#ff6b6b" : "#f5f5f5";
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 6,
        background: isHovered ? hoverBg : baseBg,
        border: "none",
        color: isHovered ? activeColor : "#a5a5a5",
        cursor: disabled ? "default" : "pointer",
        fontSize: 11,
        fontWeight: 500,
        fontFamily: "inherit",
        transition: "all 0.15s ease",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};
