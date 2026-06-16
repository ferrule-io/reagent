export interface Decision {
  result: "approve" | "reject" | "revise";
  note?: string;
}

interface Pending {
  workItemId: string;
  prompt: string;
  decision?: Decision;
  /** Resolvers of in-flight awaitDecision calls, woken when a decision lands. */
  waiters: Array<() => void>;
}

export type AwaitResult =
  | { status: "pending" }
  | { status: "decided"; decision: Decision };

export class CheckpointStore {
  private readonly pending = new Map<string, Pending>();

  open(workItemId: string, checkpointId: string, prompt: string): void {
    this.pending.set(checkpointId, { workItemId, prompt, waiters: [] });
  }

  resolve(checkpointId: string, decision: Decision): void {
    const p = this.pending.get(checkpointId);
    if (!p) throw new Error(`unknown checkpoint: ${checkpointId}`);
    if (p.decision) return; // idempotent: first decision wins
    p.decision = decision;
    for (const wake of p.waiters.splice(0)) wake();
  }

  /** Wait up to timeoutMs for a decision. Returns "pending" if none arrives. */
  async awaitDecision(checkpointId: string, timeoutMs: number): Promise<AwaitResult> {
    const p = this.pending.get(checkpointId);
    if (!p) throw new Error(`unknown checkpoint: ${checkpointId}`);
    if (p.decision) return { status: "decided", decision: p.decision };

    await new Promise<void>((resolveWait) => {
      const timer = setTimeout(() => {
        // remove our waiter, then resolve as a timeout
        const idx = p.waiters.indexOf(wake);
        if (idx >= 0) p.waiters.splice(idx, 1);
        resolveWait();
      }, timeoutMs);
      const wake = () => {
        clearTimeout(timer);
        resolveWait();
      };
      p.waiters.push(wake);
    });

    return p.decision ? { status: "decided", decision: p.decision } : { status: "pending" };
  }

  has(checkpointId: string): boolean {
    return this.pending.has(checkpointId);
  }
}
