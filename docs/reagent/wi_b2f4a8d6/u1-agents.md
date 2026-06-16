# Unit u1 — New subagents (planner + reviewer) and unit-aware executor

## Goal
Introduce the two missing subagents the adversarial pipeline needs, and make the executor operate on a single unit:
- `reagent-planner` — decomposes an approved direction into mutually-exclusive units and writes plan docs.
- `reagent-reviewer` — a read-only adversarial critic that runs in a fresh context, with two duties (plan-reality review, per-unit code review).
- `reagent-executor` — small edit so it implements ONE named unit (scope-bounded) rather than an undifferentiated plan.

## Scope
- `agents/reagent-planner.md` (new)
- `agents/reagent-reviewer.md` (new)
- `agents/reagent-executor.md` (edit — make it unit-aware)

No other files.

## Approach

### agents/reagent-planner.md (new)
Frontmatter: `name: reagent-planner`; a `description` saying it decomposes an approved reagent direction into units of work and writes plan docs, invoked by the pipeline for the PLAN stage; `tools: Read, Grep, Glob, Bash, Write, mcp__plugin_reagent_reagent-bridge__report_status`; `model: sonnet`.
Body — given `id`, `repoPath`, approved `plan` (diagnosis+direction), and any `feedback[]`:
1. Read-only explore the repo to ground the decomposition in real paths.
2. Decompose into **mutually-exclusive** units — non-overlapping file scope (`scope: string[]` globs). Prefer the smallest set of cohesive units.
3. For each unit write `docs/reagent/<id>/<unitId>.md` stating: goal, scope, approach, acceptance criteria.
4. Return a JSON array of `{ id, title, scope, planDocPath, dependsOn }` to the caller (the orchestrator records it on the bridge). Do NOT make source edits — planning only writes plan docs.

### agents/reagent-reviewer.md (new)
Frontmatter: `name: reagent-reviewer`; `description` saying it is a read-only adversarial critic validating reagent work in a fresh context, invoked for plan-reality review and per-unit code review; `tools: Read, Grep, Glob, Bash` (read-only — NO Edit/Write, so it cannot fix what it reviews); `model: sonnet`.
Body — adversarial framing ("your job is to find violations, not to be agreeable"). Two modes selected by the caller:
- **Mode: plan-review** — given the units + plan docs, verify the plan is grounded in reality: every `scope` path/glob refers to real or sensibly-new paths, units are mutually exclusive (no overlapping scope), the approach is feasible, acceptance criteria are checkable. Output a verdict.
- **Mode: code-review** — given a unit's plan doc (the spec) and the unit's `git diff` (compute via `git diff` of the unit's commit(s) on `reagent/<id>`), validate **ALL and ONLY** the specified changes were made: (a) every acceptance criterion is satisfied by the diff; (b) NO file outside the unit's `scope` was modified; (c) no unrelated/out-of-scope edits, debug leftovers, or silent changes. 
- **Verdict format** (both modes): a clear `VERDICT: PASS` or `VERDICT: FAIL`, followed by a list of violations (description + impact + remediation) when FAIL. The reviewer never edits; it only reports.

### agents/reagent-executor.md (edit)
Make it operate on a single unit: accept a `unit` (`{ id, title, scope, planDocPath }`) in addition to work item `id`/`repoPath`/`branch`. Instruct it to read the unit's plan doc, implement ONLY within the unit's `scope`, commit with a message referencing the unit, and (when re-invoked after a review FAIL) address the supplied violations without expanding scope. Keep all existing scope-guard rules (branch-only, never push, no out-of-scope edits).

## Acceptance criteria
- `agents/reagent-planner.md` and `agents/reagent-reviewer.md` exist with valid frontmatter (name/description/tools/model).
- `reagent-reviewer` has read-only tools (no Edit/Write) and documents both plan-review and code-review modes, including the ALL-and-ONLY scope check via git diff and a PASS/FAIL verdict.
- `reagent-planner` writes plan docs and returns the units array; does not edit source.
- `reagent-executor.md` is unit-aware (reads a unit's plan doc, bounded to the unit's scope, can act on review violations) while retaining its scope guards.
- Only the three files above are changed.
