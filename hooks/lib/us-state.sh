#!/usr/bin/env bash
# ultraspec — state library
#
# Sourced by every core hook script. Owns all reads/writes of .us-state.json.
# Depends only on: bash, jq, coreutils.
#
# Contract:
#   - Every function is fail-open: on a missing/corrupt/non-conforming state file
#     the reads return an empty object and rc 3, and the caller must NOT block.
#   - Writes are atomic (tmp file + mv) and always refresh `updated_at`.
#   - `phase` / `phases_done` / `history` are only ever written by us_state_advance,
#     us_state_reopen and us_state_approve — never by hooks.

set -o pipefail

us_warn() { printf 'ultraspec: %s\n' "$*" >&2; }

# --- discovery -------------------------------------------------------------

# Walk up from $1 (default: $PWD) until a dir containing ultraspec/us.config.json.
us_find_root() {
  local dir="${1:-$PWD}"
  dir="$(cd "$dir" 2>/dev/null && pwd)" || return 1
  while [ -n "$dir" ]; do
    if [ -f "$dir/ultraspec/us.config.json" ]; then
      printf '%s\n' "$dir"
      return 0
    fi
    [ "$dir" = "/" ] && break
    dir="$(dirname "$dir")"
  done
  return 1
}

# Populate US_ROOT / US_DIR / US_CONFIG / US_STATE_FILE. Arg: cwd from the hook event.
us_env() {
  local cwd="${1:-$PWD}"
  US_ROOT="${US_ROOT:-$(us_find_root "$cwd" || true)}"
  if [ -z "$US_ROOT" ]; then
    return 1
  fi
  US_DIR="$US_ROOT/ultraspec"
  US_CONFIG="$US_DIR/us.config.json"
  local rel
  rel="$(jq -r '.state_file // "ultraspec/.us-state.json"' "$US_CONFIG" 2>/dev/null)" || rel="ultraspec/.us-state.json"
  US_STATE_FILE="$US_ROOT/$rel"
  export US_ROOT US_DIR US_CONFIG US_STATE_FILE
  return 0
}

us_have_jq() { command -v jq >/dev/null 2>&1; }

# --- config accessors ----------------------------------------------------

us_cfg() { # us_cfg '<jq filter>' [default]
  local filter="$1" def="${2:-}"
  local out
  out="$(jq -r "$filter // empty" "$US_CONFIG" 2>/dev/null)" || out=""
  [ -n "$out" ] && printf '%s\n' "$out" || printf '%s\n' "$def"
}

# index of a phase in phase_order (-1 if unknown)
us_phase_index() { # us_phase_index <phase>
  jq -r --arg p "$1" '(.phase_order | index($p)) // -1' "$US_CONFIG" 2>/dev/null || echo -1
}

# --- state reads -------------------------------------------------------

# Structural sanity check (NOT full JSON Schema — that lives in tests/).
# rc 0 = looks like a state object; rc 1 = not.
us_state_validate() { # us_state_validate <<<json
  jq -e '
    type == "object"
    and (.workflow | type == "string")
    and (.track | (. == "greenfield" or . == "brownfield"))
    and (.phase | type == "string")
    and (.phases_done | type == "array")
    and (.gates | type == "object")
    and (.session_log | type == "array")
    and (.history | type == "array")
  ' >/dev/null 2>&1
}

# Echo the current state object. rc 0 = valid state; rc 3 = no/corrupt state (fail-open).
us_state_read() {
  if [ ! -f "$US_STATE_FILE" ]; then
    printf '{}\n'; return 3
  fi
  local raw
  raw="$(cat "$US_STATE_FILE" 2>/dev/null)"
  if ! printf '%s' "$raw" | jq -e . >/dev/null 2>&1; then
    us_warn "state file is not valid JSON ($US_STATE_FILE) — treating as no active workflow"
    printf '{}\n'; return 3
  fi
  if ! printf '%s' "$raw" | us_state_validate; then
    us_warn "state file does not match the expected shape ($US_STATE_FILE) — treating as no active workflow"
    printf '%s\n' "$raw"; return 3
  fi
  printf '%s\n' "$raw"
}

# True (rc 0) when there is a usable active workflow.
us_state_active() { us_state_read >/dev/null 2>&1; }

us_state_get() { # us_state_get '<jq filter>'
  us_state_read 2>/dev/null | jq -r "$1 // empty" 2>/dev/null
}

# --- state writes -----------------------------------------------------

# Replace the whole state object (stdin), refresh updated_at, atomic write.
us_state_write() { # us_state_write <<<json
  local new now tmp
  new="$(cat)"
  printf '%s' "$new" | jq -e . >/dev/null 2>&1 || { us_warn "refusing to write invalid JSON state"; return 1; }
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  mkdir -p "$(dirname "$US_STATE_FILE")"
  tmp="$(mktemp "${US_STATE_FILE}.XXXXXX")" || return 1
  printf '%s' "$new" | jq --arg now "$now" '.updated_at = $now' > "$tmp" && mv -f "$tmp" "$US_STATE_FILE"
}

# Merge a jq expression into the state. Extra args after the filter are passed to jq.
us_state_patch() { # us_state_patch '<jq expr on .>' [jq args...]
  local filter="$1"; shift
  local cur
  cur="$(us_state_read)" || { [ "$?" = 3 ] && return 3; }
  printf '%s' "$cur" | jq "$@" "$filter" | us_state_write
}

us_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Append a terse machine-log entry (hooks use this; no model involvement).
us_state_log() { # us_state_log <event> <note> [session_id]
  local ev="$1" note="$2" sid="${3:-}"
  us_state_active || return 3
  us_state_patch '
    .session_log += [{at:$at, session_id:($sid|select(.!="")//null), event:$ev, note:$note}]
    | .last_session_id = (($sid|select(.!=""))//.last_session_id)
  ' --arg at "$(us_now)" --arg ev "$ev" --arg note "$note" --arg sid "$sid"
}

# Append a history entry from a JSON object on stdin.
us_state_history() { # echo '{event:...}' | us_state_history
  local entry
  entry="$(cat)"
  us_state_patch '.history += [$e | .at = $at]' \
    --argjson e "$entry" --arg at "$(us_now)"
}
