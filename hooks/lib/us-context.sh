#!/usr/bin/env bash
# ultraspec — context + continuity helpers
#
# Builds the text injected on session_start, and the stop/pre_compact decisions.
# Sourced by us-banner.sh, us-stop-check.sh, us-nudge.sh and the test suite.
# Requires us-state.sh + us-decision.sh already sourced.

# --- artifacts ---------------------------------------------------------

us_artifacts_dir_abs() {
  local d; d="$(us_state_get .artifacts_dir)"
  [ -z "$d" ] && d="$(us_cfg '.workflows_dir' 'ultraspec/workflows')/$(us_state_get .workflow)"
  case "$d" in /*) printf '%s\n' "$d" ;; *) printf '%s\n' "$US_ROOT/$d" ;; esac
}

# echo the required artifacts for a phase that are still missing on disk
us_missing_artifacts() { # us_missing_artifacts <phase>
  local phase="$1" dir f
  dir="$(us_artifacts_dir_abs)"
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -e "$dir/$f" ] || printf '%s\n' "$f"
  done < <(jq -r --arg p "$phase" '.gates[$p].requires // [] | .[]' "$US_CONFIG" 2>/dev/null)
}

us_gate_approved() { # us_gate_approved <phase>  -> rc0 if not required or already approved
  local phase="$1" req appr
  req="$(us_cfg ".gates.\"$phase\".requires_approval" false)"
  [ "$req" != "true" ] && return 0
  appr="$(us_state_get ".gates.\"$phase\".human_approved")"
  [ "$appr" = "true" ]
}

# --- session_start banner --------------------------------------------

# the shared head: workflow line + what's blocked + phase skill + gate line
us_phase_banner_short() {
  us_state_active || return 1
  local wf tk ph nextcmd missing from allowed
  wf="$(us_state_get .workflow)"; tk="$(us_state_get .track)"; ph="$(us_state_get .phase)"
  nextcmd="$(us_cfg ".phase_commands.\"$ph\"")"
  from="$(us_cfg '.code_edit_allowed_from' build)"
  allowed="$(us_cfg '.commit_allowed_phases | join(", ")')"

  printf '[ultraspec] workflow=%s  track=%s  phase=%s\n' "$wf" "$tk" "$ph"
  if us_phase_allows_code; then
    printf 'Modifiche a codice: CONSENTITE in questa fase.\n'
  else
    printf 'BLOCCATO in questa fase: modifiche a codice di prodotto (fino alla fase "%s") e git commit/push (consentiti in: %s).\n' "$from" "$allowed"
  fi
  if [ -n "$nextcmd" ]; then
    printf 'Comando di fase: /ultraspec:%s   (stato completo: /ultraspec:status)\n' "$nextcmd"
    case " discover spec plan build review archive " in
      *" $nextcmd "*)
        printf 'Azione: se non l'\''hai già svolta in questa sessione, esegui la procedura ultraspec/workflow/%s.md, poi fermati al gate (artefatto + eventuale /ultraspec:approve). Non eseguire advance/approve da solo.\n' "$nextcmd" ;;
    esac
  fi

  missing="$(us_missing_artifacts "$ph" | paste -sd, - | sed 's/,/, /g')"
  if [ -n "$missing" ]; then
    printf 'Gate: mancano %s\n' "$missing"
  elif jq -e --arg p "$ph" '.gates[$p]' "$US_CONFIG" >/dev/null 2>&1; then
    if us_gate_approved "$ph"; then printf 'Gate: soddisfatto — /ultraspec:advance\n'
    else printf 'Gate: artefatti pronti, manca /ultraspec:approve %s\n' "$ph"; fi
  fi
  return 0
}

# full banner for session_start: short head + continuity extras
us_phase_banner() {
  us_phase_banner_short || return 1
  us_recent_handoff_blob
  us_memory_blob
  return 0
}

# --- continuity: handoff + memory ------------------------------------

# Path of the most recent handoff for the active workflow, if any.
us_latest_handoff() {
  local dir wf
  dir="$US_ROOT/$(us_cfg '.handoffs_dir' 'ultraspec/handoffs')"
  wf="$(us_state_get .workflow)"
  [ -d "$dir" ] || return 1
  ls -1t "$dir/${wf}-"*.md 2>/dev/null | head -n1
}

# epoch of a date string (ISO or anything `date -d` groks); empty on failure
us_epoch() { date -d "$1" +%s 2>/dev/null || date -u +%s; }

# Inject the latest handoff iff it is newer than the last recorded session;
# otherwise fall back to a terse summary of the machine session_log.
us_recent_handoff_blob() {
  local hf hf_epoch last_epoch last_at
  hf="$(us_latest_handoff)"
  last_at="$(us_state_get .last_session_at)"
  if [ -n "$hf" ] && [ -f "$hf" ]; then
    hf_epoch="$(date -r "$hf" +%s 2>/dev/null || echo 0)"
    last_epoch="$([ -n "$last_at" ] && us_epoch "$last_at" || echo 0)"
    if [ "$hf_epoch" -ge "$last_epoch" ]; then
      printf '\n--- Handoff dalla sessione precedente (%s) ---\n' "$(basename "$hf")"
      cat "$hf"
      printf '\n--- fine handoff ---\n'
      return 0
    fi
  fi
  us_session_log_summary
}

# Terse recap from the machine log (no model involvement, always available).
us_session_log_summary() {
  local n
  n="$(us_state_get '.session_log | length')"
  [ -z "$n" ] || [ "$n" = "0" ] && return 0
  printf '\n--- Attività recente (machine log, ultime voci) ---\n'
  us_state_read | jq -r '.session_log[-8:][] | "- \(.event): \(.note)"'
  printf 'Nessun /ultraspec:handoff scritto per questa sessione.\n'
}

us_memory_blob() {
  [ "$(us_cfg '.memory.enabled' false)" = "true" ] || return 0
  local mf
  mf="$US_ROOT/$(us_cfg '.memory_dir' 'ultraspec/memory')/MEMORY.md"
  [ -f "$mf" ] || return 0
  printf '\n--- ultraspec project memory ---\n'
  cat "$mf"
  printf '\n--- fine memory ---\n'
}

# --- stop / pre_compact --------------------------------------------

# rc/text via us_emit. event in {stop, pre_compact}
us_stop_decision() { # us_stop_decision <event>
  local event="$1" ph
  ph="$(us_state_get .phase)"

  # 1) hard: a stop-gated phase whose required artifacts are missing
  if [ "$event" = "stop" ] && jq -e --arg p "$ph" '.stop_gated_phases // [] | index($p) != null' "$US_CONFIG" >/dev/null 2>&1; then
    local missing
    missing="$(us_missing_artifacts "$ph" | paste -sd, - | sed 's/,/, /g')"
    if [ -n "$missing" ]; then
      us_emit block "Fase '$ph' non completata: manca $missing. Completa la fase prima di chiudere il turno."
      return
    fi
  fi

  # 2) soft: handoff nudge, once per threshold crossing
  local n threshold since marker
  threshold="$(us_cfg '.handoff.nudge_threshold' 15)"
  since="$(us_state_get '[.session_log[] | select(.event=="post_write")] | length')"
  [ -z "$since" ] && since=0
  marker="$(us_state_get .nudge_marker)"
  local bucket=$(( since / (threshold>0?threshold:15) ))
  if [ "$bucket" -ge 1 ] && [ "$marker" != "$bucket" ]; then
    us_state_patch '.nudge_marker = $b' --arg b "$bucket" >/dev/null 2>&1
    us_emit nudge "Molto lavoro dall'ultimo handoff ($since scritture). Scrivi /ultraspec:handoff prima di chiudere o compattare, così la prossima sessione riparte pulita."
    return
  fi

  us_emit allow "nothing to gate at ${event}"
}
