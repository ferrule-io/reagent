import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/state/store.js";
import { RepoStore } from "../src/state/repos.js";
import { Registry } from "../src/registry/registry.js";
import { CheckpointStore } from "../src/checkpoints/checkpoints.js";
import { buildHttpServer } from "../src/http/server.js";

describe("HTTP API", () => {
  let dir: string;
  let store: StateStore;
  let repos: RepoStore;
  let reg: Registry;
  let cps: CheckpointStore;
  let app: ReturnType<typeof buildHttpServer>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "reagent-http-"));
    store = new StateStore(dir);
    repos = new RepoStore(dir);
    reg = new Registry();
    cps = new CheckpointStore();
    app = buildHttpServer({
      store,
      repos,
      registry: reg,
      checkpoints: cps,
      worktreesDir: join(dir, "worktrees"),
    });
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists items", async () => {
    reg.upsert(
      store.create({ id: "a", title: "A", repoPath: "/r", request: "q", origin: "terminal" }),
    );
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

  it("derives a human-readable branch when creating a phone-origin item", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "Improve onboarding flow", repoPath: "/r", request: "make it better" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.branch).toBe("reagent/improve-onboarding-flow");
    expect(store.get(body.id)?.branch).toBe("reagent/improve-onboarding-flow");
  });

  it("disambiguates duplicate phone-origin branches with a numeric suffix", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "Update readme", repoPath: "/r", request: "q" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "Update readme", repoPath: "/r", request: "q" },
    });
    expect(first.json().branch).toBe("reagent/update-readme");
    expect(second.json().branch).toBe("reagent/update-readme-2");
  });

  it("resolves a pending checkpoint via POST decision", async () => {
    store.create({ id: "b", title: "B", repoPath: "/r", request: "q", origin: "terminal" });
    cps.open("b", "cp_b", "approve?");
    store.update("b", (it) => {
      it.phase = "PROPOSE";
      it.pendingCheckpoint = {
        id: "cp_b",
        kind: "PROPOSE",
        prompt: "approve?",
        createdAt: new Date().toISOString(),
      };
    });
    reg.upsert(store.get("b")!);

    const res = await app.inject({
      method: "POST",
      url: "/api/items/b/decision",
      payload: { result: "approve" },
    });
    expect(res.statusCode).toBe(200);

    const decided = await cps.awaitDecision("cp_b", 100);
    if (decided.status !== "decided") throw new Error("expected decided");
    expect(decided.decision.result).toBe("approve");
  });

  it("persists the decision note onto pendingCheckpoint in the store", async () => {
    store.create({ id: "d", title: "D", repoPath: "/r", request: "q", origin: "terminal" });
    cps.open("d", "cp_d", "approve?");
    store.update("d", (it) => {
      it.phase = "PROPOSE";
      it.pendingCheckpoint = {
        id: "cp_d",
        kind: "PROPOSE",
        prompt: "approve?",
        createdAt: new Date().toISOString(),
      };
    });
    reg.upsert(store.get("d")!);

    const res = await app.inject({
      method: "POST",
      url: "/api/items/d/decision",
      payload: { result: "approve", note: "looks good, ship it" },
    });
    expect(res.statusCode).toBe(200);

    // The note must be durable in the store, not just in-memory checkpoints.
    const stored = store.get("d");
    expect(stored?.pendingCheckpoint?.decision?.result).toBe("approve");
    expect(stored?.pendingCheckpoint?.decision?.note).toBe("looks good, ship it");
    expect(stored?.pendingCheckpoint?.decision?.decidedAt).toBeTruthy();
  });

  it("returns 409 when deciding an item with no pending checkpoint", async () => {
    reg.upsert(
      store.create({ id: "c", title: "C", repoPath: "/r", request: "q", origin: "terminal" }),
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/items/c/decision",
      payload: { result: "approve" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("accepts revise decision and appends to feedback trail", async () => {
    store.create({ id: "e", title: "E", repoPath: "/r", request: "q", origin: "terminal" });
    cps.open("e", "cp_e", "approve?");
    store.update("e", (it) => {
      it.phase = "PROPOSE";
      it.pendingCheckpoint = {
        id: "cp_e",
        kind: "PROPOSE",
        prompt: "approve?",
        createdAt: new Date().toISOString(),
      };
    });
    reg.upsert(store.get("e")!);

    const res = await app.inject({
      method: "POST",
      url: "/api/items/e/decision",
      payload: { result: "revise", note: "needs more detail" },
    });
    expect(res.statusCode).toBe(200);

    const stored = store.get("e");
    expect(stored?.pendingCheckpoint?.decision?.result).toBe("revise");
    expect(stored?.feedback).toHaveLength(1);
    expect(stored?.feedback![0].note).toBe("needs more detail");
    expect(stored?.phase).toBe("PROPOSE");
  });

  it("returns 400 for an invalid decision result", async () => {
    store.create({ id: "f", title: "F", repoPath: "/r", request: "q", origin: "terminal" });
    cps.open("f", "cp_f", "approve?");
    store.update("f", (it) => {
      it.phase = "PROPOSE";
      it.pendingCheckpoint = {
        id: "cp_f",
        kind: "PROPOSE",
        prompt: "approve?",
        createdAt: new Date().toISOString(),
      };
    });
    reg.upsert(store.get("f")!);

    const res = await app.inject({
      method: "POST",
      url: "/api/items/f/decision",
      payload: { result: "maybe" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("HTTP API — /api/repos", () => {
  let dir: string;
  let repos: RepoStore;
  let app: ReturnType<typeof buildHttpServer>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "reagent-repos-http-"));
    const store = new StateStore(dir);
    repos = new RepoStore(dir);
    const reg = new Registry();
    const cps = new CheckpointStore();
    app = buildHttpServer({
      store,
      repos,
      registry: reg,
      checkpoints: cps,
      worktreesDir: join(dir, "worktrees"),
    });
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("GET /api/repos returns empty array initially", async () => {
    const res = await app.inject({ method: "GET", url: "/api/repos" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("POST /api/repos creates a repo and returns 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/repos",
      payload: { name: "myrepo", path: "/home/user/myrepo" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toMatch(/^repo_/);
    expect(body.name).toBe("myrepo");
    expect(body.path).toBe("/home/user/myrepo");
  });

  it("POST /api/repos returns 400 when path is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/repos",
      payload: { name: "no-path" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/repos returns 400 when path is blank", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/repos",
      payload: { path: "   " },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/repos deduplicates by path (returns existing)", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/repos",
      payload: { path: "/dup" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/repos",
      payload: { path: "/dup" },
    });
    expect(second.json().id).toBe(first.json().id);
    const list = await app.inject({ method: "GET", url: "/api/repos" });
    expect(list.json()).toHaveLength(1);
  });

  it("DELETE /api/repos/:id removes the repo", async () => {
    const add = await app.inject({
      method: "POST",
      url: "/api/repos",
      payload: { path: "/to/remove" },
    });
    const { id } = add.json();
    const del = await app.inject({ method: "DELETE", url: `/api/repos/${id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });
    const list = await app.inject({ method: "GET", url: "/api/repos" });
    expect(list.json()).toHaveLength(0);
  });

  it("DELETE /api/repos/:id returns 404 for unknown id", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/repos/repo_unknown" });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/repos reflects added repos from store directly", async () => {
    repos.add({ name: "a", path: "/a" });
    repos.add({ name: "b", path: "/b" });
    const res = await app.inject({ method: "GET", url: "/api/repos" });
    expect(res.json()).toHaveLength(2);
  });
});

describe("HTTP API — launcher wiring", () => {
  let dir: string;
  let store: StateStore;
  let repos: RepoStore;
  let reg: Registry;
  let cps: CheckpointStore;
  let launcher: {
    starts: any[];
    resumes: any[];
    startAsync: (o: any) => void;
    resume: (o: any) => void;
  };
  let app: ReturnType<typeof buildHttpServer>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "reagent-launch-"));
    store = new StateStore(dir);
    repos = new RepoStore(dir);
    reg = new Registry();
    cps = new CheckpointStore();
    launcher = {
      starts: [],
      resumes: [],
      startAsync(o) {
        this.starts.push(o);
      },
      resume(o) {
        this.resumes.push(o);
      },
    };
    app = buildHttpServer({
      store,
      repos,
      registry: reg,
      checkpoints: cps,
      launcher,
      worktreesDir: join(dir, "worktrees"),
    });
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("launches a session when new phone work is created", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/items",
      payload: { title: "New", repoPath: "/tmp/repo", request: "do it" },
    });
    const id = res.json().id;
    expect(launcher.starts).toHaveLength(1);
    expect(launcher.starts[0]).toEqual({ id, repoPath: "/tmp/repo", request: "do it" });
  });

  it("re-launches resume on approval of a phone item", async () => {
    store.create({ id: "p", title: "P", repoPath: "/tmp/repo", request: "q", origin: "phone" });
    cps.open("p", "cp_p", "approve?");
    store.update("p", (it) => {
      it.phase = "PROPOSE";
      it.pendingCheckpoint = {
        id: "cp_p",
        kind: "PROPOSE",
        prompt: "approve?",
        createdAt: new Date().toISOString(),
      };
    });
    reg.upsert(store.get("p")!);

    await app.inject({
      method: "POST",
      url: "/api/items/p/decision",
      payload: { result: "approve" },
    });
    expect(launcher.resumes).toEqual([{ id: "p", repoPath: "/tmp/repo" }]);
  });

  it("re-launches resume on revise of a phone item", async () => {
    store.create({ id: "r", title: "R", repoPath: "/tmp/repo", request: "q", origin: "phone" });
    cps.open("r", "cp_r", "propose?");
    store.update("r", (it) => {
      it.phase = "PROPOSE";
      it.pendingCheckpoint = {
        id: "cp_r",
        kind: "PROPOSE",
        prompt: "propose?",
        createdAt: new Date().toISOString(),
      };
    });
    reg.upsert(store.get("r")!);

    await app.inject({
      method: "POST",
      url: "/api/items/r/decision",
      payload: { result: "revise", note: "try again" },
    });
    expect(launcher.resumes).toEqual([{ id: "r", repoPath: "/tmp/repo" }]);
  });

  it("does NOT re-launch on approval of a terminal item (its live session continues)", async () => {
    store.create({ id: "t", title: "T", repoPath: "/tmp/repo", request: "q", origin: "terminal" });
    cps.open("t", "cp_t", "approve?");
    store.update("t", (it) => {
      it.phase = "PROPOSE";
      it.pendingCheckpoint = {
        id: "cp_t",
        kind: "PROPOSE",
        prompt: "approve?",
        createdAt: new Date().toISOString(),
      };
    });
    reg.upsert(store.get("t")!);

    await app.inject({
      method: "POST",
      url: "/api/items/t/decision",
      payload: { result: "approve" },
    });
    expect(launcher.resumes).toEqual([]);
  });
});
