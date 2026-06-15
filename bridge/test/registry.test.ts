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
