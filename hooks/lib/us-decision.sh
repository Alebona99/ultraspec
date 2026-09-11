#!/usr/bin/env bash
# ultraspec — decision logic
#
# Pure functions: given the normalized event + the current state/config (via
# us-state.sh), return a normalized decision. Sourced by hooks/us-gate.sh and by
# the test suite. Emits nothing itself except through us_emit.

# us_emit <decision> [reason] [context]  -> normalized decision JSON on stdout
us_emit() {
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg d "$1" --arg r "${2:-}" --arg c "${3:-}" \
      '{decision:$d} + (if $r=="" then {} else {reason:$r} end) + (if $c=="" then {} else {context:$c} end)'
  else
    # jq-less fallback: minimal escaping (backslash, double-quote, newline)
    local esc
    esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | sed ':a;N;$!ba;s/\n/ /g'; }
    printf '{"decision":"%s"' "$1"
    [ -n "${2:-}" ] && printf ',"reason":"%s"' "$(esc "$2")"
    [ -n "${3:-}" ] && printf ',"context":"%s"' "$(esc "$3")"
    printf '}\n'
  fi
}

# glob (with **, *, ?) -> anchored ERE
us_glob_to_ere() {
  local g="$1" out='' i c
  for (( i=0; i<${#g}; i++ )); do
    c="${g:$i:1}"
    case "$c" in
      '*')
        if [ "${g:$((i+1)):1}" = '*' ]; then
          i=$((i+1))
          if [ "${g:$((i+1)):1}" = '/' ]; then i=$((i+1)); out+='(.*/)?'; else out+='.*'; fi
        else
          out+='[^/]*'
        fi ;;
      '?') out+='[^/]' ;;
      '.') out+='\.' ;;
      '/') out+='/' ;;
      [a-zA-Z0-9_-]) out+="$c" ;;
      *) out+="[${c}]" ;;
    esac
  done
  printf '^%s$' "$out"
}

us_path_matches_any() { # us_path_matches_any <relpath> <jq-array-filter-in-config>
  local rel="$1" filt="$2" g ere
  while IFS= read -r g; do
    [ -z "$g" ] && continue
    ere="$(us_glob_to_ere "$g")"
    printf '%s\n' "$rel" | grep -Eq "$ere" && return 0
  done < <(jq -r "$filt // [] | .[]" "$US_CONFIG" 2>/dev/null)
  return 1
}

# repo-relative, slash-normalized path
us_relpath() { # us_relpath <target_path>
  local p="$1"
  case "$p" in
    "$US_ROOT"/*) p="${p#"$US_ROOT"/}" ;;
    /*) : ;;                       # absolute but outside root: leave as-is
    ./*) p="${p#./}" ;;
  esac
  printf '%s\n' "$p"
}

# Is the current phase at/after code_edit_allowed_from ?
us_phase_allows_code() {
  local cur from ci fi
  cur="$(us_state_get .phase)"; [ -z "$cur" ] && return 1
  from="$(us_cfg '.code_edit_allowed_from' build)"
  ci="$(us_phase_index "$cur")"; fi="$(us_phase_index "$from")"
  [ "$ci" -ge 0 ] && [ "$fi" -ge 0 ] && [ "$ci" -ge "$fi" ]
}

us_phase_allows_commit() {
  local cur
  cur="$(us_state_get .phase)"; [ -z "$cur" ] && return 1
  jq -e --arg p "$cur" '.commit_allowed_phases | index($p) != null' "$US_CONFIG" >/dev/null 2>&1
}

# --- the two gate decisions ---

us_decide_pre_write() { # us_decide_pre_write <target_path>
  local rel; rel="$(us_relpath "$1")"
  if [ -z "$rel" ]; then us_emit allow "no target path"; return; fi
  # 0) never writable by the agent, in ANY phase: the state file, the config,
  #    and the enforcement code itself. This is what makes the gate real —
  #    without it the agent could just rewrite .us-state.json.
  if us_path_matches_any "$rel" '.protected_always_globs'; then
    us_emit deny "BLOCCATO: '$rel' è protetto in ogni fase (stato/config/hook di ultraspec). Modifica lo stato solo tramite /ultraspec:advance, /ultraspec:approve, /ultraspec:reopen."
    return
  fi
  if us_path_matches_any "$rel" '.always_allowed_globs'; then
    us_emit allow "planning/docs/test path"; return
  fi
  if ! us_path_matches_any "$rel" '.protected_globs'; then
    us_emit allow "not a protected code path"; return
  fi
  # protected code path:
  if us_phase_allows_code; then
    us_emit allow "phase permits code edits"
  else
    local cur from
    cur="$(us_state_get .phase)"; from="$(us_cfg '.code_edit_allowed_from' build)"
    us_emit deny "BLOCCATO: fase '$cur'. Le modifiche a codice ($rel) richiedono la fase '$from'. Avanza con /ultraspec:advance dopo aver superato i gate."
  fi
}

us_decide_pre_bash() { # us_decide_pre_bash <command>
  local cmd="$1"
  case "$cmd" in
    *"git commit"*|*"git push"*|"git commit"*|"git push"*)
      if us_phase_allows_commit; then
        us_emit allow "phase permits commit"
      else
        local cur allowed
        cur="$(us_state_get .phase)"
        allowed="$(us_cfg '.commit_allowed_phases | join(", ")')"
        us_emit deny "BLOCCATO: 'git commit/push' non consentito in fase '$cur'. Consentito solo nelle fasi: $allowed."
      fi ;;
    *) us_emit allow "not a commit/push" ;;
  esac
}
