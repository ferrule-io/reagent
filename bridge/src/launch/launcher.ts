export type SpawnLike = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; detached?: boolean; stdio?: unknown },
) => {
  on: (event: string, cb: (...a: unknown[]) => void) => void;
  stdout: unknown;
  stderr: unknown;
  unref: () => void;
};

export interface LaunchFlags {
  /** Permission mode passed to `claude -p` (locked in Plan 3 Task 0). */
  permissionMode: string;
  /** Comma-separated --allowedTools list including the bridge MCP tools. */
  allowedTools: string;
}

/**
 * Spawn env for a launched session. ANTHROPIC_API_KEY is forced undefined so the
 * spawned `claude` uses the user's subscription auth rather than switching to
 * metered API billing.
 */
function envWithoutApiKey(): NodeJS.ProcessEnv {
  return { ...process.env, ANTHROPIC_API_KEY: undefined };
}

/** What the HTTP layer needs from a launcher (lets tests inject a recorder). */
export interface SessionLauncher {
  startAsync(opts: { id: string; repoPath: string; request: string }): void;
  resume(opts: { id: string; repoPath: string }): void;
}

/** Launches headless `claude -p` sessions that run the reagent plugin's pipeline. */
export class Launcher implements SessionLauncher {
  constructor(
    private readonly spawn: SpawnLike,
    private readonly flags: LaunchFlags,
  ) {}

  private run(prompt: string, cwd: string): void {
    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--permission-mode",
      this.flags.permissionMode,
      "--allowedTools",
      this.flags.allowedTools,
    ];
    // Fire-and-forget: the launched session reports progress to the bridge over MCP.
    const child = this.spawn("claude", args, {
      cwd,
      env: envWithoutApiKey(),
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }

  /** Launch a fresh session for new phone-submitted work (uses the bridge-assigned id). */
  startAsync(opts: { id: string; repoPath: string; request: string }): void {
    this.run(`/reagent:reagent start-async ${opts.id} ${opts.repoPath} ${opts.request}`, opts.repoPath);
  }

  /** Re-launch a short session to continue a work item after the human decided. */
  resume(opts: { id: string; repoPath: string }): void {
    this.run(`/reagent:reagent resume ${opts.id}`, opts.repoPath);
  }
}
