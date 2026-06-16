import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/state/store.js";
import { RepoStore } from "../src/state/repos.js";

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

  it("lists all persisted work items (wi_*.yaml only), ignoring other yaml files", () => {
    store.create({ id: "wi_a", title: "a", repoPath: "/r", request: "q", origin: "terminal" });
    store.create({ id: "wi_b", title: "b", repoPath: "/r", request: "q", origin: "phone" });
    const ids = store.list().map((i) => i.id).sort();
    expect(ids).toEqual(["wi_a", "wi_b"]);
  });

  it("does NOT include repos.yaml entries in StateStore.list()", () => {
    // Simulate RepoStore writing repos.yaml into the same stateDir
    const repoStore = new RepoStore(dir);
    repoStore.add({ name: "myrepo", path: "/some/path" });

    store.create({ id: "wi_x", title: "X", repoPath: "/r", request: "q", origin: "terminal" });

    const items = store.list();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("wi_x");
  });
});
