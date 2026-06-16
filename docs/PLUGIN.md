# reagent plugin

The session-side half of the reagent harness (M1, Plan 2 of 3). A Claude Code plugin that drives a work item through investigate → plan approval → execute, talking to the always-on **bridge** (see `bridge/`) over MCP-over-HTTP.

## Prerequisite: run the bridge

```sh
cd bridge && npm run dev      # serves MCP at http://localhost:4319/mcp and the PWA at http://localhost:4319/
```

The plugin's `.mcp.json` connects the session to that bridge. Keep it running.

## Installing the plugin (interactive use)

This repo *is* the plugin: `.claude-plugin/{plugin.json,marketplace.json}`, `.mcp.json`, `skills/`, `agents/`, `commands/` at the root. Install it as a local marketplace (confirmed working):

```
/plugin marketplace add /Users/mquinlan/Workspace/purse/reagent
/plugin install reagent@reagent
/reload-plugins
```

Re-sync after editing plugin files: `/plugin marketplace update reagent` + `/reload-plugins` (or remove + re-add). Commands are namespaced `/<plugin>:<command>`.

## Commands (interactive)

- `/reagent:ping` — registers a throwaway work item; confirm it appears at http://localhost:4319/. (Connectivity check.)
- `/reagent:start <repoPath> <request...>` — begin work interactively: the skill investigates `repoPath`, proposes a direction, opens an **approval gate**, and **stays open polling** until you Approve/Reject from the bridge UI. On approval, the scoped `reagent-executor` subagent makes the change on the item's human-readable branch (e.g. `reagent/<slug-of-title>`) and commits.
- `/reagent:resume <id>` — reconstruct an in-flight item from the bridge and continue it.

## How it works

### Pipeline

```
INVESTIGATE → PROPOSE → PLAN (planner) → plan-review → per-unit [ execute → code-review ] → DONE
```

INVESTIGATE and PROPOSE run in the orchestrating session. After the human approves the proposal at the gate, the remaining stages all run as **subagents** — the orchestrator delegates and never implements inline.

### Three subagents

- **`reagent-planner`** (`agents/reagent-planner.md`) — decomposes the approved direction into mutually-exclusive units of work and writes `docs/reagent/<id>/<unitId>.md` plan docs. Runs during PLAN.
- **`reagent-executor`** (`agents/reagent-executor.md`) — implements a single unit on the item's branch (the stored human-readable slug, e.g. `reagent/<slug>`), commits locally, and reports status. Confined to the unit's declared `scope`. Runs once per unit during EXECUTE.
- **`reagent-reviewer`** (`agents/reagent-reviewer.md`) — adversarial, read-only critic that runs in a **fresh context** with no memory of how the work was produced. It runs in two modes:
  - *plan-review* — checks that each unit's scope is grounded in real repo paths, units are mutually exclusive, the approach is feasible, and acceptance criteria are concrete.
  - *code-review* — diffs the unit's commit(s) and validates the **ALL-and-ONLY** criterion: all specified changes are present and no out-of-scope edits slipped in.

The fresh-context, read-only design follows the adversarial code review pattern: https://asdlc.io/patterns/adversarial-code-review/

### Scope guards

- **State + the human gate live in the bridge.** The skill calls `register_work_item`, `report_status`, `await_decision` (polled — an unattended wait answered from the phone), and `complete_work_item`.
- **PLAN is subagent-delegated.** The orchestrator invokes `reagent-planner`; it never decomposes inline.
- **EXECUTE is subagent-delegated.** The orchestrator invokes `reagent-executor` per unit; each executor instance is confined by its `tools:` allow-list (read/edit/git within the target repo — no web, no pushing) and by the unit's declared scope.
- **REVIEW is adversarial and bounded.** Plan-review allows up to 2 replan rounds; per-unit code-review allows up to 2 executor retries. If still failing after the limit, the pipeline calls `complete_work_item({ phase: "FAILED" })` and stops — it never silently proceeds.
- **MCP tool names** follow `mcp__plugin_reagent_reagent-bridge__<tool>`; they're pre-authorized in `.claude/settings.json` so the workflow runs without prompts.

## Headless launch (Plan 3 — phone-driven, validated)

Phone-submitted work is run by **launched headless `claude -p` sessions** that the bridge spawns. Two facts learned the hard way and locked into the Launcher:

1. **Headless does NOT expand plugin slash commands**, so the session invokes the skill in natural language: `Use the reagent:reagent-pipeline skill with arguments: <verb> <args>`.
2. **Headless does NOT see user-installed plugins**, so the plugin is loaded explicitly with `--plugin-dir <repo-root>`.

The exact launch command (what the bridge runs; also runnable by hand to validate):

```sh
cd <repoPath> && ANTHROPIC_API_KEY= claude -p \
  "Use the reagent:reagent-pipeline skill with arguments: start-async <id> <repoPath> <request>" \
  --plugin-dir /Users/mquinlan/Workspace/purse/reagent \
  --output-format json \
  --permission-mode acceptEdits \
  --allowedTools "Read,Edit,Write,Bash,Grep,Glob,Task,mcp__plugin_reagent_reagent-bridge__*,mcp__reagent-bridge__*"
```

- `ANTHROPIC_API_KEY=` keeps it on the subscription (the Launcher forces it undefined in the spawn env).
- `acceptEdits` + the `--allowedTools` list make it run prompt-free.
- `--plugin-dir` defaults in the bridge to the repo root (computed from the bridge module location); override with `REAGENT_PLUGIN_DIR`. Permission mode / tools are overridable via `REAGENT_LAUNCH_PERMISSION_MODE` / `REAGENT_LAUNCH_ALLOWED_TOOLS`.

**The launched flow (`origin: "phone"`):** new work from the PWA → bridge `startAsync` → the session investigates, opens the gate, and **exits** → you approve from the phone → bridge `resume` re-launches → the session executes and reaches DONE. (Interactive `start`, `origin: "terminal"`, stays open and polls instead — no re-launch.)

## Remote access (Tailscale)

The bridge listens on `0.0.0.0:4319` with no auth — Tailscale is the access boundary:

```sh
tailscale serve --bg 4319    # then open https://<machine>.<tailnet>.ts.net/ on your phone
```

Do not expose `:4319` publicly.
