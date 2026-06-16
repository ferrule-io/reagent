---
description: reagent harness — connectivity check (registers a throwaway work item)
---

Call the MCP tool `mcp__plugin_reagent_reagent-bridge__register_work_item` with:

```json
{
  "id": "wi_ping_<short-random>",
  "title": "ping",
  "repoPath": "(none)",
  "request": "connectivity check",
  "origin": "terminal"
}
```

Replace `<short-random>` with a short random alphanumeric string (e.g. 6 characters).

After the tool call succeeds, tell the user:
- The work item id you registered (e.g. `wi_ping_abc123`)
- That it should now be visible in the bridge web UI at http://localhost:4319/

Do not do anything else.
