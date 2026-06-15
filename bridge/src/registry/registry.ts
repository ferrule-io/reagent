import type { WorkItem } from "../state/types.js";
import type { StateStore } from "../state/store.js";

type Listener = (item: WorkItem) => void;

export class Registry {
  private readonly items = new Map<string, WorkItem>();
  private readonly listeners = new Set<Listener>();

  loadFrom(store: StateStore): void {
    for (const item of store.list()) this.items.set(item.id, item);
  }

  upsert(item: WorkItem): void {
    this.items.set(item.id, item);
    for (const l of this.listeners) l(item);
  }

  get(id: string): WorkItem | undefined {
    return this.items.get(id);
  }

  list(): WorkItem[] {
    return [...this.items.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
