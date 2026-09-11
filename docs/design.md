# Design

Perché ultraspec è fatto così. Vedi `workflow.md` per il contratto delle fasi
e `adapters.md` per il meccanismo hook.

## Il problema

Un agente di coding ha comandi/skill/hook potenti ma non componibili in un
workflow **imposto**: un comando può solo suggerire il passo successivo, e nulla
impedisce di scrivere codice prima di avere una spec o un piano. Lo stesso team
usa harness diversi. Serve un layer che definisca **una sola pipeline**, la
biforchi su greenfield/brownfield in ingresso, e la faccia rispettare con gate
deterministici su ogni harness.

## D1 — Una spina, due onramp (non due pipeline)

`discover → spec → plan → build → review → archive`. Solo `discover` differisce
per track: greenfield = decisioni libere da **prendere e registrare**;
brownfield = vincoli esistenti da **scoprire e non rompere**. Da `spec` in poi è
identico. Duplicare la parte centrale la farebbe divergere.

## D2 — Lo state file è l'unica verità

`ultraspec/.us-state.json`: workflow, track, phase, phases_done, gates,
session_log, history. Scritto solo da `bin/us` (advance/approve/reopen/handoff),
mai dagli hook (che solo leggono) né a mano.

**Immutabilità.** Lo state file, `us.config.json` e gli script in
`hooks/`/`adapters/`/`bin/` sono in `protected_always_globs`: l'hook `pre_write`
li nega in **ogni** fase. Senza questo, l'agente potrebbe riscrivere
`.us-state.json` con `phase: build, human_approved: true` e aprire ogni gate.
`bin/us` scrive lo stato come proprio sottoprocesso, non come tool call, quindi
non è intercettato.

## D3 — Solo gli hook impongono

Un comando può solo consigliare. Gli hook sono processi stateless che scattano
su un evento e possono negare/bloccare. La logica vive **in un solo posto**
(`hooks/*.sh`, harness-neutral) e ragiona su un **evento normalizzato**
(`session_start`, `user_prompt`, `pre_write`, `pre_bash`, `stop`, `pre_compact`,
`post_write`) restituendo una **decisione** (`allow|deny|block|nudge`). Contratto
completo in `adapters.md`.

| Evento | Comportamento |
|---|---|
| `session_start` | banner completo (fase, cosa è bloccato, gate) + handoff recente + memory se abilitata |
| `user_prompt` | riepilogo breve a ogni turno — la fase resta nota dopo una compattazione |
| `pre_write` | `deny` se il path è protetto sempre; `deny` se è codice protetto e la fase precede `build` |
| `pre_bash` | `deny` per `git commit`/`push` fuori da build/review/archive |
| `stop` | `block` se una fase stop-gated (review) non ha il suo artefatto; nudge handoff una volta per soglia |
| `pre_compact` | nudge handoff |
| `post_write` | appende al machine log; nudge non bloccante con gli artefatti mancanti |

## D4 — Ratchet a senso unico

`/ultraspec:advance` valida il gate (artefatti + `human_approved` dove richiesto) e
va **solo avanti**. Indietro solo con `/ultraspec:reopen <fase> --reason "..."`, che
logga il motivo e azzera le approvazioni a valle. La complessità nascosta deve
far salire di rigore, non permettere scorciatoie.

## D5 — `human_approved` lo scrive solo `/ultraspec:approve`

È il confine tra gate reale e gate di facciata. `approve` è un comando (i comandi
sono digitati dall'utente, non invocati dal modello). Ogni approvazione finisce
in `history`. Su harness dove l'agente può eseguire shell arbitraria il comando
resta eseguibile ma è tracciabile e non forgiabile scrivendo lo stato.

## D6 — Standalone: store proprio degli artefatti

Ogni workflow ha `ultraspec/workflows/<nome>/` con `discovery.md`, `spec.md`,
`plan.md`, `review.md`, `summary.md`. Nessuna dipendenza da un sistema di spec
esterno. I gate controllano la presenza di questi file più l'approvazione utente.

## D7 — Hook core + adapter di traduzione

`hooks/` contiene tutta la logica. Un adapter (`adapters/<harness>/`, ~40 righe)
fa solo due traduzioni: payload nativo → evento normalizzato, e decisione
normalizzata → meccanismo nativo (`deny` → Claude Code `exit 2`, → OpenCode
`throw`, → git `pre-commit exit 1`). `generic-git/pre-commit` è installato **su
ogni harness** come rete di sicurezza: anche dove l'intercettazione della singola
write è debole, un commit fuori fase fallisce. `adapters/SUPPORT.md` dichiara le
garanzie per harness; `bin/us status` riporta il livello effettivo.

## D8 — AGENTS.md canonico

`agent_instructions` in `us.config.json` (`auto|AGENTS.md|CLAUDE.md|both`):
`auto` mantiene `CLAUDE.md` solo se l'harness è Claude Code, altrimenti
`AGENTS.md`. Il contenuto canonico ha un'unica sorgente; l'altro file ne è una
proiezione.

## D9 — Continuità a tre livelli

Machine log continuo (hook `post_write` → `session_log`) · nudge a
`stop`/`pre_compact` quando la fase è cambiata o si supera una soglia di
scritture · prosa `/ultraspec:handoff` → `ultraspec/handoffs/<wf>-<ts>.md` ·
ripresa automatica: l'hook `session_start` inietta l'handoff se più recente
dell'ultima sessione, altrimenti un riepilogo dal machine log. Effimero: l'handoff
è consumato una volta.

## D11 — Procedure di fase neutre + auto-flow gestito, controllo manuale

Le procedure di fase vivono in `workflow/*.md` come markdown puro, non legato a
un agent. Su Claude Code i comandi `/ultraspec:*` sono thin pointer a questi file;
su altri agent è `AGENTS.md` a dirigere l'agent verso `workflow/<fase>.md`. Così
un nuovo agent si integra senza scrivere comandi nativi — serve solo il fallback
git e l'istruzione in `AGENTS.md`.

**Auto-flow, ma solo per il lavoro.** Il banner iniettato a ogni turno (e
`AGENTS.md`) istruisce l'agent a eseguire da sé la procedura della fase corrente
e a fermarsi al gate. I **comandi di controllo** — `advance`, `approve`,
`reopen`, `set-track` — sono esplicitamente esclusi: sono i punti di decisione
dell'utente. Se l'agent potesse `advance` da solo, i gate su spec/plan/review si
svuoterebbero di senso. L'agent produce l'artefatto e si ferma; l'utente
approva e avanza.

## D10 — Project memory opzionale

`memory.enabled` off di default. Quando `true`: `ultraspec/memory/` con un file
per fatto + `MEMORY.md` indice, iniettata a `session_start`. Portabile (nel repo,
visibile a qualunque harness), distinta dall'handoff (durevole vs effimero).

## D12 — Ponytail: scala minimale in build, caccia all'over-engineering in review

`workflow/build.md` guida l'implementazione minima (passo 3 del ciclo TDD) con
una scala a gradini — YAGNI → riuso di ciò che già c'è → stdlib → nativo →
dipendenza già installata → una riga → minimo — invece di lasciarla al giudizio
implicito del modello. Una scorciatoia deliberata si marca con un commento
`ponytail: <limite>, <trigger>` così non marcisce in "poi" silenzioso.
`workflow/review.md` aggiunge una caccia separata (§2) con gli stessi tag
(`delete`/`stdlib`/`native`/`yagni`/`shrink`) e un contatore `net: -N righe
possibili`, tenuta distinta dai findings di correttezza/sicurezza per non
annacquare l'una con l'altra — sono giudizi diversi (bug vs. peso). Ispirato al
plugin ponytail (github.com/DietrichGebert/ponytail, visto in un altro
progetto), riscritto qui in prosa neutra: nessuna dipendenza da quel plugin,
solo il principio recepito nelle procedure di fase — coerente con D6.

## Rischi / trade-off

- **Hook troppo aggressivi** → glob configurabili in `us.config.json`;
  `/ultraspec:status` spiega sempre perché e come sbloccare; `/ultraspec:reopen` come
  valvola.
- **Contratto hook di un harness cambia** → la logica è nel core; solo l'adapter
  va aggiornato. `RUNBOOK.md` §1 step 0 confronta le fixture con la realtà.
- **State file desincronizzato** → validazione strutturale a ogni lettura; hook
  fail-open con warning se corrotto.
- **`jq` non installato** → hook lo verificano a `session_start` e degradano a
  warning.
- **Un solo workflow per working copy** → worktree separati per lavori paralleli.
