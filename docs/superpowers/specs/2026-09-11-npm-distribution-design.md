# Distribuzione npm di ultraspec — design

Data: 2026-09-11. Stato: approvato in chat, da implementare.

## Perché

ultraspec è stato estratto da Kineta in un repo dedicato
(`github.com/Alebona99/ultraspec`) l'11 settembre 2026, distribuito finora
come plugin Claude Code locale (`.claude-plugin/` + submodule/clone manuale
della cartella `ultraspec/` nel progetto ospite). L'utente vuole
un'installazione **tramite npm**, sul modello di `@fission-ai/openspec`
(CLI Node/TS globale, `openspec init` che scaffolda il progetto target).

Analisi di `@fission-ai/openspec` (installato globalmente su questa
macchina, `npm root -g`) ha mostrato il pattern di riferimento: pacchetto
Node/TS puro (niente bash/jq), `bin/openspec.js` → CLI compilata, comando
`init` che genera nel progetto ospite solo **dati + file di integrazione per
agent** (skill/comandi, generati da template interni al pacchetto), non una
copia del codice del tool. L'enforcement di openspec è però **advisory-only**
(skill che istruiscono l'agente a chiamare la CLI, nessun hook Claude Code
che blocca scritture) — l'opposto della scelta fondante di ultraspec (gate
**deterministici via hook**, D-qualcosa in `docs/design.md`: "non aggirabile
a piacere del modello"). Questo design adotta la distribuzione di openspec
**mantenendo** l'enforcement hard di ultraspec.

## Decisioni

### 1. Pacchetto e due vie di installazione, un solo codice

- Nome npm: **`ultraspec`** (libero, verificato su registry, non scoped).
- Stesso repo `Alebona99/ultraspec` diventa pubblicabile: si aggiungono
  `package.json`, `tsconfig.json`, `src/` (TypeScript), build in `dist/`.
  `bin: { "us": "./dist/cli.js", "ultraspec": "./dist/cli.js" }`.
- **Via npm**: `npm i -g ultraspec` (persistente) o `npx ultraspec init`
  (one-off, sempre ultima versione). Aggiornamenti con `npm update -g`.
- **Via marketplace Claude Code**: `/plugin marketplace add
  https://github.com/Alebona99/ultraspec`. `plugin.json`/`hooks.json`
  puntano a `${CLAUDE_PLUGIN_ROOT}/dist/cli.js`. Richiede `node` ma non
  npm/registry — nessuna installazione globale.
- **Le due vie condividono lo stesso `dist/`**: eccezione dichiarata alla
  regola "dist/ gitignored" — per la via marketplace `dist/` va committato
  (il plugin lo legge direttamente dal repo/dal clone del marketplace);
  per la via npm `dist/` si pubblica sul registry allo stesso commit. Zero
  logica duplicata, zero implementazioni bash parallele da tenere
  allineate: quella bash esistente viene sostituita, non affiancata.

### 2. Cosa genera `ultraspec init` nel progetto target

Mirror di openspec: `init` scrive dati e file di integrazione, non il
codice del tool (quello resta nel pacchetto/plugin globale).

Nel progetto ospite, cartella `ultraspec/`:
- `us.config.json`, `.us-state.json`, `workflows/`, `handoffs/`,
  `memory/` (opt-in) — **come oggi**.
- `workflow/*.md` — **copia locale, editabile** (decisione presa in
  conversazione: l'utente vuole poter personalizzare le procedure di fase
  per progetto). Non è nei `protected_always_globs`.
- **non più** `hooks/`, `bin/`, `adapters/`, `commands/`: quelli vivono nel
  pacchetto/plugin, non vengono copiati per progetto.

Fuori da `ultraspec/`:
- `.claude/settings.json` generato/mergiato con gli hook che chiamano il
  CLI globale (`us hook <evento>` via npm, o
  `${CLAUDE_PLUGIN_ROOT}/dist/cli.js hook <evento>` via plugin).
- `.claude/commands/ultraspec/*.md` generati da template interni al
  pacchetto — **solo per la via npm** (la via marketplace li porta già
  col plugin stesso, niente da generare).
- `AGENTS.md` aggiornato/generato per gli altri agent, come oggi.
- `adapters/generic-git/pre-commit` installato comunque (rete di
  sicurezza universale, resta uno script shell nativo — è un git hook,
  non ha senso portarlo in TS).

### 3. Aggiornamento (`ultraspec update`) e drift dei file locali

- File sempre rigenerati (mai editabili a mano, `protected_always_globs`):
  `.claude/commands/ultraspec/*.md`, la sezione hook di
  `.claude/settings.json`.
- `workflow/*.md`: si traccia, per file, con quale **versione del
  pacchetto** è stato scritto (piccolo manifest, es. in `us.config.json` o
  file dedicato `.ultraspec-manifest.json`). All'`update`:
  - file locale identico al template con cui è stato generato →
    aggiornato silenziosamente al nuovo template;
  - file locale modificato dall'utente → **non sovrascritto**, drift
    segnalato (es. "`workflow/build.md` personalizzato, nuova versione
    disponibile nel pacchetto: diff a mano o `--force`").
- `.us-state.json` / `us.config.json` mai toccati da `update`.

### 4. Runtime: state machine, hook, adapter in TypeScript

Porting 1:1 della logica esistente, cambia solo il linguaggio (bash+jq →
TS), non l'architettura (evento normalizzato → decisione normalizzata resta
il contratto):

- `bin/us` → `src/cli.ts`. Sottocomandi invariati (`start`, `advance`,
  `approve`, `reopen`, `status`, `board`, `handoff`, `set-track`) + nuovi
  (`init`, `update`, `hook`).
- `hooks/us-{gate,banner,stop-check,nudge}.sh` + `hooks/lib/us-{state,event,
  decision,context}.sh` → moduli `src/hooks/{gate,banner,stopCheck,
  nudge}.ts` + `src/lib/{state,event,decision,context}.ts`.
- Adapter **tutti** portati in TS in questa iterazione: `claude-code`,
  `opencode`; `generic-git/pre-commit` resta shell (è un git hook nativo);
  scaffold `cursor`/`codex` invariati (cartelle vuote, documentate in
  `adapters/SUPPORT.md`).
- Dipendenza da `jq` eliminata: solo `node` richiesto.

### 5. Test

- Le 227 asserzioni bash (`tests/*.sh`) diventano test **Vitest**, stessa
  suddivisione per file (`state`, `event`, `decision`, `context`, `gate`,
  `adapters`, `cli`, `continuity`, `e2e`) — porting dei casi esistenti, non
  un redesign della suite.

### 6. Release

- Script `build` (tsc) + `prepublishOnly` che lancia i test.
- Versionamento manuale (`npm version`), niente changesets/CI automatica
  per ora (YAGNI, un solo maintainer).

## Non-goal di questa iterazione

- Nessuna migrazione automatica per progetti che avevano già ultraspec
  installato come submodule/clone bash (nessuno lo ha ancora in uso reale
  fuori da Kineta, che è già stato ripulito).
- Nessun sistema di plugin/estensioni di terze parti.
- Nessun changelog/release-notes automatizzato.

## Prossimo passo

Piano di implementazione via `writing-plans` (TDD, un modulo alla volta:
state-lib → event → decision → gate → context → cli → adapter
claude-code → init/update → adapter opencode).
