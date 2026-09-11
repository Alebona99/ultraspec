---
description: Mostra fase, track, artefatti mancanti, stato dei gate, harness ed enforcement, e il motivo di eventuali blocchi.
---

# /ultraspec:status

```
bash "${CLAUDE_PLUGIN_ROOT}/bin/us" status          # leggibile
bash "${CLAUDE_PLUGIN_ROOT}/bin/us" status --json   # programmatico
```

Usalo quando: un'operazione è stata appena bloccata (spiega *perché* e *come
sbloccare*); non è chiaro in che fase sei o cosa manca; vuoi sapere quale
comando di fase invocare.

L'output include il livello di enforcement effettivo dell'harness corrente:
"completo" = anche le singole modifiche di codice sono bloccate fuori fase;
livelli inferiori si affidano al fallback git per bloccare almeno i commit.
