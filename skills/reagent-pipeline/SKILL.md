---
name: reagent-pipeline
description: Drive a coding work item through the reagent pipeline — investigate, get human plan approval via the bridge, then execute on a branch. Use when starting or resuming reagent work.
---

# reagent pipeline

You orchestrate one work item through: INTAKE → INVESTIGATE → PLAN_APPROVAL (human gate) → EXECUTE → DONE.
All state and the human approval gate live in the **reagent bridge**, reached via the `reagent-bridge` MCP tools
(`mcp__plugin_reagent_reagent-bridge__*`). The bridge must be running at http://localhost:4319.

You are given `$ARGUMENTS`, beginning with a verb:
- `start <repoPath> <request...>` — begin a new work item.
- `resume <id>` — continue an existing work item.

## Tool reference (bridge)
- `register_work_item({ id, title, repoPath, request, origin })`
- `report_status({ id, phase?, line?, plan?, branch? })`
- `await_decision({ id, prompt })` → returns `{ "status": "pending" }` or `{ "status": "decided", "decision": { "result": "approve"|"reject", "note"? } }`
- `complete_work_item({ id, phase })` where phase ∈ DONE | REJECTED | FAILED

## START flow

1. **INTAKE.** Generate a work item id `wi_<8 hex chars>`. Derive a short `title` from the request. Call
   `register_work_item({ id, title, repoPath, request: "<the full request text>", origin: "terminal" })`.
   Call `report_status({ id, phase: "INVESTIGATE", line: "starting investigation" })`.

2. **INVESTIGATE (read-only).** Explore the target repo (Read/Grep/Glob/Bash for read-only inspection — do NOT edit anything yet).
   Understand the request and the relevant code. Produce a concise **diagnosis + a single proposed direction**
   (2–6 sentences: what's going on, and the approach you propose). Call
   `report_status({ id, phase: "INVESTIGATE", line: "investigation complete", plan: "<diagnosis + proposed direction>" })`.

3. **PLAN_APPROVAL (human gate — autonomous wait).** Call
   `await_decision({ id, prompt: "<the same diagnosis + proposed direction, formatted for a human to approve>" })`.
   - The tool returns `{ "status": "pending" }` after a short server-side wait. **When it does, call it again immediately with the same arguments.** Keep polling in a loop.
   - **This is an unattended wait. Do NOT stop, do NOT ask the user in the terminal, do NOT start other work.** The human answers from the bridge web UI / their phone. Simply keep calling `await_decision` until it returns `{ "status": "decided", ... }`.
   - When decided:
     - If `decision.result === "reject"`: call `complete_work_item({ id, phase: "REJECTED" })`, tell the user it was rejected (include the note if any), and STOP.
     - If `decision.result === "approve"`: proceed to EXECUTE.

4. **EXECUTE (delegated, scoped).** Delegate to the `reagent-executor` subagent (via the Agent tool / `@agent-reagent-executor`),
   passing: the work item `id`, the `repoPath`, the approved `plan`, and the branch `reagent/<id>`.
   The executor makes the change on that branch, commits locally, and reports status. Wait for it to finish.

5. **DONE.** Once the executor reports success, call `complete_work_item({ id, phase: "DONE" })`. Tell the user the branch
   (`reagent/<id>`) and a one-line summary. (Opening a PR is a later milestone — do not push.)

If any step hits an unrecoverable error, call `complete_work_item({ id, phase: "FAILED" })`, report what failed, and stop.

## RESUME flow

1. Fetch the current state of work item `<id>` from the bridge HTTP API (read-only) via Bash:
   `curl -s http://localhost:4319/api/items/<id>` → JSON with `phase`, `plan`, `branch`, `pendingCheckpoint`, `request`, `repoPath`.
2. Determine where it stands and continue the START flow from the appropriate phase, **reconstructing from this state + the live repo** rather than relying on any prior conversation:
   - `phase` INVESTIGATE with no plan → redo INVESTIGATE.
   - `phase` PLAN_APPROVAL with an undecided `pendingCheckpoint` → resume the await_decision poll loop (step 3).
   - `phase` PLAN_APPROVAL already decided, or EXECUTE in progress → resume EXECUTE (step 4) on `reagent/<id>` (the executor is idempotent on its own branch).
   - terminal phase (DONE/REJECTED/FAILED) → report it; nothing to do.

## Guardrails
- INVESTIGATE never edits. Only EXECUTE (via the scoped subagent) edits, only on `reagent/<id>`, never pushing.
- Thread the work item `id` through every bridge call.
- Keep `report_status` lines short and human-readable — they show up live in the bridge UI.
