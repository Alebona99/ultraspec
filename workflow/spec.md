# Fase SPEC

> Procedura neutrale. Comando esplicito: `/ultraspec:spec`.

**Obiettivo:** produrre `ultraspec/workflows/<workflow>/spec.md`.
**Gate per uscire:** `spec.md` esiste **e** `/ultraspec:approve spec` (utente).

## 0. Contesto

```
us status
```
Leggi `discovery.md`. Se `spec.md` esiste già, riprendilo dal punto 3.

## 1. Scrivi la spec

Parti da `templates/spec.md`. È un **contratto di comportamento**, non un piano
di implementazione: se l'implementazione può cambiare senza cambiare il
comportamento osservabile, non va nella spec.

- **Problema** — dal punto di vista dell'utente. Perché serve, perché ora.
- **Soluzione** — dal punto di vista dell'utente.
- **User story** — elenco numerato, **esteso**, che copre tutti gli aspetti.
  Formato: "Come <attore>, voglio <funzione>, così che <beneficio>".
- **Comportamento / contratti**:
  - input, output, condizioni di errore;
  - vincoli esterni (sicurezza, privacy, affidabilità, compatibilità);
  - scenari testabili in formato WHEN / THEN — ognuno è un potenziale test.
- **Decisioni di implementazione** — moduli da creare/modificare e le loro
  interfacce, schema, contratti API, interazioni specifiche. **Niente** path di
  file o snippet di codice (invecchiano subito).
- **Seam di test** — quelli esistenti da riusare (preferiti), quelli nuovi
  necessari. Per brownfield: elenca i characterization test come primo lavoro
  della fase build.
- **Fuori scope** — cosa la spec esplicitamente non copre.

## 2. Auto-review

Rileggi la spec con occhi freschi:
1. **Placeholder** — "TBD", "TODO", sezioni incomplete, requisiti vaghi. Correggi.
2. **Coerenza interna** — sezioni che si contraddicono? L'architettura combacia
   con le user story?
3. **Scope** — è abbastanza focalizzata per un singolo piano di implementazione,
   o va decomposta?
4. **Ambiguità** — un requisito interpretabile in due modi? Scegline uno e
   rendilo esplicito.

Correggi tutto inline.

## 3. Chiudi la fase

Quando `spec.md` è pronto, **fermati**:

> Spec scritta (`spec.md`). Per favore rivedila. Se è ok:
> `/ultraspec:approve spec`, poi `/ultraspec:advance` → `/ultraspec:plan`.

Non approvare e non avanzare da solo.
