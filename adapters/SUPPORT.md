# Adapter support matrix

What each harness adapter can actually enforce. `X` = delivered, `-` = not
delivered (relies on the universal `generic-git` fallback). The `us status`
command reads this file to report the effective enforcement level.

| harness | block-write | block-commit | inject-context | turn-end |
|---|---|---|---|---|
| claude-code | X | X | X | X |
| opencode | X | X | X | - |
| generic-git | - | X | - | - |
| cursor | X | X | X | - |
| codex | - | X | X | - |

Legend:

- **block-write** — a single `write`/`edit` to a protected code path outside the
  `build` phase is refused before it happens.
- **block-commit** — `git commit` / `git push` outside `build`/`review`/`archive`
  is refused. `generic-git` guarantees this everywhere.
- **inject-context** — the phase banner (and any pending handoff / memory) is
  injected at session start.
- **turn-end** — the `stop` / `pre_compact` gate can hold the turn open when a
  stop-gated phase is incomplete, or nudge for a handoff.

State-file integrity (independent of the row above): on **every** harness the
`.us-state.json`, `us.config.json` and the `hooks/`/`adapters/` scripts are in
`protected_always_globs` — the agent cannot write them in any phase. The state
machine itself (`dist/cli.js`, exposed as the `us`/`ultraspec` binary) lives in
the npm package, not inside the target project, so it isn't part of this glob.
This
is what makes the gate un-bypassable. `human_approved` is only ever set by
`us approve`; where a harness can't tell agent input from user input (Claude
Code), that command stays runnable by the agent but every call is visible and
logged to `history`, and forging approval by editing the state file is blocked.

Notes:

- `opencode` throws from `tool.execute.before` to block; it has no native
  turn-end hook, so the stop gate is advisory there (surfaced via context).
- `cursor` and `codex` rows are the intended contract; their adapters are
  scaffolds pending live verification (see `RUNBOOK.md`).
- Every harness also gets `generic-git/pre-commit` installed, so `block-commit`
  is effectively `X` everywhere regardless of the row above.
