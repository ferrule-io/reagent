# Unit: reviewer-checks-integration

## Goal

Extend `agents/reagent-reviewer.md` so that `code-review` mode re-runs the CHECKS.md checks against the branch and emits `VERDICT: FAIL` if any non-pre-existing check is red. This makes check enforcement adversarial and independent of the executor's self-report.

## Scope

```
agents/reagent-reviewer.md
```

## Approach

1. Open `agents/reagent-reviewer.md` and locate the **Mode: code-review** section (currently steps 1–4 plus the verdict format).

2. Add a new step **after step 2 (compute the diff)** and before step 3 (check ALL specified changes present). Call it **step 2b** or insert as a numbered step and renumber:

   **Step 2b — Re-run CHECKS.md checks (adversarial enforcement)**

   a. Read `docs/reagent/<slug>/CHECKS.md` from the worktree (slug = the part after `reagent/` in the branch name). If CHECKS.md is absent, flag this as a violation: "CHECKS.md not found at `docs/reagent/<slug>/CHECKS.md` — planner did not produce required check manifest."

   b. Run every check command in the CHECKS.md table, in order, from the worktree root using Bash.

   c. For each failure:
      - If the failing check is listed in the CHECKS.md "Pre-existing failures" section: note it but do not count it as a violation.
      - If the failing check is NOT listed as pre-existing: this is a violation. Record the command, its exit code, and the first ~20 lines of stderr/stdout.

   d. If any non-pre-existing check fails, add it to the violations list with the format:
      ```
      Check `<command>` failed (exit <code>): <first line of error output>
      Impact: This unit introduces a check failure that CI would reject.
      Remediation: The executor must fix the failure within unit scope before committing.
      ```

3. Update **step 4** (ONLY specified changes present) to explicitly state: "Also verify that CHECKS.md exists at `docs/reagent/<slug>/CHECKS.md` and is non-empty — its absence is an out-of-scope omission by the planner, not the executor, but must be flagged."

4. Update the **Verdict format** note to clarify: "A VERDICT: FAIL due to check failures (step 2b) takes priority and must be listed before scope violations."

5. Preserve all existing steps, the plan-review mode section, and the Rules section unchanged.

## Acceptance criteria

1. `agents/reagent-reviewer.md` is modified (present in the diff).
2. The code-review mode section contains a new step that reads CHECKS.md from `docs/reagent/<slug>/CHECKS.md`.
3. The new step directs the reviewer to run each check command via Bash.
4. The new step distinguishes pre-existing failures (do not count as violation) from new failures (count as violation with the specified format).
5. A missing CHECKS.md is flagged as a violation (not silently skipped).
6. The verdict format guidance specifies that check failures produce `VERDICT: FAIL`.
7. No other file is modified in this unit's commit.
