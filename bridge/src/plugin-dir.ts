import { existsSync, mkdirSync, cpSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the effective plugin directory for this bridge process.
 *
 * Priority:
 *   1. REAGENT_PLUGIN_DIR (explicit override — dev or special deployments)
 *   2. REAGENT_BUNDLED_PLUGIN_DIR (set by Electron main.ts when packaged)
 *      → copies to ~/.reagent/plugin if absent or version-stale
 *   3. Dev-mode fallback: repo root (bridge/dist/index.js → ../../..)
 */
export async function resolvePluginDir(): Promise<string> {
  if (process.env.REAGENT_PLUGIN_DIR) return process.env.REAGENT_PLUGIN_DIR;

  const bundledSrc = process.env.REAGENT_BUNDLED_PLUGIN_DIR;
  if (bundledSrc) {
    const dest = join(homedir(), ".reagent", "plugin");
    if (!existsSync(dest) || pluginVersion(dest) !== pluginVersion(bundledSrc)) {
      mkdirSync(dest, { recursive: true });
      cpSync(bundledSrc, dest, { recursive: true });
    }
    return dest;
  }

  // Dev-mode fallback: this file compiles to bridge/dist/plugin-dir.js,
  // so three levels up (dist → bridge → reagent) is the repo root.
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function pluginVersion(dir: string): string {
  try {
    const pj = join(dir, ".claude-plugin", "plugin.json");
    return (JSON.parse(readFileSync(pj, "utf8")).version as string) ?? "";
  } catch {
    return "";
  }
}
