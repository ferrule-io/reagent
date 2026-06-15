import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { StateStore } from "../state/store.js";
import type { Registry } from "../registry/registry.js";
import type { CheckpointStore } from "../checkpoints/checkpoints.js";
import type { Phase } from "../state/types.js";

export interface McpDeps {
  store: StateStore;
  registry: Registry;
  checkpoints: CheckpointStore;
  checkpointPollMs: number;
}

const PHASES = [
  "INTAKE", "INVESTIGATE", "PLAN_APPROVAL", "EXECUTE", "DONE", "REJECTED", "FAILED",
] as const;

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

export function buildMcpServer(deps: McpDeps): McpServer {
  const { store, registry, checkpoints, checkpointPollMs } = deps;
  const server = new McpServer({ name: "reagent-bridge", version: "0.0.1" });

  const touch = (id: string) => {
    const item = store.get(id);
    if (item) registry.upsert(item);
  };

  server.registerTool(
    "register_work_item",
    {
      description: "Register (create or refresh) a reagent work item with the bridge.",
      inputSchema: {
        id: z.string(),
        title: z.string(),
        repoPath: z.string(),
        request: z.string(),
        origin: z.enum(["terminal", "phone"]),
      },
    },
    async ({ id, title, repoPath, request, origin }) => {
      if (!store.get(id)) store.create({ id, title, repoPath, request, origin });
      touch(id);
      return json({ ok: true });
    },
  );

  server.registerTool(
    "report_status",
    {
      description: "Stream a status update for a work item (phase, log line, plan, branch).",
      inputSchema: {
        id: z.string(),
        phase: z.enum(PHASES).optional(),
        line: z.string().optional(),
        plan: z.string().optional(),
        branch: z.string().optional(),
      },
    },
    async ({ id, phase, line, plan, branch }) => {
      store.update(id, (it) => {
        if (phase) it.phase = phase as Phase;
        if (plan !== undefined) it.plan = plan;
        if (branch !== undefined) it.branch = branch;
        if (line) it.log.push({ at: new Date().toISOString(), line });
      });
      touch(id);
      return json({ ok: true });
    },
  );

  server.registerTool(
    "await_decision",
    {
      description:
        "Open (or continue waiting on) a human approval gate. Returns {status:'pending'} on timeout — call again to keep waiting.",
      inputSchema: { id: z.string(), prompt: z.string() },
    },
    async ({ id, prompt }) => {
      const item = store.get(id);
      if (!item) throw new Error(`work item not found: ${id}`);

      let cpId = item.pendingCheckpoint?.id;
      if (!cpId || item.pendingCheckpoint?.decision) {
        cpId = `cp_${randomUUID().slice(0, 8)}`;
        checkpoints.open(id, cpId, prompt);
        store.update(id, (it) => {
          it.phase = "PLAN_APPROVAL";
          it.pendingCheckpoint = {
            id: cpId!,
            kind: "PLAN_APPROVAL",
            prompt,
            createdAt: new Date().toISOString(),
          };
        });
        touch(id);
      } else if (!checkpoints.has(cpId)) {
        checkpoints.open(id, cpId, item.pendingCheckpoint!.prompt);
      }

      const res = await checkpoints.awaitDecision(cpId, checkpointPollMs);
      if (res.status === "decided") {
        store.update(id, (it) => {
          if (it.pendingCheckpoint) {
            it.pendingCheckpoint.decision = { ...res.decision, decidedAt: new Date().toISOString() };
          }
        });
        touch(id);
        return json({ status: "decided", decision: res.decision });
      }
      return json({ status: "pending" });
    },
  );

  server.registerTool(
    "complete_work_item",
    {
      description: "Mark a work item terminal (DONE, REJECTED, or FAILED).",
      inputSchema: { id: z.string(), phase: z.enum(["DONE", "REJECTED", "FAILED"]) },
    },
    async ({ id, phase }) => {
      store.update(id, (it) => {
        it.phase = phase as Phase;
        it.pendingCheckpoint = undefined;
      });
      touch(id);
      return json({ ok: true });
    },
  );

  return server;
}
