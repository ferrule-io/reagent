# Unit u1 — Add Biome lint to the bridge project

**Work item:** wi_c5d8f3a1 — Run GitHub Actions on PRs and pushes to development

## Goal
Introduce Biome as the linter/formatter for the `bridge/` npm package, configured so
`npm run lint` passes cleanly on the existing codebase. This is the prerequisite for the
CI workflow (u2) to enforce lint.

## Scope (files)
- `bridge/package.json`, `bridge/package-lock.json`
- `bridge/biome.json` (new)
- `bridge/src/**`, `bridge/scripts/**`, `bridge/test/**` (only one-time auto-format/lint fixes)

Explicitly NOT in scope: `.github/**` (handled in u2), anything outside `bridge/`.

## Approach
1. Add `@biomejs/biome` (current 1.x) as a devDependency in `bridge/package.json` and
   install so `package-lock.json` updates.
2. Add `bridge/biome.json`:
   - Enable the **recommended** linter ruleset and the formatter.
   - Match existing code style where reasonable to minimize churn (the repo uses
     double-quoted strings, semicolons, 2-space indent — configure Biome accordingly so
     the diff stays small).
   - Scope Biome to the bridge project (it runs with `bridge/` as cwd).
3. Add scripts:
   - `"lint": "biome check ."` — lint + format check, **no writes**; non-zero exit on issues (this is what CI runs).
   - `"lint:fix": "biome check --write ."` — apply safe fixes + formatting.
4. Run `biome check --write .` once and commit the resulting auto-fixes so the tree is clean.
5. If a recommended rule is too noisy / wrong for this codebase (e.g. flags intentional
   patterns), disable that **specific** rule in `biome.json` and note it in the commit
   message — do not blanket-disable the linter.
6. Re-run `npm run build` and `npm test` to confirm the auto-fixes didn't break anything.

## Acceptance criteria
- `cd bridge && npm run lint` exits 0 on the committed tree.
- `npm run build` and `npm test` (71 tests) still pass after auto-fixes.
- `biome.json` exists with recommended rules; any disabled rule is explicit and justified.
- `package.json` has `lint` and `lint:fix` scripts; lockfile reflects the new devDependency.
