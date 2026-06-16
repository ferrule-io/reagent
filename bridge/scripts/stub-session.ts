import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { randomUUID } from "node:crypto";

const BRIDGE = process.env.REAGENT_BRIDGE_URL ?? "http://localhost:4319/mcp";

function textOf(result: any): string {
  return result.content.map((c: any) => c.text).join("");
}

async function main() {
  const client = new Client({ name: "stub-session", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(BRIDGE)));

  const id = `wi_${randomUUID().slice(0, 8)}`;
  console.log(`stub session: work item ${id}`);

  await client.callTool({
    name: "register_work_item",
    arguments: {
      id,
      title: "Stub task",
      repoPath: "/tmp/repo",
      request: "demonstrate the loop",
      origin: "terminal",
    },
  });

  await client.callTool({
    name: "report_status",
    arguments: {
      id,
      phase: "INVESTIGATE",
      line: "investigating…",
      plan: "Proposed direction: do the thing in module X.",
    },
  });

  console.log("awaiting approval — open http://localhost:4319/ and Approve/Reject");
  let decision: any;
  for (;;) {
    const res = await client.callTool({
      name: "await_decision",
      arguments: {
        id,
        prompt: "Approve this plan?\n\nProposed direction: do the thing in module X.",
      },
    });
    const payload = JSON.parse(textOf(res));
    if (payload.status === "decided") {
      decision = payload.decision;
      break;
    }
    console.log("…still pending, re-polling");
  }

  console.log(`decision: ${decision.result}${decision.note ? ` (${decision.note})` : ""}`);
  if (decision.result === "reject") {
    await client.callTool({ name: "complete_work_item", arguments: { id, phase: "REJECTED" } });
  } else {
    // Fetch the stored branch (derived at registration time) rather than constructing reagent/<id>.
    const itemRes = await fetch(
      `${process.env.REAGENT_BRIDGE_HTTP_URL ?? "http://localhost:4319"}/api/items/${id}`,
    );
    const item = (await itemRes.json()) as { branch?: string };
    const branch = item.branch ?? `reagent/${id}`;
    await client.callTool({
      name: "report_status",
      arguments: { id, phase: "EXECUTE", line: "making the change…", branch },
    });
    await client.callTool({ name: "complete_work_item", arguments: { id, phase: "DONE" } });
  }
  console.log("done");
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
