import { describe, it, expect } from "vitest";
import { slugify, branchFor } from "../src/state/slug.js";

describe("slugify", () => {
  it("lowercases and hyphenates a typical title", () => {
    expect(slugify("Human-readable branch names")).toBe("human-readable-branch-names");
  });

  it("collapses runs of non-alphanumeric chars to a single hyphen", () => {
    expect(slugify("Fix  the   bug!!!")).toBe("fix-the-bug");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("  -- hello world --  ")).toBe("hello-world");
  });

  it("handles unicode / non-ASCII junk", () => {
    // Non-ascii chars are non-alphanumeric and should become hyphens
    expect(slugify("café résumé")).toBe("caf-r-sum");
  });

  it("returns empty string for all-junk input", () => {
    expect(slugify("---!!!---")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("caps length at 50 chars without a trailing hyphen", () => {
    const long = "word-".repeat(15); // 75 chars
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith("-")).toBe(false);
  });

  it("returns exactly 50 chars when input fits exactly", () => {
    const title = "a".repeat(50);
    expect(slugify(title)).toBe("a".repeat(50));
  });

  it("does not truncate mid-word when truncation lands on a hyphen boundary", () => {
    // 45 chars of 'a' + '-extra' = 51 chars total; slug should trim the trailing '-' at position 50
    const title = `${"a".repeat(45)}-extra`;
    const result = slugify(title);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith("-")).toBe(false);
  });
});

describe("branchFor", () => {
  it("returns reagent/<slug> for a fresh title with no conflicts", () => {
    expect(branchFor("Human-readable branch names", "wi_abc", new Set())).toBe(
      "reagent/human-readable-branch-names",
    );
  });

  it("appends -2 when the base branch is already taken", () => {
    const existing = new Set(["reagent/human-readable-branch-names"]);
    expect(branchFor("Human-readable branch names", "wi_abc", existing)).toBe(
      "reagent/human-readable-branch-names-2",
    );
  });

  it("appends -3 when -2 is also taken", () => {
    const existing = new Set([
      "reagent/human-readable-branch-names",
      "reagent/human-readable-branch-names-2",
    ]);
    expect(branchFor("Human-readable branch names", "wi_abc", existing)).toBe(
      "reagent/human-readable-branch-names-3",
    );
  });

  it("falls back to reagent/<id> when title is empty/all-junk", () => {
    expect(branchFor("", "wi_b7c4e9a2", new Set())).toBe("reagent/wi_b7c4e9a2");
    expect(branchFor("---!!!", "wi_b7c4e9a2", new Set())).toBe("reagent/wi_b7c4e9a2");
  });

  it("disambiguates id-fallback branches too", () => {
    const existing = new Set(["reagent/wi_b7c4e9a2"]);
    expect(branchFor("", "wi_b7c4e9a2", existing)).toBe("reagent/wi_b7c4e9a2-2");
  });
});
