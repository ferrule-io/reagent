import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StateStore } from "../src/state/store.js";
import { Registry } from "../src/registry/registry.js";
import { CheckpointStore } from "../src/checkpoints/checkpoints.js";
import { buildMcpServer } from "../src/mcp/server.js";

function textOf(result: any): string {
  return result.content.map((c: any) => c.text).join("");
}

describe("MCP server tools", () => {
  let dir: string;
  let store: StateStore;
  let reg: Registry;
  let cps: CheckpointStore;
  let client: Client;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "reagent-mcp-"));
    store = new StateStore(dir);
    reg = new Registry();
    cps = new CheckpointStore();
    const server = buildMcpServer({ store, registry: reg, checkpoints: cps, checkpointPollMs: 50 });

    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(serverT), client.connect(clientT)]);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("registers a work item and lands it in store + registry", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_1", title: "T", repoPath: "/r", request: "do it", origin: "terminal" },
    });
    expect(store.get("wi_1")?.request).toBe("do it");
    expect(reg.get("wi_1")?.title).toBe("T");
  });

  it("resolves '.' repoPath to an absolute path (current working directory)", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_dot", title: "T", repoPath: ".", request: "q", origin: "terminal" },
    });
    const stored = store.get("wi_dot");
    expect(stored).toBeTruthy();
    expect(isAbsolute(stored!.repoPath)).toBe(true);
    expect(stored!.repoPath).toBe(process.cwd());
  });

  it("resolves empty repoPath to current working directory", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_empty", title: "T", repoPath: "", request: "q", origin: "terminal" },
    });
    const stored = store.get("wi_empty");
    expect(stored).toBeTruthy();
    expect(isAbsolute(stored!.repoPath)).toBe(true);
  });

  it("keeps already-absolute repoPath unchanged", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_abs", title: "T", repoPath: "/absolute/path", request: "q", origin: "terminal" },
    });
    expect(store.get("wi_abs")?.repoPath).toBe("/absolute/path");
  });

  it("report_status updates phase and appends a log line", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_2", title: "T", repoPath: "/r", request: "q", origin: "terminal" },
    });
    await client.callTool({
      name: "report_status",
      arguments: { id: "wi_2", phase: "INVESTIGATE", line: "reading code", plan: "do X" },
    });
    const it = store.get("wi_2")!;
    expect(it.phase).toBe("INVESTIGATE");
    expect(it.plan).toBe("do X");
    expect(it.log.at(-1)?.line).toBe("reading code");
  });

  it("await_decision returns pending, then decided after resolve", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_3", title: "T", repoPath: "/r", request: "q", origin: "terminal" },
    });

    const first = await client.callTool({
      name: "await_decision",
      arguments: { id: "wi_3", prompt: "approve plan?" },
    });
    expect(JSON.parse(textOf(first)).status).toBe("pending");

    const cpId = store.get("wi_3")!.pendingCheckpoint!.id;
    cps.resolve(cpId, { result: "approve" });

    const second = await client.callTool({
      name: "await_decision",
      arguments: { id: "wi_3", prompt: "approve plan?" },
    });
    const payload = JSON.parse(textOf(second));
    expect(payload.status).toBe("decided");
    expect(payload.decision.result).toBe("approve");
  });
});
