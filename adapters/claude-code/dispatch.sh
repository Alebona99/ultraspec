#!/usr/bin/env bash
# ultraspec adapter — Claude Code
#
# Registered from adapters/claude-code/hooks.json. One job: translate.
#   native stdin  --us-event.sh-->  normalized event  --core-->  normalized decision
#   normalized decision  -->  Claude Code's native hook contract (exit code / JSON)
#
# Usage (from hooks.json):  dispatch.sh <core>
#   <core> in: gate | banner | stop | nudge
#
# Contains NO workflow logic.
set -u
core="${1:?usage: dispatch.sh gate|banner|stop|nudge}"
US_HOOKS="$(cd "$(dirname "$0")/../../hooks" && pwd)"
. "$US_HOOKS/lib/us-state.sh"
. "$US_HOOKS/lib/us-event.sh"

native="$(cat)"
event_json="$(printf '%s' "$native" | us_event_normalize claude-code)"

case "$core" in
  gate)   script="us-gate.sh" ;;
  banner) script="us-banner.sh" ;;
  stop)   script="us-stop-check.sh" ;;
  nudge)  script="us-nudge.sh" ;;
  *) echo "unknown core: $core" >&2; exit 0 ;;
esac
decision_json="$(printf '%s' "$event_json" | bash "$US_HOOKS/$script" 2>/dev/null)"

d="$(printf '%s'  "$decision_json" | jq -r '.decision // "allow"' 2>/dev/null || echo allow)"
reason="$(printf '%s' "$decision_json" | jq -r '.reason  // ""' 2>/dev/null)"
context="$(printf '%s' "$decision_json" | jq -r '.context // ""' 2>/dev/null)"

emit_json() { jq -n --arg k "$1" --arg c "$2" '{hookSpecificOutput:{hookEventName:$k, additionalContext:$c}}'; }

case "$core" in
  gate)
    if [ "$d" = "deny" ]; then
      printf '%s\n' "${reason:-blocked by ultraspec}" >&2
      exit 2
    fi
    exit 0 ;;
  banner)
    ev_kind="$(printf '%s' "$event_json" | jq -r '.event // "session_start"')"
    [ "$ev_kind" = "user_prompt" ] && hk="UserPromptSubmit" || hk="SessionStart"
    [ -n "$context" ] && emit_json "$hk" "$context"
    exit 0 ;;
  stop)
    if [ "$d" = "block" ] || [ "$d" = "nudge" ]; then
      printf '%s\n' "${reason:-ultraspec: fase non completata}" >&2
      exit 2
    fi
    exit 0 ;;
  nudge)
    [ -n "$context" ] && emit_json "PostToolUse" "$context"
    exit 0 ;;
esac
exit 0
