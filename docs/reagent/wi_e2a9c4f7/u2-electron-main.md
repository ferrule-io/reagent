# Unit u2 — Electron Main Process (Tray + Server Supervisor)

## Goal

Implement `desktop/src/main.ts` — the Electron main process entry point. It must:
1. Fork `bridge/dist/index.js` as a child process on startup (server supervision).
2. Show a macOS menu-bar tray icon with a contextual menu (URL display, Open Web UI, Restart server, View logs, Quit).
3. Restart the bridge child automatically if it crashes.
4. Clean up (kill child) on quit.

No source file under `bridge/src/` or any file outside `desktop/src/` may be touched.

## Scope

- `desktop/src/main.ts` (new — replaces the `.gitkeep` placeholder from u1)
- `desktop/build/tray-icon.png` (new — the tray icon asset)

## Approach

### 1. Fork strategy

`bridge/src/index.ts` defines an unexported `main()` function that calls `process.exit()` on SIGTERM/SIGINT. It has no exported start function and is designed to be a self-contained process entry point. Therefore the correct approach is to **fork `bridge/dist/index.js` as a child process**, not to import it.

Two execution contexts:

- **Dev** (`app:dev`, running from source): bridge's `dist/index.js` is resolved relative to `__dirname` as `../../bridge/dist/index.js`.
- **Packaged** (`.app`): electron-builder copies `bridge/` into `Contents/Resources/bridge/` (see u1 `extraResources`). Resolve it via `process.resourcesPath`.

Branch on `app.isPackaged`:

```ts
function bridgePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bridge', 'dist', 'index.js');
  }
  return path.join(__dirname, '..', '..', 'bridge', 'dist', 'index.js');
}
```

Fork using Node's `child_process.fork` is NOT appropriate here because the bridge is an ESM module (`"type":"module"` in its package.json) and `fork` assumes CJS. Use `child_process.spawn` with the system `node` binary. Document that `node` must be in PATH in dev (it always is in a development environment). For M1, a bundled Node binary is out of scope; see u3 follow-ups.

### 2. Quit-guard variable

To prevent the crash-restart supervisor from re-spawning the bridge after the user clicks Quit, use a module-local boolean:

```ts
let isQuitting = false;
```

Set it to `true` in the Quit menu handler before calling `stopBridge()` and `app.quit()`. Check it in the bridge `'exit'` event handler before scheduling a restart. This avoids both `(app as any).isQuitting` casts and any `declare module 'electron'` augmentation — the flag is entirely local to `main.ts`.

### 3. Tray icon path

The tray icon source file lives at `desktop/build/tray-icon.png`. At runtime the path is resolved differently depending on whether the app is packaged:

- **Dev**: `path.join(__dirname, '..', 'build', 'tray-icon.png')` — `__dirname` is `desktop/dist/` after compilation, so `..` resolves to `desktop/`, and then `build/tray-icon.png` is found in the source tree.
- **Packaged**: electron-builder copies `build/tray-icon.png` into the app via the `extraResources` entry `{ from: "build/tray-icon.png", to: "tray-icon.png" }` (declared in u1's `electron-builder.yml`). At runtime this resolves to `path.join(process.resourcesPath, 'tray-icon.png')`.

Important: `directories.buildResources: build` in `electron-builder.yml` is consumed at BUILD TIME ONLY (for icns, entitlements, etc.) and does NOT cause `build/` contents to be copied into `Contents/Resources/` at runtime. The explicit `extraResources` entry in u1 is what places the icon inside the packaged `.app`.

```ts
function trayIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tray-icon.png');
  }
  return path.join(__dirname, '..', 'build', 'tray-icon.png');
}
```

### 4. Complete `main.ts` implementation

```ts
import { app, Tray, Menu, shell, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const PORT = process.env.REAGENT_HTTP_PORT ?? '4319';
const BASE_URL = `http://localhost:${PORT}`;

let tray: Tray | null = null;
let bridgeProcess: ChildProcess | null = null;
let isQuitting = false;
const logLines: string[] = [];

function bridgePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bridge', 'dist', 'index.js');
  }
  return path.join(__dirname, '..', '..', 'bridge', 'dist', 'index.js');
}

function trayIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tray-icon.png');
  }
  return path.join(__dirname, '..', 'build', 'tray-icon.png');
}

function startBridge() {
  const entry = bridgePath();
  if (!fs.existsSync(entry)) {
    logLines.push(`[ERROR] bridge entry not found: ${entry}`);
    updateMenu('stopped');
    return;
  }

  logLines.push(`[INFO] starting bridge: node ${entry}`);
  bridgeProcess = spawn('node', [entry], {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  bridgeProcess.stdout?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    logLines.push(`[bridge] ${line}`);
    if (logLines.length > 500) logLines.splice(0, logLines.length - 500);
  });

  bridgeProcess.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    logLines.push(`[bridge:err] ${line}`);
    if (logLines.length > 500) logLines.splice(0, logLines.length - 500);
  });

  bridgeProcess.on('exit', (code, signal) => {
    logLines.push(`[INFO] bridge exited (code=${code}, signal=${signal})`);
    bridgeProcess = null;
    updateMenu('stopped');
    // Auto-restart after 2 seconds unless the app is quitting.
    if (!isQuitting) {
      setTimeout(startBridge, 2000);
    }
  });

  updateMenu('running');
}

function stopBridge() {
  if (bridgeProcess) {
    bridgeProcess.kill('SIGTERM');
    bridgeProcess = null;
  }
}

function buildMenu(status: 'running' | 'stopped'): Menu {
  return Menu.buildFromTemplate([
    { label: `Reagent Bridge — ${status}`, enabled: false },
    { label: BASE_URL, enabled: false },
    { type: 'separator' },
    { label: 'Open Web UI', click: () => shell.openExternal(BASE_URL) },
    { type: 'separator' },
    {
      label: 'Restart Server',
      click: () => {
        stopBridge();
        setTimeout(startBridge, 500);
      },
    },
    {
      label: 'View Logs',
      click: () => {
        const recent = logLines.slice(-50).join('\n') || '(no logs yet)';
        dialog.showMessageBox({
          type: 'info',
          title: 'Reagent Bridge Logs',
          message: recent,
          buttons: ['OK'],
        });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        stopBridge();
        app.quit();
      },
    },
  ]);
}

function updateMenu(status: 'running' | 'stopped') {
  tray?.setContextMenu(buildMenu(status));
  tray?.setToolTip(`Reagent Bridge (${status})`);
}

app.on('ready', () => {
  // Prevent the app from appearing in the Dock (menu-bar only).
  if (app.dock) app.dock.hide();

  tray = new Tray(trayIconPath());
  tray.setToolTip('Reagent Bridge');
  updateMenu('stopped');

  // Right-click or left-click both open the menu.
  tray.on('click', () => tray?.popUpContextMenu());

  startBridge();
});

app.on('window-all-closed', (e: Event) => {
  // Prevent default quit behavior — the app lives in the tray, not windows.
  e.preventDefault();
});
```

Key implementation notes:
- `isQuitting` is a plain module-level `let` boolean. There is no `(app as any)` cast and no `declare module 'electron'` augmentation anywhere in the file.
- `dialog` is imported at the top of the file alongside the other Electron imports (no inline `require('electron')` inside the menu handler).
- `trayIconPath()` returns `process.resourcesPath/tray-icon.png` when packaged, matching the `extraResources` destination declared in u1. It returns `__dirname/../build/tray-icon.png` in dev, resolving into the source tree (`desktop/build/tray-icon.png`).

### 5. Tray icon asset

Create a minimal 16x16 (or 32x32) monochrome PNG at `desktop/build/tray-icon.png`. On macOS, a Template Image (named with the `Template` suffix, e.g. `tray-iconTemplate.png`) gives automatic light/dark mode adaptation. For M1 a plain PNG is sufficient — Electron accepts any valid PNG for `new Tray(path)`.

The file must exist at `desktop/build/tray-icon.png` so that:
1. The dev path (`__dirname/../build/tray-icon.png`) resolves correctly at runtime.
2. The `extraResources` entry in u1's `electron-builder.yml` (`from: "build/tray-icon.png"`) can copy it into the packaged app.

### 6. Build verification

After implementing, confirm:

```sh
cd /path/to/reagent/desktop
npm install
npm run build   # must succeed with no tsc errors
```

Then:

```sh
cd /path/to/reagent/bridge
npm run build   # ensure bridge dist is fresh
cd /path/to/reagent/desktop
npm run app:dev # Electron launches, tray icon appears, bridge starts on :4319
```

## Acceptance criteria

- `desktop/src/main.ts` exists and compiles with `tsc` (`npm run build` inside `desktop/` exits 0 with no type errors).
- `desktop/build/tray-icon.png` exists (any valid PNG, even 1x1, so the `Tray` constructor does not throw at runtime).
- `main.ts` contains no `(app as any)` cast and no `declare module 'electron'` augmentation. The quit-guard is implemented as `let isQuitting = false;` at module scope, set to `true` in the Quit handler, and checked in the bridge `'exit'` handler.
- The packaged icon path in `trayIconPath()` is `path.join(process.resourcesPath, 'tray-icon.png')` — consistent with the `extraResources` destination declared in u1 (`to: "tray-icon.png"`). It does NOT use `path.join(process.resourcesPath, 'build', 'tray-icon.png')`.
- The dev icon path in `trayIconPath()` resolves to `desktop/build/tray-icon.png` relative to the compiled `dist/` directory (i.e. `path.join(__dirname, '..', 'build', 'tray-icon.png')`).
- `dialog` is imported at the top of the file with the other Electron imports; no inline `require` calls appear in the code.
- `npm run app:dev` (from `desktop/`) launches Electron, shows a tray icon, and starts the bridge child process on port 4319 (confirmed by `curl http://localhost:4319/api/items` returning a JSON array).
- The tray menu contains: a disabled status/URL label, "Open Web UI", "Restart Server", "View Logs", and "Quit".
- Clicking "Restart Server" kills the existing child and spawns a fresh one without crashing the Electron process.
- Clicking "Quit" sets `isQuitting = true`, kills the bridge child, and exits Electron cleanly (exit code 0).
- If the bridge child exits unexpectedly, it is automatically restarted within 3 seconds (supervisor uses `isQuitting` to suppress restart on intentional quit).
- No file outside `desktop/src/main.ts` and `desktop/build/tray-icon.png` is modified.
- `bridge/src/` is untouched (verify with `git diff --name-only` — no paths under `bridge/src/` appear).
