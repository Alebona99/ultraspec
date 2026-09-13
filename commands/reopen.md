---
description: SOLO UTENTE. Riporta il workflow a una fase precedente, registrando il motivo. Azzera le approvazioni a valle.
argument-hint: "<fase> --reason \"...\""
---

# /ultraspec:reopen <fase> --reason "..."

```
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" reopen <fase> --reason "descrizione del perché"
```

Riporta il workflow indietro a `<fase>`. Serve quando emerge complessità
nascosta che invalida una fase già chiusa.

Effetti: `phase` torna a `<fase>`; `phases_done` viene troncato; l'approvazione
umana di quella fase e delle successive torna a `false` (vanno ri-approvate);
il motivo è scritto in `history`. Il ratchet normale (`/ultraspec:advance`) va solo
avanti; `reopen` è la sola valvola all'indietro. Senza `--reason` rifiuta.
