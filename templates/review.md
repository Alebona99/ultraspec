# Review — <workflow>

> Prodotto dalla fase `review`. Findings verificati, i più gravi in cima.

## Findings

### 1. <titolo breve>  —  `file:riga`  —  [confermato | plausibile]

**Cosa:** <il difetto in una frase.>
**Scenario di fallimento:** <input/stato concreto → output sbagliato / crash.>
**Esito:** <fixato in <commit> | non serve modifica | rimandato — perché>

### 2. ...

## Complessità

<Una riga per finding: `tag: cosa. sostituzione. file:riga`. Tag: `delete` /
`stdlib` / `native` / `yagni` / `shrink`. Chiudi con `net: -N righe possibili`,
o `Lean già. Ship.` se non c'è nulla da tagliare.>

## Copertura spec

<Ogni user story di `spec.md` è soddisfatta? Elenca quelle non coperte.>

## Test

<Coprono il comportamento nuovo e gli edge case? Characterization test verdi?>
