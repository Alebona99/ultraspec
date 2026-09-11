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
- **bin/us** — la macchina a stati (bash + jq, si auto-localizza).
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

**Passo 0, sempre** — ultraspec vive in una cartella `ultraspec/` alla radice
del progetto che lo usa (stato, config e workflow ci si scrivono dentro).
Nel progetto target:

```
git submodule add https://github.com/Alebona99/ultraspec.git ultraspec
# oppure, senza submodule:
git clone https://github.com/Alebona99/ultraspec.git ultraspec && rm -rf ultraspec/.git
```

In breve — Claude Code come plugin locale, `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "ultraspec": { "source": { "source": "directory", "path": "./ultraspec" } }
  },
  "enabledPlugins": { "ultraspec@ultraspec": true }
}
```

più `./ultraspec/adapters/generic-git/install.sh` (il fallback git va su
**ogni** agent). OpenCode: aggiungi il plugin in `opencode.json`. Altri agent:
basta `AGENTS.md` (generato dalla fase discover) + il fallback git.

**Oppure, solo Claude Code, senza clonare a mano** — come plugin da
marketplace remoto:
```
/plugin marketplace add https://github.com/Alebona99/ultraspec
/plugin install ultraspec@ultraspec
```
Nota: `bin/us` e gli hook cercano comunque una cartella `ultraspec/` con dentro
`us.config.json` risalendo dal progetto — verificare che l'installazione plugin
la crei dove serve, o ripiegare sul Passo 0 se `bin/us status` non trova lo stato.

## Alias da shell

`bin/us` si auto-localizza risalendo fino a `ultraspec/us.config.json`, quindi:

```
alias ultraspec='<path-assoluto>/ultraspec/bin/us'
```

funziona da qualunque sottocartella di un repo che contiene `ultraspec/`.
I comandi `/ultraspec:*` usano invece `${CLAUDE_PLUGIN_ROOT}/bin/us`.

## Requisiti

- `jq` — hook shell (senza, i gate si disattivano con un warning a inizio sessione)
- `node` — solo per l'adapter OpenCode
- `python3` + `jsonschema` — solo per `tests/`

## Test

```
bash ultraspec/tests/run.sh
```

## Stato

In sviluppo. Verifica live end-to-end: [`RUNBOOK.md`](RUNBOOK.md).
