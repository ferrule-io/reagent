# Unit: http-worktree-first

## Goal

Mirror the worktree-first registration logic in `bridge/src/http/server.ts`'s `POST /api/items` handler: resolve the base ref, create the worktree + branch at creation time (keyed by slug), and persist `baseBranch` on the stored item.

## Scope

```
bridge/src/http/server.ts
```

## Approach

### 1. Import `resolveBaseBranch` and `provisionWorktree`

Add to the existing import block:
```ts
import { resolveBaseBranch, provisionWorktree } from "../state/worktree.js";
```

Remove the now-unused `mkdirSync` import from `"node:fs"` if it is no longer needed elsewhere in this file. Keep all other imports.

### 2. Update `POST /api/items` handler

Current logic (abbreviated):
```ts
const branch = branchFor(title, id, existingBranches);
mkdirSync(worktreesDir, { recursive: true });
const worktreePath = join(worktreesDir, id);   // keyed by id — OLD
const item = store.create({ id, title, repoPath, request, origin: "phone", branch, worktreePath });
```

New logic:
```ts
const branch = branchFor(title, id, existingBranches);
const branchSlug = branch.replace(/^reagent\//, "");

const baseBranch = resolveBaseBranch(repoPath);

const effectiveWorktreesDir = worktreesDir || join(repoPath, ".reagent", "worktrees");

const worktreePath = provisionWorktree({
  repoPath,
  worktreesDir: effectiveWorktreesDir,
  branchSlug,
  branch,
  baseBranch,
});

const item = store.create({
  id,
  title,
  repoPath,
  request,
  origin: "phone",
  branch,
  worktreePath,
  baseBranch,
});
```

Note: `join` from `"node:path"` is already imported; add it to the import if not already there (check the existing imports — `dirname` and `join` are already imported from `"node:path"`).

### 3. No other handlers change

All other routes (`GET`, `DELETE`, `/api/items/:id/decision`, etc.) are unchanged.

## Acceptance criteria

1. `bridge/src/http/server.ts`: imports `resolveBaseBranch` and `provisionWorktree` from `"../state/worktree.js"`.
2. `POST /api/items` calls `resolveBaseBranch(repoPath)` to get the base ref.
3. The worktree path is computed as `join(effectiveWorktreesDir, branchSlug)` where `branchSlug = branch.replace(/^reagent\//, "")` — NOT `join(..., id)`.
4. `provisionWorktree(...)` is called before `store.create(...)`.
5. `store.create(...)` includes `baseBranch` in its argument.
6. No `mkdirSync(worktreesDir, ...)` call remains in the handler (moved into `provisionWorktree`).
7. All other routes are unmodified (no unrelated changes in the diff).
8. TypeScript compilation passes.
