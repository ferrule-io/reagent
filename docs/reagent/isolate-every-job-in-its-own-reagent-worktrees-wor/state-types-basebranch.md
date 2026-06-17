# Unit: state-types-basebranch

## Goal

Add a `baseBranch` field to `WorkItem` (the durable per-item state) and to `CreateInput` (the store creation input) so that the resolved base ref is persisted alongside the work item and available to the executor and reviewer without re-deriving it.

## Scope

```
bridge/src/state/types.ts
bridge/src/state/store.ts
```

## Approach

### 1. `bridge/src/state/types.ts` — add `baseBranch` to `WorkItem`

Insert an optional field after the existing `worktreePath` field:

```ts
/** Resolved git base ref this item's branch was created from (e.g. "origin/development"). */
baseBranch?: string;
```

The field is optional (`?`) for backward-compatibility with persisted YAML files that predate this change.

### 2. `bridge/src/state/store.ts` — add `baseBranch` to `CreateInput` and propagate it

Add an optional `baseBranch?: string` field to the `CreateInput` interface.

In the `create` method, spread `baseBranch` into the new `WorkItem` object alongside the existing `branch` and `worktreePath` pattern:

```ts
...(input.baseBranch !== undefined ? { baseBranch: input.baseBranch } : {}),
```

No other logic in `store.ts` changes.

## Acceptance criteria

1. `bridge/src/state/types.ts`: `WorkItem` has an optional `baseBranch?: string` field.
2. `bridge/src/state/types.ts`: the field carries a JSDoc comment explaining it holds the resolved base ref.
3. `bridge/src/state/store.ts`: `CreateInput` has an optional `baseBranch?: string` field.
4. `bridge/src/state/store.ts`: the `create` method conditionally spreads `baseBranch` into the new `WorkItem` (same pattern as `branch` and `worktreePath`).
5. No other files are modified.
6. TypeScript compilation passes (no type errors introduced).
