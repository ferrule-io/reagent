# Unit: config-and-gitignore

## Goal

Change the default `worktreesDir` in `bridge/src/config.ts` from the home-directory path (`~/.reagent/worktrees`) to a repo-relative path that the callers compute at use-time, and add `/.reagent/` to `.gitignore` so that in-repo worktrees (`.reagent/worktrees/<slug>`) are never accidentally committed to the shared checkout.

## Scope

```
bridge/src/config.ts
.gitignore
```

## Approach

### 1. Update `bridge/src/config.ts`

The current default is:
```ts
worktreesDir: process.env.REAGENT_WORKTREES_DIR ?? join(homedir(), ".reagent", "worktrees"),
```

The new design: worktrees live at `<repoPath>/.reagent/worktrees/<slug>`, so the config-level `worktreesDir` becomes a *base directory* override. Remove the home-relative default and instead set the default to an empty string sentinel `""`, meaning "derive from repoPath at call-time". Callers (MCP and HTTP handlers) already receive `worktreesDir` from the config; when it is `""` they will fall through to the repo-relative path via the `provisionWorktree` helper in `bridge/src/state/worktree.ts`.

Concretely:
- Change the `worktreesDir` default value to `process.env.REAGENT_WORKTREES_DIR ?? ""`.
- Update the `Config` interface JSDoc comment to: `/** Base directory for git worktrees. Empty string = derive from repoPath at registration time (default). Override with REAGENT_WORKTREES_DIR. */`
- Remove the `homedir` import if it is no longer used elsewhere in the file.

### 2. Update `.gitignore`

Append a new line `/.reagent/` to `.gitignore` (repo-root level). The leading `/` anchors it to the repo root so it does not affect any sub-directory named `.reagent`.

Current `.gitignore` contains only `.DS_Store`. Add `/.reagent/` on a new line.

## Acceptance criteria

1. `bridge/src/config.ts`: the `worktreesDir` default is `process.env.REAGENT_WORKTREES_DIR ?? ""` (the `homedir()` call and `~/.reagent/worktrees` path are gone from the default expression).
2. `bridge/src/config.ts`: the `Config.worktreesDir` JSDoc reflects the new "empty = derive from repoPath" semantics.
3. `bridge/src/config.ts`: the `homedir` import from `"node:os"` is removed if it is no longer referenced (no dead imports).
4. `.gitignore`: contains the line `/.reagent/` (the diff shows it added).
5. No other file is modified.
