# Unit: check-discovery-reference

## Goal

Create a new shared reference document (`agents/check-discovery.md`) that defines the canonical, language-agnostic, deterministic procedure for discovering a repo's required checks. This document becomes the authoritative source that all other agents reference; it must not duplicate logic defined elsewhere, only concentrate it.

## Scope

```
agents/check-discovery.md
```

This file does not yet exist. The executor must create it from scratch.

## Approach

1. Create `agents/check-discovery.md` as a new Markdown document (no front-matter header — it is a reference doc, not a Claude agent prompt file).

2. Open with a short paragraph explaining the purpose: "given an arbitrary repo, deterministically discover the ordered list of check commands that CI would run, without guessing or relying on convention alone."

3. Define the discovery procedure as a **priority-ordered search** — the executor reads each source in order and adds commands to the list only if not already present from a higher-priority source:

   **Priority 1 — CI config files (authoritative)**
   - Look for `.github/workflows/*.yml` / `.github/workflows/*.yaml`. For each job's `steps`, extract `run:` lines that invoke build/lint/test commands (e.g. `npm run lint`, `npm run build`, `npm test`, `cargo test`, `go test ./...`, `biome check`, etc.). These ARE the required checks.
   - Also check `.gitlab-ci.yml`, `.circleci/config.yml`, `Jenkinsfile`, `.travis.yml` — same extraction logic.
   - Ignore CI-only infrastructure commands (checkout actions, cache setup, Docker login, deploy steps). Focus on commands that validate code quality/correctness.

   **Priority 2 — Declared manifest scripts**
   - `package.json`: extract `scripts` entries named `lint`, `build`, `test`, `typecheck`, `check`, `format:check` (or similar check-oriented names). Order: lint before build before test.
   - `Makefile` / `justfile`: look for targets named `lint`, `test`, `build`, `check`, `ci`. If present, record `make lint`, `make test`, etc.
   - `pyproject.toml` / `setup.cfg`: look for `[tool.pytest.ini_options]`, tox config, or declared test/lint commands.

   **Priority 3 — Tool-config presence → default command**
   Map config file presence to a default invocation command:
   - `biome.json` or `biome.jsonc` → `npx biome check .` (or `npm run check` if that script exists)
   - `.eslintrc*` / `eslint.config.*` → `npx eslint .`
   - `.prettierrc*` → `npx prettier --check .`
   - `ruff.toml` / `pyproject.toml` with `[tool.ruff]` → `ruff check .`
   - `mypy.ini` / `pyproject.toml` with `[tool.mypy]` → `mypy .`
   - `Cargo.toml` → `cargo clippy -- -D warnings` then `cargo test`
   - `go.mod` → `go vet ./...` then `go test ./...`
   - `pom.xml` → `mvn verify`
   - `build.gradle` / `build.gradle.kts` → `./gradlew check`

   **Priority 4 — Git pre-commit hooks**
   - Check `.git/hooks/pre-commit` or `.husky/pre-commit` or `.lefthook.yml`. If a hook script exists and is executable, record it as a check to run (execute it directly: `bash .git/hooks/pre-commit` or let `git commit` trigger it).

4. Specify the **output format** — the executor must produce a CHECKS.md manifest at `docs/reagent/<slug>/CHECKS.md` with this exact structure:

   ```markdown
   # Checks for <slug>

   | # | Command | Discovered via |
   |---|---------|----------------|
   | 1 | npm run lint | CI: .github/workflows/ci.yml step "Lint" |
   | 2 | npm run build | CI: .github/workflows/ci.yml step "Build" |
   | 3 | npm test | package.json scripts.test |
   ```

5. Specify the **pre-existing-failure rule**: if a check fails before any unit changes are applied (i.e. the branch is already red on the base), the executor must:
   - Record which checks were already failing in a `CHECKS.md` "Pre-existing failures" section.
   - Not silently fix failures outside its scope.
   - Fix failures its own changes introduce.
   - Flag (report) pre-existing failures to the pipeline orchestrator so a human can decide whether to block.

6. End the document with a short note: "All agents (planner, executor, reviewer) reference this document. The CHECKS.md manifest is written once by the planner and consumed unchanged by the executor and reviewer — no re-discovery at each stage."

## Acceptance criteria

1. File `agents/check-discovery.md` is created and non-empty (present in the diff).
2. The document defines at least four named discovery priority levels (CI config, manifest scripts, tool-config map, git hooks) in an explicit priority order.
3. The tool-config-to-command mapping table covers at minimum: biome, eslint, ruff, cargo, go — all with explicit default commands.
4. The CHECKS.md output format is shown with a concrete Markdown table example (columns: #, Command, Discovered via).
5. The pre-existing-failure rule is explicitly stated: failing checks not caused by the unit's changes must be flagged, not silently fixed.
6. The document mentions that discovery runs once (in the planner), producing CHECKS.md, which executors and reviewers consume.
7. No other file is modified in this unit's commit.
