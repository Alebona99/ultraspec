---
description: Fase SPEC del workflow ultraspec.
---

# /ultraspec:spec

Esegui la fase `spec`. Segui la procedura dettagliata:

**`${CLAUDE_PLUGIN_ROOT}/workflow/spec.md`** — leggila e applicala passo per passo.

In sintesi: fai il lavoro della fase, produci l'artefatto richiesto in
`ultraspec/workflows/<workflow>/`, poi **fermati** al gate (artefatto +, dove
previsto, `/ultraspec:approve spec`). Non eseguire `/ultraspec:advance` né
`/ultraspec:approve` da solo — sono comandi di controllo dell'utente.

Per lo stato: `bash "${CLAUDE_PLUGIN_ROOT}/bin/us" status`.
