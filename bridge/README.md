# reagent bridge

Always-on hub for the reagent harness (M1, Plan 1 of 3).

## Scripts
- `npm run dev` — start the bridge from source via tsx (HTTP + PWA + MCP-over-HTTP on :4319).
- `npm run build` — compile `src/` to `dist/` (src-only, via `tsconfig.build.json`).
- `npm start` — run the compiled bridge (`node dist/index.js`).
- `npm run stub` — run a stub session that walks the pipeline and opens an approval gate.
- `npm test` — unit tests (vitest).

## Env
- `REAGENT_STATE_DIR` — per-work-item YAML state (default `~/.reagent/state`).
- `REAGENT_HTTP_PORT` — HTTP/PWA/MCP port (default `4319`).
- `REAGENT_CHECKPOINT_POLL_MS` — how long `await_decision` waits before returning `pending` (default `25000`).

## Surfaces
- **PWA** at `/` — lists all work items, renders pending approval gates, Approve/Reject, "start new work".
- **REST** under `/api` — `GET /api/items`, `GET /api/items/:id`, `POST /api/items` (new work), `POST /api/items/:id/decision`.
- **SSE** at `/api/stream` — live `item` events as the registry changes.
- **MCP** (Streamable HTTP) at `/mcp` — a Claude Code session running the reagent skill connects here as an MCP client (Plan 2). Tools: `register_work_item`, `report_status`, `await_decision`, `complete_work_item`.

## Architecture
A single process: `StateStore` (YAML per item) ← watched by `Watcher` → `Registry` (in-memory, drives SSE); `CheckpointStore` mediates approval gates with poll/resolve semantics; the MCP server is the session-facing protocol; Fastify serves REST/SSE/PWA. State is durable and the registry + open checkpoints are rebuilt from disk on restart (resume-by-reconstruction).

## Try the loop (two terminals)
```sh
npm run dev                       # terminal 1
npm run stub                      # terminal 2 — registers work, opens a gate
# open http://localhost:4319/ and Approve/Reject; the stub continues to DONE
```

Next: **Plan 2** wires the real Claude Code plugin (skill + scoped executor) to this `/mcp` endpoint; **Plan 3** adds headless launch + Tailscale + full end-to-end.
