#!/usr/bin/env bash
# ultraspec core hook — session_start context injection
#
# stdin:  normalized event JSON  (event: session_start)
# stdout: normalized decision JSON  {decision:"allow", context:"<banner text>"}
#         no active workflow / no root / no jq -> {decision:"allow"} with no context
# rc:     0 always
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/lib/us-state.sh"
. "$here/lib/us-decision.sh"
. "$here/lib/us-context.sh"

ev="$(cat)"
cwd="$(printf '%s' "$ev" | jq -r '.cwd // empty' 2>/dev/null)"
event="$(printf '%s' "$ev" | jq -r '.event // "session_start"' 2>/dev/null)"

if ! us_have_jq; then
  printf '%s\n' '{"decision":"allow","context":"ultraspec: jq non installato — i gate di enforcement sono INATTIVI. Installa jq (apt install jq / brew install jq) per riattivarli."}'
  exit 0
fi
if ! us_env "${cwd:-$PWD}" || ! us_state_active; then
  us_emit allow; exit 0
fi

if [ "$event" = "user_prompt" ]; then
  # every-turn re-injection: short head only, no continuity dump, no state write
  banner="$(us_phase_banner_short)"
else
  banner="$(us_phase_banner)"
  # record that a session has started (drives handoff-freshness on the NEXT start)
  sid="$(printf '%s' "$ev" | jq -r '.session_id // empty')"
  us_state_patch '.last_session_at = $now | .last_session_id = ($s|select(.!="")//.last_session_id)' \
    --arg now "$(us_now)" --arg s "$sid" >/dev/null 2>&1
fi
if [ -n "$banner" ]; then
  us_emit allow "" "$banner"
else
  us_emit allow
fi
exit 0
