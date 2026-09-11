---
description: SOLO UTENTE. Registra l'approvazione umana del gate di una fase (spec, plan, review, archive).
argument-hint: "<fase>"
---

# /ultraspec:approve <fase>

```
bash "${CLAUDE_PLUGIN_ROOT}/bin/us" approve <fase>
```

Registra che **l'utente** ha approvato il gate di una fase.

`human_approved` è il confine tra un gate reale e un gate di facciata: solo
questo comando lo imposta, ed è pensato per essere digitato dall'utente. Né
`/ultraspec:advance` né i comandi di fase possono approvare. Ogni approvazione
finisce in `history`. Lo state file è immutabile per l'agente, quindi
l'approvazione non è forgiabile scrivendo il file a mano.
