# Fase PLAN

> Procedura neutrale. Comando esplicito: `/ultraspec:plan`.

**Obiettivo:** produrre `ultraspec/workflows/<workflow>/plan.md`.
**Gate per uscire:** `plan.md` esiste **e** `/ultraspec:approve plan` (utente).

## 0. Contesto

```
us status
```
Leggi `spec.md`. Assumi un implementatore che conosce bene il linguaggio ma
**nulla** di questo codebase e del dominio.

## 1. Struttura dei file (prima dei task)

Elenca ogni file da creare o modificare e la sua **unica responsabilità**.
- Un file = una responsabilità chiara.
- File che cambiano insieme stanno insieme; separa per responsabilità, non per
  layer tecnico.
- In un codebase esistente segui i pattern già presenti; non ristrutturare cose
  fuori scope.

## 2. Task

Un task è la più piccola unità che porta il proprio ciclo di test ed è degna del
gate di un revisore fresco. Fondi dentro il task il setup/config/scaffolding che
gli serve; separa solo dove un revisore potrebbe accettare un task e rifiutare
quello accanto. Ogni task termina con un **deliverable testabile in modo
indipendente**.

Per ogni task:

- **File**: `Create:` / `Modify:` (con range di righe) / `Test:`.
- **Interfacce**:
  - *Consuma*: cosa usa dai task precedenti — firme esatte.
  - *Produce*: cosa i task successivi useranno — nomi di funzione, tipi di
    parametri e ritorno esatti.
- **Passi bite-sized** (2-5 minuti ciascuno):
  1. scrivi il test che fallisce — **codice reale**, non "scrivi dei test";
  2. eseguilo, verifica che fallisca — comando esatto + errore atteso;
  3. implementazione minima per farlo passare — **codice reale**;
  4. eseguilo, verifica che passi;
  5. commit.

## 3. Niente placeholder

Vietati, sono fallimenti del piano:
- "TBD", "TODO", "implementa dopo";
- "aggiungi gestione errori / validazione / edge case" senza dire come;
- "scrivi i test per quanto sopra" senza il codice dei test;
- "simile al Task N" — ripeti il codice (i task si leggono anche fuori ordine);
- riferimenti a tipi/funzioni non definiti in nessun task.

## 4. Self-review

- **Copertura**: ogni requisito di `spec.md` è coperto da un task? Lista i gap.
- **Placeholder**: scansione dei pattern del punto 3.
- **Tipi**: le firme usate nei task successivi combaciano con quelle definite nei
  precedenti?

Correggi inline. Se trovi un requisito senza task, aggiungi il task.

## 5. Chiudi la fase

Quando `plan.md` è pronto, **fermati**:

> Piano scritto (`plan.md`). Per favore rivedilo. Se è ok:
> `/ultraspec:approve plan`, poi `/ultraspec:advance` → `/ultraspec:build`.
