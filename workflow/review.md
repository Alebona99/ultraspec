# Fase REVIEW

> Procedura neutrale. Comando esplicito: `/ultraspec:review`.

**Obiettivo:** produrre `ultraspec/workflows/<workflow>/review.md`.
**Gate per uscire:** `review.md` esiste **e** `/ultraspec:approve review` (utente).
L'hook `stop` ti trattiene dal chiudere il turno finché `review.md` non esiste.

## 0. Contesto

```
us status
```

## 1. Rivedi il diff di questo workflow (dalla base)

- **Correttezza** — bug logici, off-by-one, gestione errori mancante, casi
  limite, race condition, **fallimenti silenziosi** (catch che ingoiano, fallback
  inappropriati).
- **Sicurezza** — input non validati, injection, segreti in chiaro, permessi
  troppo larghi, dati esposti.
- **Aderenza alla spec** — ogni user story di `spec.md` è soddisfatta?
- **Qualità** — duplicazione, funzioni troppo grandi, nomi fuorvianti,
  complessità inutile, riuso mancato.
- **Test** — coprono il comportamento nuovo e gli edge case? I characterization
  test (brownfield) sono verdi?

## 2. Caccia separata: complessità (ponytail)

Stessa base — il diff di questo workflow — ma un'altra domanda: cosa si può
*togliere*. Non correttezza, non sicurezza, solo over-engineering:
astrazione con una sola implementazione, dipendenza per ciò che la stdlib o la
piattaforma già fanno, codice morto, forma più lunga del necessario. Un finding
per riga, taggato:

- `delete:` codice morto, flessibilità inutilizzata. Sostituzione: nessuna.
- `stdlib:` cosa fatta a mano che la standard library già offre. Nomina la funzione.
- `native:` dipendenza o codice che la piattaforma fa già da sola. Nomina la feature.
- `yagni:` astrazione con una sola implementazione, config che nessuno imposta, layer con un solo chiamante.
- `shrink:` stessa logica, meno righe. Mostra la forma più corta.

Se nel diff ci sono commenti `ponytail: <limite>, <trigger>`, verifica che ognuno
nomini davvero un limite e un trigger di aggiornamento — uno senza li è una
scorciatoia che rischia di marcire in "poi" silenzioso, segnalalo.

## 3. Scrivi i findings

`review.md` (da `templates/review.md`), i più gravi in cima. Findings di
correttezza/sicurezza/spec/test: `file:riga` · cosa (una frase) · scenario di
fallimento concreto (input/stato → output sbagliato / crash) · verdetto
(confermato | plausibile). Findings di complessità (§2): `tag: cosa.
sostituzione. file:riga`, chiusi con `net: -N righe possibili` (o `Lean già.
Ship.` se non c'è nulla da tagliare).

## 4. Applica i fix

I commit sono consentiti in questa fase. Aggiorna `review.md` con l'esito di
ciascun finding (fixato in <commit> | non serve modifica | rimandato — perché).

## 5. Chiudi la fase

> Review completata (`review.md`). Per favore rivedila. Se è ok:
> `/ultraspec:approve review`, poi `/ultraspec:advance` → `/ultraspec:archive`.
