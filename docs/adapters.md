# Adapters: the cross-harness contract

ultraspec keeps **all enforcement logic** in `hooks/` (harness-neutral bash).
An adapter is a thin translator — typically 30–60 lines — and contains no
workflow rules.

## The normalized event (adapter → core)

An adapter turns its harness's native hook payload into this shape and pipes it
to a core script on stdin. Schema: `templates/event.schema.json`.

```json
{
  "event": "session_start | user_prompt | pre_write | pre_bash | stop | pre_compact | post_write | ignore",
  "harness": "claude-code",
  "cwd": "/abs/path",
  "session_id": "…",
  "target_path": "/abs/or/rel/path",   // pre_write, post_write
  "command": "git commit -m …",        // pre_bash
  "reason": "startup | manual | auto"   // session_start, pre_compact
}
```

`hooks/lib/us-event.sh` already contains the mapping for `claude-code`,
`opencode` and `generic-git`; a new harness adds a `case` branch there **or** the
adapter emits the normalized shape directly (see `_us_ev_passthrough`).

## The normalized decision (core → adapter)

Each core script writes one of these to stdout. Schema: `templates/decision.schema.json`.

```json
{ "decision": "allow | deny | block | nudge", "reason": "…", "context": "…" }
```

| core script | events | meaningful decisions |
|---|---|---|
| `us-gate.sh` | `pre_write`, `pre_bash` | `allow`, `deny` |
| `us-banner.sh` | `session_start` (banner completo), `user_prompt` (riepilogo breve, ogni turno) | `allow` (+ `context`) |
| `us-stop-check.sh` | `stop`, `pre_compact` | `allow`, `block`, `nudge` |
| `us-nudge.sh` | `post_write` | `allow`, `nudge` (never blocks) |

## Translating the decision back

| decision | Claude Code | OpenCode | git pre-commit |
|---|---|---|---|
| `allow` | exit 0 | return | exit 0 |
| `deny` | exit 2 + reason on stderr | `throw new Error(reason)` | exit 1 + reason |
| `block` | exit 2 + reason (forces continue) | (advisory — inject reason) | n/a |
| `nudge` | `additionalContext` JSON, exit 0 | inject into message | n/a |
| `context` | `hookSpecificOutput.additionalContext` | prepend to first user message | n/a |

## Adding an adapter

1. Create `adapters/<harness>/` with the translator (script or plugin).
2. Map native events → normalized events (extend `us-event.sh` or emit directly).
3. Map normalized decisions → the harness's block/inject mechanism.
4. Add a row to `adapters/SUPPORT.md` with the honest capability set.
5. Add cases to `tests/test_adapters.sh` using native payloads in
   `tests/fixtures/`. Those fixtures are **sintetici** (scritti a mano dal
   contratto documentato); `RUNBOOK.md` §1 step 0 li fa confrontare con un
   payload reale catturato dall'harness.
6. Always ship `generic-git/pre-commit` alongside — it is the floor.

## Tested harness versions

| harness | version tested | notes |
|---|---|---|
| claude-code | hooks contract as of 2026-09 | `PreToolUse` field names: `tool_name`, `tool_input.file_path`, `tool_input.command` |
| opencode | `@opencode-ai/plugin` v2 (`tool.execute.before` / `experimental.chat.messages.transform`) | blocks by throwing |
| git | any | POSIX `pre-commit` hook |
