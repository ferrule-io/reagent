import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "./config.js";
import { StateStore } from "./state/store.js";
import { RepoStore } from "./state/repos.js";
import { Registry } from "./registry/registry.js";
import { Watcher } from "./registry/watcher.js";
import { CheckpointStore } from "./checkpoints/checkpoints.js";
import { buildMcpServer } from "./mcp/server.js";
import { buildHttpServer } from "./http/server.js";
import { Launcher, type SpawnLike } from "./launch/launcher.js";

async function main() {
  const cfg = loadConfig();
  const store = new StateStore(cfg.stateDir);
  const repos = new RepoStore(cfg.stateDir);
  const registry = new Registry();
  registry.loadFrom(store);
  const watcher = new Watcher(cfg.stateDir, store, registry);
  await watcher.start();
  const checkpoints = new CheckpointStore();

  // Re-open any persisted-but-unresolved checkpoints so awaiting sessions resume.
  for (const item of store.list()) {
    const cp = item.pendingCheckpoint;
    if (cp && !cp.decision) checkpoints.open(item.id, cp.id, cp.prompt);
  }

  const mcpDeps = { store, registry, checkpoints, checkpointPollMs: cfg.checkpointPollMs, worktreesDir: cfg.worktreesDir };
  // The reagent plugin is the repo root (this file lives at <repo>/bridge/{src,dist}/index).
  const pluginDir =
    process.env.REAGENT_PLUGIN_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const launcher = new Launcher(spawn as unknown as SpawnLike, {
    pluginDir,
    permissionMode: cfg.launchPermissionMode,
    allowedTools: cfg.launchAllowedTools,
  });
  const app = buildHttpServer({ store, repos, registry, checkpoints, launcher, worktreesDir: cfg.worktreesDir });

  // Mount the MCP server at /mcp using stateless Streamable HTTP transport.
  // Per-request pattern: each POST creates a fresh transport + server instance
  // sharing the same singleton deps (store, registry, checkpoints).
  // reply.hijack() is required so Fastify doesn't interfere with the raw response
  // that the MCP transport writes directly.

  app.all("/mcp", async (req, reply) => {
    const method = req.method.toUpperCase();

    if (method === "GET") {
      // Stateless mode doesn't need GET SSE streams.
      reply.raw.writeHead(405, { "Content-Type": "application/json" });
      reply.raw.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed." },
          id: null,
        }),
      );
      reply.hijack();
      return;
    }

    if (method === "DELETE") {
      reply.raw.writeHead(405, { "Content-Type": "application/json" });
      reply.raw.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed." },
          id: null,
        }),
      );
      reply.hijack();
      return;
    }

    if (method !== "POST") {
      reply.raw.writeHead(405).end();
      reply.hijack();
      return;
    }

    // POST: handle MCP request in stateless mode.
    // Create a fresh transport and server per request so each call is self-contained.
    reply.hijack();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    const mcp = buildMcpServer(mcpDeps);

    // Clean up on response close
    reply.raw.on("close", () => {
      transport.close().catch(() => undefined);
    });

    try {
      await mcp.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (err) {
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { "Content-Type": "application/json" });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          }),
        );
      }
      throw err;
    }
  });

  await app.listen({ port: cfg.httpPort, host: "0.0.0.0" });
  console.log(`reagent bridge on http://0.0.0.0:${cfg.httpPort}  (state: ${cfg.stateDir})`);

  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) {
      // Second signal while teardown is in progress — force exit immediately.
      process.exit(1);
    }
    shuttingDown = true;
    console.log("shutting down…");

    // Race graceful teardown against a hard timeout so we never hang.
    const timer = setTimeout(() => {
      console.error("shutdown timed out, forcing exit");
      process.exit(0);
    }, 3000);
    // Allow the Node process to exit even if the timer is still pending.
    if (timer.unref) timer.unref();

    (async () => {
      try {
        await watcher.stop();
        await app.close();
      } catch {
        // Ignore teardown errors — we're exiting regardless.
      } finally {
        clearTimeout(timer);
        process.exit(0);
      }
    })();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
