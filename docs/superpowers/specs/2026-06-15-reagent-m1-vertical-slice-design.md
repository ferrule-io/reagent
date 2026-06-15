# reagent — M1 (vertical slice) design

**Status:** draft for review
**Date:** 2026-06-15
**Scope:** Milestone 1 only. The full target system is captured in Appendix A so later milestones inherit a shared vocabulary; only the M1 section below is in scope for the next implementation plan.

---

## 1. Purpose

`reagent` is a long-lived TypeScript service that runs on the user's local machine and drives a unit of work through an investigate → plan → decompose → execute → review → wrap-up pipeline of scoped Claude Agent SDK sessions, with durable human checkpoints, controllable from a self-hosted PWA on the user's phone. It is used "like Claude Code today" — a personal harness in a terminal on the local machine, with a remote interface attached so the user can start new work and resume pending work from the road.

**M1 proves the spine end-to-end on the thinnest possible pipeline:** a durable state machine that runs one real Agent SDK stage, suspends at one human gate reachable from the phone, resumes on the user's decision, performs one scoped code change, and finishes — surviving a process restart at any point.

M1 deliberately excludes the DAG scheduler, parallel worktrees, adversarial review, the autonomy dial, holistic review, and PR submission. Those are M2–M4 (Appendix A). M1 exists to de-risk the architecture: durable suspend/resume across an out-of-band human gate, driving a real subscription-authed SDK session, with a remote interface.

## 2. Goals and non-goals

**M1 goals**
- A single long-lived Node/TypeScript process that owns a durable state machine.
- One work item flows: `INTAKE → INVESTIGATE → [PLAN_APPROVAL gate] → EXECUTE → DONE`.
- `INVESTIGATE` and `EXECUTE` are **real** Claude Agent SDK sessions authenticated against the user's Claude subscription.
- The pipeline **durably suspends** at `PLAN_APPROVAL`, notifies the PWA, and **resumes** on the user's approve/reject — including across a process restart.
- A minimal self-hosted **PWA** to: start a work item (freeform text), watch live status, view the proposed plan, approve/reject the gate, and see the result. Reachable remotely via Tailscale.
- Crash-resilience: on restart, in-flight items rehydrate from durable storage and resume.

**M1 non-goals (deferred — see Appendix A)**
- Multiple units / decomposition / dependency DAG / parallel worktrees.
- Adversarial per-unit review, fix loops, holistic review.
- The autonomy dial; solution-selection gate; PR/MR submission gate.
- Paste-a-link/ID intake (freeform text only in M1).
- Web Push (M1 uses live in-app updates + reconnect; push lands in a later milestone).
- Multiple concurrent work items (M1 handles one active item; storage schema leaves room for more).

## 3. Authentication & model

- **Auth:** Claude **subscription OAuth**, used exactly as Claude Code does — personal individual use. Token minted via `claude setup-token` and supplied as `CLAUDE_CODE_OAUTH_TOKEN`. The runtime **must ensure `ANTHROPIC_API_KEY` is unset**, because if present it takes precedence and silently bills metered API instead of the subscription.
- Auth is read through a single `getCredentials()` boundary so a future Console API key can be substituted without touching pipeline code. No second auth path is built in M1 — just no hard-coding.
- **Model:** default `claude-opus-4-8` (current Opus). Configurable per stage.

## 4. Architecture (M1)

A single process composed of these units, each with one responsibility and a well-defined interface:

- **Orchestrator (state machine).** Owns the lifecycle of a work item. Every state transition is persisted *before* side effects so the machine can suspend for hours and resume cleanly. Pure-ish: given current state + an event, it computes the next state and the action to perform.
- **Store (durable state).** SQLite. Persists work items, current phase, the investigation result, the proposed plan, the pending checkpoint, the user's decision, and a log/artifact trail. Single source of truth on restart.
- **Stage runners (Agent SDK adapter).** Each pipeline stage is a function that spawns a Claude Agent SDK `query()` with a stage-specific `systemPrompt`, `allowedTools`, and (for execute) a `canUseTool` scope guard. All SDK access goes through one `AgentRunner` interface so the pipeline is testable with a **fake runner** (deterministic, no model calls, no cost).
- **Checkpoint/gate system.** Suspends the machine at `PLAN_APPROVAL`: persists a checkpoint record, emits a "needs input" event to the PWA, and parks. On the user's decision it validates and resumes the machine.
- **HTTP/API + PWA.** A small HTTP server (e.g. Fastify or Hono) that serves the PWA and exposes endpoints to start work, list/get items, stream live updates (SSE), and respond to a checkpoint. The PWA is a minimal single-page app (start form, status view, plan + approve/reject, result view).
- **Remote access.** `tailscale serve` exposes the local HTTP server over HTTPS to the user's tailnet — no public exposure of the home machine. (Operational setup, not code.)

```
                ┌───────────────── reagent process (local machine) ─────────────────┐
   phone PWA    │                                                                    │
 (over Tailscale)│  HTTP/API ── Orchestrator ── Store (SQLite)                        │
      │  ◄──SSE──┤      │            │   │                                            │
      └─────────►│      │            │   └── Checkpoint/gate ── (suspend/resume)      │
                │      │            │                                                 │
                │      │            └── Stage runners ──► AgentRunner ──► Claude      │
                │      │                 (investigate, execute)   (subscription OAuth)│
                │      └── serves PWA + REST + SSE                                    │
                └────────────────────────────────────────────────────────────────────┘
                                              │ git
                                              ▼
                                     work-item branch (local repo)
```

## 5. Pipeline (M1)

`INTAKE → INVESTIGATE → PLAN_APPROVAL (gate) → EXECUTE → DONE` (with `FAILED` as a terminal error state and `REJECTED` if the user declines the plan).

1. **INTAKE.** User submits freeform text + the target repo path (the local git repo to work in) via the PWA. A work item is created and persisted.
2. **INVESTIGATE.** A read-only Agent SDK session (read/search tools only; no edits) examines the target repo and the request, then produces a short structured result: a diagnosis and a single proposed direction (one or two sentences + a brief rationale). Persisted.
3. **PLAN_APPROVAL (hard gate).** Machine suspends. PWA shows the diagnosis + proposed direction with **Approve** / **Reject** (reject may carry a note). The decision is persisted and the machine resumes. Reject → `REJECTED` (terminal for M1; redirect/iterate is M2+).
4. **EXECUTE.** A scoped Agent SDK session implements the approved direction in the target repo on a new branch (`reagent/<work-item-id>`), constrained to edit + bash(git) + read/search tools, and commits. (M1 is a single scope over the whole repo; per-unit path allowlists arrive with decomposition in M2.) Result (branch name, summary, changed files) persisted.
5. **DONE.** Terminal. PWA shows the branch and a summary. (PR submission is M4.)

Every transition writes to the Store before performing its side effect, so a crash between any two steps resumes correctly.

## 6. Durable suspend/resume (the core risk M1 retires)

- A work item's row holds `phase` and a `pending_checkpoint` (nullable). When the machine enters `PLAN_APPROVAL`, it writes `phase=PLAN_APPROVAL` + a checkpoint record, then returns control (no thread blocked).
- The PWA's approve/reject hits an endpoint that records the decision against the checkpoint and signals the orchestrator to advance.
- **On process start**, the orchestrator scans the Store for items not in a terminal state and rehydrates them: items at `PLAN_APPROVAL` simply re-emit their checkpoint to any connected PWA and keep waiting; items mid-`INVESTIGATE`/`EXECUTE` (i.e., crashed during an SDK stage) are restarted from the beginning of that stage (stages are idempotent at the work-item level — execute always works on the item's own branch, re-running re-derives the change).
- SDK stage calls run with a timeout; a stage that errors or times out transitions the item to `FAILED` with the error captured, surfaced in the PWA (not a silent hang).

## 7. Scope guard (foundation for later guardrails)

Even though M1 has a single unit, the **execute** stage already routes every tool call through a `canUseTool` callback that (a) confines edits/writes to the target repo directory and (b) blocks destructive git operations (e.g. `push`, `reset --hard`, branch deletion) — M1 only commits locally. This establishes the guardrail seam that per-unit path allowlists plug into in M2.

## 8. Testing

- **Unit tests:** state-machine transitions (including every suspend/resume edge), Store read/write + rehydration, scope-guard accept/deny decisions.
- **Integration test:** a full pipeline run driven by the **fake `AgentRunner`** — deterministic investigation + execute outputs, no model calls — exercising intake → gate → (simulated approve) → execute → done, plus a forced crash-and-rehydrate at the gate. Free and repeatable in CI.
- **One real smoke test (manual/opt-in):** a single end-to-end run against the real Agent SDK on a throwaway repo, confirming subscription auth and a real commit. Not in CI.

## 9. Tech stack (M1)

- TypeScript, Node.
- `@anthropic-ai/claude-agent-sdk` — `query()` with per-stage `Options` (`systemPrompt`, `allowedTools`/`disallowedTools`, `canUseTool`, `permissionMode`). Wrapped behind the `AgentRunner` interface.
- SQLite (e.g. `better-sqlite3`) for the Store.
- A small HTTP framework (Fastify or Hono) + SSE for live updates.
- Git via the system `git` (through the SDK's bash tool inside execute; the orchestrator only needs to know the branch name).
- Tailscale (`tailscale serve`) for remote reach — operational, not a dependency.
- Minimal PWA: plain TS + a service worker shell, or a tiny Vite app — kept deliberately small for M1.

## 10. Open questions for the plan phase

- Exact `AgentRunner` interface shape and how structured stage outputs are extracted from a `query()` stream (tool-call result vs. final message) — resolved when writing code against the SDK.
- SSE vs. WebSocket for live updates (SSE is simpler and sufficient for M1's one-way status; lean SSE unless approve/reject latency argues otherwise).
- PWA framework choice (plain vs. tiny Vite) — a small decision deferred to the plan.

---

## Appendix A — full target architecture (M2–M4, for context only)

This is the agreed end-state the milestones build toward. **Not in scope for the M1 plan.**

**Pipeline (full):** `INTAKE → INVESTIGATE → [SOLUTION_SELECT gate*] → PLAN → [PLAN_APPROVAL gate] → DECOMPOSE → EXECUTE → HOLISTIC_REVIEW → WRAP_UP → [PR_APPROVAL gate] → SUBMIT → DONE` (*only when investigation yields multiple candidate solutions).

- **Decompose after approval:** decomposition runs *after* plan approval, producing units + a dependency **DAG** + per-unit `{scope: allowed paths, acceptanceCriteria, dependsOn[]}`.
- **Parallel execution:** the agent computes the dependency DAG; the scheduler runs independent units **concurrently in per-unit git worktrees** (concurrency degree chosen by the decomposer), merging passed units into an **integration branch in dependency order**.
- **Scoped units + guardrails:** each unit's executor subagent is confined to its declared scope via `allowedTools` + `canUseTool` path allowlist + worktree isolation, so it physically can't edit outside scope.
- **Adversarial review:** each unit gets a fresh-context reviewer subagent that attacks correctness, acceptance criteria, *and* scope-adherence; findings feed a fix loop (up to N rounds); unresolved → escalate per the dial.
- **Holistic review:** after all units, a final pass reviews the whole integrated diff and emits **fix units** that run through the same execute path.
- **Autonomy dial (runtime-adjustable from the PWA):** `Auto` (stop only at hard gates) / `Review-on-fail` (pause only when a unit can't pass review within N rounds) / `Per-unit` (sign off after each unit). Changes take effect at the next unit boundary.
- **Hard gates:** solution selection (when multiple), plan approval, PR/MR submission.
- **Intake (full):** freeform text **plus** paste-a-link/ID with best-effort MCP fetch (Sentry / GitLab / GitHub) to seed investigation; degrades to treating the link as context if no MCP matches.
- **Remote interface (full):** self-hosted PWA with Web Push for "needs input" checkpoints, live progress over SSE/WebSocket, plan/DAG/diff rendering, and controls to start work, resume pending work, respond to gates, and flip the autonomy dial.

**Milestones**
- **M1** — vertical slice (this doc): state machine + SQLite + one real SDK stage + one hard gate + minimal PWA + Tailscale, end-to-end on a trivial task.
- **M2** — full pipeline: investigate/plan/decompose/execute with the dependency DAG + worktrees.
- **M3** — adversarial per-unit review + holistic review + scoped guardrails.
- **M4** — autonomy dial, intake integrations (paste link/ID), PR/MR submission, Web Push, polish.
