# Unit u2 — Rewrite SKILL.md to orchestrate the adversarial, fully-subagent flow

## Goal
Update the pipeline skill so PLAN, EXECUTE, and REVIEW are all delegated to subagents, and the flow runs the adversarial loop: plan → plan-review → per-unit (execute → code-review, looping on FAIL).

## Scope
- `skills/reagent-pipeline/SKILL.md`

No other files. (Note: the root SKILL prose injected at command time mirrors this file; updating this file is the source of truth.)

## Approach
Revise the shared stage definitions in `skills/reagent-pipeline/SKILL.md`:

1. **PLAN (delegated):** Replace the inline-decomposition instructions with: delegate to the `reagent-planner` subagent (Agent tool), passing `id`, `repoPath`, the approved `plan`, and accumulated `feedback[]`. The planner writes the plan docs and returns the `units` array. The orchestrator records units via `report_status({ phase: "PLAN", units })`.

2. **PLAN REVIEW (new, delegated, adversarial):** After planning, delegate to the `reagent-reviewer` subagent in **plan-review** mode, passing the units + plan doc paths. On `VERDICT: FAIL`, re-invoke `reagent-planner` with the violations (bounded, e.g. up to 2 rounds); on `VERDICT: PASS`, proceed. Report progress via `report_status({ phase: "PLAN", line: "plan review: PASS/FAIL …" })` (reuse the PLAN phase; no new bridge phase).

3. **EXECUTE — per unit (delegated):** Replace the single-pass executor instruction with a loop **once per unit**:
   - Delegate to `reagent-executor` for that unit (pass the unit object + plan doc path + branch `reagent/<id>`).
   - Then delegate to `reagent-reviewer` in **code-review** mode for that unit (pass the unit's plan doc + instruct it to diff the unit's commit(s)). 
   - On `VERDICT: FAIL`, re-invoke `reagent-executor` for the same unit with the violations (bounded retries, e.g. 2). If still failing, report and stop/escalate (do not silently proceed).
   - On `VERDICT: PASS`, continue to the next unit.
   - Report each step via `report_status({ phase: "EXECUTE", line: "unit u<i>: executed / review PASS …", branch })`.

4. When all units pass review: `complete_work_item({ phase: "DONE" })`, report branch + summary. Still never push.

5. **Guardrails section:** add bullets stating PLAN/EXECUTE/REVIEW all run as subagents; the reviewer is read-only and runs in a fresh context (independent verification per the adversarial-code-review pattern); review verdicts are PASS/FAIL with violations; FAIL loops are bounded.

Keep INTAKE, INVESTIGATE, PROPOSE and the `start`/`start-async`/`resume` verb sections intact, adjusting only the references to PLAN/EXECUTE so the new sub-flow is reflected (e.g. resume's EXECUTE-in-progress branch re-enters the per-unit loop idempotently).

## Acceptance criteria
- SKILL.md PLAN section delegates to `reagent-planner` and no longer decomposes inline.
- A plan-review step delegates to `reagent-reviewer` (plan-review mode) with a bounded FAIL→replan loop.
- EXECUTE runs one `reagent-executor` per unit, each followed by a `reagent-reviewer` code-review (ALL-and-ONLY check) with a bounded FAIL→fix loop.
- Guardrails mention all-subagent stages, read-only fresh-context reviewer, PASS/FAIL verdicts, bounded loops.
- INTAKE/INVESTIGATE/PROPOSE and the verb sections remain coherent.
- Only `skills/reagent-pipeline/SKILL.md` is changed.
