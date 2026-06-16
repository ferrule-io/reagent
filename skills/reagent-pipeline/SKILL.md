---
name: reagent-pipeline
description: Drive a coding work item through the reagent pipeline — investigate, propose, get human approval via the bridge, decompose into units of work, then execute on a branch. Use when starting or resuming reagent work.
---

# reagent pipeline

You orchestrate one work item through: INTAKE → INVESTIGATE → PROPOSE (human gate, loops on revise) → PLAN (delegated + reviewed) → EXECUTE (per-unit, delegated + reviewed) → DONE.
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

## PLAN (shared, delegated + adversarial review)

### Step 1 — Delegate decomposition to `reagent-planner`
Invoke the `reagent-planner` subagent (Agent tool / `@agent-reagent-planner`) passing:
- `id`, `repoPath`, the approved `plan` (diagnosis + direction)
- `feedback[]` — accumulated revise-round notes (empty array on first call)

The planner explores the repo, writes `docs/reagent/<id>/<unitId>.md` for each unit, and returns a `units` array:
```json
[
  { "id": "u1", "title": "...", "scope": ["path/to/file"], "planDocPath": "docs/reagent/<id>/u1.md", "dependsOn": [] },
  ...
]
```
Record the units on the bridge:
```
report_status({ id, phase: "PLAN", line: "plan decomposed into N units", units: [...] })
```

### Step 2 — Plan review (adversarial, bounded)
Invoke the `reagent-reviewer` subagent (Agent tool / `@agent-reagent-reviewer`) in **plan-review** mode, passing:
- `id`, `repoPath`, `mode: "plan-review"`, the `units` array, and the plan doc paths.

Parse the reviewer's final lines for `VERDICT: PASS` or `VERDICT: FAIL`.

- **VERDICT: PASS** → proceed to **EXECUTE**.
- **VERDICT: FAIL** → extract the violations list and re-invoke `reagent-planner` with `feedback[]` containing the violations. Re-run plan review on the revised plan. Repeat up to **2 rounds total**. If still failing after 2 rounds, call `complete_work_item({ id, phase: "FAILED" })`, report the violations, and stop.

Report each review outcome:
```
report_status({ id, phase: "PLAN", line: "plan review: PASS" })
// or
report_status({ id, phase: "PLAN", line: "plan review: FAIL — <violation summary>" })
```

## EXECUTE (shared, per-unit delegated + adversarial review)

First fetch the item's `branch` field: `curl -s http://localhost:4319/api/items/<id>` (same call used in `resume`). Use that stored branch value everywhere below — pass it to every subagent as `branch` rather than constructing `reagent/<id>` literally.

For **each unit** in the approved units array (in dependency order):

### Step 1 — Delegate execution to `reagent-executor`
Invoke the `reagent-executor` subagent (Agent tool / `@agent-reagent-executor`) passing:
- `id`, `repoPath`, the approved `plan` (diagnosis + direction), the item's `branch`
- `unit` — the unit object `{ id, title, scope, planDocPath }`
- `violations[]` — empty on first invocation; populated on retry after a review FAIL

The executor makes changes on the branch, commits locally, and reports status.

```
report_status({ id, phase: "EXECUTE", line: "unit <unitId>: execution complete", branch: "<the item branch>" })
```

### Step 2 — Code review (adversarial, bounded, per unit)
Invoke the `reagent-reviewer` subagent (Agent tool / `@agent-reagent-reviewer`) in **code-review** mode, passing:
- `id`, `repoPath`, `mode: "code-review"`, the `unit` object, `branch: "<the item branch>"`

The reviewer diffs the unit's commit(s) and checks the ALL-and-ONLY criterion (all specified changes present, no out-of-scope changes).

Parse the reviewer's final lines for `VERDICT: PASS` or `VERDICT: FAIL`.

- **VERDICT: PASS** → report and continue to the next unit.
- **VERDICT: FAIL** → extract the violations list and re-invoke `reagent-executor` for the **same unit** with `violations[]`. Re-run code review on the updated commit. Repeat up to **2 retries total**. If still failing after 2 retries, call `complete_work_item({ id, phase: "FAILED" })`, report the violations, and **stop** (do not silently proceed to the next unit).

Report each step:
```
report_status({ id, phase: "EXECUTE", line: "unit <unitId>: review PASS", branch: "<the item branch>" })
// or
report_status({ id, phase: "EXECUTE", line: "unit <unitId>: review FAIL — <violation summary>", branch: "<the item branch>" })
```

### Completion
When all units pass code review:
```
complete_work_item({ id, phase: "DONE" })
```
Report the branch name and a one-line summary. Do not push.

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
   - `phase` EXECUTE (in progress) → **EXECUTE** (shared step) on the item's `branch` (already fetched from the API response), re-entering the per-unit loop idempotently: skip units whose code review already passed (check existing commits on the branch), then continue with the next pending unit.
   - `pendingCheckpoint` present but **undecided** → call `await_decision({ id, prompt: pendingCheckpoint.prompt })` **once**; pending → end your turn; decided → handle as above.
   - `phase` INVESTIGATE with no plan → run **INVESTIGATE**, then open the gate as in `start-async` step 3 (call once, exit if pending).
   - `phase` PROPOSE with no pending checkpoint (e.g. after revise was processed) → regenerate proposal (using accumulated `feedback[]`), `report_status`, call `await_decision` once, exit if pending.

## Guardrails
- INVESTIGATE never edits. Only EXECUTE (via the scoped `reagent-executor` subagent) edits, only on the item's `branch`, never pushing.
- **All three stages — PLAN, EXECUTE, and REVIEW — run as subagents** (Agent tool). The orchestrator delegates; it never decomposes or implements inline.
- **The reviewer (`reagent-reviewer`) is read-only and runs in a fresh context** — it has no memory of how the work was produced, providing independent adversarial verification. It never edits files.
- **Review verdicts are PASS or FAIL with a violations list.** A PASS means no violations were found. A FAIL includes precise citations (file, line, criterion) for each violation.
- **FAIL loops are bounded:** plan-review allows up to 2 replan rounds; per-unit code-review allows up to 2 executor retries. If still failing after the limit, call `complete_work_item({ id, phase: "FAILED" })` and stop — do not silently proceed.
- Thread the work item `id` through every bridge call.
- Keep `report_status` lines short and human-readable — they show up live in the bridge UI.
- **Async mode (`start-async`/`resume`) is short-lived: do exactly one step (open the gate, or execute), then end your turn. Never poll in async mode — the bridge re-launches you on the human's decision.**
- The `revise` result is a first-class outcome: always incorporate the note from `decision.note` into the regenerated proposal. Each revise round is appended to `item.feedback[]` by the bridge automatically.
- Plan documents (`docs/reagent/<id>/<unitId>.md`) are written to the **target repo**, not the bridge repo. Create parent directories as needed.
