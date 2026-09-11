#!/usr/bin/env bash
# ultraspec core hook — gate for pre_write / pre_bash
#
# stdin:  normalized event JSON (from an adapter via us-event.sh)
# stdout: normalized decision JSON  {decision: allow|deny, reason}
# rc:     0 always (the adapter translates `deny` into the harness's block form)
#
# No active workflow, unreadable state, or missing jq  ->  allow (fail-open).

here="$(cd "$(dirname "$0")" && pwd)"
. "$here/lib/us-state.sh"
. "$here/lib/us-decision.sh"

ev="$(cat)"
event="$(printf '%s' "$ev" | jq -r '.event // "ignore"' 2>/dev/null)"
cwd="$(printf '%s' "$ev" | jq -r '.cwd // empty' 2>/dev/null)"

if ! us_have_jq; then
  us_emit allow "jq not available"; exit 0
fi
if ! us_env "${cwd:-$PWD}"; then
  us_emit allow "no ultraspec root"; exit 0
fi
if ! us_state_active; then
  us_emit allow "no active workflow"; exit 0
fi

case "$event" in
  pre_write)
    us_decide_pre_write "$(printf '%s' "$ev" | jq -r '.target_path // empty')" ;;
  pre_bash)
    us_decide_pre_bash "$(printf '%s' "$ev" | jq -r '.command // empty')" ;;
  *)
    us_emit allow "event not gated: $event" ;;
esac
exit 0
