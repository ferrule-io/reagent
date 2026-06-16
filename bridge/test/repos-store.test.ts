import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoStore } from "../src/state/repos.js";

describe("RepoStore", () => {
  let dir: string;
  let store: RepoStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "reagent-repos-"));
    store = new RepoStore(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns empty list when no repos.yaml exists", () => {
    expect(store.list()).toEqual([]);
  });

  it("adds a repo and lists it back", () => {
    const repo = store.add({ name: "my-project", path: "/home/user/my-project" });
    expect(repo.id).toMatch(/^repo_/);
    expect(repo.name).toBe("my-project");
    expect(repo.path).toBe("/home/user/my-project");
    expect(repo.addedAt).toBeTruthy();

    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(repo.id);
  });

  it("falls back to basename when name is empty", () => {
    const repo = store.add({ name: "", path: "/home/user/cool-thing" });
    expect(repo.name).toBe("cool-thing");
  });

  it("falls back to basename when name is whitespace", () => {
    const repo = store.add({ name: "   ", path: "/repos/some-lib" });
    expect(repo.name).toBe("some-lib");
  });

  it("trims whitespace from path", () => {
    const repo = store.add({ path: "  /trimmed/path  " });
    expect(repo.path).toBe("/trimmed/path");
  });

  it("deduplicates repos by path (returns existing)", () => {
    const first = store.add({ name: "first", path: "/dup/path" });
    const second = store.add({ name: "second", path: "/dup/path" });
    expect(second.id).toBe(first.id);
    expect(store.list()).toHaveLength(1);
  });

  it("removes a repo by id and returns true", () => {
    const repo = store.add({ path: "/to/remove" });
    expect(store.remove(repo.id)).toBe(true);
    expect(store.list()).toHaveLength(0);
  });

  it("returns false when removing a non-existent id", () => {
    expect(store.remove("repo_nonexistent")).toBe(false);
  });

  it("persists across instances (survives reload)", () => {
    store.add({ name: "persistent", path: "/persist/me" });
    const reloaded = new RepoStore(dir);
    const list = reloaded.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("persistent");
  });

  it("can add multiple repos and list all", () => {
    store.add({ name: "a", path: "/a" });
    store.add({ name: "b", path: "/b" });
    store.add({ name: "c", path: "/c" });
    expect(store.list()).toHaveLength(3);
  });
});
