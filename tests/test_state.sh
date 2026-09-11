#!/usr/bin/env bash
# Tests for hooks/lib/us-state.sh  (tasks 1.2, 1.3)
set -u
here="$(cd "$(dirname "$0")" && pwd)"
export US_SRC="${US_SRC:-$(cd "$here/.." && pwd)}"
. "$here/lib.sh"
. "$US_SRC/hooks/lib/us-state.sh"

STATE='{
  "workflow":"w","track":"brownfield","phase":"spec","phases_done":["intake","discover"],
  "harness":"claude-code","artifacts_dir":"ultraspec/workflows/w",
  "gates":{"spec":{"requires":["spec.md"],"requires_approval":true,"human_approved":false}},
  "session_log":[],"last_handoff_at":null,"last_session_id":null,"nudge_marker":null,
  "history":[{"at":"2026-01-01T00:00:00Z","event":"start","from":null,"to":"intake"}],
  "updated_at":"2026-01-01T00:00:00Z"
}'

# each test: reset root discovery
reset() { unset US_ROOT US_DIR US_CONFIG US_STATE_FILE; }

it "us_env resolves root/config/state from a nested cwd"
root="$(us_fixture_root "$STATE")"
mkdir -p "$root/src/deep/nested"
reset; us_env "$root/src/deep/nested"
assert_eq "$root/ultraspec/.us-state.json" "$US_STATE_FILE"

it "read returns the state and rc 0 when valid"
reset; us_env "$root"
out="$(us_state_read)"; rc=$?
assert_rc 0 "$rc"
assert_eq "spec" "$(printf '%s' "$out" | jq -r .phase)"

it "write -> read round-trips and refreshes updated_at"
reset; us_env "$root"
printf '%s' "$STATE" | jq '.phase="plan"' | us_state_write
assert_eq "plan" "$(us_state_get .phase)"
assert_not_contains "$(us_state_get .updated_at)" "2026-01-01T00:00:00Z"

it "history grows by exactly one and stamps .at"
root2="$(us_fixture_root "$STATE")"
reset; us_env "$root2"
before="$(us_state_get '.history | length')"
echo '{"event":"advance","from":"spec","to":"plan"}' | us_state_history
assert_eq "$((before+1))" "$(us_state_get '.history | length')"
assert_eq "advance" "$(us_state_get '.history[-1].event')"
assert_false test -z "$(us_state_get '.history[-1].at')"

it "session_log grows and records the session id"
reset; us_env "$root2"
us_state_log post_write "scritto spec.md" "sess-42"
assert_eq "1" "$(us_state_get '.session_log | length')"
assert_eq "sess-42" "$(us_state_get '.session_log[-1].session_id')"
assert_eq "sess-42" "$(us_state_get '.last_session_id')"

# --- fail-open (task 1.3) ---

it "read on a MISSING state file -> {} and rc 3"
rootA="$(us_fixture_root "")"
reset; us_env "$rootA"
out="$(us_state_read 2>/dev/null)"; rc=$?
assert_rc 3 "$rc"
assert_eq "{}" "$(printf '%s' "$out" | jq -c .)"

it "read on NON-JSON state -> {} , rc 3, warning on stderr"
rootB="$(us_fixture_root 'this is not json {{{')"
reset; us_env "$rootB"
err="$(us_state_read 2>&1 >/dev/null)"
out="$(us_state_read 2>/dev/null)"; rc=$?
assert_rc 3 "$rc"
assert_eq "{}" "$(printf '%s' "$out" | jq -c .)"
assert_contains "$err" "not valid JSON"

it "read on JSON not matching the shape -> rc 3 + warning (fail-open)"
rootC="$(us_fixture_root '{"phase":"spec"}')"
reset; us_env "$rootC"
err="$(us_state_read 2>&1 >/dev/null)"
us_state_read >/dev/null 2>&1; assert_rc 3 "$?"
assert_contains "$err" "does not match the expected shape"

it "us_state_active is false when there is no usable workflow"
reset; us_env "$rootA"
assert_false us_state_active

it "log is a no-op (rc 3) when there is no active workflow"
reset; us_env "$rootA"
us_state_log post_write "x" "s"; assert_rc 3 "$?"

us_test_summary
