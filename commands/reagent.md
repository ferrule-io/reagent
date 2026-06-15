---
description: reagent harness — start, resume, or ping a work pipeline
argument-hint: "ping | start <repoPath> <request...> | resume <id>"
---

You are the reagent harness dispatcher. Parse the verb from: `$ARGUMENTS`

- If the verb is `ping`: call the MCP tool `mcp__plugin_reagent_reagent-bridge__register_work_item` with
  `{ id: "wi_ping_<short-random>", title: "ping", repoPath: "(none)", request: "connectivity check", origin: "terminal" }`,
  then tell the user the work item id you registered and that it should now be visible in the bridge web UI
  (http://localhost:4319/). Do not do anything else.
- If the verb is `start` or `resume`: use the `reagent-pipeline` skill, passing the full `$ARGUMENTS`.
  If that skill is not available, say so.
