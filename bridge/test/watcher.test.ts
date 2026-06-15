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
