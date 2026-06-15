# reagent plugin

The session-side half of the reagent harness (M1, Plan 2 of 3). A Claude Code plugin that drives a work item through investigate → plan approval → execute, talking to the always-on **bridge** (see `bridge/`) over MCP-over-HTTP.

## Prerequisite: run the bridge

```sh
cd bridge && npm run dev      # serves MCP at http://localhost:4319/mcp and the PWA at http://localhost:4319/
```

The plugin's `.mcp.json` connects the session to that bridge. Keep it running.

## Loading the plugin (confirm for your Claude Code version)

This repo *is* the plugin: `.claude-plugin/plugin.json`, `.mcp.json`, `skills/`, `agents/`, `commands/` at the root. Load it via one of (confirm which your version supports):

- Starting `claude` in the repo (a project-level plugin/`.mcp.json` may load automatically), or
- a local-plugin dev flag (`claude --plugin-dir .` or equivalent — check `claude --help`), or
- a local marketplace: `/plugin marketplace add .` then `/plugin install reagent`.

Verify it loaded: `/reagent` is available, and the `reagent-bridge` MCP tools are connected (ask the session to list its `reagent-bridge` tools).

## Commands

- `/reagent ping` — registers a throwaway work item; confirm it appears at http://localhost:4319/. (Connectivity check.)
- `/reagent start <repoPath> <request...>` — begin work: the skill investigates `repoPath`, proposes a direction, and opens an **approval gate**. Approve/Reject from the bridge web UI (or your phone). On approval, the scoped `reagent-executor` subagent makes the change on branch `reagent/<id>` and commits locally.
- `/reagent resume <id>` — reconstruct an in-flight item from the bridge and continue it.

## How it works

- **State + the human gate live in the bridge.** The skill calls `register_work_item`, `report_status`, `await_decision` (polled — an unattended wait answered from the phone), and `complete_work_item`.
- **Scope guard:** EXECUTE runs in the `reagent-executor` subagent, whose `tools:` allow-list confines it to read/edit/git within the target repo (no web, no pushing). Per-unit path scoping + parallel worktrees come in a later milestone.
- **MCP tool names** follow `mcp__plugin_reagent_reagent-bridge__<tool>`; they're pre-authorized in `.claude/settings.json` so the workflow runs without prompts.

## Marketplace (finalized in Plan 3)

Eventually: `/plugin marketplace add <this-repo>` → `/plugin install reagent`. Plan 3 also adds headless session launch from the phone (the bridge spawns a `claude -p` session running this plugin) and bundles/auto-starts the bridge, so the manual "run the bridge / load the plugin" steps go away.
