# workflow/ — procedure di fase neutrali

Un file per fase (`discover`, `spec`, `plan`, `build`, `review`, `archive`).
Sono **indipendenti dall'agent**: markdown puro, riferiscono il CLI come
`us` (che si auto-localizza).

- **Claude Code**: i comandi `/ultraspec:<fase>` puntano qui; l'agent le esegue
  anche da solo quando entra in una fase (vedi la sezione ultraspec di
  `AGENTS.md`/`CLAUDE.md`).
- **Altri agent**: `AGENTS.md` istruisce l'agent a leggere `workflow/<fase>.md`
  quando l'utente chiede quella fase o quando lo stato ci entra.

I **comandi di controllo** — `advance`, `approve`, `reopen`, `set-track` — NON
stanno qui: sono azioni dell'utente, mai automatiche.
