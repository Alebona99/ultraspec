# Il workflow ultraspec

```
                 /ultraspec:start  (chiede greenfield | brownfield)
                     |
              +------+------+
              |   INTAKE     |  crea .us-state.json + ultraspec/workflows/<nome>/
              +------+------+
                     | /ultraspec:advance   (nessun gate)
                     v
   greenfield  <-- DISCOVER -->  brownfield
   visione, glossario,           mappa del codebase, convenzioni,
   decisioni (ADR),              area di impatto, characterization test,
   seam di test                  genera/aggiorna AGENTS.md|CLAUDE.md
   -> discovery.md               -> discovery.md
                     | /ultraspec:advance   gate: discovery.md
                     v
              +------------+
              |   SPEC     |  problema, soluzione, user story, contratti, seam
              +-----+------+  gate: spec.md + /ultraspec:approve spec
                    | /ultraspec:advance
                    v
              +------------+
              |   PLAN     |  file per task, task TDD bite-sized, interfacce
              +-----+------+  gate: plan.md + /ultraspec:approve plan
                    | /ultraspec:advance
                    v
              +------------+   <-- da qui l'hook pre_write NON blocca piu' src/**
              |   BUILD    |  implementa plan.md task per task (scala YAGNI->
              +-----+------+  minimo), commit frequenti
                    |          gate: (nessun artefatto) - avanzi quando i task sono verdi
                    | /ultraspec:advance
                    v
              +------------+
              |   REVIEW   |  rivedi il diff: correttezza, sicurezza, spec,
              +-----+------+  test, complessita (ponytail)
                    |          gate: review.md + /ultraspec:approve review
                    |           (l'hook stop ti trattiene finche' manca il file)
                    | /ultraspec:advance
                    v
              +------------+
              |  ARCHIVE   |  summary.md
              +-----+------+  gate: summary.md + /ultraspec:approve archive
                    | /ultraspec:advance
                    v
                  DONE
```

Gli artefatti di ogni workflow vivono in `ultraspec/workflows/<nome>/`
(`discovery.md`, `spec.md`, `plan.md`, `review.md`, `summary.md`).

La procedura dettagliata di ogni fase è in `ultraspec/workflow/<fase>.md`
(markdown neutro, ogni agent la esegue leggendola). Guida passo-passo:
`docs/guide-greenfield.md` e `docs/guide-brownfield.md`.

## Contratto per fase

| Fase | Comando | Artefatto richiesto | Approvazione utente | Codice editabile |
|---|---|---|---|---|
| intake | `/ultraspec:start` | — | no | no |
| discover | `/ultraspec:discover` | `discovery.md` | no | no |
| spec | `/ultraspec:spec` | `spec.md` | **sì** (`/ultraspec:approve spec`) | no |
| plan | `/ultraspec:plan` | `plan.md` | **sì** | no |
| build | `/ultraspec:build` | — | no | **sì** |
| review | `/ultraspec:review` | `review.md` | **sì** | sì |
| archive | `/ultraspec:archive` | `summary.md` | **sì** | sì |

## Regole trasversali

- **Ratchet a senso unico**: `/ultraspec:advance` va solo avanti. Indietro solo con
  `/ultraspec:reopen <fase> --reason "..."` (azione utente, motivo loggato,
  approvazioni a valle azzerate).
- **`human_approved` lo scrive solo `/ultraspec:approve`** — mai un comando di fase,
  mai `/ultraspec:advance`.
- **Commit** consentiti solo in `build` / `review` / `archive` (hook `pre_bash` +
  `generic-git/pre-commit` su ogni harness).
- **Immutabilità**: `.us-state.json`, `us.config.json` e gli script in
  `hooks/`/`adapters/`/`bin/` non sono scrivibili dall'agente in nessuna fase.
- **Un solo workflow per working copy**. Lavori paralleli → git worktree separati.
- **Track**: si cambia solo in `intake`/`discover` (`/ultraspec:set-track`).
- **Continuità**: machine log continuo, nudge `/ultraspec:handoff` ai breakpoint,
  ripresa automatica all'avvio sessione. Meccanismo hook in `docs/adapters.md`,
  livello di enforcement per harness in `adapters/SUPPORT.md`.
