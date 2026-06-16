import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import type { WorkItem } from "./types.js";

export interface CreateInput {
  id: string;
  title: string;
  repoPath: string;
  request: string;
  origin: "terminal" | "phone";
  /** Pre-derived human-readable branch name (e.g. `reagent/<slug>`). */
  branch?: string;
}

export class StateStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private pathFor(id: string): string {
    return join(this.dir, `${id}.yaml`);
  }

  create(input: CreateInput): WorkItem {
    const now = new Date().toISOString();
    const item: WorkItem = {
      id: input.id,
      title: input.title,
      repoPath: input.repoPath,
      request: input.request,
      origin: input.origin,
      phase: "INTAKE",
      log: [],
      createdAt: now,
      updatedAt: now,
      ...(input.branch !== undefined ? { branch: input.branch } : {}),
    };
    this.write(item);
    return item;
  }

  get(id: string): WorkItem | undefined {
    try {
      return parse(readFileSync(this.pathFor(id), "utf8")) as WorkItem;
    } catch {
      return undefined;
    }
  }

  update(id: string, mutate: (item: WorkItem) => void): WorkItem {
    const item = this.get(id);
    if (!item) throw new Error(`work item not found: ${id}`);
    mutate(item);
    item.updatedAt = new Date().toISOString();
    this.write(item);
    return item;
  }

  write(item: WorkItem): void {
    writeFileSync(this.pathFor(item.id), stringify(item), "utf8");
  }

  list(): WorkItem[] {
    return readdirSync(this.dir)
      .filter((f) => f.startsWith("wi_") && f.endsWith(".yaml"))
      .map((f) => parse(readFileSync(join(this.dir, f), "utf8")) as WorkItem);
  }
}
