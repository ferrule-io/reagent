import { describe, it, expect } from "vitest";
import { Launcher, type SpawnLike } from "../src/launch/launcher.js";

function recordingSpawn() {
  const calls: { cmd: string; args: string[]; opts: any }[] = [];
  const spawn: SpawnLike = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return {
      on: () => {},
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      unref: () => {},
    } as any;
  };
  return { calls, spawn };
}

const FLAGS = {
  pluginDir: "/plugin/root",
  permissionMode: "acceptEdits",
  allowedTools:
    "Read,Edit,Write,Bash,Grep,Glob,Task,mcp__plugin_reagent_reagent-bridge__*,mcp__reagent-bridge__*",
};

describe("Launcher", () => {
  it("spawns claude -p start-async with the given id in the target repo", () => {
    const { calls, spawn } = recordingSpawn();
    new Launcher(spawn, FLAGS).startAsync({
      id: "wi_1",
      repoPath: "/tmp/repo",
      request: "do the thing",
    });
    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect(c.cmd).toBe("claude");
    expect(c.args).toContain("-p");
    expect(c.args.join(" ")).toContain(
      "reagent:reagent-pipeline skill with arguments: start-async wi_1 /tmp/repo",
    );
    expect(c.args.join(" ")).toContain("do the thing");
    expect(c.args).toContain("--permission-mode");
    expect(c.args).toContain("acceptEdits");
    expect(c.args).toContain("--plugin-dir");
    expect(c.args).toContain("/plugin/root");
    expect(c.opts.cwd).toBe("/tmp/repo");
    // subscription auth: ANTHROPIC_API_KEY must be present-but-undefined in the spawn env
    expect("ANTHROPIC_API_KEY" in c.opts.env).toBe(true);
    expect(c.opts.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("spawns claude -p resume on approval", () => {
    const { calls, spawn } = recordingSpawn();
    new Launcher(spawn, FLAGS).resume({ id: "wi_2", repoPath: "/tmp/repo" });
    const c = calls[0];
    expect(c.args.join(" ")).toContain(
      "reagent:reagent-pipeline skill with arguments: resume wi_2",
    );
    expect(c.opts.cwd).toBe("/tmp/repo");
  });
});
