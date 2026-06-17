# Unit: planner-checks-integration

## Goal

Extend `agents/reagent-planner.md` to run check discovery (per `agents/check-discovery.md`) once during the PLAN stage and write the resulting `docs/reagent/<slug>/CHECKS.md` manifest into the worktree. Every subsequent executor and reviewer invocation reads this manifest rather than rediscovering checks independently.

## Scope

```
agents/reagent-planner.md
```

## Approach

1. Open `agents/reagent-planner.md` and locate the existing **Procedure** section (currently steps 1–7).

2. Insert a new step **between step 1 (enter worktree) and step 2 (decompose into units)** — call it step 1b or renumber. This new step is titled "Discover required checks and write CHECKS.md":

   a. Reference `agents/check-discovery.md` by name: "Follow the check-discovery procedure defined in `agents/check-discovery.md` to enumerate the repo's required checks."
   b. Apply the four priority levels (CI config → manifest scripts → tool-config map → git hooks) against the worktree.
   c. Detect pre-existing failures: run each discovered check command against the base state (before any unit changes) and note which ones fail. Record these in a "Pre-existing failures" section of CHECKS.md.
   d. Write `docs/reagent/<slug>/CHECKS.md` inside the worktree with the table format specified in `agents/check-discovery.md` (columns: #, Command, Discovered via), plus the pre-existing failures section if any.
   e. Stage and include CHECKS.md in the same commit as the unit plan docs (step 4 of the existing procedure already covers `git add docs/reagent/<slug>` — CHECKS.md lives in the same directory and is captured automatically).

3. Update the step 4 commit message template to reflect that CHECKS.md is included: `"docs(reagent): plan docs + CHECKS.md for <id> (<unit slugs>)"`.

4. Update step 5 (the returned JSON array) to note: "The units array does not include CHECKS.md as a unit — it is a shared manifest, not a unit of implementation work."

5. Ensure the existing Rules section at the top remains intact — CHECKS.md write is a plan-stage artifact, consistent with "Write plan docs only."

## Acceptance criteria

1. `agents/reagent-planner.md` is modified (present in the diff).
2. The Procedure section contains a clearly-labelled step directing the planner to follow `agents/check-discovery.md` for check discovery.
3. The step specifies that CHECKS.md is written to `docs/reagent/<slug>/CHECKS.md` in the worktree.
4. The step specifies detecting pre-existing failures and recording them in CHECKS.md before any unit changes are applied.
5. The commit message template in step 4 (or equivalent) references CHECKS.md inclusion.
6. No other file is modified in this unit's commit.
