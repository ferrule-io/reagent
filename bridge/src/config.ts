import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  stateDir: string;
  httpPort: number;
  /** How long awaitDecision waits before returning "pending" (ms). */
  checkpointPollMs: number;
}

export function loadConfig(): Config {
  return {
    stateDir: process.env.REAGENT_STATE_DIR ?? join(homedir(), ".reagent", "state"),
    httpPort: Number(process.env.REAGENT_HTTP_PORT ?? 4319),
    checkpointPollMs: Number(process.env.REAGENT_CHECKPOINT_POLL_MS ?? 25000),
  };
}
