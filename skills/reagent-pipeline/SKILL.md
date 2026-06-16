---
name: reagent-pipeline
description: Drive a coding work item through the reagent pipeline — investigate, propose, get human approval via the bridge, decompose into units of work, then execute on a branch. Use when starting or resuming reagent work.
---

# reagent pipeline

You orchestrate one work item through: INTAKE → INVESTIGATE → PROPOSE (human gate, loops on revise) → PLAN (decompose) → EXECUTE → DONE.
All state and the human approval gate live in the **reagent bridge**, reached via the `reagent-bridge` MCP tools
(`mcp__plugin_reagent_reagent-bridge__*`). The bridge must be running at http://localhost:4319.

You are given `$ARGUMENTS`, beginning with a verb:
- `start <repoPath> <request...>` — begin a new work item **interactively**: you stay open and poll the gate until the human decides.
- `start-async <id> <repoPath> <request...>` — begin a **launched** work item with a pre-assigned `id`: investigate, open the propose gate, then **end your turn** (the bridge re-launches you to continue after the human responds). You are short-lived — never poll.
- `resume <id>` — continue a launched work item: do the next single step, then end your turn if still waiting.

## Tool reference (bridge)
- `register_work_item({ id, title, repoPath, request, origin })` (no-op if `id` already exists)
- `report_status({ id, phase?, line?, plan?, proposal?, units?, branch? })`
  - `proposal`: the current human-facing proposal text (PROPOSE stage)
  - `units`: array of `{ id, title, scope: string[], planDocPath, dependsOn: string[] }` (PLAN stage)
- `await_decision({ id, prompt })` → returns `{ "status": "pending" }` or `{ "status": "decided", "decision": { "result": "approve"|"reject"|"revise", "note"? } }`
  - `revise`: the human wants changes; `decision.note` contains feedback; call `await_decision` again with the revised prompt (bridge opens a fresh gate)
- `complete_work_item({ id, phase })` where phase ∈ DONE | REJECTED | FAILED

## INVESTIGATE (shared, read-only)
Explore the target repo (Read/Grep/Glob/Bash for read-only inspection — do NOT edit anything). Understand the request and the
relevant code. Produce structured findings: a concise **diagnosis** of the current state and a **proposed direction** (2–6 sentences).
Then call `report_status({ id, phase: "INVESTIGATE", line: "investigation complete", plan: "<diagnosis + proposed direction>" })`.

## PROPOSE (shared, may loop)
Convert findings into a human-readable proposal. Call:
```
report_status({ id, phase: "PROPOSE", line: "proposal ready", proposal: "<proposal text>" })
await_decision({ id, prompt: "<proposal text formatted for human review>" })
```
Then branch on the decision result:
- `approve` → proceed to **PLAN**.
- `revise` → incorporate `decision.note` feedback, regenerate the proposal, call `report_status` with the new proposal text, then call `await_decision` again with the revised prompt. Repeat until approve or reject.
- `reject` → `complete_work_item({ id, phase: "REJECTED" })`, stop.

**Async mode**: call `await_decision` exactly once per resume invocation; exit on pending.

## PLAN (shared)
Take the approved investigation findings (and any accumulated `feedback[]` from revise rounds) and decompose into **units of work**. Each unit MUST be mutually exclusive — non-overlapping file scope (`scope: string[]` of path globs). For each unit:
1. Write a plan document to `docs/reagent/<id>/<unitId>.md` in the **target repo** (create dirs as needed). The plan doc must state: goal, scope, approach, and acceptance criteria.
2. Record `{ id, title, scope, planDocPath: "docs/reagent/<id>/<unitId>.md", dependsOn: [] }`.

Then call:
```
report_status({ id, phase: "PLAN", line: "plan decomposed into N units", units: [...] })
```

## EXECUTE (shared, delegated + scoped)
Fetch the item's `branch` field: `curl -s http://localhost:4319/api/items/<id>` (same call used in `resume`). Pass that stored branch value to the `reagent-executor` subagent (Agent tool / `@agent-reagent-executor`) along with the work item `id`, the `repoPath`, and the approved `plan`/`units`. The subagent makes changes on that branch, commits locally, and reports status.
When it finishes, call `complete_work_item({ id, phase: "DONE" })` and report the branch + a one-line summary.
(Per-unit parallel execution via worktrees is a future milestone; for now a single-pass execution proceeds over all units.)
Do not push — PRs are a later milestone.

---

## `start` (interactive)

1. **INTAKE.** Generate a work item id `wi_<8 hex chars>`. Derive a short `title`. Call
   `register_work_item({ id, title, repoPath, request: "<full request text>", origin: "terminal" })` and
   `report_status({ id, phase: "INVESTIGATE", line: "starting investigation" })`.
2. **INVESTIGATE** (shared step above).
3. **PROPOSE (poll).** Generate proposal. Call `report_status({ id, phase: "PROPOSE", line: "proposal ready", proposal })`.
   Call `await_decision({ id, prompt })`.
   - On `{ "status": "pending" }`, **call it again immediately** with the same arguments. Keep polling.
   - **Unattended wait: do NOT stop, do NOT ask the user, do NOT start other work.** The human answers from the bridge UI / phone. Loop until `decided`.
   - On `decided`:
     - `approve` → **PLAN** (shared step), then **EXECUTE** (shared step).
     - `revise` → incorporate feedback, regenerate proposal, `report_status` with new proposal, call `await_decision` again. Poll until decided.
     - `reject` → `complete_work_item({ id, phase: "REJECTED" })`, report, STOP.
4. **PLAN** (shared step above).
5. **EXECUTE** (shared step above).

## `start-async <id> <repoPath> <request...>` (launched — short-lived)

1. **INTAKE.** Use the **given `id`** (do NOT generate one). Derive a short `title`. Call
   `register_work_item({ id, title, repoPath, request: "<full request text>", origin: "phone" })` (no-op if the bridge already created it) and
   `report_status({ id, phase: "INVESTIGATE", line: "starting investigation" })`.
2. **INVESTIGATE** (shared step above).
3. **PROPOSE (open + exit).** Generate proposal. Call `report_status({ id, phase: "PROPOSE", line: "proposal ready", proposal })`.
   Call `await_decision({ id, prompt })` **exactly once**.
   - On `{ "status": "pending" }` (expected): **end your turn now** — report "gate opened; awaiting proposal decision (bridge will resume me)." Do NOT poll.
   - On `decided`: handle as in `start` step 3 (plan + execute, or revise, or reject), then end.

## `resume <id>` (launched — short-lived, one step then exit)

1. Fetch state (read-only) via Bash: `curl -s http://localhost:4319/api/items/<id>` → JSON with `phase`, `plan`, `proposal`, `units`, `feedback`, `branch`, `pendingCheckpoint`, `request`, `repoPath`. Reconstruct from this + the live repo — do NOT rely on prior conversation.
2. Branch on state:
   - terminal (`DONE`/`REJECTED`/`FAILED`) → report it; nothing to do.
   - `pendingCheckpoint` present **and decided**:
     - `approve` → **PLAN** (shared step), then **EXECUTE** (shared step).
     - `revise` → incorporate `decision.note` from `pendingCheckpoint.decision`, regenerate proposal incorporating existing `feedback[]`, call `report_status({ id, phase: "PROPOSE", proposal })`, then call `await_decision` **once**; pending → end your turn; decided → handle.
     - `reject` → `complete_work_item({ id, phase: "REJECTED" })`.
   - `phase` PLAN (in progress, no units yet) → run **PLAN** (shared step), then **EXECUTE**.
   - `phase` EXECUTE (in progress) → **EXECUTE** (shared step) on the item's `branch` (already fetched from the API response; the executor is idempotent on its own branch).
   - `pendingCheckpoint` present but **undecided** → call `await_decision({ id, prompt: pendingCheckpoint.prompt })` **once**; pending → end your turn; decided → handle as above.
   - `phase` INVESTIGATE with no plan → run **INVESTIGATE**, then open the gate as in `start-async` step 3 (call once, exit if pending).
   - `phase` PROPOSE with no pending checkpoint (e.g. after revise was processed) → regenerate proposal (using accumulated `feedback[]`), `report_status`, call `await_decision` once, exit if pending.

## Guardrails
- INVESTIGATE never edits. Only EXECUTE (via the scoped subagent) edits, only on the item's `branch`, never pushing.
- Thread the work item `id` through every bridge call.
- Keep `report_status` lines short and human-readable — they show up live in the bridge UI.
- **Async mode (`start-async`/`resume`) is short-lived: do exactly one step (open the gate, or execute), then end your turn. Never poll in async mode — the bridge re-launches you on the human's decision.**
- The `revise` result is a first-class outcome: always incorporate the note from `decision.note` into the regenerated proposal. Each revise round is appended to `item.feedback[]` by the bridge automatically.
- Plan documents (`docs/reagent/<id>/<unitId>.md`) are written to the **target repo**, not the bridge repo. Create parent directories as needed.
