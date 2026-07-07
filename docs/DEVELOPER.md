# Developer Guide & Architecture

This document provides a technical walkthrough of Claudee Tracky's architecture, detailing how the Rust backend and React frontend interact.

## Architecture Overview

Claudee Tracky utilizes **Tauri v2** to separate system-level tasks (networking, credentials, background timers) from the UI layer (React, Tailwind, Recharts).

```
┌────────────────────────────────────────────────────────┐
│                    REACT FRONTEND                      │
│  - Presentation Layer & Charts (Recharts)               │
│  - State Management (Zustand)                          │
│  - Layout Views (Dashboard & Tray Popup)               │
└──────────────────────────┬─────────────────────────────┘
                           │
             IPC Invocation│  Tauri Events
             (Tauri Cmds)  │  (usage-updated, etc.)
                           ▼
┌────────────────────────────────────────────────────────┐
│                     TAURI RUST BACKEND                 │
│  - Polling Loop: Multi-threaded async Tokio daemon      │
│  - Keychain: Reads credentials securely via Keyring     │
│  - Persistence: Config & history saved locally         │
│  - Notifications: Native OS-level alerts               │
└──────────────────────────┬─────────────────────────────┘
                           │
                 HTTPS GET │ (Authorization Bearer)
                           ▼
              ┌──────────────────────────┐
              │  Anthropic API Console   │
              └──────────────────────────┘
```

---

## Component Layout

* **`src-tauri/src/`**
  * `keychain.rs`: Looks up the `"Claude Code-credentials"` service entry in the macOS Keychain/Windows Credential Manager to parse the active OAuth token.
  * `network.rs`: Makes requests to `api.anthropic.com/api/oauth/usage` and classifies HTTP statuses (401/429/500/offline).
  * `polling.rs`: Runs a loop sleeping for `refresh_interval` seconds, which can be interrupted early via a channel when a manual refresh is triggered.
  * `config.rs`: Safely reads/writes JSON files in the user's application data directory, and exposes a thread-safe static OnceLock logs buffer.
  * `notifications.rs`: Gated checking logic preventing duplicate notifications until usage resets.
  * `tray.rs`: Instantiates the system tray menu and positions the borderless, transparent webview window directly below the tray coordinate.
  * `commands.rs`: Maps frontend invocations to backend tasks.
  * `lib.rs`: Boots up plugins, configures app state, registers listeners, and controls the exit cycle.

* **`src/`**
  * `App.tsx`: Main router routing between popup and dashboard views. Establishes Tauri event listeners on mount to sync Rust data changes to state.
  * `index.css`: Imports Tailwind CSS v4, initializes the dark mode design token palette, and overrides root transparency.
  * `stores/useAppStore.ts`: Zustand store for state caching.
  * `pages/Popup.tsx`: Small, glassmorphic layout displaying radial SVG progress dials and action triggers.
  * `pages/Dashboard.tsx`: Large layout featuring Recharts area charts, settings panels, and scrollable logging console.

---

## Polling & Backoff Strategy

The Rust background task implements exponential backoff on HTTP/connection failures:
1. **First Failure**: Retries in 5 seconds.
2. **Second Failure**: Retries in 10 seconds.
3. **Third Failure**: Retries in 20 seconds (updates state status to `"offline"` or `"error"`, showing a banner to the user).
4. **Fourth Failure**: Retries in 40 seconds.
5. **Fifth+ Failure**: Retries in 60 seconds.

If a successful poll is completed, the failure counter resets to 0 and normal polling interval resumes. If an authentication failure (HTTP 401/403) occurs, the polling pauses until credentials are refreshed.
