# Unit: agent-docs-update

## Goal

Update the four agent/skill docs so that they correctly describe the worktree-first, slug-keyed, base-ref-resolved pipeline: the planner writes plan docs into the worktree and commits them on the feature branch; the executor assumes the worktree already exists and never creates branches from HEAD; the reviewer uses `baseBranch` (not a hardcoded `development`); the orchestrator skill shows slug-named units and the updated worktree contract.

## Scope

```
agents/reagent-planner.md
agents/reagent-executor.md
agents/reagent-reviewer.md
skills/reagent-pipeline/SKILL.md
```

## Approach

### 1. `agents/reagent-planner.md`

Key changes:
- The planner receives a `worktreePath` argument (the pre-created worktree) and a `baseBranch` in addition to `id`, `repoPath`, `plan`, `feedback[]`.
- Step 1: `cd` into `worktreePath` (not `repoPath`) for all reading and writing.
- Step 3: write `docs/reagent/<slug>/<unit-slug>.md` inside the worktree where `<slug>` is the branch slug (part after `reagent/`). Create parent directories as needed.
- After writing plan docs, commit them on the feature branch from within the worktree: `git add docs/reagent/<slug> . && git commit -m "docs(reagent): plan docs for <id> (<unit slugs>)"`.
- Step 2 unit naming: unit ids must be descriptive kebab-case slugs (e.g. `repo-internal-worktree-path`, `base-ref-resolver`) not `u1`/`u2`. The text currently says `e.g. u1, u2` — change it to `e.g. repo-internal-worktree-path, base-ref-resolver`.
- Step 5 `report_status` call: include `branch: "<the item branch>"` so the orchestrator does not need to re-fetch.
- Remove the note "Plan documents are written to the **target repo**" — they are written to the worktree (which is a checkout of the feature branch, so they live there naturally).

### 2. `agents/reagent-executor.md`

Key changes:
- Remove step 1b (the "if worktree does not exist, create it" branch). The bridge creates the worktree at registration time. The executor's step 1 becomes: verify `worktreePath` exists (`.git` file present); if for some reason it does not, emit a clear error and call `report_status` with `phase: "FAILED"` — do not silently create a branch from HEAD.
- Remove "create it from the current HEAD if it does not exist" from the Rules section.
- Update the worktree path description: `worktreePath` is `<repoPath>/.reagent/worktrees/<branchSlug>` (no longer `~/.reagent/worktrees/<id>`).
- The `baseBranch` is now available on the work item (via the bridge API response); reference it in the git context explanation.

### 3. `agents/reagent-reviewer.md`

Key changes (code-review mode):
- Step 2: change `git diff <base>...<branch>` to use `baseBranch` from the work item instead of the hardcoded word `development`. Instruction text should say: "Use the item's `baseBranch` field (from `GET /api/items/<id>`) as the base ref for diff commands: `git diff <baseBranch>...<branch> -- <scope files>`."
- Remove the example `git log reagent/<id> --not development --oneline` and replace `development` with `<baseBranch>`.

### 4. `skills/reagent-pipeline/SKILL.md`

Key changes:
- **PLAN section, Step 1**: Update the planner invocation to pass `worktreePath` and `baseBranch` (from the registered item) alongside `id`, `repoPath`, `plan`, `feedback[]`.
- **PLAN section, Step 1**: Update the example units JSON to show slug-named unit ids (`"id": "repo-internal-worktree-path"` etc.) not `"u1"`.
- **PLAN section, Step 1**: Note that the planner commits plan docs on the feature branch in the worktree — the orchestrator does not need to do this.
- **EXECUTE section**: Update the planner pass-through for `worktreePath` and `baseBranch`.
- **EXECUTE section, reviewer invocation**: Pass `baseBranch` to the reviewer so it can diff correctly.
- **Tool reference**: Add a note that `register_work_item` now also creates the git worktree and branch synchronously — the response item will have `worktreePath` and `baseBranch` populated.
- **`start` and `start-async` sections**: After `register_work_item`, fetch the item immediately (`curl -s http://localhost:4319/api/items/<id>`) to get `worktreePath` and `baseBranch` for passing to subagents.
- **`resume` section**: When fetching state, also extract `worktreePath` and `baseBranch` from the API response.
- **Guardrails**: Add: "The shared main checkout is read-only for automation — all file edits happen inside the worktree."

## Acceptance criteria

1. `agents/reagent-planner.md`: accepts `worktreePath` and `baseBranch` as inputs; `cd`s into `worktreePath`; writes plan docs to `docs/reagent/<slug>/` (using the branch slug, not item id); commits them on the feature branch; unit ids are described as descriptive kebab-case slugs.
2. `agents/reagent-executor.md`: no longer creates the worktree or branch from HEAD; step 1 only checks for existence and errors clearly if missing; `worktreePath` description matches the slug-keyed repo-relative path.
3. `agents/reagent-reviewer.md`: code-review diff commands use `baseBranch` from the item, not a hardcoded branch name.
4. `skills/reagent-pipeline/SKILL.md`: planner invocation includes `worktreePath` and `baseBranch`; example units JSON uses descriptive slug ids; reviewer invocation includes `baseBranch`; `resume` and `start` flows extract `worktreePath`/`baseBranch` from the API.
5. No source files (`bridge/src/`, `bridge/test/`) are modified.
