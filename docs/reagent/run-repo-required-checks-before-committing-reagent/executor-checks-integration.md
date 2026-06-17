# Unit: executor-checks-integration

## Goal

Replace the vague, optional step 4 of `agents/reagent-executor.md` ("Run the project's tests/build if an obvious command exists; if they fail, fix within scope") with a mandatory, enforceable gate that reads the CHECKS.md manifest produced by the planner and runs every listed check before committing. The executor commits only when all checks pass (or pre-existing failures are flagged but not owned).

## Scope

```
agents/reagent-executor.md
```

## Approach

1. Open `agents/reagent-executor.md` and locate **step 4** in the Procedure section:
   > "Run the project's tests/build if an obvious command exists; if they fail, fix within scope."

2. Replace step 4 entirely with the following expanded content (preserve the numbering — this is still step 4):

   **Step 4 — Run CHECKS.md checks and fix failures within scope**

   a. Read `docs/reagent/<slug>/CHECKS.md` from the worktree (the slug comes from the branch name: the part after `reagent/`). If CHECKS.md is absent, emit a warning and fall back to the `check-discovery.md` procedure to discover checks ad-hoc.

   b. Run every check command listed in the CHECKS.md table, in order, from the worktree root.

   c. For each failure, determine if it was pre-existing (already listed in the "Pre-existing failures" section of CHECKS.md):
      - **Pre-existing failure**: do NOT fix it. Flag it in the `report_status` call — include the check name and the error summary. Do not block the commit solely because of pre-existing failures.
      - **New failure** (introduced by this unit's changes): fix it within `unit.scope`. If fixing requires a change outside `unit.scope`, emit a clear error, call `report_status` with `phase: "FAILED"`, and stop — do not silently expand scope.

   d. Re-run the failed checks after fixing until all non-pre-existing failures are resolved.

   e. Only then proceed to commit (step 5).

3. Update step 5 (the commit step) to reflect that check passage is a precondition: "Commit the change **after all new failures from step 4 are resolved**."

4. Update step 7 (the final report) to include: "Report whether each CHECKS.md check passed or was pre-existing-failed."

5. Preserve all other steps (1–3, 6–7) and the Rules section unchanged.

## Acceptance criteria

1. `agents/reagent-executor.md` is modified (present in the diff).
2. The old step 4 text ("Run the project's tests/build if an obvious command exists") is gone from the file.
3. The new step 4 explicitly directs the executor to read CHECKS.md from `docs/reagent/<slug>/CHECKS.md`.
4. The new step 4 distinguishes pre-existing failures (flag, do not fix) from new failures (fix within scope or stop with FAILED).
5. The new step 4 makes passing all non-pre-existing checks a hard precondition for the commit in step 5.
6. The fallback behaviour (CHECKS.md absent → ad-hoc discovery) is documented.
7. No other file is modified in this unit's commit.
