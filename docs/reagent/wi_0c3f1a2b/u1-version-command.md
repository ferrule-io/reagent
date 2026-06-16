# Unit u1 — `:version` command

## Goal
Add a `/reagent:version` command that reports the reagent harness version, and align the
plugin manifest to `0.0.1` so there is a single source of truth.

## Scope
- `commands/version.md` (new)
- `.claude-plugin/plugin.json` (version field: `0.1.0` → `0.0.1`)

## Approach
1. Set `.claude-plugin/plugin.json` `version` to `0.0.1` (currently `0.1.0`). This matches
   `bridge/package.json` (already `0.0.1`) and the user's request, making the manifest the
   canonical version.
2. Create `commands/version.md` following the existing command pattern (see `ping.md`):
   - Frontmatter: `description: reagent harness — report the installed reagent version`.
   - Body instructs Claude to read the `version` field from `.claude-plugin/plugin.json`
     (resolved relative to the plugin root) and report `reagent v<version>` to the user.
   - Reading from the manifest avoids a hardcoded number drifting out of sync.

## Acceptance criteria
- `commands/version.md` exists, has valid frontmatter with a `description`, and instructs
  reading the version from `.claude-plugin/plugin.json`.
- `.claude-plugin/plugin.json` `version` is `0.0.1` and the JSON remains valid.
- Invoking `/reagent:version` would report `reagent v0.0.1`.
- No other files modified.
