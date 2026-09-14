---
description: Mostra fase, track, artefatti mancanti, stato dei gate, harness ed enforcement, e il motivo di eventuali blocchi.
---

# /ultraspec:status

```
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" status          # leggibile
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" status --json   # programmatico
```

Usalo quando: un'operazione è stata appena bloccata (spiega *perché* e *come
sbloccare*); non è chiaro in che fase sei o cosa manca; vuoi sapere quale
comando di fase invocare.

L'output include il livello di enforcement effettivo dell'harness corrente:
"completo" = anche le singole modifiche di codice sono bloccate fuori fase;
livelli inferiori si affidano al fallback git per bloccare almeno i commit.
