# Unit: worktree-provisioner

## Goal

Introduce a shared helper module `bridge/src/state/worktree.ts` that centralises all worktree-provisioning logic: deriving the repo-relative worktree path from the branch slug, resolving the configured base branch via `git symbolic-ref`, and atomically creating the git worktree + branch off that base ref. Both the MCP and HTTP handlers import from this module so neither duplicates the logic (keeping those two handlers as mutually-exclusive units).

## Scope

```
bridge/src/state/worktree.ts
```

(New file. No existing file is modified by this unit.)

## Approach

### 1. Create `bridge/src/state/worktree.ts`

Export two functions:

#### `resolveBaseBranch(repoPath: string, override?: string): string`

- If `override` is a non-empty string, return it directly (the caller supplied an explicit base).
- Otherwise shell out: `execSync('git symbolic-ref refs/remotes/origin/HEAD', { cwd: repoPath }).toString().trim()` which yields `refs/remotes/origin/main` (or `origin/development`, etc.). Strip the `refs/remotes/` prefix to get `origin/<branch>`.
- Wrap in try/catch: if the command fails (no remote or HEAD not set), fall back to `origin/HEAD` and log a warning to stderr.
- Return the resolved ref string, e.g. `"origin/development"`.

#### `provisionWorktree(opts: { repoPath: string; worktreesDir: string; branchSlug: string; branch: string; baseBranch: string; }): string`

- Derive the worktree path: `join(worktreesDir, branchSlug)`. `branchSlug` is the part after `reagent/` in the branch name (i.e. `branch.replace(/^reagent\//, '')`).
- `mkdirSync(worktreesDir, { recursive: true })` to ensure parent exists.
- Check if worktree already exists: `existsSync(join(worktreePath, '.git'))`.
  - If it already exists, return `worktreePath` immediately (idempotent — re-registration of the same item should not fail).
  - If it does NOT exist: run `git worktree add -b <branch> <worktreePath> <baseBranch>` via `execSync` with `{ cwd: repoPath }`.
    - The `-b` flag creates the new branch. If the branch already exists (collision), fall back to `git worktree add <worktreePath> <branch>` (without `-b`) so an existing branch is simply checked out.
- Return the absolute `worktreePath`.

### 2. Exports

Export both functions and the `WorktreeOpts` interface. Use named exports (no default export).

### 3. Dependencies

Only Node built-ins (`node:path`, `node:fs`, `node:child_process`) and no reagent-internal imports. This keeps the module dependency-free and independently testable.

## Acceptance criteria

1. `bridge/src/state/worktree.ts` is a new file with no prior existence in the diff.
2. `resolveBaseBranch` is exported and accepts `(repoPath: string, override?: string): string`.
3. `resolveBaseBranch` uses `git symbolic-ref refs/remotes/origin/HEAD` when no override is given; has a catch block with stderr fallback.
4. `provisionWorktree` is exported, accepts the documented `opts` shape, and returns a `string` (absolute worktree path).
5. `provisionWorktree` derives the path as `join(worktreesDir, branchSlug)` — NOT as `join(worktreesDir, id)`.
6. `provisionWorktree` is idempotent: when `.git` already exists at the computed path it returns without re-running git.
7. `provisionWorktree` uses `git worktree add -b <branch> <path> <baseBranch>` when the worktree directory does not exist.
8. No other existing file is modified.
