# Unit u1 — Root README

## Goal
Add a `README.md` at the repo root that serves as the project's front door: explains what reagent is, how its two halves (plugin + bridge) fit together, how to get started, and where to find deeper docs.

## Scope
- `README.md` (new file at repo root)

No code changes; no edits to existing docs.

## Approach
Write a single root `README.md` with these sections:
1. **Title + one-line tagline** — phone-drivable Claude Code coding harness with human approval gates.
2. **What is reagent** — one short paragraph framing the problem it solves (kick off and approve coding work from your phone).
3. **Architecture** — the two halves: the **plugin** (session-side skill + scoped executor + commands) and the **bridge** (always-on hub holding state and the human gate). Describe the INVESTIGATE → PROPOSE → PLAN → EXECUTE pipeline, with the approval gate answerable from a phone.
4. **Quickstart** — (a) run the bridge (`cd bridge && npm run dev`), (b) install the plugin as a local marketplace, (c) `/reagent:start <repoPath> <request>`. Keep commands consistent with docs/PLUGIN.md and bridge/README.md.
5. **Repo layout** — brief map of top-level dirs: `.claude-plugin/`, `.mcp.json`, `skills/`, `agents/`, `commands/`, `bridge/`, `docs/`.
6. **Status** — M1 complete; M2 = full pipeline (per project memory and existing docs).
7. **Learn more** — links to `docs/PLUGIN.md` (plugin half) and `bridge/README.md` (bridge half). Do not duplicate their content.

## Acceptance criteria
- `README.md` exists at the repo root.
- Accurately names the two halves and the pipeline stages, consistent with existing docs.
- Quickstart commands match those in docs/PLUGIN.md / bridge/README.md.
- Links to docs/PLUGIN.md and bridge/README.md resolve (correct relative paths).
- No changes to any file other than the new README.md.
