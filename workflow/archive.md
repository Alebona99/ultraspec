# Fase ARCHIVE

> Procedura neutrale. Comando esplicito: `/ultraspec:archive`.

**Obiettivo:** produrre `summary.md` e chiudere il workflow.
**Gate per uscire:** `summary.md` esiste **e** `/ultraspec:approve archive` (utente).
Dopo l'avanzamento la fase è `done` e il workflow è chiuso.

## Passi

1. `us status` — conferma fase `archive`.
2. Scrivi `ultraspec/workflows/<workflow>/summary.md` (da `templates/summary.md`):
   cosa è stato costruito, decisioni chiave, deviazioni dalla spec e perché, link
   ai commit, follow-up noti. Resta come traccia durevole del lavoro.
3. Se `memory.enabled` in `ultraspec/us.config.json`: proponi all'utente di
   salvare in `ultraspec/memory/` i fatti durevoli emersi (decisioni
   architetturali, trappole) — un file per fatto + una riga in `MEMORY.md`.
   Salva solo dopo conferma.
4. **Fermati**:
   > Summary scritto (`summary.md`). Per chiudere: `/ultraspec:approve archive`, poi `/ultraspec:advance`.
