#!/usr/bin/env bash
# Tests for handoff + memory  (tasks 6.2, 6.3, 6.4, 6.5)
set -u
here="$(cd "$(dirname "$0")" && pwd)"
export US_SRC="${US_SRC:-$(cd "$here/.." && pwd)}"
. "$here/lib.sh"
US="$US_SRC/bin/us"
BANNER="$US_SRC/hooks/us-banner.sh"

mkwf() { # -> root, workflow in phase plan with a session_log
  local root; root="$(us_fixture_root "{
    \"workflow\":\"w\",\"track\":\"greenfield\",\"phase\":\"plan\",
    \"phases_done\":[\"intake\",\"discover\",\"spec\"],\"openspec_change\":\"w\",\"harness\":\"claude-code\",
    \"artifacts_dir\":\"ultraspec/workflows/w\",
    \"gates\":{\"plan\":{\"requires\":[\"plan.md\"],\"requires_approval\":true,\"human_approved\":false}},
    \"session_log\":[{\"at\":\"2026-01-01T00:00:00Z\",\"session_id\":\"s1\",\"event\":\"post_write\",\"note\":\"scritto spec.md\"}],
    \"last_handoff_at\":null,\"last_session_id\":\"s1\",\"last_session_at\":\"2026-01-01T00:00:00Z\",
    \"nudge_marker\":null,\"history\":[],\"updated_at\":\"2026-01-01T00:00:00Z\"
  }")"
  mkdir -p "$root/ultraspec/workflows/w"
  printf '%s\n' "$root"
}
sstart() { jq -nc --arg r "$1" '{event:"session_start",cwd:$r,session_id:"s2"}'; }

# --- 6.2 us-handoff plumbing ---
it "handoff-path returns a path under handoffs/ named for the workflow"
r="$(mkwf)"
p="$(cd "$r" && US_CWD="$PWD" bash "$US" handoff-path)"
assert_contains "$p" "/ultraspec/handoffs/w-"
assert_contains "$p" ".md"

it "handoff-done stamps last_handoff_at"
printf '# Handoff\nProssima azione: /ultraspec:plan\n' > "$p"
( cd "$r" && US_CWD="$PWD" bash "$US" handoff-done "$p" ) >/dev/null
assert_false test "null" = "$(jq -r .last_handoff_at "$r/ultraspec/.us-state.json")"

it "handoff-done refuses a missing file"
( cd "$r" && US_CWD="$PWD" bash "$US" handoff-done /nope/x.md ) >/dev/null 2>&1
assert_rc 1 "$?"

# --- 6.3 banner: fresh handoff injected, else session_log summary ---
it "session_start injects a handoff newer than last session"
r2="$(mkwf)"
mkdir -p "$r2/ultraspec/handoffs"
printf '# Handoff w\nProssima azione: completare plan.md\n' > "$r2/ultraspec/handoffs/w-20990101T000000Z.md"
touch "$r2/ultraspec/handoffs/w-20990101T000000Z.md"   # far future mtime via name is not enough; set real mtime
d="$(printf '%s' "$(sstart "$r2")" | US_ROOT="$r2" bash "$BANNER")"
assert_contains "$(jq -r .context <<<"$d")" "Handoff dalla sessione precedente"
assert_contains "$(jq -r .context <<<"$d")" "completare plan.md"

it "session_start with a STALE handoff falls back to the machine-log summary"
r3="$(mkwf)"
mkdir -p "$r3/ultraspec/handoffs"
printf '# old\n' > "$r3/ultraspec/handoffs/w-20200101T000000Z.md"
touch -d "2020-01-01" "$r3/ultraspec/handoffs/w-20200101T000000Z.md"
# advance last_session_at to now so the handoff is stale
jq '.last_session_at="2099-01-01T00:00:00Z"' "$r3/ultraspec/.us-state.json" > "$r3/x" && mv "$r3/x" "$r3/ultraspec/.us-state.json"
d="$(printf '%s' "$(sstart "$r3")" | US_ROOT="$r3" bash "$BANNER")"
ctx="$(jq -r .context <<<"$d")"
assert_contains "$ctx" "Attività recente (machine log"
assert_contains "$ctx" "scritto spec.md"
assert_not_contains "$ctx" "Handoff dalla sessione precedente"

it "session_start updates last_session_at to the current time"
r3b="$(mkwf)"
jq '.last_session_at="2099-01-01T00:00:00Z"' "$r3b/ultraspec/.us-state.json" > "$r3b/x" && mv "$r3b/x" "$r3b/ultraspec/.us-state.json"
printf '%s' "$(sstart "$r3b")" | US_ROOT="$r3b" bash "$BANNER" >/dev/null
after="$(jq -r .last_session_at "$r3b/ultraspec/.us-state.json")"
assert_not_contains "$after" "2099"
assert_contains "$after" "$(date -u +%Y-%m)"

# --- 6.4 memory opt-in ---
it "memory disabled (default): banner injects no memory, no memory/ dir made"
d="$(printf '%s' "$(sstart "$r")" | US_ROOT="$r" bash "$BANNER")"
assert_not_contains "$(jq -r .context <<<"$d")" "project memory"
assert_false test -d "$r/ultraspec/memory"

it "memory enabled: banner injects MEMORY.md"
rm4="$(mkwf)"
tmp="$(mktemp)"; jq '.memory.enabled=true' "$rm4/ultraspec/us.config.json" > "$tmp"; mv "$tmp" "$rm4/ultraspec/us.config.json"
mkdir -p "$rm4/ultraspec/memory"; printf '# MEMORY\n- decisione X\n' > "$rm4/ultraspec/memory/MEMORY.md"
d="$(printf '%s' "$(sstart "$rm4")" | US_ROOT="$rm4" bash "$BANNER")"
assert_contains "$(jq -r .context <<<"$d")" "decisione X"

# --- 6.5 handoff does not touch memory/ ---
it "writing a handoff + handoff-done leaves memory/ untouched"
mkdir -p "$rm4/ultraspec/memory"; sum_before="$(cat "$rm4/ultraspec/memory/MEMORY.md" | md5sum)"
hp="$(cd "$rm4" && US_CWD="$PWD" bash "$US" handoff-path)"
printf '# h\n' > "$hp"; ( cd "$rm4" && US_CWD="$PWD" bash "$US" handoff-done "$hp" ) >/dev/null
sum_after="$(cat "$rm4/ultraspec/memory/MEMORY.md" | md5sum)"
assert_eq "$sum_before" "$sum_after"

us_test_summary
