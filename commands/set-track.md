---
description: Cambia il track del workflow tra greenfield e brownfield. Consentito solo nelle fasi intake/discover.
argument-hint: "greenfield|brownfield"
---

# /ultraspec:set-track <greenfield|brownfield>

```
bash "${CLAUDE_PLUGIN_ROOT}/bin/us" set-track <greenfield|brownfield>
```

Il track influenza solo la fase `discover`, quindi si cambia solo mentre sei in
`intake` o `discover` (oltre, il comando rifiuta). Il cambio è registrato in
`history`. Dopo il cambio, rilancia `/ultraspec:discover`. Se sei già oltre e devi
rifare la discovery: `/ultraspec:reopen discover --reason "..."`.
