import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  stateDir: string;
  httpPort: number;
  /** How long awaitDecision waits before returning "pending" (ms). */
  checkpointPollMs: number;
  /** `--permission-mode` for launched headless sessions (locked in Plan 3 Task 0). */
  launchPermissionMode: string;
  /** `--allowedTools` for launched headless sessions. */
  launchAllowedTools: string;
}

export function loadConfig(): Config {
  return {
    stateDir: process.env.REAGENT_STATE_DIR ?? join(homedir(), ".reagent", "state"),
    httpPort: Number(process.env.REAGENT_HTTP_PORT ?? 4319),
    checkpointPollMs: Number(process.env.REAGENT_CHECKPOINT_POLL_MS ?? 25000),
    launchPermissionMode: process.env.REAGENT_LAUNCH_PERMISSION_MODE ?? "acceptEdits",
    launchAllowedTools:
      process.env.REAGENT_LAUNCH_ALLOWED_TOOLS ??
      "Read,Edit,Write,Bash,Grep,Glob,Task,mcp__plugin_reagent_reagent-bridge__*,mcp__reagent-bridge__*",
  };
}
