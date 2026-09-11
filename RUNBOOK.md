# RUNBOOK — verifica live di ultraspec

La suite `tests/` copre logica ed enforcement con payload di hook. Restano tre
verifiche che richiedono un agente reale e non sono automatizzabili qui.

## Pre-requisiti

- `jq` nel PATH.
- Un repo di prova (o un git worktree dedicato) — **non** la working copy dove
  sviluppi ultraspec, perché i gate bloccheranno le tue stesse modifiche.
- Per il ramo OpenCode: `opencode` installato.

---

## 1. Workflow greenfield reale su Claude Code

### Step 0 — verifica i payload fixture contro la realtà

I file in `tests/fixtures/cc_*.json` sono **sintetici**. Prima di fidarti:

1. Registra un hook temporaneo che scarica lo stdin:
   `"command": "cat > /tmp/us-payload-$(date +%s).json"` su `PreToolUse`.
2. In una sessione, fai fare un `Write`, un `Edit`, un `Bash` e osserva
   `SessionStart` / `UserPromptSubmit` / `Stop` / `PreCompact`.
3. Confronta i campi (`tool_name`, `tool_input.file_path`, `tool_input.command`,
   `hook_event_name`, `reason`, il campo del testo del prompt in
   `UserPromptSubmit`) con `hooks/lib/us-event.sh`. Se un nome è diverso,
   aggiorna `_us_ev_claude_code` e la fixture.
4. Rimuovi l'hook temporaneo.

### Installazione nel repo di prova

`.claude/settings.json`:
```json
{
  "extraKnownMarketplaces": {
    "ultraspec": { "source": { "source": "directory", "path": "<path>/ultraspec" } }
  },
  "enabledPlugins": { "ultraspec@ultraspec": true }
}
```
più `<path>/ultraspec/adapters/generic-git/install.sh`. Apri `/hooks` una
volta (o riavvia) per attivare gli hook.

### Workflow

1. Nuova sessione. Atteso: nessun banner (nessun workflow attivo).
2. `/ultraspec:start demo-green` → **greenfield**. Atteso: `.us-state.json` +
   `ultraspec/workflows/demo-green/`, fase `intake`.
3. Riavvia la sessione. Atteso: banner con `phase=intake`.
4. Chiedi all'agente di scrivere `src/foo.ts`. **Atteso: bloccato** ("fase
   'intake' … richiede la fase 'build'").
5. `/ultraspec:discover` → `/ultraspec:advance` → `/ultraspec:spec`. In `spec`, chiedi un
   edit a `src/`. **Atteso: bloccato.** Edit a `ultraspec/workflows/…`.
   **Atteso: ok.**
6. `/ultraspec:advance` senza `spec.md`. **Atteso: rifiutato** (artefatto). Crea
   `spec.md`, riprova. **Atteso: rifiutato** (approvazione).
7. `/ultraspec:approve spec` (tu, non l'agente) → `/ultraspec:advance` → fase `plan`.
8. `/ultraspec:plan` → approva → `/ultraspec:advance` → fase `build`.
9. In `build`, edit a `src/` e `git commit`. **Atteso: consentiti.**
10. `/ultraspec:review`: prova a far chiudere il turno all'agente senza `review.md`.
    **Atteso: l'hook `Stop` lo trattiene.**
11. Completa review + approva; `summary.md`; `/ultraspec:approve archive` →
    `/ultraspec:advance`. **Atteso: `phase=done`.**

## 2. Stesso workflow, brownfield, su OpenCode

1. `opencode.json` → `"plugin": ["<path>/ultraspec/adapters/opencode/plugin.ts"]`
   + `./ultraspec/adapters/generic-git/install.sh`.
2. `/ultraspec:start demo-brown` → **brownfield**. In `discover`, verifica che venga
   generato/aggiornato **`AGENTS.md`** (non `CLAUDE.md`).
3. Ripeti i passi 4–9 della sezione 1: gli edit di codice fuori fase vengono
   rifiutati (il plugin lancia un errore); i commit fuori fase falliscono
   comunque via `pre-commit`.
4. `bash ultraspec/bin/us status` → `enforcement` deve indicare "parziale" per
   OpenCode (nessun hook di turn-end nativo).

## 3. Ripresa reale tra due sessioni

1. In un workflow in fase `plan`, lavora un po', poi `/ultraspec:handoff`. Verifica
   che `ultraspec/handoffs/<wf>-<ts>.md` esista e **non** contenga segreti né
   il contenuto integrale di `plan.md`.
2. Chiudi la sessione. Aprine una nuova. Atteso: il banner inietta l'handoff.
3. Scrivi un secondo handoff, apri una terza sessione: deve iniettare il
   **secondo** (il più recente).
4. Senza nuovo handoff, apri un'altra sessione: atteso il fallback "Attività
   recente (machine log)".

## Esito

Annota data, versioni di Claude Code / OpenCode, e ogni scostamento. Aggiorna
`docs/adapters.md` ("Tested harness versions") e `adapters/SUPPORT.md` se
qualcosa è cambiato.
