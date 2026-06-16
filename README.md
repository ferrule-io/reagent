# reagent

Phone-drivable Claude Code coding harness with human approval gates.

## What is reagent

reagent lets you kick off and approve coding work from your phone. You describe a task, reagent's pipeline investigates the codebase, proposes a direction, and waits at a human approval gate before writing any code. You read the proposal on your phone, approve or reject it, and reagent executes — committing the change on a scoped branch. The whole loop runs unattended; you only need to be present at the gate.

## Architecture

reagent has two halves:

**Plugin** (this repo root) — a Claude Code plugin loaded into any Claude Code session. It drives a work item through the pipeline using a skill (`skills/reagent-pipeline`), a scoped executor subagent (`agents/reagent-executor.md`), and slash commands (`commands/`). It talks to the bridge over MCP-over-HTTP.

**Bridge** (`bridge/`) — an always-on Node/TypeScript hub that holds per-item state and mediates the human gate. It serves HTTP + a PWA + MCP on `:4319`. State is durable (YAML per item); the bridge can be restarted and will reconstruct open items from disk.

**Pipeline:** each work item moves through four phases:

```
INVESTIGATE  →  PROPOSE  →  PLAN  →  EXECUTE
```

INVESTIGATE and PROPOSE run autonomously. After PROPOSE, the bridge opens an **approval gate** — you see the proposal in the PWA on your phone and Approve or Reject. On approval, the PLAN and EXECUTE phases run and commit the result on a `reagent/<id>` branch.

## Quickstart

**1. Start the bridge**

```sh
cd bridge && npm run dev
# serves MCP at http://localhost:4319/mcp and the PWA at http://localhost:4319/
```

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

The session investigates `repoPath`, proposes a direction, and opens an approval gate. Approve from the bridge UI (locally or on your phone); reagent executes and commits on `reagent/<id>`.

Other commands:

- `/reagent:ping` — connectivity check; confirm the item appears at `http://localhost:4319/`
- `/reagent:resume <id>` — reconstruct and continue an in-flight item

## Repo layout

```
.claude-plugin/   plugin.json + marketplace.json (plugin identity)
.mcp.json         wires the session to the bridge MCP endpoint
skills/           reagent-pipeline skill (INVESTIGATE→PROPOSE→PLAN→EXECUTE)
agents/           reagent-executor subagent (scoped: read/edit/git only)
commands/         /reagent:start, :ping, :resume, :version
bridge/           always-on hub (HTTP + PWA + MCP on :4319)
docs/             PLUGIN.md, bridge details, work item plans
```

## Status

- **M1** — complete. Bridge, plugin, full end-to-end pipeline (terminal + headless phone-driven), approval gate, Tailscale.
- **M2** — full pipeline (per-unit path scoping, parallel worktrees, richer proposal UI).

## Learn more

- [docs/PLUGIN.md](docs/PLUGIN.md) — plugin install, commands, headless launch, Tailscale details
- [bridge/README.md](bridge/README.md) — bridge scripts, env vars, surfaces, architecture
