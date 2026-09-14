---
description: Fase REVIEW del workflow ultraspec.
---

# /ultraspec:review

Esegui la fase `review`. Segui la procedura dettagliata:

**`${CLAUDE_PLUGIN_ROOT}/workflow/review.md`** — leggila e applicala passo per passo.

In sintesi: fai il lavoro della fase, produci l'artefatto richiesto in
`ultraspec/workflows/<workflow>/`, poi **fermati** al gate (artefatto +, dove
previsto, `/ultraspec:approve review`). Non eseguire `/ultraspec:advance` né
`/ultraspec:approve` da solo — sono comandi di controllo dell'utente.

Per lo stato: `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" status`.
