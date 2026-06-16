# Reagent Desktop

Electron menu-bar app that wraps the reagent bridge server. On launch it forks `bridge/dist/index.js` as a child process, supervises it (auto-restart on crash), and places a tray icon in the macOS menu bar. No browser is needed to reach the web UI — clicking "Open Web UI" opens `http://localhost:4319/` in the default browser.

## Prerequisites

1. **`node` on PATH** — the app forks `node bridge/dist/index.js` directly. Bundling a Node runtime is a planned follow-up; for M1 the packaged `.app` relies on `node` being available on `PATH` at runtime.

2. **Bridge built** — the compiled bridge artifact must exist before launching:

   ```sh
   cd bridge && npm install && npm run build
   # produces bridge/dist/index.js
   ```

3. **Desktop dependencies installed:**

   ```sh
   cd desktop && npm install
   ```

## Running in dev

```sh
# 1. Build the bridge (if not already built)
cd bridge && npm run build && cd ..

# 2. Run the Electron app in development mode
cd desktop && npm run app:dev
```

A tray icon appears in the macOS menu bar. The bridge starts on `:4319`. The web UI is at `http://localhost:4319/`.

## Building the macOS .app

```sh
cd desktop && npm run app:build
# Output in desktop/out/
```

electron-builder produces both a `.dmg` and a `.zip` (for both `x64` and `arm64`) under `desktop/out/`. The bridge's `dist/` and `node_modules/` are bundled as extra resources inside the `.app` via `extraResources` in `electron-builder.yml`, so no separate bridge install is needed on the target machine.

For a universal (Intel + Apple Silicon) single binary:

```sh
cd desktop && npm run app:build -- --mac --universal
```

To build for all platforms (see follow-ups below before running this):

```sh
cd desktop && npm run app:build:all
```

## Tray menu items

| Item | Behaviour |
|---|---|
| `Reagent Bridge — running/stopped` | Status label (disabled) |
| `http://localhost:4319` | URL label (disabled) |
| Open Web UI | Opens the PWA in the default browser |
| Restart Server | Kills and restarts the bridge child process |
| View Logs | Shows the last 50 lines of bridge stdout/stderr in a dialog |
| Quit | Kills the bridge and exits the app |

## Follow-ups (out of scope for M1)

- **Code-signing & notarization** — required for distribution outside the App Store on macOS. Needs `CSC_LINK`/`CSC_KEY_PASSWORD` env vars and an `afterSign` notarization hook in `electron-builder.yml`.
- **Auto-launch at login** — use `app.setLoginItemSettings({ openAtLogin: true })` or the `auto-launch` npm package.
- **Auto-update** — integrate `electron-updater` (ships with electron-builder) once a release server/S3 bucket is in place.
- **Bundled Node runtime** — for a zero-dependency packaged app, ship a node binary via `extraResources` or use `pkg`; trades app size for installation simplicity and removes the PATH requirement.
- **Windows & Linux binaries** — `electron-builder.yml` already declares win (NSIS) and linux (AppImage + deb) targets; run `npm run app:build:all` once those targets are smoke-tested and signing is arranged.

## See also

- [bridge/README.md](../bridge/README.md) — bridge scripts, env vars, MCP surfaces, architecture
- [README.md](../README.md) — repo overview and quickstart
