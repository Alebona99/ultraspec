# Plan — <workflow>

> Prodotto dalla fase `plan`. Assume un implementatore che conosce il linguaggio
> ma nulla di questo codebase. Riferisce da `spec.md`.

## Obiettivo

<Una frase.>

## Vincoli globali

<Requisiti trasversali della spec — version floor, limiti di dipendenze, regole
di naming — una riga ciascuno, valori esatti.>

## Struttura dei file

<Per ogni file da creare/modificare: percorso e unica responsabilità.>

---

## Task 1: <nome>

**File:**
- Create: `path/esatto`
- Modify: `path/esatto:righe`
- Test: `path/esatto`

**Interfacce:**
- Consuma: <firme esatte dai task precedenti>
- Produce: <nomi e tipi esatti per i task successivi>

- [ ] **Passo 1 — test che fallisce** (codice reale)
- [ ] **Passo 2 — eseguilo, deve fallire** (comando + esito atteso)
- [ ] **Passo 3 — implementazione minima** (codice reale)
- [ ] **Passo 4 — eseguilo, deve passare**
- [ ] **Passo 5 — commit**

## Task 2: ...

## Self-review

- Ogni requisito di `spec.md` ha un task? Lista i gap.
- Scansione placeholder ("TBD", "gestisci gli edge case", "simile al Task N").
- Coerenza dei tipi tra task.
