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
