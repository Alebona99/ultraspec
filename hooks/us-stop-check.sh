#!/usr/bin/env bash
# ultraspec core hook — stop / pre_compact
#
# stdin:  normalized event JSON  (event: stop | pre_compact)
# stdout: normalized decision JSON  {decision: allow|block|nudge, reason}
# rc:     0 always  (adapter turns `block` into the harness's "keep going" form)
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/lib/us-state.sh"
. "$here/lib/us-decision.sh"
. "$here/lib/us-context.sh"

ev="$(cat)"
event="$(printf '%s' "$ev" | jq -r '.event // "ignore"' 2>/dev/null)"
cwd="$(printf '%s' "$ev" | jq -r '.cwd // empty' 2>/dev/null)"

if ! us_have_jq || ! us_env "${cwd:-$PWD}" || ! us_state_active; then
  us_emit allow; exit 0
fi

case "$event" in
  stop|pre_compact) us_stop_decision "$event" ;;
  *)                us_emit allow "event not gated: $event" ;;
esac
exit 0
