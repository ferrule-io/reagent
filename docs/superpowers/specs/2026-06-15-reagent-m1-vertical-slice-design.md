# reagent — M1 (vertical slice) design

**Status:** draft for review
**Date:** 2026-06-15
**Scope:** Milestone 1 only. The full target system is captured in Appendix A so later milestones inherit a shared vocabulary; only the M1 sections below are in scope for the next implementation plan.

---

## 1. Purpose

`reagent` is a **Claude Code plugin** plus a small **always-on bridge** that together turn Claude Code into a remote-controllable coding harness. It drives a unit of work through investigate → plan → decompose → execute → review → wrap-up, with durable human checkpoints you can answer from your phone.

- **Claude Code is the runtime.** Your subscription, its tools, subagents, and worktrees do the actual work — used "like Claude Code today," in a terminal on your local machine. There is no separate Agent SDK service.
- **The bridge is the always-on hub.** It serves a self-hosted PWA, keeps a registry of *all* reagent work (whether you started it by typing `/reagent` in your terminal or by submitting it from your phone), mediates the human checkpoints, and can headlessly launch a new Claude Code session when you start work from the road.

**M1 proves the spine end-to-end on the thinnest pipeline:** the reagent skill drives one work item through a single human gate, the gate is answered from the phone via the bridge, the webapp shows the session live (whether started from terminal or phone), a scoped code change lands on a branch, and the whole thing survives a process death via resume-by-reconstruction.

M1 deliberately excludes decomposition, the dependency DAG, parallel worktrees, adversarial review, the autonomy dial, holistic review, and PR submission (M2–M4, Appendix A). M1 exists to de-risk the *new* spine: pipeline-as-a-Claude-Code-skill, the bridge↔Claude Code↔phone checkpoint loop, a registry that sees all sessions, headless launch from the phone, and durable resume.

## 2. System shape (components)

- **reagent plugin** (installed into Claude Code, marketplace-distributable):
  - **skill** `reagent` — encodes the pipeline workflow Claude Code follows.
  - **slash commands** — e.g. `/reagent start "<text>"`, `/reagent resume <id>`, `/reagent bridge` (start/inspect the bridge).
  - **subagents** — scoped unit executor and adversarial reviewer (M3); M1 uses a single scoped executor.
  - **MCP client wiring** — connects each Claude Code session to the bridge's MCP server (register work item, stream status, await checkpoint decisions).
- **bridge** (always-on companion process on the local machine):
  - serves the **PWA** + REST/SSE over Tailscale.
  - **registry** of work items and live status, built from the shared YAML state directory it watches **plus** live updates from connected sessions.
  - **checkpoint mediation** — an MCP tool the skill calls at a gate that does not resolve until you respond from the phone.
  - **session launcher** — headlessly spawns a Claude Code session running the reagent skill, bound to a work item, when you submit new work from the phone.
  - Web Push (later).
- **state** — a per-work-item **YAML state file** in a shared state directory. Durable source of truth; enables resume-by-reconstruction; the bridge watches this directory so it sees every work item regardless of how it was started.
- **remote access** — `tailscale serve` fronts the bridge's PWA (HTTPS, no public exposure of the home machine).

## 3. Authentication & model

- **Auth is just Claude Code's own login** (your subscription) — nothing to plumb, since Claude Code is the runtime. This is the "use it like Claude Code today" property, for free.
- **Model:** whatever the Claude Code session is configured to use (default Opus, `claude-opus-4-8`).

## 4. Architecture (M1)

```
   phone PWA
      │  (HTTPS over Tailscale)
      ▼
 ┌─────────────────────── bridge (always-on, local machine) ───────────────────────┐
 │  PWA + REST/SSE   ·   work-item registry   ·   checkpoint mediation   ·  launcher │
 └─────┬───────────────────────────▲───────────────────────────────┬────────────────┘
       │ watches                    │ MCP (register / status /       │ spawns headless
       │                            │      await_decision)           │
       ▼                            │                                ▼
 shared YAML state dir ◄────────────┴──────────── Claude Code session(s) running the
 (per-work-item files;                              reagent skill  ──►  git branch/worktree
  durable source of truth)                          (subscription, tools, subagents)
```

- Sessions started from the **terminal** (`/reagent start …`) and sessions **launched by the bridge** from the phone are identical at runtime — both run the reagent skill, both register with the bridge, both write the same YAML state. The webapp therefore shows all of them.

## 5. Pipeline (M1)

`INTAKE → INVESTIGATE → PLAN_APPROVAL (gate) → EXECUTE → DONE` (`FAILED` terminal-on-error; `REJECTED` if the plan is declined).

1. **INTAKE.** A work item is created from freeform text + the target repo path — either via `/reagent start` in the terminal or submitted from the PWA (which the bridge turns into a launched session). A YAML state file is written.
2. **INVESTIGATE.** The skill, in read-only mode, examines the repo + request and produces a short diagnosis + a single proposed direction. Persisted to the state file; streamed to the bridge.
3. **PLAN_APPROVAL (hard gate).** The skill calls the bridge's `await_decision` tool. The bridge records a pending checkpoint, surfaces the diagnosis + direction in the PWA with **Approve / Reject** (reject may carry a note), and does not resolve the call until you respond. Decision persisted; reject → `REJECTED`.
4. **EXECUTE.** The skill implements the approved direction in the target repo on branch `reagent/<id>`, confined to edit + git + read/search, and commits. (M1 = one scope over the repo; per-unit path scoping arrives with decomposition in M2.) Result persisted + streamed.
5. **DONE.** Terminal. PWA shows branch + summary. (PR submission is M4.)

## 6. Durable progress + resume-by-reconstruction

- The YAML state file is the source of truth for *where the work is*: `phase`, `pending_checkpoint` (nullable), and the structured outputs so far (investigation result, approved plan, branch + commits, execute summary). It records enough to reconstruct progress **without** any conversation history.
- **Resume by reconstruction, not transcript replay.** If a session dies — or work is deliberately picked up later — a fresh session reads the state file, determines the current phase and what remains, and continues by being **briefed** with the plan, what's done, and the live repo/git state. It does *not* replay the old session's messages. Stages are idempotent at the work-item level (execute always operates on the item's own branch), so re-entering a partial stage converges rather than duplicating.
- The bridge watching the shared state directory is also what makes **all** work items visible in the webapp — including ones started from the terminal — and lets the registry survive a bridge restart (it rebuilds from disk).

## 7. The checkpoint loop (core risk M1 retires)

The novel mechanism is Claude Code (running the skill) parking at a human gate that you answer from your phone, mediated by the bridge:

- At a gate the skill calls the bridge MCP tool `await_decision(workItemId, payload)`.
- The bridge stores a pending checkpoint, pushes it to the PWA (live via SSE; Web Push later), and **holds the decision open** until you act.
- On Approve/Reject the bridge returns the decision to the skill, which advances the pipeline.
- **Risk to resolve in the plan:** MCP tool calls may have timeouts, so a single multi-hour blocking call may not be viable. Fallback pattern: `await_decision` returns `pending` after a bounded wait and the skill re-calls (poll), with the durable checkpoint in the state file guaranteeing no decision is lost across reconnects or a session restart. The plan picks blocking-with-reconnect vs. poll based on Claude Code's actual MCP behavior.

## 8. Seeing every session in the webapp

Every reagent session registers its work item with the bridge on start (writes the shared YAML state file **and** connects to the bridge MCP server to stream status). The bridge aggregates the registry from both the watched state directory and live session connections, and the PWA lists all active/recent items — terminal-started and phone-started alike — with phase, current activity, and any pending checkpoint.

## 9. Starting new work from the phone (headless launch)

The PWA's "new work" form posts to the bridge; the bridge writes a work-item state file and **headlessly spawns a Claude Code session** running the reagent skill, bound to that work item, against the chosen repo. (Exact headless invocation — how the launcher starts a session and injects the skill + work item — is confirmed in the plan phase.) From there the session behaves identically to a terminal-started one.

## 10. Scope guard (foundation for later guardrails)

Even with M1's single scope, the execute stage routes file/command actions through Claude Code's permission mechanism so it (a) confines edits to the target repo and (b) blocks destructive git (`push`, `reset --hard`, branch deletion) — M1 only commits locally. This is the seam that per-unit path allowlists plug into in M2/M3.

## 11. Testing

- **Skill/workflow:** exercised against a throwaway repo for the investigate → gate → execute path.
- **Bridge unit tests:** registry build/merge, `await_decision` pending/resolve, state-directory watching + rebuild-on-restart, launcher invocation (mocked spawn).
- **Integration:** a stub MCP client (standing in for a session) drives the bridge through intake → checkpoint → decision → done, including a forced crash + rebuild-from-disk and a reconstruct-and-continue.
- **One real smoke test (manual/opt-in):** a genuine end-to-end run — terminal `/reagent start`, approve from a browser hitting the bridge, real commit. Not in CI.

## 12. Tech stack (M1)

- **Claude Code** + the **reagent plugin** (skill, commands, subagents, MCP client wiring). Plugin is structured for marketplace install from the start.
- **bridge:** TypeScript/Node; an MCP server (stdio or local HTTP) the plugin connects to; a small HTTP framework (Fastify/Hono) + SSE for the PWA; `yaml` for state; a file watcher (e.g. chokidar); spawns Claude Code headless for launches.
- **Tailscale** (`tailscale serve`) for remote reach — operational.
- **PWA:** deliberately minimal (plain TS + service-worker shell, or a tiny Vite app).

## 13. Open questions for the plan phase

- Headless Claude Code launch: exact invocation to start a session bound to a work item with the reagent skill active.
- Plugin-bundled MCP server: confirm a plugin can ship an MCP server the session connects to as a client, pointed at the local bridge.
- Checkpoint call shape: blocking-with-reconnect vs. poll, per Claude Code's MCP tool-timeout behavior.
- SSE vs. WebSocket for live PWA updates (lean SSE).
- PWA framework (plain vs. tiny Vite).

---

## Appendix A — full target architecture (M2–M4, for context only)

The agreed end-state. **Not in scope for the M1 plan.**

**Pipeline (full):** `INTAKE → INVESTIGATE → [SOLUTION_SELECT gate*] → PLAN → [PLAN_APPROVAL gate] → DECOMPOSE → EXECUTE → HOLISTIC_REVIEW → WRAP_UP → [PR_APPROVAL gate] → SUBMIT → DONE` (*only when investigation yields multiple candidate solutions).

- **Substrate:** runs inside Claude Code as plugin components (skill + commands + subagents + MCP client), orchestrated against the always-on bridge. Claude Code is the agent runtime throughout.
- **Decompose after approval:** decomposition runs *after* plan approval, producing units + a dependency **DAG** + per-unit `{scope: allowed paths, acceptanceCriteria, dependsOn[]}`.
- **Parallel execution:** the skill computes the dependency DAG; independent units run **concurrently in per-unit git worktrees** via Claude Code subagents (concurrency degree chosen during decomposition), merging passed units into an **integration branch in dependency order**.
- **Scoped units + guardrails:** each unit's executor subagent is confined to its declared scope via Claude Code permission rules (path allowlist) + worktree isolation, so it physically can't edit outside scope.
- **Adversarial review:** each unit gets a fresh-context reviewer subagent attacking correctness, acceptance criteria, *and* scope-adherence; findings feed a fix loop (up to N rounds); unresolved → escalate per the dial.
- **Holistic review:** after all units, a final pass reviews the whole integrated diff and emits **fix units** that run through the same execute path.
- **Autonomy dial (runtime-adjustable from the PWA):** `Auto` (stop only at hard gates) / `Review-on-fail` (pause only when a unit can't pass review within N rounds) / `Per-unit` (sign off after each unit). Changes take effect at the next unit boundary, mediated by the bridge.
- **Hard gates:** solution selection (when multiple), plan approval, PR/MR submission — all answerable from the phone via the bridge checkpoint loop.
- **Intake (full):** freeform text **plus** paste-a-link/ID with best-effort MCP fetch (Sentry / GitLab / GitHub) to seed investigation; degrades to treating the link as context if no MCP matches.
- **Remote interface (full):** self-hosted PWA with Web Push for "needs input" checkpoints, live progress over SSE, plan/DAG/diff rendering, controls to start work, resume pending work, respond to gates, flip the autonomy dial, and view all active sessions (terminal- or phone-started).
- **Distribution:** reagent **is** a Claude Code plugin, so marketplace install is native (`/plugin marketplace add <repo>` → `/plugin install reagent`); the bridge ships with the plugin and a command starts/manages it.

**Milestones**
- **M1** — vertical slice (this doc): plugin skill + bridge spine (registry, checkpoint loop, headless launch, all-sessions webapp) driving investigate → one gate → execute, with YAML state + resume-by-reconstruction, over Tailscale.
- **M2** — full pipeline: investigate/plan/decompose/execute with the dependency DAG + worktrees + subagents.
- **M3** — adversarial per-unit review + holistic review + scoped path guardrails.
- **M4** — autonomy dial, intake integrations (paste link/ID), PR/MR submission, Web Push, marketplace-listing polish.
