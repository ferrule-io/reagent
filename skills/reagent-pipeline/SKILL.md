---
name: reagent-pipeline
description: Drive a coding work item through the reagent pipeline — investigate, get human plan approval via the bridge, then execute on a branch. Use when starting or resuming reagent work.
---

# reagent pipeline

You orchestrate one work item through: INTAKE → INVESTIGATE → PLAN_APPROVAL (human gate) → EXECUTE → DONE.
All state and the human approval gate live in the **reagent bridge**, reached via the `reagent-bridge` MCP tools
(`mcp__plugin_reagent_reagent-bridge__*`). The bridge must be running at http://localhost:4319.

You are given `$ARGUMENTS`, beginning with a verb:
- `start <repoPath> <request...>` — begin a new work item **interactively**: you stay open and poll the gate until the human decides.
- `start-async <id> <repoPath> <request...>` — begin a **launched** work item with a pre-assigned `id`: investigate, open the gate, then **end your turn** (the bridge re-launches you to continue after approval). You are short-lived — never poll.
- `resume <id>` — continue a launched work item: do the next single step, then end your turn if still waiting.

## Tool reference (bridge)
- `register_work_item({ id, title, repoPath, request, origin })` (no-op if `id` already exists)
- `report_status({ id, phase?, line?, plan?, branch? })`
- `await_decision({ id, prompt })` → returns `{ "status": "pending" }` or `{ "status": "decided", "decision": { "result": "approve"|"reject", "note"? } }`
- `complete_work_item({ id, phase })` where phase ∈ DONE | REJECTED | FAILED

## INVESTIGATE (shared, read-only)
Explore the target repo (Read/Grep/Glob/Bash for read-only inspection — do NOT edit anything). Understand the request and the
relevant code. Produce a concise **diagnosis + a single proposed direction** (2–6 sentences). Then call
`report_status({ id, phase: "INVESTIGATE", line: "investigation complete", plan: "<diagnosis + proposed direction>" })`.

## EXECUTE (shared, delegated + scoped)
Delegate to the `reagent-executor` subagent (Agent tool / `@agent-reagent-executor`), passing the work item `id`, the `repoPath`,
the approved `plan`, and the branch `reagent/<id>`. It makes the change on that branch, commits locally, and reports status. When it
finishes, call `complete_work_item({ id, phase: "DONE" })` and report the branch + a one-line summary. (Do not push — PRs are a later milestone.)

---

## `start` (interactive)

1. **INTAKE.** Generate a work item id `wi_<8 hex chars>`. Derive a short `title`. Call
   `register_work_item({ id, title, repoPath, request: "<full request text>", origin: "terminal" })` and
   `report_status({ id, phase: "INVESTIGATE", line: "starting investigation" })`.
2. **INVESTIGATE** (shared step above).
3. **PLAN_APPROVAL (poll).** Call `await_decision({ id, prompt: "<diagnosis + proposed direction, for a human>" })`.
   - On `{ "status": "pending" }`, **call it again immediately** with the same arguments. Keep polling.
   - **Unattended wait: do NOT stop, do NOT ask the user, do NOT start other work.** The human answers from the bridge UI / phone. Loop until `decided`.
   - On `decided`: reject → `complete_work_item({ id, phase: "REJECTED" })`, report, STOP. approve → **EXECUTE** (shared step).

## `start-async <id> <repoPath> <request...>` (launched — short-lived)

1. **INTAKE.** Use the **given `id`** (do NOT generate one). Derive a short `title`. Call
   `register_work_item({ id, title, repoPath, request: "<full request text>", origin: "phone" })` (no-op if the bridge already created it) and
   `report_status({ id, phase: "INVESTIGATE", line: "starting investigation" })`.
2. **INVESTIGATE** (shared step above).
3. **PLAN_APPROVAL (open + exit).** Call `await_decision({ id, prompt: "<diagnosis + proposed direction>" })` **exactly once**.
   - On `{ "status": "pending" }` (expected): **end your turn now** — report "gate opened; awaiting approval (the bridge will resume me)." Do NOT poll.
   - On `decided` (already approved/rejected): handle as in `start` step 3 (execute or complete REJECTED), then end.

## `resume <id>` (launched — short-lived, one step then exit)

1. Fetch state (read-only) via Bash: `curl -s http://localhost:4319/api/items/<id>` → JSON with `phase`, `plan`, `branch`, `pendingCheckpoint`, `request`, `repoPath`. Reconstruct from this + the live repo — do NOT rely on prior conversation.
2. Branch on state:
   - terminal (`DONE`/`REJECTED`/`FAILED`) → report it; nothing to do.
   - `pendingCheckpoint` present **and decided**: approve → **EXECUTE** (shared step); reject → `complete_work_item({ id, phase: "REJECTED" })`.
   - `phase` EXECUTE (in progress) → **EXECUTE** (shared step) on `reagent/<id>` (the executor is idempotent on its own branch).
   - `pendingCheckpoint` present but **undecided** → call `await_decision({ id, prompt })` **once**; pending → end your turn; decided → handle as above.
   - `phase` INVESTIGATE with no plan → run **INVESTIGATE**, then open the gate as in `start-async` step 3 (call once, exit if pending).

## Guardrails
- INVESTIGATE never edits. Only EXECUTE (via the scoped subagent) edits, only on `reagent/<id>`, never pushing.
- Thread the work item `id` through every bridge call.
- Keep `report_status` lines short and human-readable — they show up live in the bridge UI.
- **Async mode (`start-async`/`resume`) is short-lived: do exactly one step (open the gate, or execute), then end your turn. Never poll in async mode — the bridge re-launches you on the human's decision.**
