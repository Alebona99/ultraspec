#!/usr/bin/env bash
# ultraspec core hook — post_write
#
# stdin:  normalized event JSON  (event: post_write)
# stdout: normalized decision JSON  {decision:"nudge"|"allow", context}
# rc:     0 always. This hook NEVER blocks anything.
#
# Side effect: appends a terse entry to state.session_log (the machine handoff).
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/lib/us-state.sh"
. "$here/lib/us-decision.sh"
. "$here/lib/us-context.sh"

ev="$(cat)"
cwd="$(printf '%s' "$ev" | jq -r '.cwd // empty' 2>/dev/null)"
target="$(printf '%s' "$ev" | jq -r '.target_path // empty' 2>/dev/null)"
sid="$(printf '%s' "$ev" | jq -r '.session_id // empty' 2>/dev/null)"

if ! us_have_jq || ! us_env "${cwd:-$PWD}" || ! us_state_active; then
  us_emit allow; exit 0
fi

rel="$(us_relpath "$target")"
us_state_log post_write "scrittura: ${rel:-?}" "$sid" >/dev/null 2>&1

ph="$(us_state_get .phase)"
missing="$(us_missing_artifacts "$ph" | paste -sd, - | sed 's/,/, /g')"
if [ -n "$missing" ]; then
  us_emit nudge "" "Fase '$ph': artefatti ancora mancanti per il gate: $missing."
else
  us_emit allow
fi
exit 0
