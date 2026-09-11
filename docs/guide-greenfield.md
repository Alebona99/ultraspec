# Guida — workflow greenfield

Percorso lineare per un progetto (o sottosistema) **nuovo**: nessun codice
esistente, le decisioni sono libere e vanno **prese e registrate**.

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

L'agent chiede: **greenfield o brownfield?** → rispondi **greenfield**.

Crea:
- `ultraspec/.us-state.json` (fase `intake`, track `greenfield`);
- `ultraspec/workflows/<nome>/` (vuota, si riempirà fase per fase).

Da qui in poi, finché non raggiungi `build`, ogni tentativo di scrivere codice
di prodotto (`src/**`, `app/**`, …) viene **bloccato** dagli hook.

**Prossimo:** `/ultraspec:advance` (nessun gate su intake).

---

## 2. `/ultraspec:advance` → `/ultraspec:discover` — DISCOVER  🟢 `discovery.md`

L'agent segue `ultraspec/workflow/discover.md`. Per il greenfield produce, una
domanda alla volta, `ultraspec/workflows/<nome>/discovery.md` con:

| Sezione | Contenuto |
|---|---|
| Visione | cosa costruiamo, per chi, come si misura il successo |
| Glossario di dominio | i termini chiave e il loro significato in *questo* progetto |
| Decisioni fondamentali (ADR) | stack, struttura del progetto, confini dei moduli, persistenza/integrazioni — per ognuna: contesto, decisione, alternative scartate, conseguenze |
| Assunzioni | cosa diamo per vero, come lo verifichiamo |
| Non-goal | cosa NON costruiamo ora |
| Seam di test previsti | dove testeremo, al punto più alto, nel minor numero |

L'agent genera anche `AGENTS.md` (o `CLAUDE.md` su Claude Code) dal template,
con la sezione ultraspec.

Puoi ancora cambiare idea sul track: `/ultraspec:set-track brownfield`.

**Rivedi `discovery.md`.** Se ok → `/ultraspec:advance`.

---

## 3. `/ultraspec:advance` → `/ultraspec:spec` — SPEC  🔴 `spec.md` + approve

L'agent segue `ultraspec/workflow/spec.md` e produce
`ultraspec/workflows/<nome>/spec.md`: **contratto di comportamento**, non
implementazione.

- Problema e soluzione dal punto di vista dell'utente.
- **User story** — elenco numerato ed esteso ("Come <attore>, voglio <x>, così che <y>").
- Comportamento / contratti: input, output, errori, vincoli esterni, scenari
  WHEN/THEN.
- Decisioni di implementazione: moduli e interfacce, schema, contratti API
  (niente path o snippet).
- Seam di test. Fuori scope.

L'agent fa un'auto-review (placeholder, contraddizioni, ambiguità, scope) e si
ferma.

**Rivedi `spec.md`.** Se ok:
```
/ultraspec:approve spec
/ultraspec:advance
```

> `/ultraspec:advance` viene rifiutato se `spec.md` manca **o** se non hai fatto
> `/ultraspec:approve spec`. L'agent non può approvare al posto tuo.

---

## 4. `/ultraspec:advance` → `/ultraspec:plan` — PLAN  🔴 `plan.md` + approve

L'agent segue `ultraspec/workflow/plan.md` e produce
`ultraspec/workflows/<nome>/plan.md`: piano di implementazione assumendo un
implementatore che non conosce il codebase.

- **Struttura dei file**: ogni file da creare + la sua unica responsabilità.
- **Task bite-sized** (2-5 min a passo): test che fallisce → verifica fallimento
  → implementazione minima → verifica successo → commit. Con file e interfacce
  esatte per ogni task.
- Niente placeholder. Self-review contro la spec.

**Rivedi il piano.** Se ok:
```
/ultraspec:approve plan
/ultraspec:advance
```

---

## 5. `/ultraspec:advance` → `/ultraspec:build` — BUILD  🟢 (nessun artefatto)

**Da qui le modifiche a codice sono sbloccate e i commit consentiti.**

L'agent segue `ultraspec/workflow/build.md`: implementa `plan.md` un task alla
volta, TDD, commit frequenti. Se il piano si rivela sbagliato l'agent si ferma e
propone `/ultraspec:reopen plan --reason "..."`.

Quando tutti i task sono verdi → `/ultraspec:advance`.

---

## 6. `/ultraspec:advance` → `/ultraspec:review` — REVIEW  🔴 `review.md` + approve

L'agent segue `ultraspec/workflow/review.md`: rivede il diff (correttezza,
sicurezza, aderenza alla spec, qualità, test), scrive i findings in
`review.md` (i più gravi in cima, con scenario di fallimento e verdetto), applica
i fix.

> L'hook `stop` trattiene l'agent dal chiudere il turno finché `review.md` non
> esiste.

**Rivedi `review.md`.** Se ok:
```
/ultraspec:approve review
/ultraspec:advance
```

---

## 7. `/ultraspec:advance` → `/ultraspec:archive` — ARCHIVE  🔴 `summary.md` + approve

L'agent segue `ultraspec/workflow/archive.md`: scrive
`ultraspec/workflows/<nome>/summary.md` (cosa è stato costruito, decisioni,
deviazioni dalla spec, commit, follow-up). Se `memory.enabled`, propone di
salvare i fatti durevoli in `ultraspec/memory/`.

```
/ultraspec:approve archive
/ultraspec:advance
```

Lo stato passa a `done`. Il workflow è chiuso; `ultraspec/workflows/<nome>/`
resta come traccia.

---

## Situazioni

| Situazione | Cosa fare |
|---|---|
| Emerge complessità che invalida una fase chiusa | `/ultraspec:reopen <fase> --reason "..."` (azzera le approvazioni a valle) |
| Un'operazione è stata bloccata e non capisci perché | `/ultraspec:status` |
| Il contesto si fa pesante / stai per chiudere | `/ultraspec:handoff` — la prossima sessione riparte da lì |
| Vuoi la panoramica di tutto | `/ultraspec:board` |
| Hai sbagliato track e sei ancora in discover | `/ultraspec:set-track brownfield` |
