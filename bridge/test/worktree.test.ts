import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock node:child_process so no real git calls occur in this test file.
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { resolveBaseBranch, provisionWorktree } from "../src/state/worktree.js";

afterEach(() => {
  vi.resetAllMocks();
});

describe("resolveBaseBranch", () => {
  it("returns the override verbatim when a non-empty override is supplied", () => {
    const result = resolveBaseBranch("/some/repo", "origin/main");
    expect(result).toBe("origin/main");
    // execSync should NOT have been called
    expect(execSync).not.toHaveBeenCalled();
  });

  it("resolves via git symbolic-ref and strips refs/remotes/ prefix when no override given", () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("refs/remotes/origin/main\n"));
    const result = resolveBaseBranch("/some/repo");
    expect(result).toBe("origin/main");
    expect(execSync).toHaveBeenCalledWith("git symbolic-ref refs/remotes/origin/HEAD", {
      cwd: "/some/repo",
    });
  });

  it("falls back to 'origin/HEAD' when execSync throws", () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("git not found");
    });
    const result = resolveBaseBranch("/some/repo");
    expect(result).toBe("origin/HEAD");
  });
});

describe("provisionWorktree", () => {
  it("is idempotent: returns path without running git when .git file already exists", () => {
    const base = mkdtempSync(join(tmpdir(), "reagent-wt-test-"));
    const worktreesDir = join(base, "worktrees");
    const branchSlug = "fix-the-login-bug";
    const expectedPath = join(worktreesDir, branchSlug);

    // Pre-create the directory and a fake .git file to simulate existing worktree.
    mkdirSync(expectedPath, { recursive: true });
    writeFileSync(join(expectedPath, ".git"), "gitdir: ../../.git/worktrees/fix-the-login-bug\n");

    const result = provisionWorktree({
      repoPath: "/r",
      worktreesDir,
      branchSlug,
      branch: "reagent/fix-the-login-bug",
      baseBranch: "origin/development",
    });

    expect(result).toBe(expectedPath);
    // git should NOT have been invoked since the worktree already exists
    expect(execSync).not.toHaveBeenCalled();
  });

  it("calls git worktree add when the worktree path does not yet exist", () => {
    const base = mkdtempSync(join(tmpdir(), "reagent-wt-test-"));
    const worktreesDir = join(base, "worktrees");
    const branchSlug = "new-feature";
    const expectedPath = join(worktreesDir, branchSlug);

    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = provisionWorktree({
      repoPath: "/r",
      worktreesDir,
      branchSlug,
      branch: "reagent/new-feature",
      baseBranch: "origin/development",
    });

    expect(result).toBe(expectedPath);
    expect(execSync).toHaveBeenCalledWith(
      `git worktree add -b reagent/new-feature ${expectedPath} origin/development`,
      { cwd: "/r" },
    );
  });
});
