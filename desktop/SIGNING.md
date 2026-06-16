# macOS Code Signing and Notarization Setup

The GitHub Actions workflow (`package-desktop.yml`) signs and notarizes the macOS app
automatically on each release tag push, using Developer ID Application credentials stored
as GitHub Actions secrets. This document describes the one-time steps to populate those
secrets.

## Prerequisites

- An active Apple Developer Program membership.
- Xcode command-line tools installed (`xcode-select --install`).
- Access to the repository's GitHub Actions secrets (repo admin or equivalent).

## Step 1 — Export the Developer ID Application certificate as a .p12

1. Open **Keychain Access** on your Mac.
2. In the sidebar, select **My Certificates**.
3. Locate **Developer ID Application: <Your Name/Org> (<Team ID>)**. If it is absent,
   create or download it from [developer.apple.com/account](https://developer.apple.com/account)
   under Certificates.
4. Right-click the certificate entry (not the private key) and choose **Export...**.
5. Choose file format **Personal Information Exchange (.p12)** and save it
   (e.g. `developer-id.p12`).
6. Set a strong export password — you will need this as `CSC_KEY_PASSWORD`.

## Step 2 — Base64-encode the .p12

```sh
base64 -i developer-id.p12 | tr -d '\n' > developer-id.p12.b64
cat developer-id.p12.b64
```

The output (a single line of base64 text) is the value of the `CSC_LINK` secret.

## Step 3 — Create an app-specific password

1. Sign in to [appleid.apple.com](https://appleid.apple.com).
2. Under **Sign-In and Security**, choose **App-Specific Passwords**.
3. Click **+** to generate a new password. Name it something like `reagent-notarize`.
4. Copy the generated password — this is the value of `APPLE_APP_SPECIFIC_PASSWORD`.

## Step 4 — Find your Team ID

1. Sign in to [developer.apple.com/account](https://developer.apple.com/account).
2. Click your name in the top right → **Membership details**.
3. Copy the **Team ID** field (10 alphanumeric characters, e.g. `AB12CD34EF`).

## Step 5 — Add the five GitHub Actions secrets

In the repository on GitHub, go to
**Settings → Secrets and variables → Actions → New repository secret** and create:

| Secret name | Value |
|---|---|
| `CSC_LINK` | base64 string from Step 2 |
| `CSC_KEY_PASSWORD` | export password from Step 1 |
| `APPLE_ID` | Your Apple ID email address |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password from Step 3 |
| `APPLE_TEAM_ID` | Team ID from Step 4 |

## How each secret is used

- **`CSC_LINK` / `CSC_KEY_PASSWORD`** — read directly by electron-builder to locate and
  unlock the signing certificate. These are electron-builder conventions.

- **`APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD`** — read **automatically** by
  electron-builder from the CI environment when `notarize.teamId` is truthy (i.e. when
  the notarytool path is active). No explicit reference to these variables is needed in
  the config file; electron-builder picks them up from the process environment.

- **`APPLE_TEAM_ID`** — consumed by **`desktop/electron-builder.js`** via
  `process.env.APPLE_TEAM_ID`. The JS config evaluates:
  ```js
  notarize: process.env.APPLE_TEAM_ID
    ? { teamId: process.env.APPLE_TEAM_ID }
    : false
  ```
  This is what selects the modern `notarytool` notarization path in electron-builder
  24.13.3 (`macPackager.js` line 471). electron-builder does **not** auto-read this
  variable — our JS config is the only consumer. When `APPLE_TEAM_ID` is unset (local
  dev builds), `notarize` is `false` and notarization is cleanly skipped.

> **Why a JS config instead of YAML?**
> electron-builder reads YAML via plain `js-yaml` with no environment-variable
> substitution for arbitrary config keys. A `${env.APPLE_TEAM_ID}` string in
> `electron-builder.yml` under `notarize.teamId` would be passed literally to
> `notarytool` and fail. A CommonJS `.js` config lets us read `process.env` at build
> time, which is the only correct approach.

## Verification

Push a tag (`git tag v0.1.0 && git push origin v0.1.0`) or manually trigger the
**Package Desktop** workflow. A successful run will:

1. Build and sign the `.app` with `Developer ID Application`.
2. Submit the signed `.app` to Apple's notarization service (`notarytool`).
3. Staple the notarization ticket to the `.app` inside each `.dmg` and `.zip`.
4. Code-sign each `.dmg` container with `Developer ID Application`.
5. Submit each `.dmg` to Apple's notarization service and wait for acceptance.
6. Staple the notarization ticket to each `.dmg`.

The uploaded artifacts can be distributed outside the Mac App Store without Gatekeeper
warnings.

To verify a downloaded `.dmg`:

```sh
# Confirm the DMG itself is stapled and accepted:
xcrun stapler validate Reagent-*.dmg
# expect: "The validate action worked!"

spctl -a -t open --context context:primary-signature Reagent-*.dmg
# expect: accepted / source=Notarized Developer ID

# Confirm the .app inside is also signed correctly:
spctl -a -vvv -t install /Volumes/Reagent/Reagent.app
codesign -dv --verbose=4 /Volumes/Reagent/Reagent.app
```

## Troubleshooting

- **"No identity found"** — `CSC_LINK` is missing or the base64 is malformed. Re-encode
  the .p12 and ensure no line breaks in the secret value.
- **"App-specific password is invalid"** — regenerate the app-specific password and
  update the secret.
- **"Team ID not found" / notarization fails** — double-check `APPLE_TEAM_ID` is the
  10-char alphanumeric string from Membership details, not the full team name. Verify
  the secret name exactly matches `APPLE_TEAM_ID` (case-sensitive).
- **Local unsigned builds** — omit `APPLE_TEAM_ID` from your local environment (or
  ensure it is unset). With `APPLE_TEAM_ID` unset, `electron-builder.js` sets
  `notarize: false` and the build succeeds unsigned. To skip signing entirely, also set
  `CSC_IDENTITY_AUTO_DISCOVERY=false`.
- **DMG notarization fails (afterAllArtifactBuild step)** — Check the CI log for the
  `xcrun notarytool submit` output. Common causes: `APPLE_ID` or
  `APPLE_APP_SPECIFIC_PASSWORD` is wrong/expired (regenerate the app-specific password
  and update the secret), or the DMG was not successfully signed by `codesign` before
  submission (check the `codesign` output immediately preceding the `notarytool` call in
  the log). The `notarytool submit --wait` command prints Apple's full error response on
  failure.
