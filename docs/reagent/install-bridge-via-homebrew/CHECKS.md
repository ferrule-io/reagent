# Checks for install-bridge-via-homebrew

| # | Command | Discovered via |
|---|---------|----------------|
| 1 | `cd bridge && npm run lint` | CI: .github/workflows/ci.yml step `npm run lint` |
| 2 | `cd bridge && npm run build` | CI: .github/workflows/ci.yml step `npm run build` |
| 3 | `cd bridge && npm test` | CI: .github/workflows/ci.yml step `npm test` |
| 4 | `brew audit --strict Formula/reagent-bridge.rb` | Homebrew best-practice validation (requires brew installed) |
| 5 | `brew style Formula/reagent-bridge.rb` | Homebrew Ruby style check (requires brew installed) |

Notes:
- Checks 1–3 run in the bridge/ subdirectory and require `npm ci` to have been run first.
- Checks 4–5 require Homebrew to be installed and are **best-effort** in CI (Ubuntu runners lack brew; they pass locally on macOS and in any brew-enabled environment). They should be run locally before merging.
- Check 4 (`brew audit --strict`) will flag that the formula builds from source and may note the absence of bottles — this is expected and acceptable for a tap formula.
- Check 5 (`brew style`) enforces Homebrew Ruby linting; the formula must pass with zero offenses.
