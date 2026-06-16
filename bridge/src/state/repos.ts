import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { parse, stringify } from "yaml";

export interface Repo {
  id: string;
  name: string;
  path: string;
  addedAt: string; // ISO
}

export class RepoStore {
  private readonly file: string;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "repos.yaml");
  }

  list(): Repo[] {
    try {
      const raw = readFileSync(this.file, "utf8");
      const parsed = parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as Repo[];
    } catch {
      return [];
    }
  }

  add({ name, path: repoPath }: { name?: string; path: string }): Repo {
    const trimmedPath = repoPath.trim();
    const existing = this.list();

    // Deduplicate: return existing entry if path already registered
    const dup = existing.find((r) => r.path === trimmedPath);
    if (dup) return dup;

    const resolvedName =
      name && name.trim() ? name.trim() : basename(trimmedPath);

    const repo: Repo = {
      id: `repo_${randomUUID().slice(0, 8)}`,
      name: resolvedName,
      path: trimmedPath,
      addedAt: new Date().toISOString(),
    };

    const updated = [...existing, repo];
    writeFileSync(this.file, stringify(updated), "utf8");
    return repo;
  }

  remove(id: string): boolean {
    const existing = this.list();
    const next = existing.filter((r) => r.id !== id);
    if (next.length === existing.length) return false;
    writeFileSync(this.file, stringify(next), "utf8");
    return true;
  }
}
