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

  logLines.push(`[INFO] starting bridge: ${process.execPath} (ELECTRON_RUN_AS_NODE) ${entry}`);
  bridgeProcess = spawn(process.execPath, [entry], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
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

app.on('window-all-closed', () => {
  // Do not quit — the app lives in the tray, not windows.
  // (In a tray-only app this event never fires since no windows are created.)
});
