#!/usr/bin/env bash
# Tests for us-banner.sh / us-stop-check.sh / us-nudge.sh  (tasks 2.4, 2.5, 2.6)
set -u
here="$(cd "$(dirname "$0")" && pwd)"
export US_SRC="${US_SRC:-$(cd "$here/.." && pwd)}"
. "$here/lib.sh"
BANNER="$US_SRC/hooks/us-banner.sh"
STOP="$US_SRC/hooks/us-stop-check.sh"
NUDGE="$US_SRC/hooks/us-nudge.sh"

mkroot() { # mkroot <phase> [extra jq merge] -> root
  local phase="$1" merge="${2:-.}" root
  root="$(us_fixture_root "$(jq -c "$merge" <<EOF
{
  "workflow":"w","track":"greenfield","phase":"$phase",
  "phases_done":["intake","discover"],"harness":"claude-code",
  "artifacts_dir":"ultraspec/workflows/w",
  "gates":{
    "spec":{"requires":["spec.md"],"requires_approval":true,"human_approved":false},
    "review":{"requires":["review.md"],"requires_approval":true,"human_approved":false}
  },
  "session_log":[],"last_handoff_at":null,"last_session_id":null,"nudge_marker":null,
  "history":[],"updated_at":"2026-01-01T00:00:00Z"
}
EOF
)")"
  mkdir -p "$root/ultraspec/workflows/w"
  printf '%s\n' "$root"
}
run() { ( printf '%s' "$2" | US_ROOT="$1" bash "$3" ); }
ev() { jq -nc --arg e "$1" --arg r "$2" '{event:$e,cwd:$r,session_id:"s9"}'; }

# --- banner (2.4) ---
it "session_start with active workflow -> allow + banner context"
r="$(mkroot spec)"
d="$(run "$r" "$(ev session_start "$r")" "$BANNER")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"
assert_contains "$(jq -r .context <<<"$d")" "phase=spec"
assert_contains "$(jq -r .context <<<"$d")" "BLOCCATO in questa fase"
assert_contains "$(jq -r .context <<<"$d")" "/ultraspec:spec"
assert_contains "$(jq -r .context <<<"$d")" "ultraspec/workflow/spec.md"
assert_contains "$(jq -r .context <<<"$d")" "spec.md"

it "banner in BUILD says code edits are allowed"
rb="$(mkroot build)"
d="$(run "$rb" "$(ev session_start "$rb")" "$BANNER")"
assert_contains "$(jq -r .context <<<"$d")" "CONSENTITE"

it "banner shows approval-needed once artifacts exist"
r2="$(mkroot spec)"
: > "$r2/ultraspec/workflows/w/spec.md"
d="$(run "$r2" "$(ev session_start "$r2")" "$BANNER")"
assert_contains "$(jq -r .context <<<"$d")" "/ultraspec:approve spec"

it "user_prompt re-injects the SHORT phase head, writes no state, no continuity dump"
ru="$(mkroot spec)"
: > "$ru/ultraspec/workflows/w/spec.md"
mkdir -p "$ru/ultraspec/handoffs"; printf '# h\nx\n' > "$ru/ultraspec/handoffs/w-20990101T000000Z.md"
before="$(cat "$ru/ultraspec/.us-state.json")"
d="$(run "$ru" "$(ev user_prompt "$ru")" "$BANNER")"
ctx="$(jq -r .context <<<"$d")"
assert_contains "$ctx" "phase=spec"
assert_contains "$ctx" "BLOCCATO in questa fase"
assert_not_contains "$ctx" "Handoff dalla sessione precedente"
assert_eq "$before" "$(cat "$ru/ultraspec/.us-state.json")"

it "user_prompt with no workflow -> allow, no context"
empty_up="$(us_fixture_root "")"
d="$(run "$empty_up" "$(ev user_prompt "$empty_up")" "$BANNER")"
assert_eq "null" "$(jq -r '.context // "null"' <<<"$d")"

it "no active workflow -> allow, no context"
empty="$(us_fixture_root "")"
d="$(run "$empty" "$(ev session_start "$empty")" "$BANNER")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"
assert_eq "null" "$(jq -r '.context // "null"' <<<"$d")"

it "memory disabled -> banner has no memory block"
d="$(run "$r" "$(ev session_start "$r")" "$BANNER")"
assert_not_contains "$(jq -r .context <<<"$d")" "project memory"

it "memory enabled -> banner injects MEMORY.md"
rm="$(mkroot spec '.')"
jq '.' "$rm/ultraspec/us.config.json" >/dev/null
tmp="$(mktemp)"; jq '.memory.enabled=true' "$rm/ultraspec/us.config.json" > "$tmp"; mv "$tmp" "$rm/ultraspec/us.config.json"
mkdir -p "$rm/ultraspec/memory"; printf '# MEMORY\n- fatto uno\n' > "$rm/ultraspec/memory/MEMORY.md"
d="$(run "$rm" "$(ev session_start "$rm")" "$BANNER")"
assert_contains "$(jq -r .context <<<"$d")" "fatto uno"

# --- stop-check (2.5) ---
it "stop in REVIEW without review.md -> block"
rv="$(mkroot review)"
d="$(run "$rv" "$(ev stop "$rv")" "$STOP")"
assert_eq "block" "$(jq -r .decision <<<"$d")"
assert_contains "$(jq -r .reason <<<"$d")" "review.md"

it "stop in REVIEW with review.md present -> allow"
: > "$rv/ultraspec/workflows/w/review.md"
d="$(run "$rv" "$(ev stop "$rv")" "$STOP")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"

it "stop in SPEC (not a stop-gated phase) -> allow even with missing artifacts"
d="$(run "$r" "$(ev stop "$r")" "$STOP")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"

it "stop nudges once when many writes accumulated, then stays quiet"
rn="$(mkroot plan "$(printf '.session_log = [range(0;20)|{at:\"t\",session_id:\"s\",event:\"post_write\",note:\"n\"}]')")"
d1="$(run "$rn" "$(ev stop "$rn")" "$STOP")"
assert_eq "nudge" "$(jq -r .decision <<<"$d1")"
d2="$(run "$rn" "$(ev stop "$rn")" "$STOP")"
assert_eq "allow" "$(jq -r .decision <<<"$d2")"

it "pre_compact also nudges"
rn2="$(mkroot plan "$(printf '.session_log = [range(0;18)|{at:\"t\",session_id:\"s\",event:\"post_write\",note:\"n\"}]')")"
d="$(run "$rn2" "$(ev pre_compact "$rn2")" "$STOP")"
assert_eq "nudge" "$(jq -r .decision <<<"$d")"

it "stop-check always exits 0"
run "$rv" "$(ev stop "$rv")" "$STOP" >/dev/null; assert_rc 0 "$?"

# --- nudge / post_write (2.6) ---
it "post_write appends to session_log and never blocks"
rp="$(mkroot spec)"
before="$(cat "$rp/ultraspec/.us-state.json" | jq '.session_log|length')"
d="$(printf '%s' "$(jq -nc --arg r "$rp" '{event:"post_write",cwd:$r,session_id:"s9",target_path:($r+"/ultraspec/workflows/w/spec.md")}')" | US_ROOT="$rp" bash "$NUDGE")"
after="$(cat "$rp/ultraspec/.us-state.json" | jq '.session_log|length')"
assert_eq "$((before+1))" "$after"
case "$(jq -r .decision <<<"$d")" in allow|nudge) _pass;; *) _fail "post_write must not block, got $(jq -r .decision <<<"$d")";; esac

it "post_write in spec still lists missing artifacts as a nudge"
d="$(printf '%s' "$(jq -nc --arg r "$rp" '{event:"post_write",cwd:$r,session_id:"s9",target_path:($r+"/ultraspec/workflows/w/spec.md")}')" | US_ROOT="$rp" bash "$NUDGE")"
assert_eq "nudge" "$(jq -r .decision <<<"$d")"
assert_contains "$(jq -r .context <<<"$d")" "spec.md"

us_test_summary
