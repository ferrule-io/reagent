# Unit: mcp-worktree-first

## Goal

Update `bridge/src/mcp/server.ts` so that `register_work_item` creates the git worktree and branch as the *first* side-effect at registration time — off an explicit, resolved base ref — rather than deferring to the executor. The worktree path is derived from the branch slug (repo-relative), and `baseBranch` is persisted. The `complete_work_item` teardown (existing) remains unchanged.

## Scope

```
bridge/src/mcp/server.ts
```

## Approach

### 1. Import `resolveBaseBranch` and `provisionWorktree` from `../state/worktree.js`

Add to the existing import block:
```ts
import { resolveBaseBranch, provisionWorktree } from "../state/worktree.js";
```

Remove the now-unused `mkdirSync` import (it moves into `worktree.ts`). Keep `execSync` only if it is still needed directly (it is used in `complete_work_item`; keep it).

### 2. Update `McpDeps` interface

Change `worktreesDir: string` to keep as-is (it will now be `""` by default from config, meaning "derive from repoPath"). No interface shape change needed — the empty-string convention is handled inside `provisionWorktree`.

### 3. Rewrite the `register_work_item` handler

Current logic (abbreviated):
```ts
const branch = branchFor(title, id, existingBranches);
mkdirSync(worktreesDir, { recursive: true });
const worktreePath = join(worktreesDir, id);   // keyed by id — OLD
store.create({ id, title, repoPath: absoluteRepoPath, request, origin, branch, worktreePath });
```

New logic:
```ts
const branch = branchFor(title, id, existingBranches);
const branchSlug = branch.replace(/^reagent\//, "");

// Resolve the base ref: use REAGENT_WORKTREES_DIR as override signal only;
// base ref resolution is independent.
const baseBranch = resolveBaseBranch(absoluteRepoPath);

// Effective worktrees dir: config override or repo-relative default.
const effectiveWorktreesDir = worktreesDir || join(absoluteRepoPath, ".reagent", "worktrees");

const worktreePath = provisionWorktree({
  repoPath: absoluteRepoPath,
  worktreesDir: effectiveWorktreesDir,
  branchSlug,
  branch,
  baseBranch,
});

store.create({
  id,
  title,
  repoPath: absoluteRepoPath,
  request,
  origin,
  branch,
  worktreePath,
  baseBranch,
});
```

Key changes:
- Worktree path is `join(effectiveWorktreesDir, branchSlug)` (keyed by slug, not id).
- `baseBranch` resolved and persisted.
- `provisionWorktree` creates the git worktree + branch atomically.

### 4. `complete_work_item` handler

No change needed to the teardown logic — it already reads `item.worktreePath` from the store and runs `git worktree remove --force`. The path stored is now slug-keyed rather than id-keyed, but the teardown logic does not care about the path structure.

### 5. No schema changes to MCP tool inputs

The `register_work_item` tool's `inputSchema` remains unchanged (no new user-facing fields). `baseBranch` is derived server-side.

## Acceptance criteria

1. `bridge/src/mcp/server.ts`: imports `resolveBaseBranch` and `provisionWorktree` from `"../state/worktree.js"`.
2. The `register_work_item` handler calls `resolveBaseBranch(absoluteRepoPath)` to get the base ref.
3. The worktree path is computed as `join(effectiveWorktreesDir, branchSlug)` where `branchSlug = branch.replace(/^reagent\//, "")` — NOT `join(..., id)`.
4. `provisionWorktree(...)` is called before `store.create(...)`.
5. `store.create(...)` is called with `baseBranch` in its argument.
6. `complete_work_item` is unchanged in semantics (still removes worktree on terminal state).
7. No `mkdirSync(worktreesDir, ...)` call remains in this file (it moved into `provisionWorktree`).
8. TypeScript compilation passes.
