# Unit: docs update

## Goal
Update the plugin documentation to describe the new per-verb command names instead of the old
`/reagent:reagent <verb>` dispatcher form.

## Scope
- `docs/PLUGIN.md`

## Approach
Update the command list in `docs/PLUGIN.md` (currently around lines 27-29):
- `/reagent:reagent ping`  → `/reagent:ping`
- `/reagent:reagent start <repoPath> <request...>` → `/reagent:start <repoPath> <request...>`
- `/reagent:reagent resume <id>` → `/reagent:resume <id>`

Leave the "headless does NOT expand plugin slash commands / invoke the skill in natural language"
notes unchanged — the bridge launcher still drives the skill directly (`start-async`/`resume`), and
that mechanism is independent of the human-facing slash command names.

Do NOT modify historical plan docs under `docs/superpowers/plans/` — they are point-in-time records.

## Acceptance criteria
- `docs/PLUGIN.md` documents `/reagent:ping`, `/reagent:start`, and `/reagent:resume`.
- No `/reagent:reagent <verb>` form remains in `docs/PLUGIN.md`.
- The headless-launch / skill-invocation section is unchanged.
