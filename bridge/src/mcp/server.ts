import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { resolve, isAbsolute } from "node:path";
import type { StateStore } from "../state/store.js";
import type { Registry } from "../registry/registry.js";
import type { CheckpointStore } from "../checkpoints/checkpoints.js";
import type { Phase, Unit } from "../state/types.js";
import { branchFor } from "../state/slug.js";

export interface McpDeps {
  store: StateStore;
  registry: Registry;
  checkpoints: CheckpointStore;
  checkpointPollMs: number;
}

const PHASES = [
  "INTAKE",
  "INVESTIGATE",
  "PROPOSE",
  "PLAN",
  "EXECUTE",
  "DONE",
  "REJECTED",
  "FAILED",
] as const;

const UnitSchema = z.object({
  id: z.string(),
  title: z.string(),
  scope: z.array(z.string()),
  planDocPath: z.string(),
  dependsOn: z.array(z.string()),
});

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
      // Resolve relative or '.' paths to absolute using process.cwd().
      // Note: process.cwd() reflects the cwd of the bridge server process,
      // which matches the terminal session that invoked the skill.
      const absoluteRepoPath =
        repoPath && isAbsolute(repoPath) ? repoPath : resolve(process.cwd(), repoPath || ".");
      if (!store.get(id)) {
        // Derive a human-readable branch slug at creation time; avoid collisions with existing items.
        const existingBranches = new Set(
          store
            .list()
            .map((item) => item.branch)
            .filter(Boolean) as string[],
        );
        const branch = branchFor(title, id, existingBranches);
        store.create({ id, title, repoPath: absoluteRepoPath, request, origin, branch });
      }
      touch(id);
      return json({ ok: true });
    },
  );

  server.registerTool(
    "report_status",
    {
      description:
        "Stream a status update for a work item (phase, log line, plan, proposal, units, branch).",
      inputSchema: {
        id: z.string(),
        phase: z.enum(PHASES).optional(),
        line: z.string().optional(),
        plan: z.string().optional(),
        proposal: z.string().optional(),
        units: z.array(UnitSchema).optional(),
        branch: z.string().optional(),
      },
    },
    async ({ id, phase, line, plan, proposal, units, branch }) => {
      store.update(id, (it) => {
        if (phase) it.phase = phase as Phase;
        if (plan !== undefined) it.plan = plan;
        if (proposal !== undefined) it.proposal = proposal;
        if (units !== undefined) it.units = units as Unit[];
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
        "Open (or continue waiting on) a human approval gate. Returns {status:'pending'} on timeout — call again to keep waiting. On revise, the old gate is cleared and a fresh one opens.",
      inputSchema: { id: z.string(), prompt: z.string() },
    },
    async ({ id, prompt }) => {
      const item = store.get(id);
      if (!item) throw new Error(`work item not found: ${id}`);

      // If a decision was already recorded for the current gate, check the result.
      // approve/reject → return idempotently (same as before).
      // revise → the skill is re-proposing: open a FRESH checkpoint, clear the stale one.
      if (item.pendingCheckpoint?.decision) {
        const existingResult = item.pendingCheckpoint.decision.result;
        if (existingResult === "approve" || existingResult === "reject") {
          return json({ status: "decided", decision: item.pendingCheckpoint.decision });
        }
        // revise: fall through to open a fresh gate below
      }

      // Check whether we have a pending (undecided) checkpoint we can reuse.
      let cpId = item.pendingCheckpoint?.id;
      const hasUndecidedCheckpoint = cpId && !item.pendingCheckpoint?.decision;

      if (!hasUndecidedCheckpoint) {
        // Open a fresh checkpoint (either first time, or after a revise)
        cpId = `cp_${randomUUID().slice(0, 8)}`;
        checkpoints.open(id, cpId, prompt);
        store.update(id, (it) => {
          it.phase = "PROPOSE";
          it.pendingCheckpoint = {
            id: cpId!,
            kind: "PROPOSE",
            prompt,
            createdAt: new Date().toISOString(),
          };
        });
        touch(id);
      } else if (!checkpoints.has(cpId!)) {
        checkpoints.open(id, cpId!, item.pendingCheckpoint!.prompt);
      }

      const res = await checkpoints.awaitDecision(cpId!, checkpointPollMs);
      if (res.status === "decided") {
        const decidedAt = new Date().toISOString();
        store.update(id, (it) => {
          if (it.pendingCheckpoint) {
            it.pendingCheckpoint.decision = { ...res.decision, decidedAt };
          }
          // On revise: append feedback and keep phase as PROPOSE
          if (res.decision.result === "revise") {
            if (!it.feedback) it.feedback = [];
            it.feedback.push({ at: decidedAt, note: res.decision.note ?? "" });
            it.phase = "PROPOSE";
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
