import chokidar, { type FSWatcher } from "chokidar";
import { basename } from "node:path";
import type { StateStore } from "../state/store.js";
import type { Registry } from "./registry.js";

export class Watcher {
  private fsw?: FSWatcher;

  constructor(
    private readonly dir: string,
    private readonly store: StateStore,
    private readonly registry: Registry,
  ) {}

  async start(): Promise<void> {
    this.fsw = chokidar.watch(this.dir, { ignoreInitial: false });
    const onChange = (path: string) => {
      const name = basename(path);
      if (!name.startsWith("wi_") || !name.endsWith(".yaml")) return;
      const id = basename(path, ".yaml");
      const item = this.store.get(id);
      if (item) this.registry.upsert(item);
    };
    this.fsw.on("add", onChange).on("change", onChange);
    await new Promise<void>((resolve) => this.fsw!.on("ready", () => resolve()));
  }

  async stop(): Promise<void> {
    await this.fsw?.close();
  }
}
