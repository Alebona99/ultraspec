#!/usr/bin/env bash
# ultraspec — event normalizer
#
# Turns a harness-native hook payload (stdin JSON) into ultraspec's normalized
# event. Adapters call `us_event_normalize <harness>` and pipe the native payload
# in; the core hook scripts only ever see the normalized shape.
#
# Field extraction is deliberately defensive (tries several known key names) so a
# harness renaming a field does not silently break the gate.

# us_event_normalize <harness>   < native.json   > normalized.json
us_event_normalize() {
  local harness="${1:-unknown}"
  local raw; raw="$(cat)"
  # not JSON at all -> ignore, but keep the raw text for debugging
  if ! printf '%s' "$raw" | jq -e . >/dev/null 2>&1; then
    jq -n --arg h "$harness" --arg r "$raw" '{event:"ignore", harness:$h, raw:$r}'
    return 0
  fi

  case "$harness" in
    claude-code) _us_ev_claude_code "$raw" ;;
    opencode)    _us_ev_opencode "$raw" ;;
    generic-git) _us_ev_generic_git "$raw" ;;
    *)           _us_ev_passthrough "$raw" "$harness" ;;
  esac
}

# Common tail: attach harness/cwd/session_id/raw, given a partial {event,...} on stdin.
_us_ev_finish() { # _us_ev_finish <harness> <raw>
  local h="$1" raw="$2"
  jq --arg h "$h" --argjson raw "$raw" '
    . as $ev
    | {
        event: .event,
        harness: $h,
        cwd: ($raw.cwd // $raw.workspace // $raw.directory // null),
        session_id: ($raw.session_id // $raw.sessionID // $raw.sessionId // $raw.session // null),
        target_path: (.target_path // null),
        command: (.command // null),
        reason: (.reason // $raw.reason // $raw.source // null),
        raw: $raw
      }'
}

_us_ev_claude_code() {
  local raw="$1" hev tool
  hev="$(jq -r '.hook_event_name // empty' <<<"$raw")"
  tool="$(jq -r '.tool_name // empty' <<<"$raw")"
  local partial
  case "$hev" in
    PreToolUse)
      case "$tool" in
        Write|Edit|MultiEdit|NotebookEdit)
          partial="$(jq -c '{event:"pre_write", target_path:(.tool_input.file_path // .tool_input.path // .tool_input.notebook_path // null)}' <<<"$raw")" ;;
        Bash)
          partial="$(jq -c '{event:"pre_bash", command:(.tool_input.command // null)}' <<<"$raw")" ;;
        *) partial='{"event":"ignore"}' ;;
      esac ;;
    PostToolUse)
      case "$tool" in
        Write|Edit|MultiEdit|NotebookEdit)
          partial="$(jq -c '{event:"post_write", target_path:(.tool_input.file_path // .tool_input.path // null)}' <<<"$raw")" ;;
        *) partial='{"event":"ignore"}' ;;
      esac ;;
    SessionStart) partial='{"event":"session_start"}' ;;
    UserPromptSubmit) partial='{"event":"user_prompt"}' ;;
    Stop|SubagentStop) partial='{"event":"stop"}' ;;
    PreCompact) partial='{"event":"pre_compact"}' ;;
    *) partial='{"event":"ignore"}' ;;
  esac
  printf '%s' "$partial" | _us_ev_finish claude-code "$raw"
}

_us_ev_opencode() {
  # OpenCode plugin hook (tool.execute.before / session events). The plugin sends
  # a pre-shaped object: {kind, tool, args:{filePath,command}, directory, sessionID}
  local raw="$1" kind tool
  kind="$(jq -r '.kind // .hook // empty' <<<"$raw")"
  tool="$(jq -r '.tool // empty' <<<"$raw")"
  local partial
  case "$kind" in
    tool.execute.before|pre_tool)
      case "$tool" in
        write|edit|patch)
          partial="$(jq -c '{event:"pre_write", target_path:(.args.filePath // .args.path // .args.file // null)}' <<<"$raw")" ;;
        bash|shell)
          partial="$(jq -c '{event:"pre_bash", command:(.args.command // null)}' <<<"$raw")" ;;
        *) partial='{"event":"ignore"}' ;;
      esac ;;
    tool.execute.after|post_tool)
      partial="$(jq -c '{event:"post_write", target_path:(.args.filePath // .args.path // null)}' <<<"$raw")" ;;
    session.start|session_start) partial='{"event":"session_start"}' ;;
    session.idle|stop)           partial='{"event":"stop"}' ;;
    *) partial='{"event":"ignore"}' ;;
  esac
  printf '%s' "$partial" | _us_ev_finish opencode "$raw"
}

_us_ev_generic_git() {
  # Synthetic event emitted by the git pre-commit adapter.
  local raw="$1"
  jq -c '{event:"pre_bash", command:(.command // "git commit")}' <<<"$raw" | _us_ev_finish generic-git "$raw"
}

_us_ev_passthrough() {
  # Unknown harness: accept an already-normalized-ish payload.
  local raw="$1" h="$2"
  jq -c '{event:(.event // "ignore"), target_path:(.target_path // null), command:(.command // null)}' <<<"$raw" \
    | _us_ev_finish "$h" "$raw"
}
