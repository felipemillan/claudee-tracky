# Claudee Tracky

[![CI Status](https://github.com/felipemillan/MyGITdash/actions/workflows/ci.yml/badge.svg)](https://github.com/felipemillan/MyGITdash/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.gl/badge/License-MIT-yellow.svg)](LICENSE)

**Claudee Tracky** is an ultra-lightweight, native-feeling system tray application that monitors your Claude Code CLI token utilization in real time. It replaces resource-heavy Electron wrappers with a performance-first **Tauri v2 + Rust + React + TypeScript** architecture, running silently in the background while consuming minimal RAM and CPU.

---

## Vision & Core Goals

Keep track of your Claude Code billing blocks and utilization quotas without opening the Anthropic Console website.
- **Immediate Insights**: View your current 5-hour and 7-day token utilization directly from your OS menu bar/system tray.
- **Proactive Alerts**: Receive native desktop notifications before your quotas are fully consumed (customizable thresholds: 75%, 80%, 90%, 95%, 100%).
- **Native Experience**: Runs hidden in the system tray, auto-starts on login, and opens a borderless glassmorphic popup overlay on left click.
- **Zero Overhead**: Idle RAM usage stays well under `40MB`, with less than `1%` CPU utilization.
- **Privacy-First**: No telemetry, no analytics, no external servers. Your settings and API keys are stored strictly on your local machine.

---

## Technology Stack

### Backend
- **Rust** & **Tokio**: Fast, asynchronous event loop.
- **Reqwest**: Thread-safe HTTP client querying Anthropic usage endpoints.
- **Keyring**: Interfaces with macOS Keychain & Windows Credential Manager to resolve active tokens automatically.
- **Tauri v2**: Low-overhead native windowing, system tray integration, and secure IPC.

### Frontend
- **React 19** & **TypeScript**: Type-safe rendering engine.
- **Tailwind CSS v4**: CSS-first compilation with slate/zinc dark mode aesthetics.
- **Zustand**: Global client state synced with Rust event streams.
- **Recharts**: Responsive SVG charts showing historical snapshots.
- **Lucide React**: Clean vector iconography.

---

## Project Structure

```
├── .github/workflows/       # GitHub Actions CI/CD release scripts
├── docs/
│   ├── INSTALLATION.md      # Detailed compilation and target setups
│   ├── DEVELOPER.md         # Architecture diagrams and polling details
│   └── CONTRIBUTING.md      # Guidelines for submitting pull requests
├── src-tauri/
│   ├── src/
│   │   ├── keychain.rs      # Resolves OAuth credentials from secure store
│   │   ├── network.rs       # Anthropic GET requests and backoff timers
│   │   ├── polling.rs       # Tokio background runners
│   │   ├── tray.rs          # System tray rendering and popup positioning
│   │   ├── config.rs        # Persistent configurations and log buffers
│   │   ├── notifications.rs # Gated system notifications
│   │   ├── commands.rs      # IPC endpoints
│   │   └── lib.rs           # Bootstrapping code
│   └── tauri.conf.json      # Declarative windows & permissions
├── src/
│   ├── pages/
│   │   ├── Popup.tsx        # Compact floating tray view
│   │   └── Dashboard.tsx    # Resizable graphs and settings panels
│   ├── stores/              # Zustand global state store
│   ├── types/               # TypeScript models
│   ├── App.tsx              # Router & event listeners
│   └── index.css            # Tailwind directives and glassmorphism styling
├── LICENSE                  # MIT License
└── CHANGELOG.md             # Version history
```

---

## Quickstart

1. **Prerequisites**: Make sure you have the [Rust toolchain](https://rustup.rs/), [Node.js](https://nodejs.org/), and logged in to Claude Code:
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude # Ensure you are logged in
   ```

2. **Clone and Install**:
   ```bash
   git clone https://github.com/felipemillan/MyGITdash.git "claudee tracky"
   cd "claudee tracky"
   npm install
   ```

3. **Run in Development**:
   ```bash
   npm run tauri dev
   ```

4. **Build Release Packages**:
   ```bash
   npm run tauri build
   ```

---

## Guides & Documentation

- [Installation Guide](docs/INSTALLATION.md)
- [Developer & Architecture Guide](docs/DEVELOPER.md)
- [Contributing Guide](docs/CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [License (MIT)](LICENSE)
