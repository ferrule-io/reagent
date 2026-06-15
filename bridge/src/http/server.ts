import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import type { StateStore } from "../state/store.js";
import type { Registry } from "../registry/registry.js";
import type { CheckpointStore } from "../checkpoints/checkpoints.js";

export interface HttpDeps {
  store: StateStore;
  registry: Registry;
  checkpoints: CheckpointStore;
}

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..", "web");

export function buildHttpServer(deps: HttpDeps): FastifyInstance {
  const { store, registry, checkpoints } = deps;
  const app = Fastify({ logger: false });

  app.get("/api/items", async () => registry.list());

  app.get("/api/items/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = registry.get(id) ?? store.get(id);
    if (!item) return reply.code(404).send({ error: "not found" });
    return item;
  });

  app.post("/api/items", async (req, reply) => {
    const { title, repoPath, request } = req.body as {
      title: string; repoPath: string; request: string;
    };
    const id = `wi_${randomUUID().slice(0, 8)}`;
    const item = store.create({ id, title, repoPath, request, origin: "phone" });
    registry.upsert(item);
    return reply.code(201).send(item);
  });

  app.post("/api/items/:id/decision", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { result, note } = req.body as { result: "approve" | "reject"; note?: string };
    const item = store.get(id);
    const cpId = item?.pendingCheckpoint?.id;
    if (!item || !cpId || !checkpoints.has(cpId)) {
      return reply.code(409).send({ error: "no pending checkpoint" });
    }
    checkpoints.resolve(cpId, { result, note });
    return { ok: true };
  });

  app.get("/api/stream", (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write(`event: hello\ndata: {}\n\n`);
    reply.hijack();
    const off = registry.subscribe((item) => {
      reply.raw.write(`event: item\ndata: ${JSON.stringify(item)}\n\n`);
    });
    req.raw.on("close", () => off());
  });

  for (const [route, file, type] of [
    ["/", "index.html", "text/html"],
    ["/app.js", "app.js", "text/javascript"],
    ["/manifest.webmanifest", "manifest.webmanifest", "application/manifest+json"],
  ] as const) {
    app.get(route, async (_req, reply) => {
      reply.type(type);
      return readFileSync(join(webDir, file), "utf8");
    });
  }

  return app;
}
