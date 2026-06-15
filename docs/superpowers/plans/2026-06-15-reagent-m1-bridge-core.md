# reagent M1 — Bridge Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the always-on "bridge" hub for reagent — durable YAML work-item state, a registry that watches the state directory, the MCP `await_decision` checkpoint loop, a REST+SSE API, and a minimal PWA — proven end-to-end with a stub session, so the bridge↔session↔phone checkpoint loop works before any Claude Code plugin exists.

**Architecture:** A single Node/TypeScript process. A `StateStore` persists one YAML file per work item. A `Registry` holds in-memory state, rebuilt from the state directory by a `Watcher` and updated live by sessions. A `CheckpointStore` holds pending human gates and resolves them when a decision arrives. An MCP server (Streamable HTTP transport) exposes tools sessions call (`register_work_item`, `report_status`, `await_decision`, `complete_work_item`); `await_decision` uses **poll semantics** (returns `pending` after a bounded wait; the caller re-calls) so no single call blocks for hours. A Fastify HTTP server serves a REST+SSE API and a minimal PWA where the human approves/rejects gates. A `stub-session` script plays the role of a Claude Code session for integration testing.

**Tech Stack:** TypeScript, Node 20+, vitest, `@modelcontextprotocol/sdk`, `fastify`, `yaml`, `chokidar`, `zod`.

This is **Plan 1 of 3** for reagent M1 (Bridge core → reagent plugin → headless launch + integration). It produces working, testable software on its own.

---

## File structure (created by this plan)

```
bridge/
  package.json            # deps + scripts
  tsconfig.json
  vitest.config.ts
  src/
    state/
      types.ts            # WorkItem, Phase, Checkpoint, StatusUpdate types
      store.ts            # StateStore: YAML per-work-item persistence
    registry/
      registry.ts         # Registry: in-memory items + subscribe/emit
      watcher.ts          # Watcher: chokidar(state dir) -> registry
    checkpoints/
      checkpoints.ts      # CheckpointStore: pending gates + poll/resolve
    mcp/
      server.ts           # MCP server (Streamable HTTP) + tool handlers
    http/
      server.ts           # Fastify REST + SSE + static PWA
    web/
      index.html          # minimal PWA shell
      app.js              # PWA logic (list, detail, approve/reject, SSE)
      manifest.webmanifest
    config.ts             # paths + ports from env, with defaults
    index.ts              # wires StateStore+Registry+Watcher+Checkpoints+MCP+HTTP
  scripts/
    stub-session.ts       # MCP client that imitates a Claude Code session
  test/
    state-store.test.ts
    checkpoints.test.ts
    registry.test.ts
    watcher.test.ts
    mcp-server.test.ts
    http-api.test.ts
```

Each file has one responsibility: `state/` owns persistence + types, `registry/` owns the in-memory view, `checkpoints/` owns the gate lifecycle, `mcp/` owns the session-facing protocol, `http/` owns the human-facing API + PWA.

---

## Task 0: Project scaffold

**Files:**
- Create: `bridge/package.json`
- Create: `bridge/tsconfig.json`
- Create: `bridge/vitest.config.ts`
- Create: `bridge/.gitignore`

- [ ] **Step 1: Create `bridge/package.json`**

```json
{
  "name": "reagent-bridge",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "stub": "tsx scripts/stub-session.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "chokidar": "^4.0.1",
    "fastify": "^5.1.0",
    "yaml": "^2.6.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5",
    "@types/node": "^22.9.0"
  }
}
```

- [ ] **Step 2: Create `bridge/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create `bridge/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 10000,
  },
});
```

- [ ] **Step 4: Create `bridge/.gitignore`**

```
node_modules
dist
*.log
.reagent-state-test
```

- [ ] **Step 5: Install deps and verify the toolchain**

Run: `cd bridge && npm install && npx vitest run`
Expected: install succeeds; vitest reports "No test files found" (exit 0) — no tests yet.

- [ ] **Step 6: Commit**

```bash
cd bridge && git add package.json tsconfig.json vitest.config.ts .gitignore package-lock.json
git commit -m "chore(bridge): scaffold TypeScript project"
```

---

## Task 1: State types

**Files:**
- Create: `bridge/src/state/types.ts`

These types are the shared contract for the whole bridge. No tests (pure type declarations); they're exercised by every later task.

- [ ] **Step 1: Write `bridge/src/state/types.ts`**

```ts
export type Phase =
  | "INTAKE"
  | "INVESTIGATE"
  | "PLAN_APPROVAL"
  | "EXECUTE"
  | "DONE"
  | "REJECTED"
  | "FAILED";

/** A human gate awaiting a decision. */
export interface Checkpoint {
  id: string;
  kind: "PLAN_APPROVAL";
  /** Human-facing payload to render (e.g. diagnosis + proposed direction). */
  prompt: string;
  createdAt: string; // ISO
  /** Set once the human responds. */
  decision?: {
    result: "approve" | "reject";
    note?: string;
    decidedAt: string; // ISO
  };
}

/** Durable per-work-item state. The single source of truth on disk. */
export interface WorkItem {
  id: string;
  title: string;
  repoPath: string;
  phase: Phase;
  /** Freeform request text from intake. */
  request: string;
  /** Short diagnosis + proposed direction produced by INVESTIGATE. */
  plan?: string;
  /** Branch the EXECUTE stage works on. */
  branch?: string;
  /** Pending human gate, if any. */
  pendingCheckpoint?: Checkpoint;
  /** Append-only activity log lines for the UI. */
  log: { at: string; line: string }[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** Origin of the work item, for display. */
  origin: "terminal" | "phone";
}

/** Live status update a session streams to the bridge. */
export interface StatusUpdate {
  phase?: Phase;
  line?: string; // appended to log
  plan?: string;
  branch?: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd bridge && npx tsc --noEmit`
Expected: PASS (no output, exit 0).

- [ ] **Step 3: Commit**

```bash
cd bridge && git add src/state/types.ts
git commit -m "feat(bridge): define work-item + checkpoint types"
```

---

## Task 2: StateStore (YAML persistence)

**Files:**
- Create: `bridge/src/state/store.ts`
- Test: `bridge/test/state-store.test.ts`

`StateStore` owns reading/writing one YAML file per work item in a state directory. It is deterministic and the durable source of truth.

- [ ] **Step 1: Write the failing test**

```ts
// bridge/test/state-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/state/store.js";

describe("StateStore", () => {
  let dir: string;
  let store: StateStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "reagent-state-"));
    store = new StateStore(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("creates, persists, and reads back a work item", () => {
    const item = store.create({
      id: "wi_1",
      title: "Fix bug",
      repoPath: "/tmp/repo",
      request: "the thing is broken",
      origin: "terminal",
    });
    expect(item.phase).toBe("INTAKE");
    expect(existsSync(join(dir, "wi_1.yaml"))).toBe(true);

    const reloaded = new StateStore(dir).get("wi_1");
    expect(reloaded?.title).toBe("Fix bug");
    expect(reloaded?.request).toBe("the thing is broken");
  });

  it("updates an item and bumps updatedAt", async () => {
    store.create({ id: "wi_2", title: "t", repoPath: "/r", request: "q", origin: "terminal" });
    const before = store.get("wi_2")!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const updated = store.update("wi_2", (it) => {
      it.phase = "INVESTIGATE";
      it.log.push({ at: new Date().toISOString(), line: "looking" });
    });
    expect(updated.phase).toBe("INVESTIGATE");
    expect(updated.log).toHaveLength(1);
    expect(updated.updatedAt).not.toBe(before);
  });

  it("lists all persisted items, ignoring non-yaml files", () => {
    store.create({ id: "a", title: "a", repoPath: "/r", request: "q", origin: "terminal" });
    store.create({ id: "b", title: "b", repoPath: "/r", request: "q", origin: "phone" });
    const ids = store.list().map((i) => i.id).sort();
    expect(ids).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bridge && npx vitest run test/state-store.test.ts`
Expected: FAIL — cannot find module `../src/state/store.js`.

- [ ] **Step 3: Implement `bridge/src/state/store.ts`**

```ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import type { WorkItem } from "./types.js";

export interface CreateInput {
  id: string;
  title: string;
  repoPath: string;
  request: string;
  origin: "terminal" | "phone";
}

export class StateStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private pathFor(id: string): string {
    return join(this.dir, `${id}.yaml`);
  }

  create(input: CreateInput): WorkItem {
    const now = new Date().toISOString();
    const item: WorkItem = {
      id: input.id,
      title: input.title,
      repoPath: input.repoPath,
      request: input.request,
      origin: input.origin,
      phase: "INTAKE",
      log: [],
      createdAt: now,
      updatedAt: now,
    };
    this.write(item);
    return item;
  }

  get(id: string): WorkItem | undefined {
    try {
      return parse(readFileSync(this.pathFor(id), "utf8")) as WorkItem;
    } catch {
      return undefined;
    }
  }

  update(id: string, mutate: (item: WorkItem) => void): WorkItem {
    const item = this.get(id);
    if (!item) throw new Error(`work item not found: ${id}`);
    mutate(item);
    item.updatedAt = new Date().toISOString();
    this.write(item);
    return item;
  }

  write(item: WorkItem): void {
    writeFileSync(this.pathFor(item.id), stringify(item), "utf8");
  }

  list(): WorkItem[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => parse(readFileSync(join(this.dir, f), "utf8")) as WorkItem);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd bridge && npx vitest run test/state-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd bridge && git add src/state/store.ts test/state-store.test.ts
git commit -m "feat(bridge): YAML-backed StateStore"
```

---

## Task 3: CheckpointStore (the poll/resolve gate)

**Files:**
- Create: `bridge/src/checkpoints/checkpoints.ts`
- Test: `bridge/test/checkpoints.test.ts`

This is the heart of the checkpoint loop. `awaitDecision` waits up to `timeoutMs` for a decision; if none arrives it returns `{ status: "pending" }` so the caller re-polls. When a decision is recorded, a waiting `awaitDecision` resolves immediately.

- [ ] **Step 1: Write the failing test**

```ts
// bridge/test/checkpoints.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { CheckpointStore } from "../src/checkpoints/checkpoints.js";

describe("CheckpointStore", () => {
  let cp: CheckpointStore;
  beforeEach(() => (cp = new CheckpointStore()));

  it("returns pending when no decision arrives before timeout", async () => {
    cp.open("wi_1", "cp_1", "approve the plan?");
    const res = await cp.awaitDecision("cp_1", 50);
    expect(res.status).toBe("pending");
  });

  it("resolves immediately when a decision is recorded while waiting", async () => {
    cp.open("wi_1", "cp_2", "approve?");
    const waiting = cp.awaitDecision("cp_2", 1000);
    setTimeout(() => cp.resolve("cp_2", { result: "approve" }), 20);
    const res = await waiting;
    expect(res.status).toBe("decided");
    expect(res.decision?.result).toBe("approve");
  });

  it("returns the decision immediately if it was already recorded", async () => {
    cp.open("wi_1", "cp_3", "approve?");
    cp.resolve("cp_3", { result: "reject", note: "wrong approach" });
    const res = await cp.awaitDecision("cp_3", 1000);
    expect(res.status).toBe("decided");
    expect(res.decision?.result).toBe("reject");
    expect(res.decision?.note).toBe("wrong approach");
  });

  it("throws when awaiting an unknown checkpoint", async () => {
    await expect(cp.awaitDecision("nope", 10)).rejects.toThrow(/unknown checkpoint/);
  });

  it("rejects resolving an unknown checkpoint", () => {
    expect(() => cp.resolve("nope", { result: "approve" })).toThrow(/unknown checkpoint/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bridge && npx vitest run test/checkpoints.test.ts`
Expected: FAIL — cannot find module `../src/checkpoints/checkpoints.js`.

- [ ] **Step 3: Implement `bridge/src/checkpoints/checkpoints.ts`**

```ts
export interface Decision {
  result: "approve" | "reject";
  note?: string;
}

interface Pending {
  workItemId: string;
  prompt: string;
  decision?: Decision;
  /** Resolvers of in-flight awaitDecision calls, woken when a decision lands. */
  waiters: Array<() => void>;
}

export type AwaitResult =
  | { status: "pending" }
  | { status: "decided"; decision: Decision };

export class CheckpointStore {
  private readonly pending = new Map<string, Pending>();

  open(workItemId: string, checkpointId: string, prompt: string): void {
    this.pending.set(checkpointId, { workItemId, prompt, waiters: [] });
  }

  resolve(checkpointId: string, decision: Decision): void {
    const p = this.pending.get(checkpointId);
    if (!p) throw new Error(`unknown checkpoint: ${checkpointId}`);
    p.decision = decision;
    for (const wake of p.waiters.splice(0)) wake();
  }

  /** Wait up to timeoutMs for a decision. Returns "pending" if none arrives. */
  async awaitDecision(checkpointId: string, timeoutMs: number): Promise<AwaitResult> {
    const p = this.pending.get(checkpointId);
    if (!p) throw new Error(`unknown checkpoint: ${checkpointId}`);
    if (p.decision) return { status: "decided", decision: p.decision };

    await new Promise<void>((resolveWait) => {
      const timer = setTimeout(() => {
        // remove our waiter, then resolve as a timeout
        const idx = p.waiters.indexOf(wake);
        if (idx >= 0) p.waiters.splice(idx, 1);
        resolveWait();
      }, timeoutMs);
      const wake = () => {
        clearTimeout(timer);
        resolveWait();
      };
      p.waiters.push(wake);
    });

    return p.decision ? { status: "decided", decision: p.decision } : { status: "pending" };
  }

  has(checkpointId: string): boolean {
    return this.pending.has(checkpointId);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd bridge && npx vitest run test/checkpoints.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd bridge && git add src/checkpoints/checkpoints.ts test/checkpoints.test.ts
git commit -m "feat(bridge): CheckpointStore with poll/resolve semantics"
```

---

## Task 4: Registry (in-memory view + subscribe)

**Files:**
- Create: `bridge/src/registry/registry.ts`
- Test: `bridge/test/registry.test.ts`

The `Registry` is the in-memory list of work items the HTTP/SSE layer reads. It can be loaded from a `StateStore`, updated by id, and subscribed to (so SSE pushes changes).

- [ ] **Step 1: Write the failing test**

```ts
// bridge/test/registry.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/state/store.js";
import { Registry } from "../src/registry/registry.js";

describe("Registry", () => {
  let dir: string;
  let store: StateStore;
  let reg: Registry;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "reagent-reg-"));
    store = new StateStore(dir);
    reg = new Registry();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("loads all items from a StateStore", () => {
    store.create({ id: "a", title: "A", repoPath: "/r", request: "q", origin: "terminal" });
    store.create({ id: "b", title: "B", repoPath: "/r", request: "q", origin: "phone" });
    reg.loadFrom(store);
    expect(reg.list().map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("notifies subscribers when an item is upserted", () => {
    const seen: string[] = [];
    reg.subscribe((item) => seen.push(item.id));
    const item = store.create({ id: "c", title: "C", repoPath: "/r", request: "q", origin: "terminal" });
    reg.upsert(item);
    expect(seen).toEqual(["c"]);
    expect(reg.get("c")?.title).toBe("C");
  });

  it("stops notifying after unsubscribe", () => {
    const seen: string[] = [];
    const off = reg.subscribe((item) => seen.push(item.id));
    off();
    reg.upsert(store.create({ id: "d", title: "D", repoPath: "/r", request: "q", origin: "terminal" }));
    expect(seen).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bridge && npx vitest run test/registry.test.ts`
Expected: FAIL — cannot find module `../src/registry/registry.js`.

- [ ] **Step 3: Implement `bridge/src/registry/registry.ts`**

```ts
import type { WorkItem } from "../state/types.js";
import type { StateStore } from "../state/store.js";

type Listener = (item: WorkItem) => void;

export class Registry {
  private readonly items = new Map<string, WorkItem>();
  private readonly listeners = new Set<Listener>();

  loadFrom(store: StateStore): void {
    for (const item of store.list()) this.items.set(item.id, item);
  }

  upsert(item: WorkItem): void {
    this.items.set(item.id, item);
    for (const l of this.listeners) l(item);
  }

  get(id: string): WorkItem | undefined {
    return this.items.get(id);
  }

  list(): WorkItem[] {
    return [...this.items.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd bridge && npx vitest run test/registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd bridge && git add src/registry/registry.ts test/registry.test.ts
git commit -m "feat(bridge): in-memory Registry with subscribe"
```

---

## Task 5: Watcher (state dir → registry)

**Files:**
- Create: `bridge/src/registry/watcher.ts`
- Test: `bridge/test/watcher.test.ts`

The `Watcher` makes terminal-started items appear in the registry: when any `*.yaml` in the state dir is created or changed (by a session writing state), it re-reads that item and upserts it into the registry.

- [ ] **Step 1: Write the failing test**

```ts
// bridge/test/watcher.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/state/store.js";
import { Registry } from "../src/registry/registry.js";
import { Watcher } from "../src/registry/watcher.js";

describe("Watcher", () => {
  let dir: string;
  let store: StateStore;
  let reg: Registry;
  let watcher: Watcher;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "reagent-watch-"));
    store = new StateStore(dir);
    reg = new Registry();
    watcher = new Watcher(dir, store, reg);
  });
  afterEach(async () => {
    await watcher.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("upserts an item into the registry when its yaml file appears", async () => {
    await watcher.start();
    const arrived = new Promise<string>((resolve) => reg.subscribe((i) => resolve(i.id)));
    store.create({ id: "wi_x", title: "X", repoPath: "/r", request: "q", origin: "terminal" });
    const id = await arrived;
    expect(id).toBe("wi_x");
    expect(reg.get("wi_x")?.title).toBe("X");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bridge && npx vitest run test/watcher.test.ts`
Expected: FAIL — cannot find module `../src/registry/watcher.js`.

- [ ] **Step 3: Implement `bridge/src/registry/watcher.ts`**

```ts
import chokidar, { type FSWatcher } from "chokidar";
import { basename } from "node:path";
import type { StateStore } from "../state/store.js";
import type { Registry } from "./registry.js";

export class Watcher {
  private fsw?: FSWatcher;

  constructor(
    private readonly dir: string,
    private readonly store: StateStore,
    private readonly registry: Registry,
  ) {}

  async start(): Promise<void> {
    this.fsw = chokidar.watch(`${this.dir}/*.yaml`, { ignoreInitial: false });
    const onChange = (path: string) => {
      const id = basename(path, ".yaml");
      const item = this.store.get(id);
      if (item) this.registry.upsert(item);
    };
    this.fsw.on("add", onChange).on("change", onChange);
    await new Promise<void>((resolve) => this.fsw!.on("ready", () => resolve()));
  }

  async stop(): Promise<void> {
    await this.fsw?.close();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd bridge && npx vitest run test/watcher.test.ts`
Expected: PASS (1 test). (If flaky on macOS due to FS event latency, the test already waits on the subscribe promise — there is no fixed sleep.)

- [ ] **Step 5: Commit**

```bash
cd bridge && git add src/registry/watcher.ts test/watcher.test.ts
git commit -m "feat(bridge): chokidar Watcher feeding the Registry"
```

---

## Task 6: Config

**Files:**
- Create: `bridge/src/config.ts`

Centralizes paths/ports so `index.ts`, the MCP server, and tests agree.

- [ ] **Step 1: Write `bridge/src/config.ts`**

```ts
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  stateDir: string;
  httpPort: number;
  /** How long awaitDecision waits before returning "pending" (ms). */
  checkpointPollMs: number;
}

export function loadConfig(): Config {
  return {
    stateDir: process.env.REAGENT_STATE_DIR ?? join(homedir(), ".reagent", "state"),
    httpPort: Number(process.env.REAGENT_HTTP_PORT ?? 4319),
    checkpointPollMs: Number(process.env.REAGENT_CHECKPOINT_POLL_MS ?? 25000),
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd bridge && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd bridge && git add src/config.ts
git commit -m "feat(bridge): config loader"
```

---

## Task 7: MCP server (session-facing tools)

**Files:**
- Create: `bridge/src/mcp/server.ts`
- Test: `bridge/test/mcp-server.test.ts`

Exposes the tools a session calls. Built on `McpServer` from the MCP SDK so it can be exercised in-process by an MCP `Client` over an in-memory linked transport (no network in the unit test). The same `McpServer` is later mounted on HTTP in `index.ts`.

Tools:
- `register_work_item({ id, title, repoPath, request, origin })` → creates/loads the item, upserts to registry.
- `report_status({ id, phase?, line?, plan?, branch? })` → updates the item.
- `await_decision({ id, prompt })` → opens a checkpoint (if new), records it on the item, waits up to `checkpointPollMs`, returns `{ status: "pending" | "decided", decision? }`.
- `complete_work_item({ id, phase })` → sets a terminal phase.

- [ ] **Step 1: Write the failing test**

```ts
// bridge/test/mcp-server.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StateStore } from "../src/state/store.js";
import { Registry } from "../src/registry/registry.js";
import { CheckpointStore } from "../src/checkpoints/checkpoints.js";
import { buildMcpServer } from "../src/mcp/server.js";

function textOf(result: any): string {
  return result.content.map((c: any) => c.text).join("");
}

describe("MCP server tools", () => {
  let dir: string;
  let store: StateStore;
  let reg: Registry;
  let cps: CheckpointStore;
  let client: Client;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "reagent-mcp-"));
    store = new StateStore(dir);
    reg = new Registry();
    cps = new CheckpointStore();
    const server = buildMcpServer({ store, registry: reg, checkpoints: cps, checkpointPollMs: 50 });

    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(serverT), client.connect(clientT)]);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("registers a work item and lands it in store + registry", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_1", title: "T", repoPath: "/r", request: "do it", origin: "terminal" },
    });
    expect(store.get("wi_1")?.request).toBe("do it");
    expect(reg.get("wi_1")?.title).toBe("T");
  });

  it("report_status updates phase and appends a log line", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_2", title: "T", repoPath: "/r", request: "q", origin: "terminal" },
    });
    await client.callTool({
      name: "report_status",
      arguments: { id: "wi_2", phase: "INVESTIGATE", line: "reading code", plan: "do X" },
    });
    const it = store.get("wi_2")!;
    expect(it.phase).toBe("INVESTIGATE");
    expect(it.plan).toBe("do X");
    expect(it.log.at(-1)?.line).toBe("reading code");
  });

  it("await_decision returns pending, then decided after resolve", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_3", title: "T", repoPath: "/r", request: "q", origin: "terminal" },
    });

    const first = await client.callTool({
      name: "await_decision",
      arguments: { id: "wi_3", prompt: "approve plan?" },
    });
    expect(JSON.parse(textOf(first)).status).toBe("pending");

    // a checkpoint is now recorded on the item
    const cpId = store.get("wi_3")!.pendingCheckpoint!.id;
    cps.resolve(cpId, { result: "approve" });

    const second = await client.callTool({
      name: "await_decision",
      arguments: { id: "wi_3", prompt: "approve plan?" },
    });
    const payload = JSON.parse(textOf(second));
    expect(payload.status).toBe("decided");
    expect(payload.decision.result).toBe("approve");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bridge && npx vitest run test/mcp-server.test.ts`
Expected: FAIL — cannot find module `../src/mcp/server.js`.

- [ ] **Step 3: Implement `bridge/src/mcp/server.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { StateStore } from "../state/store.js";
import type { Registry } from "../registry/registry.js";
import type { CheckpointStore } from "../checkpoints/checkpoints.js";
import type { Phase } from "../state/types.js";

export interface McpDeps {
  store: StateStore;
  registry: Registry;
  checkpoints: CheckpointStore;
  checkpointPollMs: number;
}

const PHASES = [
  "INTAKE", "INVESTIGATE", "PLAN_APPROVAL", "EXECUTE", "DONE", "REJECTED", "FAILED",
] as const;

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

export function buildMcpServer(deps: McpDeps): McpServer {
  const { store, registry, checkpoints, checkpointPollMs } = deps;
  const server = new McpServer({ name: "reagent-bridge", version: "0.0.1" });

  const touch = (id: string) => {
    const item = store.get(id);
    if (item) registry.upsert(item);
  };

  server.registerTool(
    "register_work_item",
    {
      description: "Register (create or refresh) a reagent work item with the bridge.",
      inputSchema: {
        id: z.string(),
        title: z.string(),
        repoPath: z.string(),
        request: z.string(),
        origin: z.enum(["terminal", "phone"]),
      },
    },
    async ({ id, title, repoPath, request, origin }) => {
      if (!store.get(id)) store.create({ id, title, repoPath, request, origin });
      touch(id);
      return json({ ok: true });
    },
  );

  server.registerTool(
    "report_status",
    {
      description: "Stream a status update for a work item (phase, log line, plan, branch).",
      inputSchema: {
        id: z.string(),
        phase: z.enum(PHASES).optional(),
        line: z.string().optional(),
        plan: z.string().optional(),
        branch: z.string().optional(),
      },
    },
    async ({ id, phase, line, plan, branch }) => {
      store.update(id, (it) => {
        if (phase) it.phase = phase as Phase;
        if (plan !== undefined) it.plan = plan;
        if (branch !== undefined) it.branch = branch;
        if (line) it.log.push({ at: new Date().toISOString(), line });
      });
      touch(id);
      return json({ ok: true });
    },
  );

  server.registerTool(
    "await_decision",
    {
      description:
        "Open (or continue waiting on) a human approval gate. Returns {status:'pending'} on timeout — call again to keep waiting.",
      inputSchema: { id: z.string(), prompt: z.string() },
    },
    async ({ id, prompt }) => {
      let item = store.get(id);
      if (!item) throw new Error(`work item not found: ${id}`);

      let cpId = item.pendingCheckpoint?.id;
      if (!cpId || item.pendingCheckpoint?.decision) {
        cpId = `cp_${randomUUID().slice(0, 8)}`;
        checkpoints.open(id, cpId, prompt);
        store.update(id, (it) => {
          it.phase = "PLAN_APPROVAL";
          it.pendingCheckpoint = {
            id: cpId!,
            kind: "PLAN_APPROVAL",
            prompt,
            createdAt: new Date().toISOString(),
          };
        });
        touch(id);
      } else if (!checkpoints.has(cpId)) {
        // bridge restarted: re-open the checkpoint from persisted state
        checkpoints.open(id, cpId, item.pendingCheckpoint!.prompt);
      }

      const res = await checkpoints.awaitDecision(cpId, checkpointPollMs);
      if (res.status === "decided") {
        store.update(id, (it) => {
          if (it.pendingCheckpoint) {
            it.pendingCheckpoint.decision = { ...res.decision, decidedAt: new Date().toISOString() };
          }
        });
        touch(id);
        return json({ status: "decided", decision: res.decision });
      }
      return json({ status: "pending" });
    },
  );

  server.registerTool(
    "complete_work_item",
    {
      description: "Mark a work item terminal (DONE, REJECTED, or FAILED).",
      inputSchema: { id: z.string(), phase: z.enum(["DONE", "REJECTED", "FAILED"]) },
    },
    async ({ id, phase }) => {
      store.update(id, (it) => {
        it.phase = phase as Phase;
        it.pendingCheckpoint = undefined;
      });
      touch(id);
      return json({ ok: true });
    },
  );

  return server;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd bridge && npx vitest run test/mcp-server.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite**

Run: `cd bridge && npx vitest run`
Expected: PASS (all tasks so far).

- [ ] **Step 6: Commit**

```bash
cd bridge && git add src/mcp/server.ts test/mcp-server.test.ts
git commit -m "feat(bridge): MCP server with register/report/await_decision/complete tools"
```

---

## Task 8: HTTP API + SSE

**Files:**
- Create: `bridge/src/http/server.ts`
- Test: `bridge/test/http-api.test.ts`

Fastify app exposing the human-facing API. Built as a factory returning the Fastify instance so tests can use `app.inject` without binding a port.

Endpoints:
- `GET /api/items` → registry list.
- `GET /api/items/:id` → one item (404 if missing).
- `POST /api/items/:id/decision` `{ result, note? }` → resolve the item's pending checkpoint, return 200; 409 if no pending checkpoint.
- `POST /api/items` `{ title, repoPath, request }` → create a `phone`-origin item in `INTAKE` and return it. (Headless launch is Plan 3; here it just records intent so the webapp can create work.)
- `GET /api/stream` → SSE; emits `item` events whenever the registry upserts.

- [ ] **Step 1: Write the failing test**

```ts
// bridge/test/http-api.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/state/store.js";
import { Registry } from "../src/registry/registry.js";
import { CheckpointStore } from "../src/checkpoints/checkpoints.js";
import { buildHttpServer } from "../src/http/server.js";

describe("HTTP API", () => {
  let dir: string;
  let store: StateStore;
  let reg: Registry;
  let cps: CheckpointStore;
  let app: ReturnType<typeof buildHttpServer>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "reagent-http-"));
    store = new StateStore(dir);
    reg = new Registry();
    cps = new CheckpointStore();
    app = buildHttpServer({ store, registry: reg, checkpoints: cps });
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists items", async () => {
    reg.upsert(store.create({ id: "a", title: "A", repoPath: "/r", request: "q", origin: "terminal" }));
    const res = await app.inject({ method: "GET", url: "/api/items" });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((i: any) => i.id)).toEqual(["a"]);
  });

  it("creates a phone-origin work item", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "New", repoPath: "/r", request: "fix it" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.origin).toBe("phone");
    expect(body.phase).toBe("INTAKE");
    expect(store.get(body.id)?.request).toBe("fix it");
  });

  it("resolves a pending checkpoint via POST decision", async () => {
    const item = store.create({ id: "b", title: "B", repoPath: "/r", request: "q", origin: "terminal" });
    cps.open("b", "cp_b", "approve?");
    store.update("b", (it) => {
      it.phase = "PLAN_APPROVAL";
      it.pendingCheckpoint = { id: "cp_b", kind: "PLAN_APPROVAL", prompt: "approve?", createdAt: new Date().toISOString() };
    });
    reg.upsert(store.get("b")!);

    const res = await app.inject({
      method: "POST",
      url: "/api/items/b/decision",
      payload: { result: "approve" },
    });
    expect(res.statusCode).toBe(200);

    const decided = await cps.awaitDecision("cp_b", 100);
    expect(decided.status).toBe("decided");
    expect(decided.decision?.result).toBe("approve");
  });

  it("returns 409 when deciding an item with no pending checkpoint", async () => {
    reg.upsert(store.create({ id: "c", title: "C", repoPath: "/r", request: "q", origin: "terminal" }));
    const res = await app.inject({
      method: "POST",
      url: "/api/items/c/decision",
      payload: { result: "approve" },
    });
    expect(res.statusCode).toBe(409);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bridge && npx vitest run test/http-api.test.ts`
Expected: FAIL — cannot find module `../src/http/server.js`.

- [ ] **Step 3: Implement `bridge/src/http/server.ts`**

```ts
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import type { StateStore } from "../state/store.js";
import type { Registry } from "../registry/registry.js";
import type { CheckpointStore } from "../checkpoints/checkpoints.js";

export interface HttpDeps {
  store: StateStore;
  registry: Registry;
  checkpoints: CheckpointStore;
}

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..", "web");

export function buildHttpServer(deps: HttpDeps): FastifyInstance {
  const { store, registry, checkpoints } = deps;
  const app = Fastify({ logger: false });

  app.get("/api/items", async () => registry.list());

  app.get("/api/items/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = registry.get(id) ?? store.get(id);
    if (!item) return reply.code(404).send({ error: "not found" });
    return item;
  });

  app.post("/api/items", async (req, reply) => {
    const { title, repoPath, request } = req.body as {
      title: string; repoPath: string; request: string;
    };
    const id = `wi_${randomUUID().slice(0, 8)}`;
    const item = store.create({ id, title, repoPath, request, origin: "phone" });
    registry.upsert(item);
    return reply.code(201).send(item);
  });

  app.post("/api/items/:id/decision", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { result, note } = req.body as { result: "approve" | "reject"; note?: string };
    const item = store.get(id);
    const cpId = item?.pendingCheckpoint?.id;
    if (!item || !cpId || !checkpoints.has(cpId)) {
      return reply.code(409).send({ error: "no pending checkpoint" });
    }
    checkpoints.resolve(cpId, { result, note });
    return { ok: true };
  });

  app.get("/api/stream", (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write(`event: hello\ndata: {}\n\n`);
    const off = registry.subscribe((item) => {
      reply.raw.write(`event: item\ndata: ${JSON.stringify(item)}\n\n`);
    });
    req.raw.on("close", () => off());
  });

  // Static PWA (index.html, app.js, manifest)
  for (const [route, file, type] of [
    ["/", "index.html", "text/html"],
    ["/app.js", "app.js", "text/javascript"],
    ["/manifest.webmanifest", "manifest.webmanifest", "application/manifest+json"],
  ] as const) {
    app.get(route, async (_req, reply) => {
      reply.type(type);
      return readFileSync(join(webDir, file), "utf8");
    });
  }

  return app;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Note: the static-PWA routes read files created in Task 9. To keep this task self-contained, create empty placeholders first so the routes don't crash if hit (the tests here don't hit them):

Run:
```bash
cd bridge && mkdir -p src/web && touch src/web/index.html src/web/app.js src/web/manifest.webmanifest
```

Then: `cd bridge && npx vitest run test/http-api.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd bridge && git add src/http/server.ts test/http-api.test.ts src/web/.gitkeep 2>/dev/null; git add -A
git commit -m "feat(bridge): Fastify REST + SSE API"
```

---

## Task 9: Minimal PWA

**Files:**
- Create: `bridge/src/web/index.html`
- Create: `bridge/src/web/app.js`
- Create: `bridge/src/web/manifest.webmanifest`

A single-page UI: a list of work items (live via SSE), a detail view showing phase + log + plan, an Approve/Reject control when a checkpoint is pending, and a "new work" form. No build step — plain JS.

- [ ] **Step 1: Write `bridge/src/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>reagent</title>
    <style>
      body { font: 15px system-ui, sans-serif; margin: 0; background: #14110f; color: #eee; }
      header { padding: 12px 16px; background: #1f1b18; font-weight: 600; }
      main { padding: 12px 16px; max-width: 720px; margin: 0 auto; }
      .item { border: 1px solid #3a322c; border-radius: 8px; padding: 12px; margin: 10px 0; }
      .phase { font-size: 12px; color: #c89; text-transform: uppercase; letter-spacing: .05em; }
      .gate { background: #2a1f14; border-color: #a96; }
      button { font: inherit; padding: 8px 14px; border-radius: 6px; border: 0; cursor: pointer; }
      .approve { background: #2f7d4f; color: #fff; } .reject { background: #8a3b2f; color: #fff; }
      input, textarea { width: 100%; box-sizing: border-box; background: #221d19; color: #eee; border: 1px solid #3a322c; border-radius: 6px; padding: 8px; margin: 4px 0; }
      pre { white-space: pre-wrap; color: #bbb; font-size: 13px; }
    </style>
  </head>
  <body>
    <header>reagent</header>
    <main>
      <details>
        <summary>Start new work</summary>
        <form id="new">
          <input name="title" placeholder="title" required />
          <input name="repoPath" placeholder="/path/to/repo" required />
          <textarea name="request" placeholder="what needs doing?" required></textarea>
          <button type="submit">Start</button>
        </form>
      </details>
      <div id="items"></div>
    </main>
    <script src="/app.js" type="module"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `bridge/src/web/app.js`**

```js
const items = new Map();
const el = document.getElementById("items");

function render() {
  el.innerHTML = "";
  [...items.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .forEach((it) => el.appendChild(card(it)));
}

function card(it) {
  const gate = it.pendingCheckpoint && !it.pendingCheckpoint.decision;
  const div = document.createElement("div");
  div.className = "item" + (gate ? " gate" : "");
  div.innerHTML = `
    <div class="phase">${it.phase} · ${it.origin}</div>
    <strong>${it.title}</strong>
    ${it.plan ? `<pre>${escapeHtml(it.plan)}</pre>` : ""}
    ${(it.log || []).slice(-4).map((l) => `<pre>· ${escapeHtml(l.line)}</pre>`).join("")}
  `;
  if (gate) {
    const prompt = document.createElement("pre");
    prompt.textContent = it.pendingCheckpoint.prompt;
    div.appendChild(prompt);
    div.appendChild(decisionButtons(it.id));
  }
  return div;
}

function decisionButtons(id) {
  const wrap = document.createElement("div");
  const approve = button("Approve", "approve", () => decide(id, "approve"));
  const reject = button("Reject", "reject", () => {
    const note = prompt("Why reject? (optional)") || undefined;
    decide(id, "reject", note);
  });
  wrap.append(approve, " ", reject);
  return wrap;
}

function button(label, cls, onClick) {
  const b = document.createElement("button");
  b.textContent = label; b.className = cls; b.onclick = onClick;
  return b;
}

async function decide(id, result, note) {
  await fetch(`/api/items/${id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ result, note }),
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

document.getElementById("new").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await fetch("/api/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.fromEntries(f)),
  });
  e.target.reset();
});

async function init() {
  const res = await fetch("/api/items");
  for (const it of await res.json()) items.set(it.id, it);
  render();
  const es = new EventSource("/api/stream");
  es.addEventListener("item", (ev) => {
    const it = JSON.parse(ev.data);
    items.set(it.id, it);
    render();
  });
}
init();
```

- [ ] **Step 3: Write `bridge/src/web/manifest.webmanifest`**

```json
{
  "name": "reagent",
  "short_name": "reagent",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#14110f",
  "theme_color": "#1f1b18",
  "icons": []
}
```

- [ ] **Step 4: Typecheck (the build still compiles; web files are static)**

Run: `cd bridge && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd bridge && git add src/web/
git commit -m "feat(bridge): minimal PWA (list, gate approve/reject, new work, SSE)"
```

---

## Task 10: Wire it together (`index.ts`) + MCP-over-HTTP mount

**Files:**
- Create: `bridge/src/index.ts`

Boots everything: load config, build StateStore, load + watch into Registry, build CheckpointStore, mount the MCP server on an HTTP route via the Streamable HTTP transport, start Fastify.

- [ ] **Step 1: Write `bridge/src/index.ts`**

```ts
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { StateStore } from "./state/store.js";
import { Registry } from "./registry/registry.js";
import { Watcher } from "./registry/watcher.js";
import { CheckpointStore } from "./checkpoints/checkpoints.js";
import { buildMcpServer } from "./mcp/server.js";
import { buildHttpServer } from "./http/server.js";

async function main() {
  const cfg = loadConfig();
  const store = new StateStore(cfg.stateDir);
  const registry = new Registry();
  registry.loadFrom(store);
  const watcher = new Watcher(cfg.stateDir, store, registry);
  await watcher.start();
  const checkpoints = new CheckpointStore();

  // Re-open any persisted-but-unresolved checkpoints so awaiting sessions resume.
  for (const item of store.list()) {
    const cp = item.pendingCheckpoint;
    if (cp && !cp.decision) checkpoints.open(item.id, cp.id, cp.prompt);
  }

  const app = buildHttpServer({ store, registry, checkpoints });

  // Mount the MCP server at POST/GET /mcp using the Streamable HTTP transport.
  const mcp = buildMcpServer({ ...{ store, registry, checkpoints }, checkpointPollMs: cfg.checkpointPollMs });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcp.connect(transport);
  app.all("/mcp", async (req, reply) => {
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });

  await app.listen({ port: cfg.httpPort, host: "0.0.0.0" });
  console.log(`reagent bridge on http://0.0.0.0:${cfg.httpPort}  (state: ${cfg.stateDir})`);

  const shutdown = async () => {
    await watcher.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck**

Run: `cd bridge && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Boot the bridge manually**

Run: `cd bridge && REAGENT_STATE_DIR=/tmp/reagent-smoke npx tsx src/index.ts`
Expected: logs `reagent bridge on http://0.0.0.0:4319 (state: /tmp/reagent-smoke)`. Open `http://localhost:4319/` in a browser — the reagent PWA shell loads with an empty list and a "Start new work" form. Leave it running for Task 11. (Ctrl-C to stop later.)

- [ ] **Step 4: Commit**

```bash
cd bridge && git add src/index.ts
git commit -m "feat(bridge): wire bridge entrypoint + mount MCP over HTTP"
```

---

## Task 11: Stub session + full-loop smoke test

**Files:**
- Create: `bridge/scripts/stub-session.ts`

A script that connects to the running bridge as an MCP client and walks the M1 pipeline — register → report INVESTIGATE → await_decision (poll until decided) → report EXECUTE → complete DONE — imitating a Claude Code session. This proves the checkpoint loop end-to-end with a human approving in the browser.

- [ ] **Step 1: Write `bridge/scripts/stub-session.ts`**

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { randomUUID } from "node:crypto";

const BRIDGE = process.env.REAGENT_BRIDGE_URL ?? "http://localhost:4319/mcp";

function textOf(result: any): string {
  return result.content.map((c: any) => c.text).join("");
}

async function main() {
  const client = new Client({ name: "stub-session", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(BRIDGE)));

  const id = `wi_${randomUUID().slice(0, 8)}`;
  console.log(`stub session: work item ${id}`);

  await client.callTool({
    name: "register_work_item",
    arguments: { id, title: "Stub task", repoPath: "/tmp/repo", request: "demonstrate the loop", origin: "terminal" },
  });

  await client.callTool({
    name: "report_status",
    arguments: { id, phase: "INVESTIGATE", line: "investigating…", plan: "Proposed direction: do the thing in module X." },
  });

  console.log("awaiting approval — open http://localhost:4319/ and Approve/Reject");
  // Poll the gate until the human decides.
  let decision: any;
  for (;;) {
    const res = await client.callTool({
      name: "await_decision",
      arguments: { id, prompt: "Approve this plan?\n\nProposed direction: do the thing in module X." },
    });
    const payload = JSON.parse(textOf(res));
    if (payload.status === "decided") { decision = payload.decision; break; }
    console.log("…still pending, re-polling");
  }

  console.log(`decision: ${decision.result}${decision.note ? ` (${decision.note})` : ""}`);
  if (decision.result === "reject") {
    await client.callTool({ name: "complete_work_item", arguments: { id, phase: "REJECTED" } });
  } else {
    await client.callTool({ name: "report_status", arguments: { id, phase: "EXECUTE", line: "making the change…", branch: `reagent/${id}` } });
    await client.callTool({ name: "complete_work_item", arguments: { id, phase: "DONE" } });
  }
  console.log("done");
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the end-to-end smoke test (manual)**

With the bridge from Task 10 still running:

Run (in a second terminal): `cd bridge && npx tsx scripts/stub-session.ts`

Expected:
1. The stub prints the work-item id and "awaiting approval".
2. The browser list shows the item with phase `PLAN_APPROVAL`, the proposed direction, and **Approve / Reject** buttons (highlighted as a gate).
3. Clicking **Approve** → the stub prints `decision: approve`, advances to `EXECUTE`, then `DONE`; the browser updates live to `DONE` via SSE.
4. Re-run and click **Reject** with a note → the stub prints `decision: reject (…)` and the item shows `REJECTED`.

This is the core risk retired: a session opens a gate, a human answers it from the web UI, and the session continues — across the poll boundary.

- [ ] **Step 3: Verify restart durability (manual)**

1. Re-run the stub; when it is "awaiting approval", Ctrl-C the **bridge** (not the stub).
2. Restart the bridge (`REAGENT_STATE_DIR=/tmp/reagent-smoke npx tsx src/index.ts`).
3. Reload the browser — the item still shows the pending gate (registry rebuilt from disk; checkpoint re-opened from persisted state in `index.ts`).
4. Approve — the stub's next poll resolves and it continues.

Expected: approval still works after a bridge restart, proving resume-by-reconstruction of the checkpoint.

- [ ] **Step 4: Commit**

```bash
cd bridge && git add scripts/stub-session.ts
git commit -m "test(bridge): stub session exercising the full checkpoint loop"
```

---

## Task 12: Full suite + README pointer

**Files:**
- Create: `bridge/README.md`

- [ ] **Step 1: Run the whole test suite**

Run: `cd bridge && npx vitest run`
Expected: PASS — all unit tests across state-store, checkpoints, registry, watcher, mcp-server, http-api.

- [ ] **Step 2: Write `bridge/README.md`**

```markdown
# reagent bridge

Always-on hub for the reagent harness (M1, Plan 1 of 3).

- `npm run dev` — start the bridge (HTTP + PWA + MCP over HTTP on :4319).
- `npm run stub` — run a stub session that walks the pipeline and opens a gate.
- `npm test` — unit tests.

Env: `REAGENT_STATE_DIR` (default `~/.reagent/state`), `REAGENT_HTTP_PORT` (4319),
`REAGENT_CHECKPOINT_POLL_MS` (25000).

The MCP endpoint is `POST/GET /mcp` (Streamable HTTP). A Claude Code session running
the reagent skill connects here as an MCP client (Plan 2). The PWA is served at `/`.
```

- [ ] **Step 3: Commit**

```bash
cd bridge && git add README.md
git commit -m "docs(bridge): README"
```

---

## Self-review notes (already applied)

- **Spec coverage (Plan 1 slice):** durable YAML state (Tasks 1–2) ✓; registry visible to webapp incl. terminal-started items via watcher (Tasks 4–5) ✓; checkpoint loop answerable from phone (Tasks 3, 7, 8, 11) ✓; resume-by-reconstruction of registry + checkpoints on restart (Task 10 + Task 11 step 3) ✓; minimal PWA over a port Tailscale can serve (Task 9) ✓; new-work intake from phone recorded (Task 8) — headless *launch* is Plan 3 ✓ (explicitly out of this plan).
- **Deferred to Plan 2/3 (not gaps):** the reagent skill/plugin and real INVESTIGATE/EXECUTE stages (Plan 2); headless session launch from `POST /api/items` and Tailscale wiring (Plan 3). The stub session stands in for a real session here.
- **Type consistency:** `WorkItem`, `Phase`, `Checkpoint`, `Decision`, `StatusUpdate` are defined once in `state/types.ts` / `checkpoints.ts` and reused; tool names (`register_work_item`, `report_status`, `await_decision`, `complete_work_item`) match between `mcp/server.ts`, the MCP test, and the stub.
- **Placeholder scan:** no TBD/TODO; every code step has complete code; manual smoke steps (Tasks 10–11) are explicit because they're inherently interactive (browser approval).

---

## Next plans

- **Plan 2 — reagent plugin:** the Claude Code plugin (skill encoding INTAKE→INVESTIGATE→PLAN_APPROVAL→EXECUTE, slash commands, scoped executor subagent, MCP client config pointing at the bridge's `/mcp`). Requires confirming Claude Code plugin packaging + MCP-client config + headless invocation — verify before writing.
- **Plan 3 — headless launch + integration:** bridge spawns a Claude Code session on `POST /api/items`; Tailscale `serve`; full real end-to-end (phone-started work, real commit), replacing the stub session.
