---
description: reagent harness — report the installed reagent version
---

Read the `version` field from the plugin manifest at `.claude-plugin/plugin.json` (resolved relative to the plugin root).

Report to the user: `reagent v<version>` where `<version>` is the value read from the manifest.

Do not hardcode the version number. Do not do anything else.
