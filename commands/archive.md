---
description: Fase ARCHIVE del workflow ultraspec.
---

# /ultraspec:archive

Esegui la fase `archive`. Segui la procedura dettagliata:

**`${CLAUDE_PLUGIN_ROOT}/workflow/archive.md`** — leggila e applicala passo per passo.

In sintesi: fai il lavoro della fase, produci l'artefatto richiesto in
`ultraspec/workflows/<workflow>/`, poi **fermati** al gate (artefatto +, dove
previsto, `/ultraspec:approve archive`). Non eseguire `/ultraspec:advance` né
`/ultraspec:approve` da solo — sono comandi di controllo dell'utente.

Per lo stato: `bash "${CLAUDE_PLUGIN_ROOT}/bin/us" status`.
