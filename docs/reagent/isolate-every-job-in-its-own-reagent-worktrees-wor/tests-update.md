# Unit: tests-update

## Goal

Update the existing MCP and HTTP test files to reflect the new worktree-first, slug-keyed behavior: mock `git worktree add` calls so tests do not require a real git repo, assert `baseBranch` is persisted, and verify the worktree path is slug-keyed (not id-keyed). Also add a unit-level test file for `bridge/src/state/worktree.ts`.

## Scope

```
bridge/test/mcp-server.test.ts
bridge/test/http-api.test.ts
bridge/test/worktree.test.ts
```

## Approach

### 1. `bridge/test/worktree.test.ts` — new test file

Test `resolveBaseBranch` and `provisionWorktree` in isolation:

- **`resolveBaseBranch` with override**: pass a non-empty override string, assert it is returned verbatim without running git.
- **`resolveBaseBranch` without override**: mock `execSync` (via `vi.mock('node:child_process', ...)`) to return `"refs/remotes/origin/main\n"`, assert the result is `"origin/main"`.
- **`resolveBaseBranch` fallback**: mock `execSync` to throw, assert the return value is `"origin/HEAD"`.
- **`provisionWorktree` idempotent**: create a temp dir, write a fake `.git` file inside it at the expected path, call `provisionWorktree` — assert it returns the path without calling git.
- **`provisionWorktree` creates worktree**: mock `execSync`, call `provisionWorktree` with a non-existent path, assert `git worktree add -b <branch> <path> <baseBranch>` was called.

Use `vi.mock` / `vi.spyOn` from vitest for `execSync`. Use `mkdtempSync` for temp directories.

### 2. `bridge/test/mcp-server.test.ts` — update existing tests

The test `beforeEach` builds a `McpServer` via `buildMcpServer({ ..., worktreesDir: join(dir, "worktrees") })`. The `register_work_item` handler now calls `provisionWorktree` which shells out to git. Tests need to suppress this:

**Option**: `vi.mock("../src/state/worktree.js", ...)` at the top of the test file to stub both `resolveBaseBranch` (returns `"origin/development"`) and `provisionWorktree` (returns a synthetic path derived from its inputs without touching the filesystem).

Stub implementation for `provisionWorktree`:
```ts
vi.mock("../src/state/worktree.js", () => ({
  resolveBaseBranch: (_repoPath: string, override?: string) => override ?? "origin/development",
  provisionWorktree: (opts: { worktreesDir: string; branchSlug: string }) =>
    join(opts.worktreesDir, opts.branchSlug),
}));
```

**New assertions** to add in existing tests (where applicable):

- After `register_work_item`, assert `store.get(id)?.baseBranch === "origin/development"`.
- After `register_work_item`, assert `store.get(id)?.worktreePath` ends with the branch slug (not the item id). For example for branch `reagent/fix-the-login-bug`, the path ends with `fix-the-login-bug`.

No existing test assertions should be removed — only add the new ones.

### 3. `bridge/test/http-api.test.ts` — update existing tests

Same approach as MCP tests:

Add at the top of the file (before the first `describe`):
```ts
vi.mock("../src/state/worktree.js", () => ({
  resolveBaseBranch: (_repoPath: string, override?: string) => override ?? "origin/development",
  provisionWorktree: (opts: { worktreesDir: string; branchSlug: string }) =>
    join(opts.worktreesDir, opts.branchSlug),
}));
```

Add `import { join } from "node:path";` if not already present (it is not currently imported in `http-api.test.ts`).

**New assertions**:

- In "creates a phone-origin work item": assert `body.baseBranch === "origin/development"`.
- In "derives a human-readable branch when creating a phone-origin item": assert the `worktreePath` stored in the item ends with `improve-onboarding-flow` (the slug), not the item id.

No existing test assertions should be removed.

## Acceptance criteria

1. `bridge/test/worktree.test.ts` is a new file containing at least 5 test cases covering `resolveBaseBranch` (with override, without override, fallback) and `provisionWorktree` (idempotent, creates worktree).
2. `bridge/test/mcp-server.test.ts`: has `vi.mock("../src/state/worktree.js", ...)` stubbing both exports; all pre-existing tests still pass with the mock in place.
3. `bridge/test/mcp-server.test.ts`: at least one test asserts `baseBranch === "origin/development"` on the stored item.
4. `bridge/test/mcp-server.test.ts`: at least one test asserts `worktreePath` ends with the branch slug (not item id).
5. `bridge/test/http-api.test.ts`: has `vi.mock("../src/state/worktree.js", ...)` stubbing both exports; all pre-existing tests still pass.
6. `bridge/test/http-api.test.ts`: at least one test asserts `body.baseBranch === "origin/development"`.
7. `bridge/test/http-api.test.ts`: at least one test asserts the stored item's `worktreePath` ends with the branch slug.
8. `npm test` (or `vitest`) passes for the bridge package with no failures.
