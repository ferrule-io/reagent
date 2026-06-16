# Unit u3 — Documentation (desktop/README.md + root README update)

## Goal

Write `desktop/README.md` covering how to run the desktop app in dev, how to build the macOS `.app`, and document the explicitly out-of-scope follow-ups (code-signing, notarization, auto-launch at login, auto-update, Windows/Linux binaries). Also update the root `README.md` to mention the new `desktop/` package and the Electron wrapper.

## Scope

- `desktop/README.md` (new)
- `README.md` (existing — narrow targeted additions only)

No files under `bridge/`, `docs/`, or any other path may be touched.

## Approach

### 1. `desktop/README.md`

Write a short README with the following sections:

**Title:** `# Reagent Desktop`

**What this is** — one paragraph: Electron menu-bar app that wraps the reagent bridge server. It forks `bridge/dist/index.js` as a child process on launch, supervises it (auto-restart on crash), and provides a tray icon for quick access. No browser needed for the web UI — clicking "Open Web UI" opens `http://localhost:4319/` in the default browser.

**Prerequisites**
- `node` in PATH (required in dev and in packaged form for M1 — bundled node is a follow-up).
- Bridge built: `cd bridge && npm run build` (produces `bridge/dist/index.js`).
- `cd desktop && npm install`.

**Running in dev**
```sh
# 1. Build the bridge (if not already built)
cd bridge && npm run build && cd ..

# 2. Run the Electron app in development mode
cd desktop && npm run app:dev
```
A tray icon appears in the macOS menu bar. The bridge starts on `:4319`. The web UI is at `http://localhost:4319/`.

**Building the macOS .app**
```sh
cd desktop && npm run app:build
# Output in desktop/out/
```
The `.app` and `.dmg` are written to `desktop/out/`. The bridge's `dist/` and `node_modules/` are bundled as extra resources inside the `.app` so no separate bridge install is needed.

For a universal (Intel + Apple Silicon) build:
```sh
npm run app:build -- --mac --universal
```

**Tray menu items**
| Item | Behaviour |
|---|---|
| `Reagent Bridge — running/stopped` | Status label (disabled) |
| `http://localhost:4319` | URL label (disabled) |
| Open Web UI | Opens the PWA in the default browser |
| Restart Server | Kills and restarts the bridge child process |
| View Logs | Shows the last 50 lines of bridge stdout/stderr |
| Quit | Kills the bridge and exits the app |

**Follow-ups (out of scope for M1)**
- **Code-signing & notarization** — required for distribution outside the App Store on macOS. Add `CSC_LINK`/`CSC_KEY_PASSWORD` env vars and an `afterSign` hook in `electron-builder.yml`.
- **Auto-launch at login** — use the `auto-launch` npm package or `app.setLoginItemSettings({ openAtLogin: true })`.
- **Auto-update** — integrate `electron-updater` (ships with electron-builder) once a release server/S3 bucket is in place.
- **Windows & Linux binaries** — run `npm run app:build:all` once targets are smoke-tested and signing is arranged. The `electron-builder.yml` already declares win (NSIS) and linux (AppImage + deb) targets.
- **Bundled Node** — for a zero-dependency packaged app, explore `pkg` or the `extraResources` approach of shipping a node binary alongside the .app (trades app size for installation simplicity).

### 2. Root `README.md` update

The existing `README.md` (at `/Users/mquinlan/Workspace/purse/reagent/README.md`) already covers the repo layout. Make two targeted additions:

1. In the **Repo layout** section, add `desktop/` to the directory map with a one-line description:
   ```
   desktop/          Electron menu-bar app wrapping the bridge server (macOS .app)
   ```

2. In the **Quickstart** section, add a note after the "Start the bridge" step:
   ```
   Alternatively, run the Electron desktop app (macOS only, M1):
   cd desktop && npm run app:dev
   ```

3. In the **Status** section, update the M1 line to mention the desktop wrapper:
   ```
   - **M1** — complete. Bridge, plugin, full end-to-end pipeline (terminal + headless phone-driven), approval gate, Tailscale, Electron desktop app.
   ```

No other content in `README.md` should change.

## Acceptance criteria

- `desktop/README.md` exists with sections: prerequisites, dev instructions, build instructions, tray menu table, and follow-ups list (code-signing, auto-launch, auto-update, Windows/Linux, bundled Node).
- Dev instructions in `desktop/README.md` are accurate: `npm run app:dev` is the correct script name (matches `desktop/package.json` from u1).
- Build instructions reference `desktop/out/` as the output directory (matches `electron-builder.yml` from u1).
- Root `README.md` repo layout table includes `desktop/` with a description.
- Root `README.md` quickstart mentions `npm run app:dev` as an alternative way to start the bridge.
- No file other than `desktop/README.md` and `README.md` is modified.
- All cross-references between `desktop/README.md` and `bridge/README.md` / root `README.md` use correct relative paths.
