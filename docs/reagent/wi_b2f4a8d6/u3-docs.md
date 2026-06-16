# Unit u3 — Document the adversarial, fully-subagent pipeline

## Goal
Update the prose docs so they describe the new flow: planner, reviewer, and per-unit execute→review with adversarial verification.

## Scope
- `docs/PLUGIN.md`
- `README.md`

No other files.

## Approach

### docs/PLUGIN.md
- In "How it works" and the scope-guard bullets, update the description so PLAN and EXECUTE are subagent-delegated and a `reagent-reviewer` performs adversarial review. State the pipeline as INVESTIGATE → PROPOSE → PLAN (planner) → plan-review → per-unit [execute → code-review] → DONE.
- Note the three subagents: `reagent-planner`, `reagent-executor`, `reagent-reviewer`, and that the reviewer is read-only and runs in a fresh context for independent verification (cite the adversarial-code-review idea / link https://asdlc.io/patterns/adversarial-code-review/).
- Mention the reviewer validates ALL-and-ONLY specified changes via the unit git diff.

### README.md
- Update the "Architecture" / pipeline section so the stage list reflects PLAN(planner) → plan-review → per-unit execute→review, and the harness description mentions adversarial review and that plan/execute/review all run as subagents.
- Keep it concise and consistent with docs/PLUGIN.md; do not duplicate full detail — link to PLUGIN.md.

## Acceptance criteria
- docs/PLUGIN.md describes planner + reviewer subagents, the per-unit execute→review loop, adversarial/read-only/fresh-context reviewer, and the ALL-and-ONLY diff check, with the asdlc link.
- README.md's pipeline/architecture reflects the same flow and stays consistent with PLUGIN.md.
- No files other than docs/PLUGIN.md and README.md are changed.
