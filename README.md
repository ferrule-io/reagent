<p align="center">
  <img src="assets/brand/lockup.svg" alt="reagent" height="48" />
</p>

# reagent

Phone-drivable Claude Code coding harness with human approval gates.

## What is reagent

reagent lets you kick off and approve coding work from your phone. You describe a task, reagent's pipeline investigates the codebase, proposes a direction, and waits at a human approval gate before writing any code. You read the proposal on your phone, approve or reject it, and reagent executes — committing the change on a scoped branch. The whole loop runs unattended; you only need to be present at the gate.

## Architecture

reagent has two halves:

**Plugin** (this repo root) — a Claude Code plugin loaded into any Claude Code session. It drives a work item through the pipeline using a skill (`skills/reagent-pipeline`), three subagents (`agents/`), and slash commands (`commands/`). It talks to the bridge over MCP-over-HTTP.

**Bridge** (`bridge/`) — an always-on Node/TypeScript hub that holds per-item state and mediates the human gate. It serves HTTP + a PWA + MCP on `:4319`. State is durable (YAML per item); the bridge can be restarted and will reconstruct open items from disk.

**Pipeline:** each work item moves through these phases:

```
INVESTIGATE → PROPOSE → PLAN (planner) → plan-review → per-unit [ execute → code-review ] → DONE
```

INVESTIGATE and PROPOSE run in the orchestrating session. After PROPOSE, the bridge opens an **approval gate** — you see the proposal in the PWA on your phone and Approve or Reject. On approval, PLAN, EXECUTE, and all review steps run as **subagents**: a `reagent-planner` decomposes the work, a `reagent-executor` implements each unit on the item's branch, and an adversarial `reagent-reviewer` validates each step in a fresh context. See [docs/PLUGIN.md](docs/PLUGIN.md) for full detail on the subagents and review loop.

## Quickstart

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

**Option C — Electron desktop app (macOS only, M1)**

```sh
cd desktop && npm run app:dev
# tray icon appears in menu bar; bridge starts automatically on :4319
```

See [desktop/README.md](desktop/README.md) for build and packaging instructions.

Keep this running. For phone access over Tailscale:

```sh
tailscale serve --bg 4319    # open https://<machine>.<tailnet>.ts.net/ on your phone
```

**2. Install the plugin**

In a Claude Code session:

```
/plugin marketplace add /path/to/reagent
/plugin install reagent@reagent
/reload-plugins
```

**3. Start a work item**

```
/reagent:start <repoPath> <request>
```

The session investigates `repoPath`, proposes a direction, and opens an approval gate. Approve from the bridge UI (locally or on your phone); reagent executes and commits on the item's branch (a human-readable slug, e.g. `reagent/<slug>`).

Other commands:

- `/reagent:ping` — connectivity check; confirm the item appears at `http://localhost:4319/`
- `/reagent:resume <id>` — reconstruct and continue an in-flight item

## Repo layout

```
.claude-plugin/   plugin.json + marketplace.json (plugin identity)
.mcp.json         wires the session to the bridge MCP endpoint
skills/           reagent-pipeline skill (orchestrator: INVESTIGATE→PROPOSE→PLAN→EXECUTE)
agents/           reagent-planner, reagent-executor, reagent-reviewer subagents
commands/         /reagent:start, :ping, :resume, :version
bridge/           always-on hub (HTTP + PWA + MCP on :4319)
desktop/          Electron menu-bar app wrapping the bridge server (macOS .app)
docs/             PLUGIN.md, bridge details, work item plans
```

## Status

- **M1** — complete. Bridge, plugin, full end-to-end pipeline (terminal + headless phone-driven), approval gate, Tailscale, Electron desktop app.
- **M2** — full pipeline (per-unit path scoping, parallel worktrees, richer proposal UI).

## Learn more

- [docs/HOMEBREW.md](docs/HOMEBREW.md) — Homebrew install, brew services, upgrade
- [docs/PLUGIN.md](docs/PLUGIN.md) — plugin install, commands, headless launch, Tailscale details
- [bridge/README.md](bridge/README.md) — bridge scripts, env vars, surfaces, architecture
