# Unit: docs-homebrew

## Goal

Update user-facing documentation to surface Homebrew as the recommended install path for the bridge. This includes: adding a "Homebrew" option to the README Quickstart section, and writing a short runbook at `docs/HOMEBREW.md` covering tap setup, `brew services`, and the upgrade path.

## Scope

- `README.md`
- `docs/HOMEBREW.md` (new file)

No other files may be touched in this unit.

## Approach

### 1. README.md — Homebrew option in Quickstart

In the existing "Quickstart" section under "**1. Start the bridge**", add a Homebrew sub-option before the existing `npm run dev` option. The new content should read:

```markdown
**1. Start the bridge**

**Option A — Homebrew (recommended for permanent installs)**

```sh
brew tap ferrule-io/reagent https://github.com/ferrule-io/reagent
brew install reagent-bridge
brew services start reagent-bridge
# bridge is now always-on at http://localhost:4319/
```

See [docs/HOMEBREW.md](docs/HOMEBREW.md) for details, upgrade instructions, and phone access over Tailscale.

**Option B — From source (development)**

```sh
cd bridge && npm run dev
# serves MCP at http://localhost:4319/mcp and the PWA at http://localhost:4319/
```
```

The existing Electron desktop option should remain as "Option C" (or equivalent). The section heading "1. Start the bridge" is unchanged.

Also update the "Learn more" section at the bottom to add a link to `docs/HOMEBREW.md`:
```markdown
- [docs/HOMEBREW.md](docs/HOMEBREW.md) — Homebrew install, brew services, upgrade
```

### 2. docs/HOMEBREW.md — Homebrew runbook

Create `docs/HOMEBREW.md` with the following sections:

```markdown
# Homebrew Install — reagent-bridge

Install and run the reagent bridge as a persistent background service using Homebrew on macOS.

## Install

```sh
brew tap ferrule-io/reagent https://github.com/ferrule-io/reagent
brew install reagent-bridge
```

This builds the bridge from source (requires Homebrew's Node dependency; no separate Node install needed).

## Start as a background service

```sh
brew services start reagent-bridge
```

The bridge starts immediately and is configured to restart automatically on login (via launchd). It listens on port 4319.

Check status:
```sh
brew services info reagent-bridge
```

View logs:
```sh
tail -f $(brew --prefix)/var/log/reagent-bridge.log
```

## Stop / restart

```sh
brew services stop reagent-bridge
brew services restart reagent-bridge
```

## Run once (foreground, no launchd)

```sh
reagent-bridge
```

## Upgrade

When a new version is released:

```sh
brew update
brew upgrade reagent-bridge
brew services restart reagent-bridge
```

## Phone access over Tailscale

After the bridge is running:

```sh
tailscale serve --bg 4319
```

Open `https://<machine>.<tailnet>.ts.net/` on your phone to reach the bridge PWA.

## Uninstall

```sh
brew services stop reagent-bridge
brew uninstall reagent-bridge
brew untap ferrule-io/reagent
```

## Troubleshooting

**Bridge doesn't start**: check logs at `$(brew --prefix)/var/log/reagent-bridge.log`.

**Port 4319 already in use**: `lsof -i :4319` to identify the conflicting process.

**Formula not found after tap**: run `brew update` to refresh the tap index.
```

## Acceptance criteria

- `README.md` Quickstart section has a "Homebrew (recommended for permanent installs)" option with the two-command install + `brew services start` flow, placed before the `npm run dev` option.
- `README.md` "Learn more" section links to `docs/HOMEBREW.md`.
- `docs/HOMEBREW.md` exists and covers: tap + install, `brew services start/stop/restart`, log path, upgrade path (`brew upgrade reagent-bridge`), Tailscale, and uninstall.
- No other files outside `README.md` and `docs/HOMEBREW.md` are modified by this unit.
