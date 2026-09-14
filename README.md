# ultraspec

Una piattaforma che impone **una singola pipeline di sviluppo** —
`discover → spec → plan → build → review → archive` — biforcata in ingresso su
progetto **greenfield** o **brownfield**, e la fa rispettare con gate
deterministici basati su hook, portabili su più harness (Claude Code, OpenCode, …).

Standalone: nessuna dipendenza da altri plugin. Funziona con **più agent**
(Claude Code, OpenCode, Cursor, Codex, …).

- **Guida passo-passo:** [`docs/guide-greenfield.md`](docs/guide-greenfield.md) ·
  [`docs/guide-brownfield.md`](docs/guide-brownfield.md)
- **Contratto delle fasi:** [`docs/workflow.md`](docs/workflow.md)
- **Architettura / decisioni:** [`docs/design.md`](docs/design.md)
- **Uso con agent diversi:** [`docs/agents.md`](docs/agents.md)

## Come funziona

```
  .us-state.json  (unica verità: workflow, track, fase, gate, log)
        ^                         ^
  legge | (hook)          scrive | (solo us advance / approve / reopen)
        |                         |
  hooks/ (core harness-neutral)   commands/ (i comandi /ultraspec:*)
        |
  adapters/<harness>/  (traduzione evento nativo <-> evento normalizzato)
  adapters/generic-git/pre-commit  (rete di sicurezza universale, su OGNI harness)
```

- **hooks/** — tutta la logica di enforcement, harness-neutral. Legge un
  *evento normalizzato* (`session_start`, `user_prompt`, `pre_write`, `pre_bash`,
  `stop`, `pre_compact`, `post_write`), restituisce una *decisione*
  (`allow | deny | block | nudge`). Fail-open: senza `.us-state.json`, zero blocchi.
- **adapters/** — un traduttore sottile per harness (`claude-code`, `opencode`,
  `generic-git`; `cursor`/`codex` scaffold). Contratto in
  [`docs/adapters.md`](docs/adapters.md), matrice in
  [`adapters/SUPPORT.md`](adapters/SUPPORT.md).
- **workflow/** — le procedure di fase, **markdown neutro**: qualunque agent le
  esegue leggendole. `commands/` (Claude Code) e `AGENTS.md` (altri agent)
  puntano qui.
- **commands/** — i comandi slash `/ultraspec:*` per Claude Code.
- **`dist/cli.js`** — la macchina a stati, TypeScript compilato, esposto come
  binario npm `us`/`ultraspec`.
- **workflows/** — gli artefatti di ogni workflow (`ultraspec/workflows/<nome>/`).

L'agent **esegue da solo** la procedura di fase quando ci entra (il riepilogo
degli hook e `AGENTS.md` glielo dicono) e si ferma ai gate. I **comandi di
controllo** — `advance`, `approve`, `reopen`, `set-track` — restano **solo
dell'utente**.

## Comandi

```
/ultraspec:start <nome>            # chiede greenfield/brownfield, crea lo stato
/ultraspec:status                  # dove sei, cosa manca, come sbloccare
/ultraspec:board                   # panoramica: workflow + artefatti + test + handoff + history
/ultraspec:discover                # fase discover
/ultraspec:spec /ultraspec:plan /ultraspec:build /ultraspec:review /ultraspec:archive
/ultraspec:approve <fase>          # SOLO UTENTE — sblocca un gate
/ultraspec:advance                 # avanza (solo se il gate è soddisfatto)
/ultraspec:reopen <fase> --reason "..."   # SOLO UTENTE — torna indietro
/ultraspec:set-track greenfield|brownfield # solo in intake/discover
/ultraspec:handoff                 # handoff per la prossima sessione
```

## Installazione

Istruzioni complete per ogni agent in **[`docs/agents.md`](docs/agents.md)**.

**Via npm (consigliata):**
```
npm i -g ultraspec
cd il-tuo-progetto
ultraspec init
```
Genera `ultraspec/` (stato, config, procedure di fase editabili) e
`.claude/commands/ultraspec/*.md` + gli hook in `.claude/settings.json`.
Aggiornamenti: `npm update -g ultraspec && ultraspec update`.

**Via marketplace Claude Code (nessuna installazione globale):**
```
/plugin marketplace add https://github.com/Alebona99/ultraspec
/plugin install ultraspec@ultraspec
```
Richiede `node`, non npm/registry. In questo caso serve comunque
`ultraspec init` (via `npx ultraspec init` o dal `dist/cli.js` del plugin)
per creare la cartella `ultraspec/` dati nel progetto.

## Uso in locale (senza pubblicare su npm)

Il pacchetto non è ancora su npm (`npm i -g ultraspec` funzionerà solo dopo
la prima `npm publish`). Nel frattempo, da un clone di questo repo:

```
npm install
npm run build
npm link          # registra `us`/`ultraspec` globalmente, puntando a questo checkout
```

Poi in un progetto qualsiasi:
```
cd il-tuo-progetto
ultraspec init
```

`npm link` crea un symlink globale al `dist/cli.js` di questo checkout: ogni
`npm run build` successivo (dopo aver modificato `src/`) si riflette subito,
senza rifare `npm link`. Per disinstallare: `npm unlink -g ultraspec`.

Se non vuoi nemmeno il link globale, puoi invocare la CLI direttamente:
```
node /percorso/assoluto/al/repo/dist/cli.js init
node /percorso/assoluto/al/repo/dist/cli.js status
```

## Requisiti

- `node` >= 18 — l'unico requisito, sia per usare il pacchetto pubblicato sia
  per buildare/testare questo repo (`npm run build && npm test`, Vitest)

## Test

```
npm run build && npm test
```

## Stato

In sviluppo. Verifica live end-to-end: [`RUNBOOK.md`](RUNBOOK.md).
