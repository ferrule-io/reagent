# Unit: bridge-terminal-resume

## Goal

Remove the `origin === "phone"` guard in the HTTP decision endpoint so that terminal-origin items are also re-launched via `launcher.resume()` when a decision lands. After this change both phone and terminal work items share a single event-driven resume path: the bridge re-launches `resume <id>` on any approve/reject/revise decision regardless of origin. Update the existing test that asserts terminal-origin items are NOT re-launched to instead assert that they ARE.

## Scope

- `bridge/src/http/server.ts`
- `bridge/test/http-api.test.ts`

No other files are touched by this unit.

## Approach

### 1. Remove the origin guard in `bridge/src/http/server.ts`

Current code (lines ~141-145):

```typescript
// Phone-origin work has no live session waiting — re-launch one to continue.
// Terminal-origin work has a live polling session that will continue itself.
// For revise, re-launch so the skill can regenerate the proposal.
if (item.origin === "phone") {
  launcher?.resume({ id, repoPath: item.repoPath });
}
```

Replace with (drop the `if` guard, update the comment):

```typescript
// Re-launch a session to continue — both phone and terminal items are now
// event-driven: the skill opens the gate once and exits, so the bridge must
// resume it on every decision.
launcher?.resume({ id, repoPath: item.repoPath });
```

No other logic in `server.ts` needs to change. The `registry`, `store`, and `CheckpointStore` do not branch on `origin`; neither does `launcher.resume()`.

### 2. Update the test in `bridge/test/http-api.test.ts`

The test at lines 419-439 is titled `"does NOT re-launch on approval of a terminal item (its live session continues)"`. It creates a terminal-origin item, posts an approve decision, then asserts `launcher.resumes` is empty.

Change this test to reflect the new behaviour:

- Rename the test: `"re-launches resume on approval of a terminal item"`.
- Keep the same setup (terminal-origin item, open checkpoint, pending gate).
- Post `{ result: "approve" }` as before.
- Assert `launcher.resumes` equals `[{ id: "t", repoPath: "/tmp/repo" }]` (previously asserted empty).

Optionally add a parallel test `"re-launches resume on revise of a terminal item"` mirroring the existing `"re-launches resume on revise of a phone item"` test (lines 397-417), using a terminal-origin item. This confirms the guard removal covers all three decision results.

### 3. Verify no other `origin`-keyed logic breaks

Before committing, confirm by grep that no other file in `bridge/src/` branches on `item.origin` in a way that would break:

- `bridge/src/state/types.ts` — `origin` is just a field definition (`"terminal" | "phone"`). No branching.
- `bridge/src/mcp/server.ts` — passes `origin` through to `store.create()`. No branching on its value.
- `bridge/src/state/store.ts` — stores `origin` verbatim. No branching.
- `bridge/src/registry/registry.ts` — no reference to `origin`.
- `bridge/src/launch/launcher.ts` — `SessionLauncher.resume()` takes `{ id, repoPath }` with no `origin`. No change needed.

The only consumer that branches on `origin` is the decision handler in `server.ts`, which is exactly what we are relaxing.

### 4. Run checks

From the `bridge/` directory:

```
npm run lint
npm run build
npm test
```

All three must pass. The changed test (`"re-launches resume on approval of a terminal item"`) must now pass with the new assertion.

## Acceptance criteria

1. `bridge/src/http/server.ts`: the `if (item.origin === "phone")` guard around `launcher?.resume(...)` is gone; `launcher?.resume(...)` is called unconditionally for any decided item (approve, reject, or revise).
2. The comment above the `resume` call is updated to explain that both origins are event-driven.
3. `bridge/test/http-api.test.ts`: the test previously titled "does NOT re-launch on approval of a terminal item" is updated to assert that `launcher.resumes` equals `[{ id: "t", repoPath: "/tmp/repo" }]` (i.e., re-launch DOES happen).
4. No new source files are created; no files outside the declared scope are modified.
5. `npm run lint`, `npm run build`, and `npm test` all exit 0 in the `bridge/` directory.
6. The `origin` field on `WorkItem` is not removed or changed — it remains useful metadata for display and future use.
