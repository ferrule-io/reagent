# reagent M1 — Plugin Implementation Plan (Plan 2 of 3)

> **For agentic workers:** This plan is **authoring-heavy** (Claude Code plugin files: JSON manifest, `.mcp.json`, skill/command markdown, subagent markdown) with **manual integration validation** rather than unit tests — the artifacts are declarative config + prose the Claude Code runtime interprets, so the "test" is loading the plugin and driving a real pipeline run against the bridge. Execute task-by-task; steps use checkbox (`- [ ]`) syntax. Prefer **inline execution** (superpowers:executing-plans) over subagent-driven for this plan, since validations are interactive (loading the plugin, approving a gate in the browser).

**Goal:** Build the `reagent` Claude Code plugin — a skill that drives a work item through INTAKE → INVESTIGATE → PLAN_APPROVAL → EXECUTE → DONE, slash commands to start/resume, and a tool-scoped executor subagent — all wired to the Plan-1 bridge over MCP-over-HTTP, so a Claude Code session becomes the harness runtime.

**Architecture:** The repo root becomes the plugin (`.claude-plugin/plugin.json` + `.mcp.json` + `skills/` + `agents/` + `commands/`), alongside the existing `bridge/`. The plugin's `.mcp.json` connects the session to the bridge at `http://localhost:4319/mcp`; the skill calls the bridge's MCP tools to register work, stream status, wait on the human gate (poll loop), and complete. EXECUTE is delegated to a `reagent-executor` subagent whose `tools:` allow-list confines it (the M1 scope guard). State + the human-approval loop live in the bridge (Plan 1); this plan adds the session-side driver.

**Tech Stack:** Claude Code plugin (JSON + Markdown), the Plan-1 bridge (must be running), git.

This is **Plan 2 of 3** (Bridge core → **plugin** → headless launch + integration). It depends on Plan 1 (merged). Headless launch, Tailscale, and auto-starting the bridge are **Plan 3**; here the bridge is started manually (`cd bridge && npm run dev`).

---

## Verified Claude Code specifics (from official docs, June 2026)

Use these exact forms. Where a field is marked ⚠️, the schema may vary by Claude Code version — Task 1 validates the real schema before the rest of the plan relies on it.

- **Plugin manifest:** `.claude-plugin/plugin.json`, required `name` + `description`. Optional `version`, `author`, etc.
- **MCP client config:** `.mcp.json` at plugin root, `{"mcpServers": {"reagent-bridge": {"type": "http", "url": "http://localhost:4319/mcp"}}}`. HTTP MCP is supported; `localhost` is fine.
- **MCP tool names (plugin-provided server):** `mcp__plugin_reagent_reagent-bridge__<tool>` — e.g. `mcp__plugin_reagent_reagent-bridge__register_work_item`. (Confirmed by the live tool-naming convention `mcp__plugin_<plugin>_<server>__<tool>`.)
- **Skill:** `skills/<name>/SKILL.md` with frontmatter `name`, `description`; body is the workflow. `$ARGUMENTS` substitutes invocation args. ⚠️ `allowed-tools` frontmatter field name/format.
- **Slash command:** `commands/<name>.md` with frontmatter `description`; `$ARGUMENTS`/`$1` for args. (Skills and commands are similar; this plan uses `commands/` for the explicit `/reagent:*` verbs and a `skills/` skill for the workflow body.)
- **Subagent:** `agents/<name>.md` with frontmatter `name`, `description`, `tools` (allow-list — restricting to listed tools is the scope guard), optional `model`, ⚠️ `isolation: worktree`. Invoked via the Agent/Task tool or `@agent-<name>`.
- **Pre-authorize MCP tools (autonomous, no prompts):** add the tool patterns to `permissions.allow` (project `.claude/settings.json`) and/or the subagent `tools` allow-list. Wildcard `mcp__plugin_reagent_reagent-bridge__*`.

---

## File structure (created by this plan, at repo root)

```
.claude-plugin/
  plugin.json                 # plugin manifest
.mcp.json                     # MCP client -> bridge (http://localhost:4319/mcp)
.claude/
  settings.json               # pre-authorize bridge MCP tools (project-local)
commands/
  reagent.md                  # /reagent:reagent dispatcher (start | resume | ping)
skills/
  reagent-pipeline/
    SKILL.md                  # the pipeline workflow (the heart of this plan)
agents/
  reagent-executor.md         # tool-scoped EXECUTE subagent (the scope guard)
docs/PLUGIN.md                # how to install/use the plugin
```

The bridge (`bridge/`) is unchanged by this plan.

---

## Task 1: Plugin skeleton + bridge connectivity (retire the "does it load + connect" risk FIRST)

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.mcp.json`
- Create: `.claude/settings.json`
- Create: `commands/reagent.md`

This task creates the minimum that proves: (a) Claude Code loads the plugin, (b) the `/reagent` command appears, (c) the bridge MCP tools are connected and callable, and an action shows up in the bridge PWA.

- [ ] **Step 1: Write `.claude-plugin/plugin.json`**

```json
{
  "name": "reagent",
  "description": "Remote-controllable coding harness: drives a work item through investigate -> plan approval -> execute, with human gates answerable from your phone via the reagent bridge.",
  "version": "0.1.0"
}
```

- [ ] **Step 2: Write `.mcp.json` (connect the session to the bridge)**

```json
{
  "mcpServers": {
    "reagent-bridge": {
      "type": "http",
      "url": "http://localhost:4319/mcp"
    }
  }
}
```

- [ ] **Step 3: Write `.claude/settings.json` (pre-authorize the bridge tools so the workflow runs without prompts)**

```json
{
  "permissions": {
    "allow": [
      "mcp__plugin_reagent_reagent-bridge__register_work_item",
      "mcp__plugin_reagent_reagent-bridge__report_status",
      "mcp__plugin_reagent_reagent-bridge__await_decision",
      "mcp__plugin_reagent_reagent-bridge__complete_work_item"
    ]
  }
}
```

- [ ] **Step 4: Write a minimal `commands/reagent.md` with a `ping` verb**

```markdown
---
description: reagent harness — start, resume, or ping a work pipeline
argument-hint: "ping | start <repoPath> <request...> | resume <id>"
---

You are the reagent harness dispatcher. Parse the verb from: `$ARGUMENTS`

- If the verb is `ping`: call the MCP tool `mcp__plugin_reagent_reagent-bridge__register_work_item` with
  `{ id: "wi_ping_<short-random>", title: "ping", repoPath: "(none)", request: "connectivity check", origin: "terminal" }`,
  then tell the user the work item id you registered and that it should now be visible in the bridge web UI. Do not do anything else.
- If the verb is `start` or `resume`: invoke the `reagent-pipeline` skill, passing the full `$ARGUMENTS`. (That skill is added in Task 3 — for now, if it is not available, say so.)
```

- [ ] **Step 5: Start the bridge (separate terminal) and load the plugin**

Start the bridge:
```bash
cd /Users/mquinlan/Workspace/purse/reagent/bridge && npm run dev
```
(Leave running; it serves MCP at `http://localhost:4319/mcp` and the PWA at `http://localhost:4319/`.)

Load the plugin in a Claude Code session rooted at the repo. **Determine the correct local-plugin load mechanism for your installed Claude Code version** — likely one of:
- `claude` started in the repo (a repo-root `.claude-plugin/plugin.json` + `.mcp.json` may load automatically as a project plugin), **or**
- a CLI dev flag to load a local plugin directory, **or**
- adding the repo as a local marketplace (`/plugin marketplace add <path>`) then `/plugin install reagent`.

Confirm the exact mechanism from `claude --help` / the plugins docs, and record it in `docs/PLUGIN.md` (Task 6). **Acceptance for this step:** in the session, `/reagent` (or `/reagent:reagent`) is available, and the bridge MCP tools appear (they should be listed as available tools; you can confirm by asking the session "list your reagent-bridge MCP tools").

- [ ] **Step 6: Prove connectivity end-to-end**

In the Claude Code session, run: `/reagent ping`

**Acceptance:**
- The session calls the register tool without a permission prompt (because of `.claude/settings.json`).
- It reports a `wi_ping_*` id.
- Open `http://localhost:4319/` — the ping work item appears in the list.

If the tool name doesn't resolve, inspect the actual tool name the session sees (ask it to list its MCP tools), and **correct the `mcp__plugin_reagent_reagent-bridge__*` names** in `.claude/settings.json` and later files to match the real convention for your version. This is the whole point of Task 1 — lock the names down now.

- [ ] **Step 7: Commit**

```bash
cd /Users/mquinlan/Workspace/purse/reagent
git add .claude-plugin/plugin.json .mcp.json .claude/settings.json commands/reagent.md
git commit -m "feat(plugin): plugin skeleton + bridge MCP connectivity (/reagent ping)"
```

---

## Task 2: Tool-scoped executor subagent (the M1 scope guard)

**Files:**
- Create: `agents/reagent-executor.md`

This subagent performs the EXECUTE stage confined to a restricted tool set — the Claude-Code-native scope guard. For M1 it operates over the whole repo (per-unit path scoping is M3), but its tools are limited to read/search/edit/git + the bridge status tools; notably no `WebFetch` and no ability to spawn further agents.

- [ ] **Step 1: Write `agents/reagent-executor.md`**

```markdown
---
name: reagent-executor
description: Implements an approved plan for a reagent work item on its own branch, confined to read/edit/git within the target repo. Invoked by the reagent-pipeline skill for the EXECUTE stage.
tools: Read, Edit, Write, Grep, Glob, Bash, mcp__plugin_reagent_reagent-bridge__report_status
model: sonnet
---

You are the reagent EXECUTE stage. You are given: a work item `id`, a target `repoPath`, an approved `plan` (diagnosis + direction), and a `branch` name (`reagent/<id>`).

Rules (scope guard):
- Work ONLY inside the target repo at `repoPath`. Do not touch files outside it.
- Do all git work on the branch `reagent/<id>` (create it from the current HEAD if it does not exist). NEVER push, force-push, reset --hard, or delete branches — commit locally only.
- Implement exactly the approved plan. Do not expand scope, refactor unrelated code, or add features beyond the plan.
- You have no web access; rely on the repo and the plan.

Procedure:
1. `cd` to `repoPath`. Create/switch to branch `reagent/<id>`.
2. Implement the approved direction with focused edits.
3. Run the project's tests/build if an obvious command exists; if they fail, fix within scope.
4. Commit the change with a clear message referencing the work item.
5. Call `mcp__plugin_reagent_reagent-bridge__report_status` with `{ id, phase: "EXECUTE", line: "<one-line summary of what you changed>", branch: "reagent/<id>" }`.
6. Report back to the caller: the branch name, files changed, and whether tests/build passed.
```

- [ ] **Step 2: Add the executor's report tool to the project allow-list**

Edit `.claude/settings.json` `permissions.allow` to also include the executor's tools if you want it prompt-free. (The bridge tool is already listed from Task 1; the standard Read/Edit/Bash/etc. are normally allowed by default or handled by `permissionMode`. If your run prompts on Edit/Bash inside the subagent, add an appropriate `permissionMode` to the subagent frontmatter — `acceptEdits` — and re-test.) Keep edits minimal; verify in Task 5.

- [ ] **Step 3: Commit**

```bash
cd /Users/mquinlan/Workspace/purse/reagent
git add agents/reagent-executor.md .claude/settings.json
git commit -m "feat(plugin): tool-scoped reagent-executor subagent (scope guard)"
```

---

## Task 3: The pipeline skill (INVESTIGATE → gate → EXECUTE → DONE)

**Files:**
- Create: `skills/reagent-pipeline/SKILL.md`

This is the heart of the plan: the workflow Claude Code follows. It must drive the bridge tools precisely and — critically — **poll the human gate persistently and autonomously**.

- [ ] **Step 1: Write `skills/reagent-pipeline/SKILL.md`**

````markdown
---
name: reagent-pipeline
description: Drive a coding work item through the reagent pipeline — investigate, get human plan approval via the bridge, then execute on a branch. Use when starting or resuming reagent work.
---

# reagent pipeline

You orchestrate one work item through: INTAKE → INVESTIGATE → PLAN_APPROVAL (human gate) → EXECUTE → DONE.
All state and the human approval gate live in the **reagent bridge**, reached via the `reagent-bridge` MCP tools
(`mcp__plugin_reagent_reagent-bridge__*`). The bridge must be running at http://localhost:4319.

You are given `$ARGUMENTS`, beginning with a verb:
- `start <repoPath> <request...>` — begin a new work item.
- `resume <id>` — continue an existing work item.

## Tool reference (bridge)
- `register_work_item({ id, title, repoPath, request, origin })`
- `report_status({ id, phase?, line?, plan?, branch? })`
- `await_decision({ id, prompt })` → returns `{ "status": "pending" }` or `{ "status": "decided", "decision": { "result": "approve"|"reject", "note"? } }`
- `complete_work_item({ id, phase })` where phase ∈ DONE | REJECTED | FAILED

## START flow

1. **INTAKE.** Generate a work item id `wi_<8 hex chars>`. Derive a short `title` from the request. Call
   `register_work_item({ id, title, repoPath, request: "<the full request text>", origin: "terminal" })`.
   Call `report_status({ id, phase: "INVESTIGATE", line: "starting investigation" })`.

2. **INVESTIGATE (read-only).** Explore the target repo (Read/Grep/Glob/Bash for read-only inspection — do NOT edit anything yet).
   Understand the request and the relevant code. Produce a concise **diagnosis + a single proposed direction**
   (2–6 sentences: what's going on, and the approach you propose). Call
   `report_status({ id, phase: "INVESTIGATE", line: "investigation complete", plan: "<diagnosis + proposed direction>" })`.

3. **PLAN_APPROVAL (human gate — autonomous wait).** Call
   `await_decision({ id, prompt: "<the same diagnosis + proposed direction, formatted for a human to approve>" })`.
   - The tool returns `{ "status": "pending" }` after a short server-side wait. **When it does, call it again immediately with the same arguments.** Keep polling in a loop.
   - **This is an unattended wait. Do NOT stop, do NOT ask the user in the terminal, do NOT start other work.** The human answers from the bridge web UI / their phone. Simply keep calling `await_decision` until it returns `{ "status": "decided", ... }`.
   - When decided:
     - If `decision.result === "reject"`: call `complete_work_item({ id, phase: "REJECTED" })`, tell the user it was rejected (include the note if any), and STOP.
     - If `decision.result === "approve"`: proceed to EXECUTE.

4. **EXECUTE (delegated, scoped).** Delegate to the `reagent-executor` subagent (via the Agent tool / `@agent-reagent-executor`),
   passing: the work item `id`, the `repoPath`, the approved `plan`, and the branch `reagent/<id>`.
   The executor makes the change on that branch, commits locally, and reports status. Wait for it to finish.

5. **DONE.** Once the executor reports success, call `complete_work_item({ id, phase: "DONE" })`. Tell the user the branch
   (`reagent/<id>`) and a one-line summary. (Opening a PR is a later milestone — do not push.)

If any step hits an unrecoverable error, call `complete_work_item({ id, phase: "FAILED" })`, report what failed, and stop.

## RESUME flow

1. Fetch the current state of work item `<id>` from the bridge HTTP API (read-only) via Bash:
   `curl -s http://localhost:4319/api/items/<id>` → JSON with `phase`, `plan`, `branch`, `pendingCheckpoint`, `request`, `repoPath`.
2. Determine where it stands and continue the START flow from the appropriate phase, **reconstructing from this state + the live repo** rather than relying on any prior conversation:
   - `phase` INVESTIGATE with no plan → redo INVESTIGATE.
   - `phase` PLAN_APPROVAL with an undecided `pendingCheckpoint` → resume the await_decision poll loop (step 3).
   - `phase` PLAN_APPROVAL already decided, or EXECUTE in progress → resume EXECUTE (step 4) on `reagent/<id>` (the executor is idempotent on its own branch).
   - terminal phase (DONE/REJECTED/FAILED) → report it; nothing to do.

## Guardrails
- INVESTIGATE never edits. Only EXECUTE (via the scoped subagent) edits, only on `reagent/<id>`, never pushing.
- Thread the work item `id` through every bridge call.
- Keep `report_status` lines short and human-readable — they show up live in the bridge UI.
````

- [ ] **Step 2: Update `commands/reagent.md` so `start`/`resume` invoke this skill**

The Task-1 command already routes `start`/`resume` to the `reagent-pipeline` skill. Re-read it and confirm the wording invokes the skill by name with `$ARGUMENTS`. Adjust if your version invokes skills differently (e.g., the command body can simply say: "Use the reagent-pipeline skill with arguments: $ARGUMENTS").

- [ ] **Step 3: Commit**

```bash
cd /Users/mquinlan/Workspace/purse/reagent
git add skills/reagent-pipeline/SKILL.md commands/reagent.md
git commit -m "feat(plugin): reagent-pipeline skill (investigate -> gate -> execute)"
```

---

## Task 4: Reload + smoke the command surface

**Files:** none (validation only)

- [ ] **Step 1: Reload the plugin**

With the bridge running, reload the plugin in the session (`/reload-plugins`, or restart the session, per your version). Confirm `/reagent` is present and the `reagent-pipeline` skill and `reagent-executor` agent are loaded (ask the session to list available skills/agents).

- [ ] **Step 2: Dry-run the START parse (no real work)**

Run `/reagent start` with no repo to confirm the dispatcher/skill parses the verb and asks for/handles missing args gracefully (it should explain usage rather than crash). This checks the command→skill wiring without doing real edits.

- [ ] **Step 3: Commit (if you adjusted any wording)**

```bash
cd /Users/mquinlan/Workspace/purse/reagent && git add -A && git commit -m "fix(plugin): command/skill wiring adjustments" || echo "no changes"
```

---

## Task 5: End-to-end integration test (the real proof)

**Files:** none (a throwaway test repo + manual run)

This proves the full Plan-2 slice: a real `/reagent start` runs investigate, opens a gate, you approve in the bridge UI, the scoped executor makes a real commit, and the item reaches DONE — all visible live in the bridge.

- [ ] **Step 1: Make a throwaway target repo**

```bash
mkdir -p /tmp/reagent-demo && cd /tmp/reagent-demo && git init -q && printf "# Demo\n\nTODO: add a greeting function.\n" > README.md && mkdir -p src && printf "// add greet() here\n" > src/index.js && git add -A && git commit -q -m "init demo" && echo "demo repo ready"
```

- [ ] **Step 2: Ensure the bridge is running** (`cd bridge && npm run dev`) and open `http://localhost:4319/` in a browser.

- [ ] **Step 3: Start work**

In the Claude Code session (plugin loaded):
```
/reagent start /tmp/reagent-demo Add a greet(name) function in src/index.js that returns "Hello, <name>!" and document it in the README.
```

**Expected, live in the bridge UI:**
1. A new work item appears, phase `INVESTIGATE`, then a `plan` (diagnosis + proposed direction) shows.
2. The item flips to `PLAN_APPROVAL` with the proposed direction and **Approve / Reject** buttons. The session keeps polling (it does not stop or ask you in the terminal).

- [ ] **Step 4: Approve in the browser.** Click **Approve**.

**Expected:**
3. The session proceeds to EXECUTE via the `reagent-executor` subagent.
4. The item shows an EXECUTE status line and a `branch` (`reagent/wi_…`), then `DONE`.
5. In the demo repo, the branch exists with a real commit implementing `greet`:
   ```bash
   cd /tmp/reagent-demo && git log --oneline --all | head && git show --stat "$(git branch --list 'reagent/*' | head -1 | tr -d ' *')" | head -20
   ```

- [ ] **Step 5: Test reject.** Run another `/reagent start ...`; this time click **Reject** (optionally with a note) in the UI. Confirm the session reports rejection and the item shows `REJECTED`, with no branch/commit made.

- [ ] **Step 6: Test resume.** Start a third item; when it reaches `PLAN_APPROVAL`, **end the Claude Code session** (leave it pending). Start a fresh session and run `/reagent resume <id>` (id from the bridge UI). Confirm it reconstructs state from the bridge, resumes the gate poll, and — after you Approve — completes. This proves resume-by-reconstruction at the session level.

- [ ] **Step 7: Record results.** Note any wording/permission adjustments you had to make to the skill/agent/command so the autonomous gate-poll and the scoped EXECUTE worked without manual prompts. Apply them to the files and commit.

```bash
cd /Users/mquinlan/Workspace/purse/reagent && git add -A && git commit -m "fix(plugin): tune pipeline skill/executor from end-to-end run" || echo "no changes"
```

---

## Task 6: Plugin docs

**Files:**
- Create: `docs/PLUGIN.md`

- [ ] **Step 1: Write `docs/PLUGIN.md`** documenting: the exact local-load mechanism you confirmed in Task 1; that the bridge must be running (`cd bridge && npm run dev`); the commands (`/reagent ping`, `/reagent start <repoPath> <request>`, `/reagent resume <id>`); the autonomous-gate behavior (approve from the bridge UI/phone); and the confirmed MCP tool-name convention. Include the marketplace-install path for later (`/plugin marketplace add <repo>` → `/plugin install reagent`) noting it's finalized in Plan 3.

- [ ] **Step 2: Commit**

```bash
cd /Users/mquinlan/Workspace/purse/reagent && git add docs/PLUGIN.md && git commit -m "docs(plugin): reagent plugin usage"
```

---

## Self-review notes (applied)

- **Spec coverage (Plan-2 slice):** pipeline as a Claude Code skill (Task 3) ✓; INVESTIGATE read-only + EXECUTE scoped (Tasks 2–3) ✓; human gate answered from the bridge/phone via the poll loop (Task 3 step 3, Task 5) ✓; scope guard via subagent tool allow-list (Task 2) ✓; resume-by-reconstruction at session level (Task 3 RESUME, Task 5 step 6) ✓; plugin/marketplace packaging foundation (Task 1) ✓ (full marketplace + headless launch = Plan 3).
- **Deferred to Plan 3 (not gaps):** headless launch of sessions from the bridge; bundling/auto-starting the bridge with the plugin; Tailscale; finalized marketplace listing.
- **Residual schema risk (handled):** exact frontmatter field names (`allowed-tools`, `isolation`, `permissionMode`) and the local-plugin load command vary by version — Task 1 validates load + connectivity and locks the MCP tool names before later tasks depend on them; Task 5 tunes permissions from a real run.
- **No placeholders:** every file has complete content; manual steps are explicit because plugin loading + browser approval are inherently interactive.

## Next: Plan 3
Headless session launch from the bridge (`POST /api/items` spawns a `claude -p` session running this plugin, bound to a repo), bundling/auto-starting the bridge, Tailscale `serve`, and the finalized marketplace entry — replacing all manual "start the bridge / load the plugin" steps with one installable, phone-drivable system.
