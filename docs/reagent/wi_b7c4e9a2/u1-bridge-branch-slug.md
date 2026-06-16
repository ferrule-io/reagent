# Unit u1 — Bridge: derive human-readable branch slugs

**Work item:** wi_b7c4e9a2 — Human-readable branch names

## Goal
Make the bridge compute a human-readable git branch name for every work item at
creation time and store it in the existing `WorkItem.branch` field, so branches read
as `reagent/<slug-of-title>` instead of `reagent/wi_<hex>`. The internal `wi_<hex>` id
is unchanged and remains the storage key.

## Scope (files)
- `bridge/src/**` (slugify helper, item-creation paths, types if needed)
- `bridge/scripts/stub-session.ts`
- `bridge/test/**`

Explicitly NOT in scope: `skills/**`, `agents/**`, `docs/**` (handled in u2).

## Approach
1. **slugify helper.** Add a `slugify(title: string): string` to the bridge (e.g.
   `bridge/src/state/slug.ts` or a `util/` module). Behaviour: lowercase, replace any
   run of non-alphanumeric chars with a single hyphen, trim leading/trailing hyphens,
   collapse repeats, cap length (~50 chars, no trailing partial word/hyphen). Empty or
   all-junk titles fall back to a stable default derived from the id (e.g. the `wi_<hex>`
   itself) so the branch is never empty.
2. **Uniqueness.** Add a `branchFor(title, existingBranches: Set<string>): string` (or
   fold into the creation path) that returns `reagent/<slug>`, appending `-2`, `-3`, …
   if that branch is already taken by another item. Source of existing branches: the
   registry/store of current items.
3. **Derive at creation.** Set `item.branch` when an item is first created, in BOTH:
   - `register_work_item` (`bridge/src/mcp/server.ts`) — terminal origin.
   - `POST /api/items` (`bridge/src/http/server.ts`) — phone origin.
   Only set on creation; do not overwrite an existing `branch` on refresh/no-op register.
4. **report_status.** Keep honoring an explicit `branch` param (executor still reports it),
   but it should now match the pre-derived value. No behaviour regression.
5. **stub-session.ts.** Use the item's stored/derived branch instead of literal
   `reagent/${id}`.

## Acceptance criteria
- New unit tests cover `slugify` (typical titles, punctuation, unicode/junk, length cap,
  empty fallback) and collision disambiguation (`-2`, `-3`).
- Creating an item via `register_work_item` and via `POST /api/items` yields a
  `branch` of the form `reagent/<slug>` with no `wi_` in it (unless the title was empty).
- Two items with the same title get distinct branches.
- Existing bridge tests still pass (`npm test` in `bridge/`); `wi_*` storage filters and
  the `branch` field semantics are unchanged for everything except its computed value.
