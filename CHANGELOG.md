# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-07

### Added
- Scaffolding of modern **Tauri v2 + Rust + React + TypeScript** architecture.
- Background polling daemon in Rust using Tokio async loop for real-time Claude Code usage tracking.
- Secure token resolution automatically reading credentials from macOS Keychain (`Claude Code-credentials` service) with fallback and custom API token overrides.
- Dual-window layout:
  - Floating borderless system tray popup centered beneath the tray icon with dynamic SVG utilization dials.
  - Resizable primary dashboard window containing detailed usage stats, Recharts area charts, settings, and live logging.
- Gated notification system firing alerts when usage breaches custom thresholds (e.g. 75%, 80%, 90%, 95%, 100%) with duplicate alert suppression.
- CSV export utility to download recorded usage history.
- Dynamic theme selection supporting Light, Dark, and System appearance.
- Native login items autostart support via `tauri-plugin-autostart`.
