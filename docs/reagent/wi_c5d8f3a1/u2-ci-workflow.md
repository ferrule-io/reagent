# Unit u2 — GitHub Actions CI workflow

**Work item:** wi_c5d8f3a1 — Run GitHub Actions on PRs and pushes to development
**Depends on:** u1 (the `lint` script must exist for CI to run it)

## Goal
Add a GitHub Actions workflow that runs lint, build, and tests on every pull request
targeting `development` and on every push to `development`.

## Scope (files)
- `.github/workflows/ci.yml` (new)

Explicitly NOT in scope: `bridge/**` (handled in u1).

## Approach
Create `.github/workflows/ci.yml`:

- **Name:** CI
- **Triggers:**
  ```yaml
  on:
    push:
      branches: [development]
    pull_request:
      branches: [development]
  ```
- **Job** `build-test` on `ubuntu-latest`, with `defaults.run.working-directory: bridge`:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` with `node-version: 20`, `cache: npm`,
     `cache-dependency-path: bridge/package-lock.json`
  3. `npm ci`
  4. `npm run lint`
  5. `npm run build`
  6. `npm test`
- Pin actions to major version tags (`@v4`). No secrets required.

## Acceptance criteria
- Workflow file is valid YAML and parses as a GitHub Actions workflow.
- Triggers are exactly: push to `development` and PRs targeting `development`.
- Steps run in `bridge/` and execute install → lint → build → test in that order.
- Uses Node 20 and npm caching keyed to `bridge/package-lock.json`.
