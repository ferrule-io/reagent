# Unit: skill-event-driven-gate

## Goal

Update the `start` flow in `skills/reagent-pipeline/SKILL.md` so that it is event-driven and short-lived at the approval gate — identical in behaviour to `start-async`. After opening the propose gate once, the skill ends its turn and relies on the bridge re-launching it via `resume <id>` when the human decides. This eliminates the per-turn token cost of the polling loop that currently exists for interactive `start` sessions.

## Scope

- `skills/reagent-pipeline/SKILL.md`

No other files are touched by this unit.

## Approach

### 1. Locate the `start` section

The `start (interactive)` section begins around line 134 of `SKILL.md`. The relevant prose is in step 3 (PROPOSE), which currently reads:

```
Call `await_decision({ id, prompt })`.
- On `{ "status": "pending" }`, **call it again immediately** with the same arguments. Keep polling.
- **Unattended wait: do NOT stop, do NOT ask the user, do NOT start other work.** The human answers from the bridge UI / phone. Loop until `decided`.
- On `decided`:
  - `approve` → **PLAN** (shared step), then **EXECUTE** (shared step).
  - `revise` → incorporate feedback, regenerate proposal, `report_status` with new proposal, call `await_decision` again. Poll until decided.
  - `reject` → `complete_work_item({ id, phase: "REJECTED" })`, report, STOP.
```

### 2. Replace the polling prose with open-gate-then-exit

Replace step 3 (the entire PROPOSE block for `start`) with the following:

```
**PROPOSE (open + exit).** Generate proposal. Call `report_status({ id, phase: "PROPOSE", line: "proposal ready", proposal })`.
Call `await_decision({ id, prompt })` **exactly once**.
- On `{ "status": "pending" }` (expected): **end your turn now** — report "gate opened; awaiting proposal decision (bridge will resume me)." Do NOT poll.
- On `decided`: handle as in the `resume <id>` step for a decided pendingCheckpoint (approve → PLAN + EXECUTE, revise → regenerate + reopen gate once + exit, reject → complete_work_item REJECTED).
```

Steps 4 (PLAN) and 5 (EXECUTE) remain as-is — they are only reached via the `resume <id>` path, not inline after the gate.

### 3. Update the Guardrails section

The Guardrails section (around line 179) contains the statement:

```
**Async mode (`start-async`/`resume`) is short-lived: do exactly one step (open the gate, or execute), then end your turn. Never poll in async mode — the bridge re-launches you on the human's decision.**
```

Update this to cover ALL modes:

```
**All modes are event-driven at the gate: open it once, then end your turn. The bridge re-launches you via `resume <id>` when the human decides. Never poll — not in `start`, not in `start-async`, not in `resume`.**
```

### 4. Remove `start`'s inline PLAN/EXECUTE continuation steps

In the updated `start` section, steps 4 and 5 (PLAN and EXECUTE) are no longer reachable directly from `start` — they execute only via the `resume <id>` path. Remove or comment them out to avoid confusion, or rephrase as: "PLAN and EXECUTE happen via `resume <id>` after the human approves."

### 5. Verify `resume <id>` already handles all three decided outcomes

Read the `resume <id>` section (lines ~164–177). Confirm it already branches on:
- `approve` → PLAN + EXECUTE
- `revise` → regenerate proposal, call `await_decision` once, exit if pending
- `reject` → `complete_work_item` REJECTED

These paths are already present and correct. No change is needed there — only a cross-reference note in the `start` section pointing to `resume`.

## Acceptance criteria

1. The `start` section of `SKILL.md` no longer contains the words "poll" or "Keep polling" or "call it again immediately" or "Loop until" in the context of the approval gate.
2. The `start` section's PROPOSE step instructs the skill to call `await_decision` **exactly once** and end the turn on pending — the same language used by `start-async`.
3. The Guardrails section no longer says `start` polls; it explicitly states all modes are event-driven.
4. The `start-async` section is unchanged (it was already correct).
5. The `resume` section is unchanged (it already handles all decided outcomes correctly and is where PLAN/EXECUTE run).
6. No source files (`.ts`, tests, etc.) are modified by this unit.
