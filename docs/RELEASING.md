# Releasing — Runbook

How to cut a macOS desktop release. Pushing a `vX.Y.Z` tag triggers the
**Package Desktop** workflow (`.github/workflows/package-desktop.yml`), which
builds the signed + notarized macOS app (`.dmg` + `.zip`, both `x64` and
`arm64`) and uploads them as a workflow-run artifact.

The release version is the **`desktop/package.json` version** — it is what
electron-builder stamps into the app and the installer filenames, and the git
tag must match it (`v` + that version). The `bridge/package.json` version is
internal and is not part of the release version.

---

## Prerequisites (once)

- **Signing secrets are configured** on the GitHub repo — see
  [`desktop/SIGNING.md`](../desktop/SIGNING.md). Without them the build still
  runs but produces an **unsigned, un-notarized** app.
- You have push access to `origin` and can push tags.

## Prerequisites (every release)

```sh
git checkout development
git pull --ff-only origin development   # be on the exact commit you want to ship
git status                              # working tree MUST be clean — npm version refuses otherwise
```

---

## 1. Choose the bump type

This project follows [semver](https://semver.org/) (`MAJOR.MINOR.PATCH`):

| Bump      | When                                                        | `0.1.0` becomes |
|-----------|-------------------------------------------------------------|-----------------|
| **patch** | Bug fixes / packaging tweaks only; no behavior change       | `0.1.1`         |
| **minor** | New backward-compatible features                            | `0.2.0`         |
| **major** | Breaking changes (config, data layout, removed features)    | `1.0.0`         |

> While the app is pre-1.0, breaking changes conventionally land as **minor**
> bumps. Use **major** (`1.0.0`) deliberately, to mark the first stable release.

## 2. Bump the version and create the tag

Run `npm version` **from `desktop/`**. It bumps `desktop/package.json`, makes a
commit, and creates a matching `v<version>` git tag in one step (npm's default
tag prefix is `v`, which is exactly what the workflow trigger expects):

```sh
cd desktop
npm version patch    # or: minor | major
cd ..
```

This produces, for example:
- a commit `0.2.0` touching `desktop/package.json` (+ `package-lock.json`)
- a tag `v0.2.0` pointing at that commit

Verify before pushing:

```sh
git show --stat HEAD          # confirms only desktop/package.json{,-lock} changed
git tag --points-at HEAD      # confirms the vX.Y.Z tag is on this commit
```

> **Exact version instead of a bump:** `npm version 1.4.2` sets a specific
> version (still creates the `v1.4.2` tag).

## 3. Push the commit and the tag

```sh
git push origin development          # pushes the version-bump commit
git push origin v0.2.0               # pushes the tag → triggers the release build
```

Or push both at once: `git push --follow-tags origin development`.

Pushing the tag is what starts the build. The branch push alone does **not**.

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

## 4. Watch the build

```sh
gh run watch       # or: gh run list --workflow "Package Desktop"
```

The run signs and notarizes the app, then signs and notarizes each `.dmg` container
separately (one notarization submission per architecture, two total — Apple's service is
the slow part, expect 3-8 minutes per submission).

## 5. Get the installers

The workflow does **not** create a GitHub Release. The signed `.dmg` and `.zip`
files are attached to the workflow run as an artifact named **`reagent-mac`**:

```sh
gh run download --name reagent-mac    # downloads the .dmg / .zip into the cwd
```

Or download from the run's **Artifacts** section in the GitHub Actions UI.

Sanity-check a downloaded `.dmg`/`.app`:

```sh
# Verify the DMG itself is notarized and stapled:
xcrun stapler validate Reagent-*.dmg
# expect: "The validate action worked!"

spctl -a -t open --context context:primary-signature Reagent-*.dmg
# expect: accepted / source=Notarized Developer ID

# Verify the .app inside the DMG:
spctl -a -vvv -t install /Volumes/Reagent/Reagent.app
# expect: accepted, source=Notarized Developer ID
codesign -dv --verbose=4 /Volumes/Reagent/Reagent.app
# shows the signing identity + Team ID
```

---

## Manual build without a release

To exercise the packaging workflow **without** cutting a version (e.g. to test
signing), trigger it manually — no tag, no version bump:

```sh
gh workflow run "Package Desktop" --ref development
```

It builds and uploads the same `reagent-mac` artifact.

---

## Fixing a bad tag

If a tag was pushed in error (wrong commit, build failed for a fixable reason),
delete it locally and remotely, fix the issue, then re-tag:

```sh
git tag -d v0.2.0
git push origin :refs/tags/v0.2.0     # delete the remote tag
```

Then either re-run `npm version` (after `git reset` of the bump commit if it was
also wrong) or re-create the tag on the corrected commit:

```sh
git tag v0.2.0 <commit-sha>
git push origin v0.2.0
```

> Avoid reusing a version number that real users may have already downloaded.
> If `v0.2.0` was published anywhere, bump to `v0.2.1` instead of re-cutting it.
