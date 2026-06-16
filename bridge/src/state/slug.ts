/**
 * Derives a human-readable git branch slug from a work-item title.
 */

const MAX_SLUG_LEN = 50;

/**
 * Convert a free-form title into a git-branch-safe slug:
 *   - lowercase
 *   - replace runs of non-alphanumeric chars with a single hyphen
 *   - trim leading/trailing hyphens
 *   - cap at MAX_SLUG_LEN characters without leaving a trailing hyphen
 */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) return "";

  if (slug.length <= MAX_SLUG_LEN) return slug;

  const truncated = slug.slice(0, MAX_SLUG_LEN);
  // Remove trailing hyphen if the truncation point landed on one.
  return truncated.replace(/-+$/, "");
}

/**
 * Derive a `reagent/<slug>` branch name for the given title, appending
 * `-2`, `-3`, … if a branch with the base slug is already taken.
 *
 * @param title          The work-item title.
 * @param id             The work-item id (used as fallback if title is empty/junk).
 * @param existingBranches  The set of `branch` values already in use by other items.
 */
export function branchFor(
  title: string,
  id: string,
  existingBranches: Set<string>,
): string {
  const slug = slugify(title) || id;
  const base = `reagent/${slug}`;

  if (!existingBranches.has(base)) return base;

  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!existingBranches.has(candidate)) return candidate;
  }
}
