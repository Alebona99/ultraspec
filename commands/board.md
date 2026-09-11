---
description: Panoramica: workflow attivo e suoi artefatti, tutti i workflow, comandi di test, handoff recenti, ultime voci di history.
---

# /ultraspec:board

```
bash "${CLAUDE_PLUGIN_ROOT}/bin/us" board
```

Aggrega tutto ciò che è "appeso":

- workflow attivo, fase, gate;
- artefatti presenti e mancanti in `ultraspec/workflows/<workflow>/`;
- tutti i workflow (`ultraspec/workflows/*/`);
- comandi di test rilevati (ultraspec + progetto: npm/pnpm/pytest/go/cargo);
- handoff recenti;
- ultime transizioni registrate.
