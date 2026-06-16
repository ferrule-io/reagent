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

  it("derives a human-readable branch at creation time", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_br1", title: "Fix the login bug", repoPath: "/r", request: "q", origin: "terminal" },
    });
    expect(store.get("wi_br1")?.branch).toBe("reagent/fix-the-login-bug");
  });

  it("disambiguates duplicate title branches with a numeric suffix", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_dup1", title: "Add dark mode", repoPath: "/r", request: "q", origin: "terminal" },
    });
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_dup2", title: "Add dark mode", repoPath: "/r", request: "q", origin: "terminal" },
    });
    expect(store.get("wi_dup1")?.branch).toBe("reagent/add-dark-mode");
    expect(store.get("wi_dup2")?.branch).toBe("reagent/add-dark-mode-2");
  });

  it("does not overwrite branch on refresh/re-register of existing item", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_ref", title: "My feature", repoPath: "/r", request: "q", origin: "terminal" },
    });
    const first = store.get("wi_ref")?.branch;
    // Re-register (refresh)
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_ref", title: "My feature", repoPath: "/r", request: "q", origin: "terminal" },
    });
    expect(store.get("wi_ref")?.branch).toBe(first);
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

  it("report_status persists proposal and units", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_prop", title: "T", repoPath: "/r", request: "q", origin: "terminal" },
    });
    const units = [
      { id: "u1", title: "Unit 1", scope: ["src/**"], planDocPath: "docs/reagent/wi_prop/u1.md", dependsOn: [] },
    ];
    await client.callTool({
      name: "report_status",
      arguments: { id: "wi_prop", phase: "PLAN", proposal: "my proposal", units },
    });
    const stored = store.get("wi_prop")!;
    expect(stored.phase).toBe("PLAN");
    expect(stored.proposal).toBe("my proposal");
    expect(stored.units).toHaveLength(1);
    expect(stored.units![0].title).toBe("Unit 1");
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

  it("await_decision opens a fresh checkpoint after a revise and appends feedback", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_rev", title: "T", repoPath: "/r", request: "q", origin: "terminal" },
    });

    // First gate: open and resolve with revise
    await client.callTool({
      name: "await_decision",
      arguments: { id: "wi_rev", prompt: "first proposal" },
    });
    const firstCpId = store.get("wi_rev")!.pendingCheckpoint!.id;
    cps.resolve(firstCpId, { result: "revise", note: "change the approach" });

    // Collect the revise decision
    const reviseResult = await client.callTool({
      name: "await_decision",
      arguments: { id: "wi_rev", prompt: "first proposal" },
    });
    const reviseParsed = JSON.parse(textOf(reviseResult));
    expect(reviseParsed.status).toBe("decided");
    expect(reviseParsed.decision.result).toBe("revise");

    // Feedback should be appended
    const afterRevise = store.get("wi_rev")!;
    expect(afterRevise.feedback).toHaveLength(1);
    expect(afterRevise.feedback![0].note).toBe("change the approach");
    expect(afterRevise.phase).toBe("PROPOSE");

    // Re-propose: await_decision again should open a FRESH checkpoint
    const reproposeCall = client.callTool({
      name: "await_decision",
      arguments: { id: "wi_rev", prompt: "revised proposal" },
    });
    // Give it time to open the gate
    await new Promise((r) => setTimeout(r, 10));

    const newItem = store.get("wi_rev")!;
    const newCpId = newItem.pendingCheckpoint!.id;
    expect(newCpId).not.toBe(firstCpId); // fresh checkpoint

    // Resolve fresh gate with approve
    cps.resolve(newCpId, { result: "approve" });
    const approveResult = await reproposeCall;
    const approveParsed = JSON.parse(textOf(approveResult));
    expect(approveParsed.status).toBe("decided");
    expect(approveParsed.decision.result).toBe("approve");
  });

  it("await_decision sets phase to PROPOSE when opening a gate", async () => {
    await client.callTool({
      name: "register_work_item",
      arguments: { id: "wi_phase", title: "T", repoPath: "/r", request: "q", origin: "terminal" },
    });
    await client.callTool({
      name: "await_decision",
      arguments: { id: "wi_phase", prompt: "proposal here" },
    });
    expect(store.get("wi_phase")!.phase).toBe("PROPOSE");
    expect(store.get("wi_phase")!.pendingCheckpoint!.kind).toBe("PROPOSE");
  });
});
