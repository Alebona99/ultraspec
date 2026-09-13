# ultraspec con agent diversi

ultraspec ha **tre strati**, indipendenti dall'agent tranne l'ultimo:

1. **`dist/cli.js`** (binario npm `us`/`ultraspec`) — la macchina a stati.
   TypeScript compilato, si auto-localizza risalendo fino a
   `ultraspec/us.config.json`. Funziona ovunque `node` sia disponibile.
2. **`workflow/*.md`** — le procedure di fase, markdown puro. Qualunque agent le
   esegue leggendole.
3. **`hooks/` + `adapters/<agent>/`** — l'enforcement. Il core è neutro; ogni
   agent ha un adapter di ~40 righe che traduce i suoi hook nativi.

Il livello di enforcement per agent è in [`../adapters/SUPPORT.md`](../adapters/SUPPORT.md).
**Su ogni agent** si installa anche `adapters/generic-git/pre-commit`: anche
dove l'intercettazione della singola scrittura è debole, un commit fuori fase
fallisce.

Prima di tutto, in qualunque progetto:
```
npm i -g ultraspec
cd il-tuo-progetto
ultraspec init
```
`init` scaffolda `ultraspec/` (stato, config, procedure di fase), genera
`.claude/commands/ultraspec/*.md`, aggiunge gli hook a `.claude/settings.json`,
installa il fallback `adapters/generic-git/pre-commit` nel repo e crea
`AGENTS.md` se manca. Aggiornamenti: `npm update -g ultraspec && ultraspec update`.

---

## Claude Code — first-class

- **Comandi** `/ultraspec:*` — generati in `.claude/commands/ultraspec/` da
  `ultraspec init` (chiamano il binario `us` sul PATH).
- **Hook** dall'adapter `claude-code`, aggiunti direttamente a
  `.claude/settings.json` da `ultraspec init` — oppure, come plugin, da
  `.claude-plugin/plugin.json` (che punta ad `adapters/claude-code/hooks.json`).
- **Auto-flow**: gli hook iniettano il riepilogo di fase a ogni turno; `CLAUDE.md`
  istruisce l'agent a seguire `workflow/<fase>.md` quando entra in una fase.

### Via npm (consigliata)

```
npm i -g ultraspec
cd il-tuo-progetto
ultraspec init
```
La prima volta, apri `/hooks` una volta (o riavvia Claude Code) per attivare
gli hook appena scritti in `.claude/settings.json`.

### Via marketplace Claude Code (nessuna installazione globale)

```
/plugin marketplace add https://github.com/Alebona99/ultraspec
/plugin install ultraspec@ultraspec
```
Richiede `node`, non npm/registry. Serve comunque `ultraspec init` (via
`npx ultraspec init`, o dal `dist/cli.js` del plugin) per creare la cartella
dati `ultraspec/` nel progetto.

---

## OpenCode — first-class per gli hook

```
npm i -g ultraspec
cd il-tuo-progetto
ultraspec init
```
Questo dà già la macchina a stati (`us`/`ultraspec` sul PATH) e il fallback
`adapters/generic-git/pre-commit`.

- **Hook** dall'adapter `adapters/opencode/plugin.ts`. Il file è incluso nel
  pacchetto npm pubblicato (vedi `files` in `package.json`), quindi è già
  presente dove `npm` installa il pacchetto — `$(npm root -g)/ultraspec/adapters/opencode/plugin.ts`
  per un'installazione globale, `./node_modules/ultraspec/adapters/opencode/plugin.ts`
  per una locale al progetto. `init` non copia questo file dentro
  `ultraspec/`: in `opencode.json` punta al percorso reale del pacchetto
  installato, es.:
  ```json
  { "plugin": ["./node_modules/ultraspec/adapters/opencode/plugin.ts"] }
  ```
  In alternativa, con un checkout del repo (o l'installazione via
  marketplace/plugin locale di Claude Code), punta al percorso del checkout:
  `{ "plugin": ["<path-al-checkout>/adapters/opencode/plugin.ts"] }`.
- Blocca le scritture fuori fase (il plugin lancia un errore), inietta il
  riepilogo nel primo messaggio, appende al machine log.
- **Comandi**: non ci sono `/ultraspec:*` nativi. Usa `AGENTS.md` (vedi sotto) o
  chiedi "esegui la fase X di ultraspec". Il turn-end (`stop` gate) è
  advisory: `us status` riporta `enforcement: parziale`.

---

## Cursor, Codex, e qualunque altro agent — via AGENTS.md

0. `npm i -g ultraspec && cd il-tuo-progetto && ultraspec init` — questo da
   solo installa già il fallback `adapters/generic-git/pre-commit`, che
   garantisce che **nessun commit fuori fase passi**.
1. Assicurati che `AGENTS.md` alla radice del repo contenga la sezione
   "Workflow ultraspec" (generata da `ultraspec init`, o rigenerata da
   `templates/AGENTS.md.tmpl`).
2. L'agent legge `AGENTS.md` e sa:
   - eseguire `us status` a inizio turno;
   - seguire `ultraspec/workflow/<fase>.md` quando è in una fase di lavoro;
   - **non** eseguire mai `advance` / `approve` / `reopen` / `set-track` — sono
     dell'utente;
   - non toccare `.us-state.json` / `us.config.json` / `hooks|adapters/`.
3. L'utente guida con `us <sotto-comando>` (`start`, `advance`, `approve`, …)
   o chiedendo la fase all'agent.

Enforcement effettivo senza adapter nativo: **commit bloccati fuori fase**
(fallback git) + gate rispettati per disciplina (l'agent segue `AGENTS.md`). Le
singole scritture di codice non sono intercettate → il momento di verità è il
commit.

### Scrivere un adapter nativo per un nuovo agent

Vedi [`adapters.md`](adapters.md): mappa gli eventi nativi → evento normalizzato,
traduci la decisione → meccanismo di blocco nativo, aggiungi una riga a
`SUPPORT.md`, aggiungi i test in `tests/adapters/`. ~40 righe.

---

## Cosa serve, per agent

| | CLI `us` (npm/node) | fallback git | adapter hook | comandi nativi |
|---|---|---|---|---|
| Claude Code | ✅ | ✅ | ✅ pieno | ✅ `/ultraspec:*` |
| OpenCode | ✅ | ✅ | ✅ (no turn-end) | ➖ via AGENTS.md |
| Cursor | ✅ | ✅ | scaffold | ➖ via AGENTS.md |
| Codex | ✅ | ✅ | scaffold | ➖ via AGENTS.md |
| altro | ✅ | ✅ | — | ➖ via AGENTS.md |
