# ultraspec — handoff completo

> Estratta in repository dedicato l'11 settembre 2026, dal repo Kineta dove era
> nata e dove è stata usata/testata per la prima volta sul progetto reale prima
> dell'estrazione. Storia di sviluppo completa (prima del subtree split)
> consultabile nel repo Kineta, path `ultraspec/` (già rimosso da `main`),
> commit `a0c7a9b`..`94c8a7a`. Questo file basta per ripartire da zero, senza
> aver letto la conversazione che l'ha prodotta.
>
> **Rinominata `ultraspec` l'11 settembre 2026** (era `ultrakineta`), lo stesso
> giorno dell'estrazione: cartella, plugin, marketplace, comandi
> (`/ultraspec:*`) e sigla interna (`uk` → `us`: `bin/us`, `us.config.json`,
> `.us-state.json`, `hooks/us-*.sh`) tutti aggiornati insieme. Questo file usa
> già i nomi nuovi ovunque.

## Cos'è, in una frase

Una piattaforma che impone **una pipeline di sviluppo unica** —
`discover → spec → plan → build → review → archive` — scelta in ingresso fra
onramp **greenfield** e **brownfield**, con gate deterministici via hook,
**standalone** (nessuna dipendenza da altri plugin/skill) e utilizzabile da più
agent (Claude Code first-class, altri via `AGENTS.md` + fallback git).

## Perché esiste

L'utente voleva un workflow imposto e verificabile per l'uso di agenti di
coding: scelta greenfield/brownfield in ingresso, poi una sequenza di skill/hook
obbligata, non aggirabile a piacere del modello. Il primo design delegava a tre
framework già installati (superpowers, openspec/opsx, mattpocock); su richiesta
esplicita dell'utente è stato riscritto **standalone**, senza nessun
riferimento o dipendenza da quei framework.

## Architettura in breve

```
  ultraspec/.us-state.json      <- unica verità (workflow, track, fase, gate, log)
        ^                    ^
   legge| (hook)      scrive | (solo bin/us: advance / approve / reopen / handoff)
        |                    |
  hooks/ (harness-neutral)   workflow/*.md (procedure di fase, markdown neutro)
        |                            ^
  adapters/<agent>/            commands/*.md (Claude Code) + AGENTS.md (altri agent)
   traduzione evento nativo         puntano qui
   <-> evento normalizzato
  adapters/generic-git/pre-commit  <- rete di sicurezza installata su OGNI agent
```

- **`.us-state.json`** — workflow/track/phase/phases_done/gates/session_log/history.
  Immutabile per l'agente (in `protected_always_globs` insieme a `us.config.json`
  e agli script di `hooks/`/`adapters/`/`bin/`) — è ciò che rende il gate reale.
  Scritto solo da `bin/us`.
- **`hooks/`** — tutta la logica di enforcement, un solo posto, harness-neutral.
  Evento normalizzato (`session_start`, `user_prompt`, `pre_write`, `pre_bash`,
  `stop`, `pre_compact`, `post_write`) → decisione (`allow|deny|block|nudge`).
  Fail-open (jq mancante, stato assente/corrotto, nessun workflow → non blocca
  mai).
- **`adapters/<agent>/`** — un traduttore sottile per agent. `claude-code`
  (hooks.json + dispatch.sh) e `opencode` (plugin.ts) sono implementati e
  testati. `cursor/` e `codex/` sono **cartelle vuote** — solo lo scaffold,
  documentato in `adapters/SUPPORT.md` ma non scritto. `generic-git/pre-commit`
  va installato **ovunque**: è la rete di sicurezza che blocca almeno i commit
  fuori fase anche senza adapter nativo.
- **`workflow/*.md`** — le 6 procedure di fase (discover/spec/plan/build/review/
  archive), markdown puro, eseguibili da qualunque agent che le legga.
- **`commands/*.md`** — i 14 comandi `/ultraspec:*` di Claude Code (le 6 fasi sono
  thin pointer a `workflow/`; `start/advance/approve/reopen/status/board/
  handoff/set-track` hanno contenuto proprio).
- **`bin/us`** — la CLI/macchina a stati dietro tutto. Bash + `jq`, si
  auto-localizza risalendo l'albero fino a `ultraspec/us.config.json`.
- **`workflows/<nome>/`** — dove ogni workflow scrive i suoi artefatti
  (`discovery.md`, `spec.md`, `plan.md`, `review.md`, `summary.md`). **Oggi è
  vuota**: nessun workflow reale è mai stato avviato.

Decisioni complete e motivate: `ultraspec/docs/design.md`. Contratto delle
fasi: `ultraspec/docs/workflow.md`. Guide passo-passo:
`ultraspec/docs/guide-greenfield.md` / `guide-brownfield.md`. Uso per agent:
`ultraspec/docs/agents.md`.

## Decisioni che contano (non riderivarle)

- **`human_approved` lo scrive solo `/ultraspec:approve`** — un comando (lo digita
  l'utente), mai il modello, mai `/ultraspec:advance`. Su Claude Code il modello
  *potrebbe* eseguire il comando via Bash, ma resta tracciato in `history` e non
  è forgiabile scrivendo lo stato a mano (immutabile). `AGENTS.md` istruisce
  esplicitamente l'agente a non farlo mai.
- **Ratchet a senso unico**: `/ultraspec:advance` va solo avanti; indietro solo
  `/ultraspec:reopen <fase> --reason "..."` (loggato, azzera le approvazioni a valle).
- **Auto-flow controllato**: quando l'agente entra in una fase, il banner
  (iniettato a ogni turno) e `AGENTS.md` lo istruiscono a eseguire da sé
  `workflow/<fase>.md` e **fermarsi al gate**. I comandi di controllo
  (`advance`/`approve`/`reopen`/`set-track`) restano sempre e solo dell'utente.
- **AGENTS.md canonico**, `CLAUDE.md` ne è una proiezione solo se l'agent è
  Claude Code (mai una seconda sorgente).
- Codice di prodotto editabile **solo da fase `build`**; commit solo in
  `build`/`review`/`archive`.
- **Ponytail in build/review** (D12, 11 settembre 2026): l'implementazione
  minima segue una scala YAGNI → riuso → stdlib → nativo → dipendenza esistente
  → una riga → minimo (`workflow/build.md`); la review ha una caccia separata
  alla complessità con tag `delete`/`stdlib`/`native`/`yagni`/`shrink` e un
  contatore `net: -N righe possibili` (`workflow/review.md`). Riscritto in
  prosa neutra, nessuna dipendenza dal plugin ponytail esterno da cui è
  ispirato — coerente con lo standalone (D6).

## Stato reale — cosa è VERO e cosa è SIMULATO

**Vero e verificato:**
- `ultraspec/tests/run.sh` → 9 file, **227 asserzioni verdi** (state lib,
  evento normalizzato, gate, adapter, CLI, continuità, packaging, E2E simulato
  intake→done).
- `bash -n` pulito su tutti gli script; `bin/us` provato a mano su un repo
  temporaneo (start/advance/board/status funzionano).
- Il plugin è registrato in `.claude/settings.json` di Kineta
  (`extraKnownMarketplaces` → `./ultraspec`, `enabledPlugins: ultraspec@ultraspec`).

**MAI verificato dal vivo — è la parte più a rischio:**
1. **Nessun payload reale di hook è mai stato catturato.** Le fixture in
   `tests/fixtures/cc_*.json` sono **sintetiche**, scritte dal contratto
   documentato dei hook di Claude Code, non da un payload osservato. Se un nome
   di campo è diverso nella realtà (es. `tool_input.file_path` si chiamasse
   altrimenti), il gate fallisce silenziosamente aperto (fail-open) — cioè
   **non blocca quando dovrebbe**, senza errore visibile.
2. **Gli hook non sono mai stati confermati attivi in questa sessione.** Un
   `.claude/settings.json` appena creato/modificato può richiedere di aprire
   `/hooks` una volta o riavviare Claude Code perché il watcher li carichi
   (limite noto del sistema di settings).
3. **Nessun workflow reale è mai stato avviato.** `/ultraspec:start` non è mai
   stato lanciato in una sessione vera; `ultraspec/workflows/` è vuota. Tutto
   ciò che sembra un "workflow completo" nei test è una simulazione con `bin/us`
   invocato direttamente, non attraverso un agente che decide da solo.
4. **`adapters/cursor/` e `adapters/codex/` sono cartelle vuote.** Zero codice,
   solo la riga promessa in `SUPPORT.md`. `adapters/gemini-cli/` idem, non
   documentata nemmeno come scaffold.
5. **Handoff e project memory** (`memory.enabled`) sono implementati e testati
   in unità ma mai usati in un caso reale multi-sessione.

## Se riparti da zero, in questo ordine

1. **Leggi questo file.** Non serve altro contesto per capire cosa fare dopo.
2. **Verifica l'ambiente**: `jq -V`, poi `bash ultraspec/tests/run.sh` — deve
   dare `ALL SUITES PASSED (9 files)`. Se qui è rosso, non toccare nient'altro
   finché non torna verde.
3. **Conferma che gli hook siano davvero attivi**: apri `/hooks` in una sessione
   Claude Code su questo repo (o riavvia), poi prova a far scrivere un file
   qualunque — se non c'è nessun workflow attivo non deve succedere nulla
   (fail-open corretto).
4. **Cattura un payload reale** (`ultraspec/RUNBOOK.md`, sezione 1, step 0):
   registra temporaneamente un hook che scarica lo stdin (`PreToolUse`,
   `SessionStart`, `UserPromptSubmit`, `Stop`, `PreCompact`), confronta i campi
   con `ultraspec/hooks/lib/us-event.sh`. Se qualcosa non combacia, corregilo
   lì e nelle fixture — è l'unico modo per sapere se il gate funziona davvero.
5. **Lancia il primo workflow reale** su un pezzo piccolo e vero di Kineta, in
   `brownfield` (`/ultraspec:start <nome>`). Segui `ultraspec/docs/guide-brownfield.md`.
   Aspettati di trovare bug che i test unitari non vedono: messaggi confusi,
   gate troppo o troppo poco aggressivi, campi hook sbagliati. È il punto.
6. Solo dopo un giro reale riuscito, valuta se scrivere gli adapter Cursor/Codex
   o estrarre il repo dedicato — non prima: sarebbe costruire su fondamenta mai
   verificate.

## Cosa NON fare per errore

- Non `/opsx:archive` né toccare `openspec/` per ultraspec: non esiste più
  nessun change OpenSpec per questa piattaforma (rimosso quando è diventata
  standalone) e non ne va creato uno nuovo qui — le sue specifiche vivono in
  `ultraspec/docs/`.
- Non editare `ultraspec/.us-state.json`, `us.config.json`, o gli script in
  `hooks/`/`adapters/`/`bin/` come se fossero normali file di progetto durante
  un workflow attivo — sono protetti apposta.
- Non aspettarti che `/ultraspec:advance` o `/ultraspec:approve` funzionino da soli:
  sono e restano azioni dell'utente.

## File di riferimento

| File | Contenuto |
|---|---|
| `ultraspec/README.md` | Panoramica, installazione, alias |
| `ultraspec/docs/design.md` | Tutte le decisioni architetturali (D1-D11) |
| `ultraspec/docs/workflow.md` | Contratto di ogni fase |
| `ultraspec/docs/guide-greenfield.md` / `guide-brownfield.md` | Percorso lineare passo-passo |
| `ultraspec/docs/agents.md` | Installazione e uso per Claude Code / OpenCode / altri |
| `ultraspec/RUNBOOK.md` | Le 3 verifiche live mai fatte, procedura esatta |
| `ultraspec/adapters/SUPPORT.md` | Cosa garantisce ogni adapter, per agent |
| `ultraspec/tests/` | 9 file, 227 asserzioni — la fonte di verità su cosa è testato |
