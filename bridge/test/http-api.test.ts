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
