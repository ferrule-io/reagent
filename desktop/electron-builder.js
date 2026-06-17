// electron-builder.js — CommonJS build config for electron-builder 24.
//
// WHY JS INSTEAD OF YAML:
// electron-builder 24 reads the YAML config via plain js-yaml with no
// environment-variable substitution pass for arbitrary keys. The
// notarize.teamId value is read directly from the parsed object
// (this.platformSpecificBuildOptions.notarize.teamId in macPackager.js).
// A "${env.APPLE_TEAM_ID}" literal in YAML would be passed as-is to
// notarytool and fail. A JS config lets us read process.env at build time.
//
// HOW NOTARIZATION IS SELECTED (electron-builder 24.13.3 macPackager.js:460):
//   • notarize: true   → legacy altool path (decommissioned by Apple Nov 2023) — BROKEN
//   • notarize: false  → skipped entirely (safe for unsigned local builds)
//   • notarize: { teamId: "..." } → modern notarytool path — CORRECT
// APPLE_TEAM_ID is NOT auto-read by electron-builder; it must be supplied here.
// APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD ARE auto-read from the environment
// by electron-builder when the notarytool path is active.

'use strict';

module.exports = {
  appId: 'com.reagent.desktop',
  productName: 'Reagent',
  copyright: 'Copyright © 2024',

  directories: {
    buildResources: 'build',
    output: 'out',
  },

  files: [
    'dist/**/*',
    'node_modules/**/*',
    'package.json',
  ],

  // Extra resources are copied INTO the packaged app at runtime
  // (into Contents/Resources/ on macOS). This is distinct from
  // `buildResources` which is consumed at build time only (icns,
  // entitlements) and is NOT present inside the final .app.
  extraResources: [
    // Bridge server (compiled artifact) — resolves at runtime as:
    //   path.join(process.resourcesPath, 'bridge', 'dist', 'index.js')
    {
      from: '../bridge',
      to: 'bridge',
      filter: ['dist/**', 'node_modules/**', 'package.json', 'package-lock.json'],
    },
    // Tray icon — resolves at runtime as:
    //   path.join(process.resourcesPath, 'tray-icon.png')
    {
      from: 'build/tray-icon.png',
      to: 'tray-icon.png',
    },
    // Retina tray icon — Electron auto-resolves @2x when it exists alongside 1x.
    {
      from: 'build/tray-icon@2x.png',
      to: 'tray-icon@2x.png',
    },
  ],

  mac: {
    icon: 'build/icon.icns',
    category: 'public.app-category.developer-tools',

    // Hardened runtime is required for notarization; also best security practice.
    hardenedRuntime: true,

    // Suppress local Gatekeeper check during CI build — it always fails before
    // notarization is complete and the ticket is stapled.
    gatekeeperAssess: false,

    // Entitlements plists (created in u1). Paths are relative to buildResources (build/).
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',

    // notarize:
    //   When APPLE_TEAM_ID is set (CI with secrets): { teamId: '...' }
    //     → triggers the modern notarytool path in macPackager.js line 471.
    //   When APPLE_TEAM_ID is unset (local dev / unsigned builds): false
    //     → notarization is cleanly skipped; build succeeds unsigned.
    // APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD are read automatically by
    // electron-builder from the environment when notarytool is active.
    notarize: process.env.APPLE_TEAM_ID
      ? { teamId: process.env.APPLE_TEAM_ID }
      : false,

    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ],
  },

  // Windows and Linux targets are pre-declared so they work without restructuring;
  // activate by running app:build:all or adding --win/--linux flags.
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
    ],
  },

  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
    ],
  },

  afterAllArtifactBuild: async (buildResult) => {
    // Only run when signing credentials are present (CI with secrets).
    // Unsigned local builds skip this entirely.
    if (!process.env.APPLE_TEAM_ID) return;

    const { execFileSync } = require('node:child_process');
    const dmgs = buildResult.artifactPaths.filter((p) => p.endsWith('.dmg'));

    for (const dmg of dmgs) {
      console.log(`[afterAllArtifactBuild] Signing DMG: ${dmg}`);
      execFileSync(
        'codesign',
        [
          '--sign', 'Developer ID Application',
          '--timestamp',
          '--verbose',
          dmg,
        ],
        { stdio: 'inherit' },
      );

      console.log(`[afterAllArtifactBuild] Notarizing DMG: ${dmg}`);
      execFileSync(
        'xcrun',
        [
          'notarytool', 'submit',
          '--apple-id', process.env.APPLE_ID,
          '--password', process.env.APPLE_APP_SPECIFIC_PASSWORD,
          '--team-id', process.env.APPLE_TEAM_ID,
          '--wait',
          dmg,
        ],
        { stdio: 'inherit' },
      );

      console.log(`[afterAllArtifactBuild] Stapling DMG: ${dmg}`);
      execFileSync(
        'xcrun',
        ['stapler', 'staple', dmg],
        { stdio: 'inherit' },
      );
    }
  },
};
