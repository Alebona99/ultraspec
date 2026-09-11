# Fase BUILD

> Procedura neutrale. Comando esplicito: `/ultraspec:build`.

**Obiettivo:** implementare `plan.md`, tutti i test verdi.
**Gate per uscire:** nessun artefatto — avanzi quando i task sono completi.
**In questa fase le modifiche a codice di prodotto sono SBLOCCATE, i commit consentiti.**

## 0. Contesto

```
ultraspec/bin/us status
```
Leggi `plan.md`.

## 1. Implementa, un task alla volta

Segui i passi del piano alla lettera, per ogni task:
1. scrivi il test che fallisce;
2. eseguilo — deve fallire;
3. implementazione minima;
4. eseguilo — deve passare;
5. commit.

Typecheck e singoli file di test spesso; la suite intera alla fine.

## 2. La scala per l'implementazione minima (passo 3 di ogni task)

Fermati al primo gradino che regge, in ordine:

1. **Serve davvero?** Bisogno speculativo → non scriverlo, dillo in una riga (YAGNI).
2. **C'è già nel codebase?** Un helper/util/tipo/pattern che vive già qui → riusalo, non reinventarlo.
3. **Lo fa la stdlib?** Usala.
4. **Lo fa la piattaforma nativamente?** Vincolo DB, CSS, tag HTML invece di codice a mano.
5. **Una dipendenza già installata lo risolve?** Usala. Non aggiungerne una nuova per poche righe.
6. **Sta in una riga?** Una riga.
7. **Solo allora:** il minimo che funziona.

Nessuna astrazione non richiesta: niente interfaccia con una sola implementazione,
niente factory per un solo prodotto, niente config per un valore che non cambia
mai. La scala non tocca mai validazione ai confini, gestione errori, sicurezza —
quelle restano complete a prescindere dal gradino.

Una scorciatoia deliberata che lascia un limite noto (lock globale, scansione
O(n²), euristica naive) si marca con un commento `ponytail: <limite>,
<quando superarlo>` nel punto esatto — è quello che la fase `review` verifica.

## 3. Se il piano è sbagliato

Se un task rivela un problema di design: **fermati**, dillo all'utente, e proponi
`/ultraspec:reopen plan --reason "..."`. Non improvvisare fuori dal piano, non
allargare lo scope in silenzio.

## 4. Chiudi la fase

Quando tutti i task sono completi e la suite è verde:

> Build completata, N task, tutti i test verdi. Per procedere: `/ultraspec:advance` → `/ultraspec:review`.

Nota: l'enforcement torna attivo se fai `/ultraspec:reopen` a una fase precedente.
