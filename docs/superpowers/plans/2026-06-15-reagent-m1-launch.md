# reagent M1 — Headless Launch + Integration Plan (Plan 3 of 3)

> **For agentic workers:** Mixed plan. The **Launcher** (bridge code, Tasks 2–3) is TDD-able with a mocked subprocess and can be built autonomously. The **skill edit** (Task 1) is authoring. **Headless validation, Tailscale, and the phone-driven run** (Tasks 0, 4, 5) are interactive/operational and must be done in a live environment. Prefer inline execution; front-load Task 0 to lock the headless-launch flags before building the Launcher.

**Goal:** Close the M1 loop: start work **from the phone** (the bridge headlessly launches a Claude Code session running the reagent plugin in the target repo), answer the gate from the phone, and have the bridge **re-launch on approval** to execute — all reachable remotely over Tailscale, with every session (terminal- or phone-started) visible in the PWA.

**Architecture:** The bridge gains a **Launcher** that spawns `claude -p` sessions. Phone-submitted work (`POST /api/items`, `origin: "phone"`) launches a session that runs the pipeline up to the gate and exits; when the human decides, the decision endpoint re-launches a session that resumes and executes. The skill gets an **async mode** (open the gate and exit, instead of polling) used by launched sessions; the interactive `start` (poll-in-session) path is unchanged. Tailscale `serve` exposes the PWA. The `origin` field decides poll-in-session (terminal) vs re-launch (phone).

**Tech Stack:** Plan-1 bridge (TypeScript/Node, vitest), the reagent plugin (Plan 2), `claude` CLI (headless), Tailscale.

This is **Plan 3 of 3** and depends on Plans 1 + 2 (merged). It replaces the manual "start the bridge / type the command" steps with a phone-drivable system.

---

## Key design decisions (from verified Claude Code headless behavior)

- **Re-launch, not long-poll, for phone work.** Headless sessions are for bounded tasks; "pause for an external human event then resume" = exit + re-launch. State persists in the bridge (YAML) and the skill's resume flow reconstructs from it.
- **`origin` selects the model:** `terminal` → live session polls + continues (Plan 2, unchanged). `phone` → launched session opens gate + exits; bridge re-launches on decision.
- **Launch invocation:** `claude -p "<prompt>" --output-format json --permission-mode acceptEdits --allowedTools "<list incl. mcp__plugin_reagent_reagent-bridge__*>"`, spawned with `{ cwd: <repoPath>, env: { ...process.env, ANTHROPIC_API_KEY: undefined } }`. Exact `--permission-mode`/`--allowedTools` spelling is locked in Task 0.
- **Auth:** spawned `claude` inherits the user's subscription; `ANTHROPIC_API_KEY` must be unset in the spawn env so it doesn't switch to metered billing.

---

## Task 0: Lock the headless-launch recipe (front-load the risk)

**Files:** none (manual validation; record findings in `docs/PLUGIN.md`).

Prove a single `claude -p` invocation can run the reagent pipeline in a target repo, prompt-free, and open a gate — and capture the exact flags that work.

- [ ] **Step 1: Bridge running** (`cd bridge && npm run dev`), demo repo present (`/tmp/reagent-demo`).
- [ ] **Step 2: Run a headless invocation by hand** (from any cwd; the plugin is user-installed so it's available):
  ```bash
  cd /tmp/reagent-demo && ANTHROPIC_API_KEY= claude -p "/reagent:reagent start /tmp/reagent-demo Add a subtract(a,b) function to src/index.js" --output-format json --permission-mode acceptEdits --allowedTools "Read,Edit,Write,Bash,Grep,Glob,Task,mcp__plugin_reagent_reagent-bridge__*,mcp__reagent-bridge__*"
  ```
  Watch the bridge UI: a `phone`/`terminal` item should appear, investigate, and reach `PLAN_APPROVAL`.
- [ ] **Step 3: Lock the flags.** Adjust until the run reaches the gate **with no permission prompt** and **no auth error**. Record the exact working command (the real `--permission-mode` value — `acceptEdits` vs `bypassPermissions` vs `dontAsk` — and whether `--allowedTools` was needed given the plugin's pre-auth) in `docs/PLUGIN.md`. If `acceptEdits` still prompts on Bash/MCP, try adding the tools to `--allowedTools` (as above) or `--dangerously-skip-permissions` as the fallback for this personal-machine use.
- [ ] **Step 4:** Approve in the UI; confirm the headless session (still attached to your terminal here) executes and reaches DONE, then the `claude -p` process exits and prints JSON (`result`, `session_id`). This confirms a launched session can complete a full cycle. (In production the session will instead EXIT at the gate — Task 1 — but here we confirm the mechanics end-to-end.)
- [ ] **Step 5: Commit the recorded recipe.**
  ```bash
  cd /Users/mquinlan/Workspace/purse/reagent && git add docs/PLUGIN.md && git commit -m "docs(plugin): lock headless launch recipe"
  ```

---

## Task 1: Skill async mode (open gate + exit; resume executes)

**Files:** Modify `skills/reagent-pipeline/SKILL.md`

Add an async path so a launched session doesn't poll forever. The launcher will trigger it with a distinct verb.

- [ ] **Step 1: Add a `start-async` verb and async gate behavior to `SKILL.md`.** Edit the START flow so the verb set is `start` (interactive, polls — unchanged), `start-async` (launched/headless), `resume`. Add this behavior:
  - `start-async <repoPath> <request...>`: do INTAKE + INVESTIGATE + `report_status` with the plan exactly as `start`. Then call `await_decision` **once**. If it returns `{status:"pending"}` (the expected case), **STOP and end the turn** — report "gate opened; awaiting approval (the bridge will resume me)". Do NOT loop. If it returns `decided` immediately (already approved), proceed to EXECUTE as normal.
  - `resume <id>`: unchanged from Plan 2 — reconstruct from `curl http://localhost:4319/api/items/<id>`; if the gate is decided→approve, run EXECUTE (delegate to `reagent-executor`) and `complete_work_item DONE`; if reject, `complete_work_item REJECTED`; if still pending, call `await_decision` once and stop again.
  - Add a one-line note: "In async mode you are a short-lived launched session; never poll — open the gate or execute, then end your turn."
- [ ] **Step 2: Re-sync the installed plugin** (`/plugin marketplace update reagent` or remove+re-add, then `/reload-plugins`) and re-run the Plan-2 interactive `start` once to confirm the unchanged interactive path still works.
- [ ] **Step 3: Commit.**
  ```bash
  cd /Users/mquinlan/Workspace/purse/reagent && git add skills/reagent-pipeline/SKILL.md && git commit -m "feat(plugin): skill async mode (open gate + exit; resume executes)"
  ```

---

## Task 2: Launcher module (bridge) — TDD with a mocked spawn

**Files:**
- Create: `bridge/src/launch/launcher.ts`
- Test: `bridge/test/launcher.test.ts`

A `Launcher` builds and spawns the `claude -p` command. The spawn function is injected so tests assert the argv/options without launching anything.

- [ ] **Step 1: Write the failing test** (`bridge/test/launcher.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { Launcher, type SpawnLike } from "../src/launch/launcher.js";

function recordingSpawn() {
  const calls: { cmd: string; args: string[]; opts: any }[] = [];
  const spawn: SpawnLike = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return { on: () => {}, stdout: { on: () => {} }, stderr: { on: () => {} }, unref: () => {} } as any;
  };
  return { calls, spawn };
}

const FLAGS = {
  permissionMode: "acceptEdits",
  allowedTools: "Read,Edit,Write,Bash,Grep,Glob,Task,mcp__plugin_reagent_reagent-bridge__*,mcp__reagent-bridge__*",
};

describe("Launcher", () => {
  it("spawns claude -p for new async work in the target repo", () => {
    const { calls, spawn } = recordingSpawn();
    new Launcher(spawn, FLAGS).startAsync({ id: "wi_1", repoPath: "/tmp/repo", request: "do the thing" });
    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect(c.cmd).toBe("claude");
    expect(c.args).toContain("-p");
    expect(c.args.join(" ")).toContain("/reagent:reagent start-async /tmp/repo");
    expect(c.args.join(" ")).toContain("do the thing");
    expect(c.args).toContain("--permission-mode");
    expect(c.args).toContain("acceptEdits");
    expect(c.opts.cwd).toBe("/tmp/repo");
    // subscription auth: ANTHROPIC_API_KEY must be unset in the spawn env
    expect("ANTHROPIC_API_KEY" in c.opts.env).toBe(true);
    expect(c.opts.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("spawns claude -p resume on approval", () => {
    const { calls, spawn } = recordingSpawn();
    new Launcher(spawn, FLAGS).resume({ id: "wi_2", repoPath: "/tmp/repo" });
    const c = calls[0];
    expect(c.args.join(" ")).toContain("/reagent:reagent resume wi_2");
    expect(c.opts.cwd).toBe("/tmp/repo");
  });
});
```

- [ ] **Step 2: Run it, verify it fails** (`cd bridge && npx vitest run test/launcher.test.ts`).
- [ ] **Step 3: Implement `bridge/src/launch/launcher.ts`:**

```ts
export type SpawnLike = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; detached?: boolean; stdio?: any },
) => { on: (e: string, cb: (...a: any[]) => void) => void; stdout: any; stderr: any; unref: () => void };

export interface LaunchFlags {
  permissionMode: string; // locked in Task 0
  allowedTools: string;
}

function envWithoutApiKey(): NodeJS.ProcessEnv {
  // Subscription auth: a present ANTHROPIC_API_KEY would switch to metered billing.
  return { ...process.env, ANTHROPIC_API_KEY: undefined };
}

export class Launcher {
  constructor(private readonly spawn: SpawnLike, private readonly flags: LaunchFlags) {}

  private run(prompt: string, cwd: string): void {
    const args = [
      "-p", prompt,
      "--output-format", "json",
      "--permission-mode", this.flags.permissionMode,
      "--allowedTools", this.flags.allowedTools,
    ];
    const child = this.spawn("claude", args, {
      cwd,
      env: envWithoutApiKey(),
      detached: true,
      stdio: "ignore",
    });
    child.unref(); // fire-and-forget; the session reports progress to the bridge via MCP
  }

  startAsync(opts: { id: string; repoPath: string; request: string }): void {
    this.run(`/reagent:reagent start-async ${opts.repoPath} ${opts.request}`, opts.repoPath);
  }

  resume(opts: { id: string; repoPath: string }): void {
    this.run(`/reagent:reagent resume ${opts.id}`, opts.repoPath);
  }
}
```

- [ ] **Step 4: Run the test, verify it passes** (2 tests). Run the full bridge suite (`npx vitest run`) — all green.
- [ ] **Step 5: Commit.**
  ```bash
  cd /Users/mquinlan/Workspace/purse/reagent/bridge && git add src/launch/launcher.ts test/launcher.test.ts && git commit -m "feat(bridge): Launcher for headless claude -p sessions"
  ```

---

## Task 3: Wire the Launcher into the bridge

**Files:** Modify `bridge/src/http/server.ts`, `bridge/src/index.ts`

- [ ] **Step 1: Thread a `Launcher` into the HTTP server.** Add an optional `launcher?: Launcher` to `HttpDeps`. In `index.ts`, build a `Launcher` (reading `permissionMode`/`allowedTools` from config/env, defaults from Task 0) with the real Node `spawn` and pass it to `buildHttpServer`. (Add `launchPermissionMode`/`launchAllowedTools` to `config.ts` with the Task-0 defaults.)
- [ ] **Step 2: On new phone work, launch.** In `POST /api/items` (which already creates a `phone`-origin item), after `registry.upsert(item)`, call `launcher?.startAsync({ id: item.id, repoPath: item.repoPath, request: item.request })`. (The launched session re-registers the same id — `register_work_item` is a no-op on an existing id — and drives it.)
  - Note: the create payload must include `repoPath` and `request` (the PWA new-work form already sends `repoPath` + `request`; ensure they flow through). Confirm the form posts a repo path.
- [ ] **Step 3: On approval of a phone item, re-launch resume.** In `POST /api/items/:id/decision`, after `checkpoints.resolve(...)`, if the item's `origin === "phone"`, call `launcher?.resume({ id, repoPath: item.repoPath })` so a fresh session executes. (For `origin === "terminal"`, do nothing — the live session is polling and will continue itself.)
- [ ] **Step 4: Add a focused test** to `bridge/test/http-api.test.ts` using a recording launcher: POST new work → asserts `startAsync` was called with the new id + repoPath; POST a decision on a `phone` item with a pending checkpoint → asserts `resume` was called; POST a decision on a `terminal` item → asserts `resume` was NOT called.
- [ ] **Step 5: Run the full suite (green), then commit.**
  ```bash
  cd /Users/mquinlan/Workspace/purse/reagent/bridge && git add src/http/server.ts src/index.ts src/config.ts test/http-api.test.ts && git commit -m "feat(bridge): launch on phone new-work and re-launch on approval"
  ```

---

## Task 4: Remote access (Tailscale) + bridge bind

**Files:** Modify `docs/PLUGIN.md` (and confirm the bridge binds appropriately).

- [ ] **Step 1: Confirm the bridge binds on all interfaces** (Plan 1 already listens on `0.0.0.0`). No code change expected.
- [ ] **Step 2: Expose via Tailscale.** With the bridge on :4319, run `tailscale serve --bg 4319` (or `tailscale serve https / http://localhost:4319`), and access the PWA at `https://<machine>.<tailnet>.ts.net/` from the phone. Record the exact working `tailscale serve` command and the URL in `docs/PLUGIN.md`.
- [ ] **Step 3: Security note in docs:** the bridge has no auth; Tailscale provides the access boundary (only your tailnet). Do not expose :4319 publicly. Commit the docs.
  ```bash
  cd /Users/mquinlan/Workspace/purse/reagent && git add docs/PLUGIN.md && git commit -m "docs: Tailscale remote access for the bridge PWA"
  ```

---

## Task 5: End-to-end phone-driven integration test

**Files:** none (manual, the real proof).

- [ ] **Step 1:** Bridge running + exposed via Tailscale; open `https://<machine>.<tailnet>.ts.net/` on your **phone**.
- [ ] **Step 2: Start new work from the phone.** Use the PWA "Start new work" form: `repoPath = /tmp/reagent-demo`, `request = Add a multiply(a,b) function to src/index.js`. Submit.
- [ ] **Step 3:** Confirm the bridge **launched a session** (a `phone`-origin item appears, investigates, reaches `PLAN_APPROVAL`), and the launching `claude -p` process **exits** at the gate (check with `pgrep -fl "reagent:reagent start-async"` — it should be gone once the gate opens).
- [ ] **Step 4: Approve from the phone.** Confirm the bridge **re-launched** a resume session that executes and the item reaches `DONE`, with a real commit on `reagent/<id>` in `/tmp/reagent-demo`.
- [ ] **Step 5: Verify all-sessions visibility.** From your computer, run a terminal `start` (Plan 2) AND submit a phone item; confirm both appear together in the PWA, live.
- [ ] **Step 6:** Record any flag/skill tuning needed for the headless path; apply + commit.

---

## Task 6: Finalize + optional Web Push

**Files:** Modify `docs/PLUGIN.md`, `README.md`; optional bridge Web Push.

- [ ] **Step 1: Document the finished system** in `docs/PLUGIN.md`/`README.md`: install (`/plugin marketplace add <repo>` → `/plugin install reagent@reagent`), start the bridge, Tailscale serve, and the phone workflow (start / approve / resume all from the phone).
- [ ] **Step 2 (optional, can defer): Web Push** so the phone is *notified* on a pending gate rather than needing the PWA open. Add VAPID keys + a service-worker push handler + a bridge `web-push` send on checkpoint open. Defer if the in-app/Tailscale flow is enough for now — note the decision.
- [ ] **Step 3: Commit.**
  ```bash
  cd /Users/mquinlan/Workspace/purse/reagent && git add -A && git commit -m "docs: finalize reagent M1 (phone-drivable harness)"
  ```

---

## Self-review notes (applied)

- **Spec coverage (Plan-3 slice / M1 completion):** start new work from the phone (Tasks 2–3, 5) ✓; bridge headlessly launches sessions (Tasks 2–3) ✓; re-launch-on-approval for phone work (Task 3) ✓; durable across the gate via existing YAML state + resume (Task 1) ✓; all sessions visible in the PWA (Task 5) ✓; remote access (Task 4) ✓; subscription auth preserved (Task 2) ✓; marketplace install finalized (Task 6) ✓.
- **Cross-repo prompt-free execution** is handled by the launcher's `--permission-mode` + `--allowedTools` flags (Task 0 locks them), so launched sessions need no per-repo project settings.
- **Deferred/optional:** Web Push (Task 6 step 2) — true push notifications; the M2+ pipeline (decomposition/DAG/parallel worktrees, adversarial + holistic review, autonomy dial) is a separate milestone beyond M1.
- **Residual risk (front-loaded):** exact headless permission flags vary by version — Task 0 validates them by hand before the Launcher hard-codes defaults.

## After this plan
M1 is complete: an installable, phone-drivable harness that investigates, gets your approval from anywhere, and executes scoped changes — on your subscription, on your machine. The next milestone (M2+) builds the full pipeline on this spine: plan→decompose into a dependency DAG, parallel scoped subagents in worktrees, adversarial per-unit review, holistic review, and the runtime autonomy dial.
