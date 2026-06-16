# Unit: per-verb commands

## Goal
Replace the single verb-parsing dispatcher (`commands/reagent.md`) with three separate
per-verb slash commands so the harness exposes `/reagent:start`, `/reagent:ping`, and
`/reagent:resume` directly instead of `/reagent:reagent <verb>`.

## Scope
- `commands/**`

## Approach
1. Delete `commands/reagent.md`.
2. Create `commands/ping.md` (`/reagent:ping`): frontmatter `description` + no `argument-hint`
   (takes no args). Body: register a throwaway work item via
   `mcp__reagent-bridge__register_work_item` with `{ id: "wi_ping_<short-random>", title: "ping",
   repoPath: "(none)", request: "connectivity check", origin: "terminal" }`, then tell the user the
   id and that it should appear at http://localhost:4319/. No verb parsing.
3. Create `commands/start.md` (`/reagent:start`): frontmatter `description` +
   `argument-hint: "<repoPath> <request...>"`. Body: hand off to the `reagent-pipeline` skill,
   passing `start <repoPath> <request...>` (i.e. `start $ARGUMENTS`).
4. Create `commands/resume.md` (`/reagent:resume`): frontmatter `description` +
   `argument-hint: "<id>"`. Body: hand off to the `reagent-pipeline` skill, passing
   `resume $ARGUMENTS`.

Each command body should be self-contained and contain no verb-parsing logic. Preserve the exact
behavior the old dispatcher delegated for each verb.

## Acceptance criteria
- `commands/reagent.md` no longer exists.
- `commands/ping.md`, `commands/start.md`, `commands/resume.md` exist, each with valid frontmatter
  (`description`, and `argument-hint` where the command takes args).
- `ping` behavior matches the old dispatcher's `ping` branch; `start`/`resume` invoke the
  `reagent-pipeline` skill with the corresponding verb + args.
- No remaining reference to a `reagent` verb-dispatcher command inside `commands/`.
