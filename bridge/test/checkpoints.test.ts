import { describe, it, expect, beforeEach } from "vitest";
import { CheckpointStore } from "../src/checkpoints/checkpoints.js";

describe("CheckpointStore", () => {
  let cp: CheckpointStore;
  beforeEach(() => (cp = new CheckpointStore()));

  it("returns pending when no decision arrives before timeout", async () => {
    cp.open("wi_1", "cp_1", "approve the plan?");
    const res = await cp.awaitDecision("cp_1", 50);
    expect(res.status).toBe("pending");
  });

  it("resolves immediately when a decision is recorded while waiting", async () => {
    cp.open("wi_1", "cp_2", "approve?");
    const waiting = cp.awaitDecision("cp_2", 1000);
    setTimeout(() => cp.resolve("cp_2", { result: "approve" }), 20);
    const res = await waiting;
    expect(res.status).toBe("decided");
    expect(res.decision?.result).toBe("approve");
  });

  it("returns the decision immediately if it was already recorded", async () => {
    cp.open("wi_1", "cp_3", "approve?");
    cp.resolve("cp_3", { result: "reject", note: "wrong approach" });
    const res = await cp.awaitDecision("cp_3", 1000);
    expect(res.status).toBe("decided");
    expect(res.decision?.result).toBe("reject");
    expect(res.decision?.note).toBe("wrong approach");
  });

  it("throws when awaiting an unknown checkpoint", async () => {
    await expect(cp.awaitDecision("nope", 10)).rejects.toThrow(/unknown checkpoint/);
  });

  it("rejects resolving an unknown checkpoint", () => {
    expect(() => cp.resolve("nope", { result: "approve" })).toThrow(/unknown checkpoint/);
  });
});
