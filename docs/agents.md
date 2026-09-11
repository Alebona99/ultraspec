# ultraspec con agent diversi

ultraspec ha **tre strati**, indipendenti dall'agent tranne l'ultimo:

1. **`bin/us`** — la macchina a stati. Bash + `jq`. Si auto-localizza risalendo
   fino a `ultraspec/us.config.json`. Funziona ovunque.
2. **`workflow/*.md`** — le procedure di fase, markdown puro. Qualunque agent le
   esegue leggendole.
3. **`hooks/` + `adapters/<agent>/`** — l'enforcement. Il core è neutro; ogni
   agent ha un adapter di ~40 righe che traduce i suoi hook nativi.

Il livello di enforcement per agent è in [`../adapters/SUPPORT.md`](../adapters/SUPPORT.md).
**Su ogni agent** si installa anche `adapters/generic-git/pre-commit`: anche
dove l'intercettazione della singola scrittura è debole, un commit fuori fase
fallisce.

---

## Claude Code — first-class

- **Comandi** `/ultraspec:*` dal plugin.
- **Hook** dall'adapter `claude-code` (via `plugin.json` o `.claude/settings.json`).
- **Auto-flow**: gli hook iniettano il riepilogo di fase a ogni turno; `CLAUDE.md`
  istruisce l'agent a seguire `workflow/<fase>.md` quando entra in una fase.

### Come plugin locale (repo che contiene `ultraspec/`)

Prima di tutto, aggiungi questo repo come `ultraspec/` alla radice del
progetto (submodule consigliato, per poter aggiornare senza vendorizzare):
```
git submodule add https://github.com/Alebona99/ultraspec.git ultraspec
```

`.claude/settings.json`:
```json
{
  "extraKnownMarketplaces": {
    "ultraspec": { "source": { "source": "directory", "path": "./ultraspec" } }
  },
  "enabledPlugins": { "ultraspec@ultraspec": true }
}
```
poi `./ultraspec/adapters/generic-git/install.sh` e, la prima volta, apri
`/hooks` una volta (o riavvia) per attivare gli hook.

### Come plugin da marketplace

```
/plugin marketplace add <path-o-URL>/ultraspec
/plugin install ultraspec@ultraspec
```

---

## OpenCode — first-class per gli hook

Prima di tutto, aggiungi questo repo come `ultraspec/` alla radice del
progetto (vedi il Passo 0 di Claude Code sopra).

- **Hook** dall'adapter `adapters/opencode/plugin.ts`. In `opencode.json`:
  ```json
  { "plugin": ["./ultraspec/adapters/opencode/plugin.ts"] }
  ```
  più `./ultraspec/adapters/generic-git/install.sh`.
- Blocca le scritture fuori fase (il plugin lancia un errore), inietta il
  riepilogo nel primo messaggio, appende al machine log.
- **Comandi**: non ci sono `/ultraspec:*` nativi. Usa `AGENTS.md` (vedi sotto) o
  chiedi "esegui la fase X di ultraspec". Il turn-end (`stop` gate) è
  advisory: `bin/us status` riporta `enforcement: parziale`.

---

## Cursor, Codex, e qualunque altro agent — via AGENTS.md

0. Aggiungi questo repo come `ultraspec/` alla radice del progetto (vedi sopra,
   `git submodule add`).
1. Installa il fallback: `./ultraspec/adapters/generic-git/install.sh`.
   Questo da solo garantisce che **nessun commit fuori fase passi**.
2. Assicurati che `AGENTS.md` alla radice del repo contenga la sezione
   "Workflow ultraspec" (la fase `discover` la genera dal template; oppure
   copiala da `templates/AGENTS.md.tmpl`).
3. L'agent legge `AGENTS.md` e sa:
   - eseguire `bash ultraspec/bin/us status` a inizio turno;
   - seguire `ultraspec/workflow/<fase>.md` quando è in una fase di lavoro;
   - **non** eseguire mai `advance` / `approve` / `reopen` / `set-track` — sono
     dell'utente;
   - non toccare `.us-state.json` / `us.config.json` / `hooks|adapters|bin/`.
4. L'utente guida con `bash ultraspec/bin/us <sotto-comando>`
   (`start`, `advance`, `approve`, …) o chiedendo la fase all'agent.

Enforcement effettivo senza adapter nativo: **commit bloccati fuori fase**
(fallback git) + gate rispettati per disciplina (l'agent segue `AGENTS.md`). Le
singole scritture di codice non sono intercettate → il momento di verità è il
commit.

### Scrivere un adapter nativo per un nuovo agent

Vedi [`adapters.md`](adapters.md): mappa gli eventi nativi → evento normalizzato,
traduci la decisione → meccanismo di blocco nativo, aggiungi una riga a
`SUPPORT.md`, aggiungi i test in `tests/test_adapters.sh`. ~40 righe.

---

## Cosa serve, per agent

| | bin/us (jq) | fallback git | adapter hook | comandi nativi |
|---|---|---|---|---|
| Claude Code | ✅ | ✅ | ✅ pieno | ✅ `/ultraspec:*` |
| OpenCode | ✅ | ✅ | ✅ (no turn-end) | ➖ via AGENTS.md |
| Cursor | ✅ | ✅ | scaffold | ➖ via AGENTS.md |
| Codex | ✅ | ✅ | scaffold | ➖ via AGENTS.md |
| altro | ✅ | ✅ | — | ➖ via AGENTS.md |
