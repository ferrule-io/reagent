# Unit: skill-checks-threading

## Goal

Thread the CHECKS.md manifest reference through `skills/reagent-pipeline/SKILL.md` so the orchestrator's PLAN and EXECUTE stage descriptions mention that the planner produces CHECKS.md and that executor/reviewer consume it. No logic changes — only the prose descriptions are updated to make CHECKS.md visible in the orchestration layer.

## Scope

```
skills/reagent-pipeline/SKILL.md
```

## Approach

1. Open `skills/reagent-pipeline/SKILL.md` and locate the **## PLAN** section, specifically:
   > "The planner explores the repo via `worktreePath`, writes `docs/reagent/<slug>/<unit-slug>.md` for each unit (inside the worktree), commits the plan docs on the feature branch, and returns a `units` array..."

   Extend this sentence to also mention CHECKS.md:
   > "...commits the plan docs **and `docs/reagent/<slug>/CHECKS.md` (the ordered check manifest)** on the feature branch, and returns a `units` array..."

2. In the same PLAN section, after the `report_status` recording units call, add a brief note:
   > "Note: `CHECKS.md` is committed alongside the plan docs. It is a shared manifest — not a unit in the `units` array — consumed by every executor and reviewer invocation."

3. Locate the **## EXECUTE / Step 1 — Delegate execution to `reagent-executor`** section. In the list of what the executor receives, add:
   > "The executor reads `docs/reagent/<slug>/CHECKS.md` from the worktree before committing each unit."

4. Locate the **## EXECUTE / Step 2 — Code review** section. In the description of what the reviewer does, add:
   > "The reviewer re-runs the checks from `docs/reagent/<slug>/CHECKS.md` as part of code review; any non-pre-existing failure causes `VERDICT: FAIL`."

5. Do not change any logic, tool lists, bridge call signatures, guardrails, async/resume flow, or any other section of the file.

## Acceptance criteria

1. `skills/reagent-pipeline/SKILL.md` is modified (present in the diff).
2. The PLAN section's description of what the planner produces now mentions `docs/reagent/<slug>/CHECKS.md`.
3. The PLAN section includes a note clarifying CHECKS.md is a shared manifest, not a unit in the units array.
4. The EXECUTE Step 1 description mentions the executor reads CHECKS.md before committing.
5. The EXECUTE Step 2 description mentions the reviewer re-runs CHECKS.md checks and FAILs on non-pre-existing failures.
6. No bridge call signatures, tool lists, logic flows, or guardrail text are changed.
7. No other file is modified in this unit's commit.
