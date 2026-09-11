#!/usr/bin/env bash
# End-to-end tests for hooks/us-gate.sh hook script (fail-open cases)
# Pure unit tests for glob matching and decisions moved to tests/lib/decision.test.ts (Task 4)
set -u
here="$(cd "$(dirname "$0")" && pwd)"
export US_SRC="${US_SRC:-$(cd "$here/.." && pwd)}"
. "$here/lib.sh"
GATE="$US_SRC/hooks/us-gate.sh"

mkstate() { # mkstate <phase>  -> echoes root
  local phase="$1" root
  root="$(us_fixture_root "{
    \"workflow\":\"w\",\"track\":\"brownfield\",\"phase\":\"$phase\",
    \"phases_done\":[\"intake\",\"discover\"],\"openspec_change\":\"w\",\"harness\":\"claude-code\",
    \"artifacts_dir\":\"ultraspec/workflows/w\",
    \"gates\":{\"spec\":{\"requires\":[\"spec.md\"],\"requires_approval\":true,\"human_approved\":false}},
    \"session_log\":[],\"last_handoff_at\":null,\"last_session_id\":null,\"nudge_marker\":null,
    \"history\":[],\"updated_at\":\"2026-01-01T00:00:00Z\"
  }")"
  printf '%s\n' "$root"
}

# feed a normalized event to the gate from within <root>, echo the decision
gate() { # gate <root> <event-json>
  ( cd "$1" && printf '%s' "$2" | US_ROOT="$1" bash "$GATE" )
}
ev_write() { jq -nc --arg p "$1" '{event:"pre_write",cwd:$ENV.PWD,session_id:"s",target_path:$p}'; }

it "no active workflow -> allow (fail-open)"
empty="$(us_fixture_root "")"
d="$(gate "$empty" "$(ev_write "$empty/src/app.js")")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"

it "corrupt state -> allow (fail-open)"
bad="$(us_fixture_root 'not json')"
d="$(gate "$bad" "$(ev_write "$bad/src/app.js")")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"

it "gate always exits 0 (adapter owns the block translation)"
r="$(mkstate spec)"
gate "$r" "$(ev_write "$r/src/app.js")" >/dev/null; assert_rc 0 "$?"

us_test_summary
