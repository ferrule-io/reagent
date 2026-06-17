import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, mkdirSync } from "node:fs";
import type { StateStore } from "../state/store.js";
import type { RepoStore } from "../state/repos.js";
import type { Registry } from "../registry/registry.js";
import type { CheckpointStore } from "../checkpoints/checkpoints.js";
import type { SessionLauncher } from "../launch/launcher.js";
import { branchFor } from "../state/slug.js";

export interface HttpDeps {
  store: StateStore;
  repos: RepoStore;
  registry: Registry;
  checkpoints: CheckpointStore;
  /** Optional: when present, phone-submitted work is launched and re-launched on approval. */
  launcher?: SessionLauncher;
  worktreesDir: string;
}

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..", "web");

export function buildHttpServer(deps: HttpDeps): FastifyInstance {
  const { store, repos, registry, checkpoints, launcher, worktreesDir } = deps;
  const app = Fastify({ logger: false, forceCloseConnections: true });

  // ── Repo registry routes ─────────────────────────────────────────────────

  app.get("/api/repos", async () => repos.list());

  app.post("/api/repos", async (req, reply) => {
    const { name, path } = req.body as { name?: string; path?: string };
    if (!path || !path.trim()) {
      return reply.code(400).send({ error: "path is required" });
    }
    const repo = repos.add({ name, path });
    return reply.code(201).send(repo);
  });

  app.delete("/api/repos/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const removed = repos.remove(id);
    if (!removed) return reply.code(404).send({ error: "repo not found" });
    return { ok: true };
  });

  // ── Work item routes ─────────────────────────────────────────────────────

  app.get("/api/items", async () => registry.list());

  app.get("/api/items/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = registry.get(id) ?? store.get(id);
    if (!item) return reply.code(404).send({ error: "not found" });
    return item;
  });

  app.post("/api/items", async (req, reply) => {
    const { title, repoPath, request } = req.body as {
      title: string;
      repoPath: string;
      request: string;
    };
    const id = `wi_${randomUUID().slice(0, 8)}`;
    // Derive a human-readable branch slug at creation time; avoid collisions with existing items.
    const existingBranches = new Set(
      store
        .list()
        .map((item) => item.branch)
        .filter(Boolean) as string[],
    );
    const branch = branchFor(title, id, existingBranches);
    mkdirSync(worktreesDir, { recursive: true });
    const worktreePath = join(worktreesDir, id);
    const item = store.create({
      id,
      title,
      repoPath,
      request,
      origin: "phone",
      branch,
      worktreePath,
    });
    registry.upsert(item);
    // Launch a headless session to drive this work item (investigate -> open gate -> exit).
    launcher?.startAsync({ id, repoPath, request });
    return reply.code(201).send(item);
  });

  app.post("/api/items/:id/decision", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { result, note } = req.body as { result: "approve" | "reject" | "revise"; note?: string };
    if (result !== "approve" && result !== "reject" && result !== "revise") {
      return reply.code(400).send({ error: "result must be 'approve', 'reject', or 'revise'" });
    }
    const item = store.get(id);
    const cpId = item?.pendingCheckpoint?.id;
    if (!item || !cpId) {
      return reply.code(409).send({ error: "no pending checkpoint" });
    }
    const decision = { result, note };
    const decidedAt = new Date().toISOString();
    // Persist the decision onto the work item so it survives bridge restarts and
    // is visible via GET /api/items/:id. The MCP await_decision path also writes
    // this, but the HTTP route must do it too for phone-origin items whose live
    // session may have already exited.
    store.update(id, (it) => {
      if (it.pendingCheckpoint) {
        it.pendingCheckpoint.decision = { ...decision, decidedAt };
      }
      // On revise: append feedback and keep phase as PROPOSE
      if (result === "revise") {
        if (!it.feedback) it.feedback = [];
        it.feedback.push({ at: decidedAt, note: note ?? "" });
        it.phase = "PROPOSE";
      }
    });
    // Wake any in-flight awaitDecision calls (terminal-origin sessions polling).
    if (checkpoints.has(cpId)) {
      checkpoints.resolve(cpId, decision);
    }
    // Phone-origin work has no live session waiting — re-launch one to continue.
    // Terminal-origin work has a live polling session that will continue itself.
    // For revise, re-launch so the skill can regenerate the proposal.
    if (item.origin === "phone") {
      launcher?.resume({ id, repoPath: item.repoPath });
    }
    return { ok: true };
  });

  app.get("/api/stream", (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write("event: hello\ndata: {}\n\n");
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
