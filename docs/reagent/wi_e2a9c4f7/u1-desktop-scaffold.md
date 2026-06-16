# Unit u1 — Desktop Package Scaffold

## Goal

Establish the `desktop/` package at the repo root: its `package.json` (with Electron + electron-builder deps and all npm scripts), `tsconfig.json`, `electron-builder.yml` packaging config, `.gitignore`, and empty `src/` placeholder. This unit creates the skeleton so that u2 (the Electron main process implementation) has a well-defined home and the build toolchain is already wired.

## Scope

- `desktop/package.json` (new)
- `desktop/tsconfig.json` (new)
- `desktop/electron-builder.yml` (new)
- `desktop/.gitignore` (new)
- `desktop/src/.gitkeep` (new placeholder — replaced by u2)

No files outside `desktop/` may be touched.

## Approach

### 1. Decide on `desktop/` location

Place the Electron wrapper at the repo root as `desktop/`, making it a peer of `bridge/`. This keeps `bridge/` truly untouched (no new files inside it), avoids ambiguity about ownership, and matches the common monorepo pattern where each runnable artifact is a top-level package.

### 2. `desktop/package.json`

Create a private ESM package named `reagent-desktop`. Key fields:

```json
{
  "name": "reagent-desktop",
  "version": "0.1.0",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "build":      "tsc -p tsconfig.json",
    "app:dev":    "npm run build && electron .",
    "app:build":  "npm run build && electron-builder --mac",
    "app:build:all": "npm run build && electron-builder --mac --win --linux"
  },
  "dependencies": {
    "electron": "^31.0.0"
  },
  "devDependencies": {
    "electron-builder": "^24.0.0",
    "typescript": "^5.6.3",
    "@types/node": "^22.9.0"
  }
}
```

Notes:
- `"main": "dist/main.js"` points at the compiled Electron entry produced by tsc.
- Electron version: use the latest stable Electron 31 (Node 22 embedded, compatible with bridge deps).
- `electron-builder` stays in devDependencies; it is only used at packaging time.
- No `"type": "module"` — Electron main process runs as CommonJS by default; tsc will emit CJS modules (see tsconfig below).

### 3. `desktop/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

Note: `module: "CommonJS"` is intentional. Electron's main process loads files via Node's CJS loader; ESM support in Electron main has rough edges. The bridge's `dist/index.js` is `type: module` but is forked as a child process, so there is no import interop issue.

### 4. `desktop/electron-builder.yml`

```yaml
appId: com.reagent.desktop
productName: Reagent
copyright: "Copyright © 2024"

directories:
  buildResources: build
  output: out

files:
  - dist/**/*
  - node_modules/**/*
  - package.json

# Extra resources are copied INTO the packaged app at runtime
# (into Contents/Resources/ on macOS). This is distinct from
# `buildResources` which is consumed at build time only (icns,
# entitlements) and is NOT present inside the final .app.
extraResources:
  # Bridge server (compiled artifact) — resolves at runtime as:
  #   path.join(process.resourcesPath, 'bridge', 'dist', 'index.js')
  - from: ../bridge
    to: bridge
    filter:
      - dist/**
      - node_modules/**
      - package.json
      - package-lock.json
  # Tray icon — resolves at runtime as:
  #   path.join(process.resourcesPath, 'tray-icon.png')
  - from: build/tray-icon.png
    to: tray-icon.png

mac:
  category: public.app-category.developer-tools
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip
      arch: [x64, arm64]

# Windows and Linux targets are pre-declared so they work without restructuring;
# activate by running app:build:all or adding --win/--linux flags.
win:
  target:
    - target: nsis
      arch: [x64]

linux:
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
```

Key decisions:
- `extraResources` copies `../bridge` (dist + node_modules) into the macOS .app at `Contents/Resources/bridge/`. The main process will fork `bridge/dist/index.js` using a system `node` binary when packaged (see u2).
- `extraResources` also copies `build/tray-icon.png` into `Contents/Resources/tray-icon.png` so the packaged app can locate the icon at `path.join(process.resourcesPath, 'tray-icon.png')`. The source file lives at `desktop/build/tray-icon.png` and is owned by u2.
- `directories.buildResources: build` tells electron-builder where to find macOS build-time assets (icns, entitlements). This directory is consumed at BUILD TIME ONLY and its files are NOT automatically copied into the packaged `.app` at runtime — that is why the tray icon also needs its own explicit `extraResources` entry.
- Both `x64` and `arm64` mac targets are listed so a universal build is possible later; default `app:build` will pick the host arch.
- Windows/Linux targets are declared but not exercised in M1 — the follow-up work item handles signing + CI for those.

### 5. `desktop/.gitignore`

```
dist/
out/
node_modules/
```

### 6. `desktop/src/.gitkeep`

Empty placeholder so the `src/` directory is tracked. u2 will replace this with `main.ts`.

## Acceptance criteria

- `desktop/package.json` exists with `"name": "reagent-desktop"`, scripts `build`, `app:dev`, `app:build`, `app:build:all`, and both `electron` (dep) and `electron-builder` (devDep).
- `desktop/tsconfig.json` exists with `"module": "CommonJS"` and `"outDir": "dist"`.
- `desktop/electron-builder.yml` exists with `appId`, mac/win/linux target blocks, an `extraResources` entry that copies `../bridge` to `bridge`, and a second `extraResources` entry that copies `build/tray-icon.png` to `tray-icon.png`.
- The `extraResources` and `directories.buildResources` keys are distinct and not conflated. `buildResources` points to `build` (build-time only); the runtime icon copy is handled solely by the `extraResources` entry.
- `desktop/.gitignore` exists and includes `dist/`, `out/`, `node_modules/`.
- `desktop/src/.gitkeep` exists (directory tracked by git).
- No file outside `desktop/` is modified.
- Running `npm install` inside `desktop/` succeeds (package.json is valid JSON with correct dep names).
