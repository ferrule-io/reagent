# Unit u2 — Skill + executor: use the stored branch, not `reagent/<id>`

**Work item:** wi_b7c4e9a2 — Human-readable branch names
**Depends on:** u1 (bridge stores `branch` at creation)

## Goal
Stop the pipeline skill and executor agent from constructing the branch as
`reagent/<id>`. Instead, use the human-readable `branch` field that the bridge now
stores on the work item (u1). Update prose/examples accordingly.

## Scope (files)
- `skills/reagent-pipeline/SKILL.md`
- `agents/reagent-executor.md`
- `docs/**` (e.g. `docs/PLUGIN.md` mention of `reagent/<id>`)

Explicitly NOT in scope: `bridge/**` (handled in u1).

## Approach
1. **SKILL.md — EXECUTE step.** Before delegating, read the work item's `branch` field
   (it is already fetched in `resume` via `curl /api/items/<id>`; for interactive `start`,
   fetch it the same way after registration). Pass that stored `branch` to the executor
   instead of literally `reagent/<id>`. Update the EXECUTE description and the guardrail
   line that says "only on `reagent/<id>`" to say "only on the item's `branch`".
2. **SKILL.md — keep id-keyed paths.** Leave `docs/reagent/<id>/<unitId>.md` and all
   `wi_<hex>` id generation as-is; only the branch wording changes.
3. **reagent-executor.md.** Change "a `branch` name (`reagent/<id>`)" and the
   create/switch/report lines so the branch is treated as an opaque value passed in
   (e.g. "a `branch` name (e.g. `reagent/<slug>`)"), not derived from the id.
4. **docs/PLUGIN.md** (and any other doc): update `reagent/<id>` references to reflect
   human-readable branches.

## Acceptance criteria
- No remaining instruction in `skills/` or `agents/` tells the model to construct the
  branch as `reagent/<id>`; the branch is read from the item's `branch` field / passed in.
- Wording is consistent: the executor treats `branch` as an opaque given.
- Docs no longer imply branches are named after the raw `wi_` id.
- `grep -rn 'reagent/<id>' skills agents docs` returns only intentional/no matches.
