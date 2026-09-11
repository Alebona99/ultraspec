# Guida — workflow brownfield

Percorso lineare per un lavoro su un **codebase esistente**: ci sono già
pattern, convenzioni, decisioni e cicatrici. L'obiettivo della fase `discover`
qui è **scoprire i vincoli e non romperli**.

Ogni comando è `/ultraspec:<azione>` su Claude Code; su altri agent, "esegui la
fase X di ultraspec" oppure `bash ultraspec/bin/us <sotto-comando>`.

Legenda gate: 🟢 automatico (basta l'artefatto) · 🔴 richiede `/ultraspec:approve`.

---

## 0. Prerequisiti

- `ultraspec/` presente nel repo e il plugin/hook attivi (vedi
  `docs/agents.md`).
- `jq` installato.
- Un solo workflow attivo per working copy. Per lavori paralleli: git worktree.

---

## 1. `/ultraspec:start <nome>` — INTAKE

L'agent chiede: **greenfield o brownfield?** → rispondi **brownfield**.

Crea `.us-state.json` (fase `intake`, track `brownfield`) e
`ultraspec/workflows/<nome>/`.

Finché non raggiungi `build`, ogni scrittura di codice di prodotto è **bloccata**.

**Prossimo:** `/ultraspec:advance`.

---

## 2. `/ultraspec:advance` → `/ultraspec:discover` — DISCOVER  🟢 `discovery.md`

L'agent segue `ultraspec/workflow/discover.md`. Per il brownfield esplora il
repo e produce `ultraspec/workflows/<nome>/discovery.md` con:

| Sezione | Contenuto |
|---|---|
| Mappa del codebase | moduli principali, confini, punti di ingresso, **dove vive la logica che questo lavoro tocca** |
| Convenzioni esistenti da rispettare | linguaggio/framework/struttura, naming, error handling, logging, layout dei test, pattern in uso *e quali NON introdurre* |
| Area di impatto | file/moduli toccati, interfacce pubbliche coinvolte, chi dipende da quelle interfacce |
| Seam di test | quelli esistenti riusabili (preferiti), quelli nuovi necessari |
| Characterization test da scrivere PRIMA | i comportamenti attuali da bloccare con un test prima di toccare il codice |
| Rischi noti | per ognuno: rischio → mitigazione |

L'agent genera/aggiorna anche `AGENTS.md` (o `CLAUDE.md`) dal template.

**Rivedi `discovery.md`.** Verifica che la mappa e i vincoli siano corretti — è
la base per non rompere nulla. Se ok → `/ultraspec:advance`.

---

## 3. `/ultraspec:advance` → `/ultraspec:spec` — SPEC  🔴 `spec.md` + approve

Come nel greenfield, ma con un'attenzione in più:

- le **user story** e i **contratti** descrivono la modifica *dentro* il sistema
  esistente, non un sistema da zero;
- nella sezione **Seam di test**, i characterization test individuati in
  discovery vanno elencati come **primo lavoro** della fase build;
- le **Decisioni di implementazione** dicono quali interfacce esistenti si
  toccano e come, restando compatibili con chi ne dipende.

Auto-review, poi stop.

**Rivedi `spec.md`.** Se ok:
```
/ultraspec:approve spec
/ultraspec:advance
```

---

## 4. `/ultraspec:advance` → `/ultraspec:plan` — PLAN  🔴 `plan.md` + approve

L'agent segue `ultraspec/workflow/plan.md`. Nel brownfield:

- la **struttura dei file** rispetta i pattern già presenti: se il codebase usa
  file grandi non li spezzare unilateralmente; se un file che tocchi è già
  ingestibile, includere uno split mirato è ragionevole;
- il **Task 1** (o i primi task) scrive i **characterization test** — bloccano il
  comportamento attuale prima di modificarlo;
- ogni task modifica indica i **range di righe** e le interfacce esatte.

**Rivedi il piano.** Se ok:
```
/ultraspec:approve plan
/ultraspec:advance
```

---

## 5. `/ultraspec:advance` → `/ultraspec:build` — BUILD  🟢

**Da qui le modifiche a codice sono sbloccate e i commit consentiti.**

L'agent implementa `plan.md` un task alla volta. I characterization test devono
restare **verdi** per tutta la fase: se ne rompi uno, o hai introdotto una
regressione, o quel comportamento andava cambiato di proposito (e allora
aggiorna il test con una nota).

Quando tutti i task sono verdi → `/ultraspec:advance`.

---

## 6. `/ultraspec:advance` → `/ultraspec:review` — REVIEW  🔴 `review.md` + approve

Rivedi il diff. Nel brownfield pesa di più:

- **regressioni** — comportamenti esistenti non toccati che potrebbero essere
  cambiati per effetto collaterale;
- **compatibilità** — le interfacce pubbliche modificate rompono chi ne dipende?
- **coerenza** con le convenzioni catturate in discovery.

Findings in `review.md`, fix applicati.

**Rivedi `review.md`.** Se ok:
```
/ultraspec:approve review
/ultraspec:advance
```

---

## 7. `/ultraspec:advance` → `/ultraspec:archive` — ARCHIVE  🔴 `summary.md` + approve

`summary.md` con: cosa è cambiato, decisioni, **deviazioni dai vincoli di
discovery e perché**, commit, follow-up.

```
/ultraspec:approve archive
/ultraspec:advance
```

Stato → `done`.

---

## Situazioni

| Situazione | Cosa fare |
|---|---|
| La discovery ha sottovalutato l'impatto | `/ultraspec:reopen discover --reason "..."` e completa la mappa |
| Un characterization test rompe in build | fermati: regressione o cambio voluto? Nel secondo caso aggiorna il test con nota |
| Un'operazione è stata bloccata | `/ultraspec:status` |
| Contesto pesante | `/ultraspec:handoff` |
| Panoramica | `/ultraspec:board` |
