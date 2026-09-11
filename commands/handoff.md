---
description: Scrive un documento di handoff per la prossima sessione di chat del workflow corrente.
---

# /ultraspec:handoff

Scrivi un handoff così che una sessione nuova riparta senza rileggere tutto.

## Passi

1. Ricava il percorso:
   ```
   bash "${CLAUDE_PLUGIN_ROOT}/bin/us" handoff-path
   ```
2. Scrivi quel file da `templates/handoff.md`:
   - **Fase / stato in una riga**: da `/ultraspec:status`.
   - **Fatto in questa sessione**: sintesi — referenzia commit e file, **non
     incollare diff né il contenuto di `spec.md`/`plan.md`**.
   - **Prossima azione**: la singola cosa concreta da fare.
   - **Questioni aperte**.
   - **Comandi suggeriti**: sempre `/ultraspec:status`, poi il comando di fase.
3. **Redigi ogni segreto** (chiavi API, password, PII): l'handoff verrà iniettato
   come contesto alla prossima sessione.
4. Registra:
   ```
   bash "${CLAUDE_PLUGIN_ROOT}/bin/us" handoff-done <file>
   ```

L'handoff è **effimero** — consumato una volta alla ripresa. Non scrivere nulla
in `ultraspec/memory/` da qui: quella è conoscenza durevole, separata.
