# Installation Guide

Follow these instructions to set up and run Claudee Tracky on your machine.

## Prerequisites

Before building or running the application, make sure you have the following tools installed:

1. **Rust & Cargo** (v1.75+): Install via [rustup.rs](https://rustup.rs/)
2. **Node.js** (v18+): Download from [nodejs.org](https://nodejs.org/)
3. **Claude Code CLI**: Installed and logged in on your system.
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude
   ```
   *Verify you are logged in by running the `/usage` command inside the Claude Code interface.*

---

## Getting Started (Development Mode)

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/felipemillan/MyGITdash.git "claudee tracky"
   cd "claudee tracky"
   ```

2. **Install Frontend Dependencies**:
   ```bash
   npm install
   ```

3. **Launch the Application**:
   ```bash
   npm run tauri dev
   ```
   Tauri will boot up the Vite frontend dev server and compile the Rust backend, opening the application directly into your macOS Menu Bar / System Tray.

---

## Building Production Packages

To bundle the application into a compact, optimized standalone binary:

### macOS (Universal / Intel / Apple Silicon)

```bash
npm run tauri build
```
This generates a DMG installer and a `.app` bundle located under `src-tauri/target/release/bundle/dmg/` or `src-tauri/target/release/bundle/macos/`.

### Windows (x64)

```bash
npm run tauri build
```
This packages the app into an MSI installer and a standalone `.exe` under `src-tauri/target/release/bundle/msi/`.

### Linux (AppImage & Debian Package)

```bash
npm run tauri build
```
This builds an `.AppImage` and a `.deb` package under `src-tauri/target/release/bundle/appimage/` and `src-tauri/target/release/bundle/deb/`. Ensure you have system compiler libraries (`libwebkit2gtk-4.0-dev`, `build-essential`, `curl`) installed on your Linux distro before building.
