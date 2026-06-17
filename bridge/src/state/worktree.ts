import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface WorktreeOpts {
  repoPath: string;
  worktreesDir: string;
  branchSlug: string;
  branch: string;
  baseBranch: string;
}

/**
 * Resolve the base branch ref to use when creating a new worktree branch.
 *
 * If `override` is a non-empty string it is returned verbatim. Otherwise the
 * remote HEAD is resolved via `git symbolic-ref refs/remotes/origin/HEAD` and
 * the `refs/remotes/` prefix is stripped to yield e.g. `origin/development`.
 * Falls back to `"origin/HEAD"` if the command fails.
 */
export function resolveBaseBranch(repoPath: string, override?: string): string {
  if (override && override.trim() !== "") {
    return override;
  }

  try {
    const raw = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
      cwd: repoPath,
    })
      .toString()
      .trim();
    // raw is e.g. "refs/remotes/origin/main" — strip the prefix
    return raw.replace(/^refs\/remotes\//, "");
  } catch (err) {
    process.stderr.write(
      `[worktree] warning: could not resolve origin/HEAD (${String(err)}); falling back to origin/HEAD\n`
    );
    return "origin/HEAD";
  }
}

/**
 * Idempotently provision a git worktree for a reagent branch.
 *
 * - Derives the worktree path as `join(worktreesDir, branchSlug)`.
 * - Creates `worktreesDir` if it does not exist.
 * - If the worktree directory already contains a `.git` file the function
 *   returns immediately without re-running git (idempotent).
 * - Otherwise runs `git worktree add -b <branch> <path> <baseBranch>`.
 *   If that fails because the branch already exists (collision), retries
 *   without `-b` to check out the existing branch instead.
 *
 * Returns the absolute worktree path.
 */
export function provisionWorktree(opts: WorktreeOpts): string {
  const { repoPath, worktreesDir, branchSlug, branch, baseBranch } = opts;

  const worktreePath = join(worktreesDir, branchSlug);

  mkdirSync(worktreesDir, { recursive: true });

  // Idempotent: if already provisioned, do nothing.
  if (existsSync(join(worktreePath, ".git"))) {
    return worktreePath;
  }

  try {
    execSync(
      `git worktree add -b ${branch} ${worktreePath} ${baseBranch}`,
      { cwd: repoPath }
    );
  } catch {
    // Branch may already exist — retry without -b to check it out.
    execSync(
      `git worktree add ${worktreePath} ${branch}`,
      { cwd: repoPath }
    );
  }

  return worktreePath;
}
