# Unit: release-flow-wiring

## Goal

Wire formula version and SHA-256 updates into the existing release flow so that every `vX.Y.Z` tag push keeps the Homebrew formula in sync with the shipped tarball. The approach is lightweight: a helper shell script (`scripts/update-formula-version.sh`) that the release operator runs after tagging, plus a new step added to `.github/workflows/package-desktop.yml` that runs the script automatically on tag push and commits the updated formula back to the release commit.

## Scope

- `scripts/update-formula-version.sh` (new file)
- `.github/workflows/package-desktop.yml`
- `docs/RELEASING.md`

No other files may be touched in this unit.

## Approach

### 1. Helper script — `scripts/update-formula-version.sh`

Create `scripts/update-formula-version.sh` (executable). It:

1. Reads the version from `desktop/package.json` (the source of truth for the release version, as documented in `docs/RELEASING.md`).
2. Constructs the tarball URL: `https://github.com/ferrule-io/reagent/archive/refs/tags/v${VERSION}.tar.gz`
3. Downloads the tarball with `curl -fsSL` to a temp file.
4. Computes the SHA-256 with `shasum -a 256` (macOS) or `sha256sum` (Linux), detecting which is available.
5. Replaces the `url "..."` and `sha256 "..."` lines in `Formula/reagent-bridge.rb` using `sed -i` (portable form).
6. Prints a summary: `Updated Formula/reagent-bridge.rb to v${VERSION} (sha256: ${HASH})`.

Script skeleton:
```sh
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -e "process.stdout.write(require('${REPO_ROOT}/desktop/package.json').version)")"
URL="https://github.com/ferrule-io/reagent/archive/refs/tags/v${VERSION}.tar.gz"
FORMULA="${REPO_ROOT}/Formula/reagent-bridge.rb"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "Downloading ${URL} ..."
curl -fsSL "$URL" -o "$TMP"

if command -v shasum &>/dev/null; then
  HASH="$(shasum -a 256 "$TMP" | awk '{print $1}')"
else
  HASH="$(sha256sum "$TMP" | awk '{print $1}')"
fi

sed -i.bak \
  -e "s|url \"https://github.com/ferrule-io/reagent/archive/refs/tags/v[^\"]*\"|url \"${URL}\"|" \
  -e "s|sha256 \"[a-f0-9]*\"|sha256 \"${HASH}\"|" \
  "$FORMULA"
rm -f "${FORMULA}.bak"

echo "Updated ${FORMULA} to v${VERSION} (sha256: ${HASH})"
```

Make the script executable: `chmod +x scripts/update-formula-version.sh`.

### 2. CI step in `package-desktop.yml`

Add a step to the `package-mac` job **after** the "Publish GitHub Release" step (or just before it, so the formula is updated before the release is published). The step:

```yaml
- name: Update Homebrew formula version
  if: startsWith(github.ref, 'refs/tags/')
  run: bash scripts/update-formula-version.sh

- name: Commit updated formula
  if: startsWith(github.ref, 'refs/tags/')
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add Formula/reagent-bridge.rb
    git diff --cached --quiet || git commit -m "chore: update Homebrew formula to ${GITHUB_REF_NAME}"
    git push origin HEAD:development
```

Notes on this approach:
- The script downloads the tarball for the newly-pushed tag. GitHub auto-serves the tarball immediately after a tag is pushed, so the download is always available at this step.
- The commit is pushed back to `development` (the default base branch). This means the formula in the repo always tracks the latest release.
- The step is guarded by `if: startsWith(github.ref, 'refs/tags/')` so it only runs on tag pushes, not manual workflow dispatches.
- The `permissions: contents: write` is already present on the `package-mac` job (it's used by the release step), so no additional permission change is needed.
- `git diff --cached --quiet || git commit` is a no-op safety: if the formula was already at the right version, we skip the commit.

### 3. Update `docs/RELEASING.md`

Add a new section after step 3 ("Push the commit and the tag") that explains what happens automatically:

```markdown
## (Automatic) Homebrew formula update

After pushing the tag, the **Package Desktop** workflow automatically:
1. Downloads the source tarball for the new tag.
2. Updates `Formula/reagent-bridge.rb` with the new `url` and `sha256`.
3. Commits and pushes the updated formula to `development`.

No manual formula update is required. If the CI step fails (e.g. network error), run it manually:

```sh
bash scripts/update-formula-version.sh
git add Formula/reagent-bridge.rb
git commit -m "chore: update Homebrew formula to vX.Y.Z"
git push origin development
```
```

## Acceptance criteria

- `scripts/update-formula-version.sh` exists and is marked executable (`git ls-files -s` shows mode `100755`).
- Running the script locally (with the current `desktop/package.json` version) produces an updated `Formula/reagent-bridge.rb` with the correct `url` and a 64-character hex `sha256`.
- `.github/workflows/package-desktop.yml` has two new steps: "Update Homebrew formula version" and "Commit updated formula", both guarded by `if: startsWith(github.ref, 'refs/tags/')`.
- `docs/RELEASING.md` contains a new section describing the automatic formula update and the manual fallback.
- No files outside `scripts/`, `.github/workflows/package-desktop.yml`, and `docs/RELEASING.md` are modified by this unit.
