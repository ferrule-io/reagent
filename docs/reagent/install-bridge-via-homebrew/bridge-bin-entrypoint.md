# Unit: bridge-bin-entrypoint

## Goal

Give the bridge a stable, self-contained executable entry point by adding a `bin` field to `bridge/package.json` and a thin shim script at `bridge/bin/reagent-bridge.js`. This gives the Homebrew formula (and any future packaging mechanism) a declared target to invoke rather than an ad-hoc `node dist/index.js` string. It also removes `private: true` so the package can expose a `bin` cleanly (the package still ships only via the formula; removing `private` does not publish it to npm).

## Scope

- `bridge/package.json`
- `bridge/bin/reagent-bridge.js` (new file)

No other files may be touched in this unit.

## Approach

1. **Add the bin shim** — create `bridge/bin/reagent-bridge.js` (a plain `.js` file, not TypeScript, so it is executable without a build step). It must:
   - Begin with the shebang `#!/usr/bin/env node`
   - Be written as an ES module (add a top-level `import` or use `"type": "module"` already present on the package) — but since shebangs work best with CommonJS for simple entry points, check whether `"type": "module"` applies to files outside `src/`. Because `bridge/package.json` has `"type": "module"`, the shim at `bridge/bin/reagent-bridge.js` is also treated as ESM. It should therefore use:
     ```js
     #!/usr/bin/env node
     import { createRequire } from "node:module";
     import { fileURLToPath } from "node:url";
     import { dirname, join } from "node:path";
     // Forward to compiled dist/index.js relative to this file's location
     const __dirname = dirname(fileURLToPath(import.meta.url));
     await import(join(__dirname, "..", "dist", "index.js"));
     ```
   - Alternatively — and more simply — make it a `.cjs` shim (rename to `reagent-bridge.cjs`) to avoid ESM shebang complications. Choose whichever approach is cleaner; the formula wrapper script will invoke `node <libexec>/bridge/bin/reagent-bridge.js` (or `.cjs`) directly.
   - The simplest correct approach: since `dist/index.js` is already a compiled ESM module, the shim can just be a one-liner that does a dynamic import:
     ```js
     #!/usr/bin/env node
     import(new URL("../dist/index.js", import.meta.url));
     ```

2. **Update `bridge/package.json`**:
   - Add a `"bin"` field pointing at the shim:
     ```json
     "bin": {
       "reagent-bridge": "./bin/reagent-bridge.js"
     }
     ```
   - Remove `"private": true` (the formula doesn't require this removal, but making the package non-private avoids npm warnings when `npm link` is used during development). This is optional — keep `private: true` if it avoids confusion; the formula does not use `npm link` or `npm install -g`. Decision: **keep `private: true`** to prevent accidental npm publish; the `bin` field is valid alongside `private`.

3. **Make the shim executable** — the file should be committed with the executable bit set: `chmod +x bridge/bin/reagent-bridge.js` before committing, or use `git update-index --chmod=+x bridge/bin/reagent-bridge.js`.

## Acceptance criteria

- `bridge/bin/reagent-bridge.js` exists, begins with `#!/usr/bin/env node`, and is marked executable in git (`git ls-files -s bridge/bin/reagent-bridge.js` shows mode `100755`).
- `bridge/package.json` has a `"bin"` field: `{ "reagent-bridge": "./bin/reagent-bridge.js" }`.
- Running `node bridge/bin/reagent-bridge.js` from the repo root (after `npm run build` in bridge/) starts the bridge server and prints the startup line (`reagent bridge on http://...`). It should be killable with Ctrl-C.
- `npm run lint` and `npm run build` in bridge/ still pass with exit code 0.
- No other files outside `bridge/package.json` and `bridge/bin/` are modified.
