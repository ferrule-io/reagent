# Check Discovery

Given an arbitrary repo, deterministically discover the ordered list of check commands that CI would run, without guessing or relying on convention alone. This document is the authoritative reference for check discovery. All agents (planner, executor, reviewer) follow this procedure; no agent re-invents it.

---

## Discovery procedure

The procedure is a **priority-ordered search**. Read each source in order. Add a command to the list only if it is not already present from a higher-priority source. Stop once a source yields at least one command — lower-priority sources are still consulted for commands not yet covered.

---

### Priority 1 — CI config files (authoritative)

CI configuration is the ground truth: these are the checks that must pass on push.

**GitHub Actions** — `.github/workflows/*.yml` / `.github/workflows/*.yaml`
For each workflow job's `steps`, extract every `run:` line that invokes a build, lint, or test command. Examples of commands to capture: `npm run lint`, `npm run build`, `npm test`, `cargo test`, `go test ./...`, `biome check`, `ruff check .`, `mypy .`, `mvn verify`, `./gradlew check`. Commands that only validate code quality or correctness qualify.

**Other CI systems** — apply the same extraction logic to:
- `.gitlab-ci.yml`
- `.circleci/config.yml`
- `Jenkinsfile`
- `.travis.yml`

**What to ignore** — CI-only infrastructure steps that do not validate code: checkout actions, cache setup, Docker login/build, deployment steps, artifact uploads, notification steps.

---

### Priority 2 — Declared manifest scripts

When no CI config exists (or to fill gaps), consult manifest files.

**`package.json`** — extract entries from the `scripts` field whose names signal check intent:
`lint`, `build`, `test`, `typecheck`, `check`, `format:check`, and any name containing those words. Preferred order: lint before build before test.

**`Makefile` / `justfile`** — look for targets named `lint`, `test`, `build`, `check`, or `ci`. If present, record the corresponding invocation (`make lint`, `make test`, `just check`, etc.).

**`pyproject.toml` / `setup.cfg`** — look for `[tool.pytest.ini_options]`, tox configuration sections, or explicitly declared lint/test commands.

---

### Priority 3 — Tool-config presence → default command

When neither CI config nor manifest scripts reveal a command for a given tool, infer the default invocation from the presence of a tool config file:

| Config file(s) | Default command |
|---|---|
| `biome.json` or `biome.jsonc` | `npx biome check .` (prefer `npm run check` if that script exists) |
| `.eslintrc*` / `eslint.config.*` | `npx eslint .` |
| `.prettierrc*` | `npx prettier --check .` |
| `ruff.toml` / `pyproject.toml` with `[tool.ruff]` | `ruff check .` |
| `mypy.ini` / `pyproject.toml` with `[tool.mypy]` | `mypy .` |
| `Cargo.toml` | `cargo clippy -- -D warnings` then `cargo test` |
| `go.mod` | `go vet ./...` then `go test ./...` |
| `pom.xml` | `mvn verify` |
| `build.gradle` / `build.gradle.kts` | `./gradlew check` |

---

### Priority 4 — Git pre-commit hooks

Check for an executable pre-commit hook in one of these locations:
- `.git/hooks/pre-commit` (executable)
- `.husky/pre-commit`
- `.lefthook.yml`

If a hook exists and is executable, record it as a check to run. Execute it directly (`bash .git/hooks/pre-commit`) or let `git commit` trigger it naturally.

---

## Output format — CHECKS.md manifest

After discovery, the planner must write a manifest at `docs/reagent/<slug>/CHECKS.md` with this exact structure:

```markdown
# Checks for <slug>

| # | Command | Discovered via |
|---|---------|----------------|
| 1 | npm run lint | CI: .github/workflows/ci.yml step "Lint" |
| 2 | npm run build | CI: .github/workflows/ci.yml step "Build" |
| 3 | npm test | package.json scripts.test |
```

Every row records one command and its discovery source. The manifest is written **once** by the planner and consumed unchanged by the executor and reviewer — no re-discovery at each stage.

---

## Pre-existing-failure rule

Before applying any unit changes, the executor runs all commands in CHECKS.md on the base branch state. If a command fails at that point:

1. **Record** the failing commands in a "Pre-existing failures" section appended to `CHECKS.md`:

   ```markdown
   ## Pre-existing failures

   The following checks were already failing before this unit's changes:

   | # | Command | Exit code | Notes |
   |---|---------|-----------|-------|
   | 2 | npm run build | 1 | Failing on base branch |
   ```

2. **Do not silently fix** failures that are outside the unit's declared scope. The executor must not widen its scope to repair pre-existing breakage.

3. **Fix** any failures that the unit's own changes introduce.

4. **Flag** all pre-existing failures to the pipeline orchestrator (via `report_status`) so a human can decide whether to block the work item.

The reviewer re-runs all checks after the executor's commit. A pre-existing failure that was already recorded does not cause the reviewer to FAIL the unit — but a new failure introduced by the unit's changes does.

---

## Note on single-pass discovery

All agents (planner, executor, reviewer) reference this document. The CHECKS.md manifest is written once by the planner and consumed unchanged by the executor and reviewer — no re-discovery at each stage.
