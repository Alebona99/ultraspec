---
description: Avvia un workflow ultraspec. Chiede greenfield o brownfield e crea lo stato.
argument-hint: "<nome-workflow>"
---

# /ultraspec:start

Avvia un nuovo workflow ultraspec.

## Passi

1. **Chiedi il track** (una sola domanda, poi fermati finché non risponde):
   > Questo lavoro è su un progetto **greenfield** (parte da zero, decisioni
   > libere) o **brownfield** (codebase esistente da rispettare)?

   Senza una risposta chiara, non procedere. Non indovinare.

2. **Nome del workflow**: usa l'argomento se dato, altrimenti chiedilo (kebab-case).

3. **Rileva l'harness** in uso (claude-code, opencode, …).

4. Esegui:
   ```
   bash "${CLAUDE_PLUGIN_ROOT}/bin/us" start <nome> --track <greenfield|brownfield> --harness <harness>
   ```
   Crea `ultraspec/workflows/<nome>/` (dove vivranno gli artefatti di fase) e
   lo state file in fase `intake`.

5. Annuncia lo stato e indica il passo successivo: `/ultraspec:discover`.

## Note

- Un solo workflow attivo per working copy. Per lavori paralleli usa un git
  worktree separato.
- Dopo `start` non fare altro: il prossimo passo è `/ultraspec:discover`, che
  l'utente invoca.
