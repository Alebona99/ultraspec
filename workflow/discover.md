# Fase DISCOVER

> Procedura neutrale. Qualunque agent la esegue leggendo questo file.
> Comando esplicito: `/ultraspec:discover` (Claude Code) — o l'agent la avvia da solo
> quando entra in questa fase (vedi AGENTS.md).

**Obiettivo:** produrre `ultraspec/workflows/<workflow>/discovery.md`.
**Gate per uscire:** `discovery.md` esiste. Nessuna approvazione utente.

## 0. Contesto

```
ultraspec/bin/us status
```
Prendi `track` e la cartella degli artefatti. Se `discovery.md` esiste già ed è
completo, riassumilo all'utente e passa al punto 4.

## 1. Lavoro — dipende dal track

### track = greenfield  (le decisioni si prendono e si registrano)

Parti da `templates/discovery.greenfield.md`. Con l'utente, una domanda alla
volta:

1. **Visione** — cosa costruiamo, per chi, come si misura il successo (3-5 frasi).
2. **Glossario di dominio** — i termini chiave e cosa significano *in questo
   progetto*. Tabella termine → significato.
3. **Decisioni fondamentali** (una per una, stile ADR): stack, struttura del
   progetto, confini dei moduli principali, persistenza/integrazioni. Per
   ognuna: contesto, decisione presa, alternative scartate, conseguenze.
4. **Assunzioni** — cosa diamo per vero e come/quando lo verifichiamo.
5. **Non-goal** — cosa esplicitamente NON costruiamo ora.
6. **Seam di test previsti** — dove testeremo, al punto più alto possibile, nel
   minor numero possibile.

### track = brownfield  (scopri i vincoli e non romperli)

Parti da `templates/discovery.brownfield.md`. Esplora il repo e cattura:

1. **Mappa del codebase** — moduli principali, confini, punti di ingresso, e
   soprattutto **dove vive la logica che questo lavoro tocca**.
2. **Convenzioni esistenti da rispettare** — linguaggio/framework/struttura
   cartelle, naming, gestione errori, logging, layout dei test, pattern
   architetturali in uso *e quali NON introdurre*.
3. **Area di impatto** — file/moduli che verranno toccati, interfacce pubbliche
   coinvolte, chi altro dipende da quelle interfacce.
4. **Seam di test** — quelli esistenti riutilizzabili (preferiti), quelli nuovi
   necessari (al punto più alto possibile).
5. **Characterization test da scrivere PRIMA** — l'elenco dei comportamenti
   attuali da bloccare con un test prima di modificare, per non introdurre
   regressioni.
6. **Rischi noti** entrando in quest'area — per ognuno: rischio → mitigazione.

## 2. File di istruzioni agente

Leggi `agent_instructions` da `ultraspec/us.config.json`:
- `auto` + agent = Claude Code → mantieni/aggiorna `CLAUDE.md`;
- `auto` + altro agent → genera/aggiorna `AGENTS.md` da `templates/AGENTS.md.tmpl`;
- valore esplicito (`AGENTS.md` / `CLAUDE.md` / `both`) → rispettalo.

`AGENTS.md` è la sorgente canonica. `CLAUDE.md`, se serve, ne è una **proiezione**
— non una seconda sorgente da mantenere in parallelo.

## 3. Cambio di track (opzionale)

Se durante la discovery capisci che il track scelto è sbagliato:
`ultraspec/bin/us set-track <greenfield|brownfield>` (funziona solo in
`intake`/`discover`), poi ricomincia dal punto 1.

## 4. Chiudi la fase

Salva il risultato come `ultraspec/workflows/<workflow>/discovery.md`. Poi
**fermati** e di' all'utente:

> Discovery completata (`discovery.md`). Rivedila. Per procedere:
> `/ultraspec:advance` → poi `/ultraspec:spec`.

Non eseguire `/ultraspec:advance` da solo: è un comando di controllo dell'utente.
