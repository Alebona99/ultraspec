---
description: Fa avanzare il workflow alla fase successiva, dopo aver verificato il gate della fase corrente (artefatti + approvazione utente dove richiesta).
---

# /ultraspec:advance

```
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" advance
```

Avanza di una fase. **Solo in avanti.**

- Se **rifiuta** per artefatto mancante → completalo (è in
  `ultraspec/workflows/<workflow>/`) e riprova.
- Se **rifiuta** per approvazione mancante → di' all'utente di eseguire
  `/ultraspec:approve <fase>`. **Tu non puoi approvare.**
- Se **avanza** → annuncia la nuova fase e il comando di fase corrispondente.

Per tornare indietro serve `/ultraspec:reopen <fase> --reason "..."` (azione utente).
Non modificare `.us-state.json` a mano — è protetto.
