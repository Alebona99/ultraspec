#!/usr/bin/env bash
# Tests for hooks/us-gate.sh + hooks/lib/us-decision.sh  (task 2.3)
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
ev_bash()  { jq -nc --arg c "$1" '{event:"pre_bash",cwd:$ENV.PWD,session_id:"s",command:$c}'; }

it "write to src/ during SPEC -> deny"
r="$(mkstate spec)"
d="$(gate "$r" "$(ev_write "$r/src/app.js")")"
assert_eq "deny" "$(jq -r .decision <<<"$d")"
assert_contains "$(jq -r .reason <<<"$d")" "fase 'spec'"

it "write to openspec/ during SPEC -> allow"
d="$(gate "$r" "$(ev_write "$r/ultraspec/workflows/w/spec.md")")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"

it "write to .us-state.json is DENIED in every phase (the gate's own integrity)"
for ph in spec build review; do
  rr="$(mkstate "$ph")"
  d="$(gate "$rr" "$(ev_write "$rr/ultraspec/.us-state.json")")"
  assert_eq "deny" "$(jq -r .decision <<<"$d")"
done

it "write to ultraspec/us.config.json is DENIED in build too"
rb2="$(mkstate build)"
d="$(gate "$rb2" "$(ev_write "$rb2/ultraspec/us.config.json")")"
assert_eq "deny" "$(jq -r .decision <<<"$d")"

it "write to ultraspec/hooks/ is DENIED in build"
d="$(gate "$rb2" "$(ev_write "$rb2/ultraspec/hooks/us-gate.sh")")"
assert_eq "deny" "$(jq -r .decision <<<"$d")"

it "write to a *.md file anywhere during SPEC -> allow"
d="$(gate "$r" "$(ev_write "$r/src/notes.md")")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"

it "write to a test file during SPEC -> allow"
d="$(gate "$r" "$(ev_write "$r/src/app_test.js")")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"

it "write to src/ during BUILD -> allow"
rb="$(mkstate build)"
d="$(gate "$rb" "$(ev_write "$rb/src/app.js")")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"

it "git commit during PLAN -> deny"
rp="$(mkstate plan)"
d="$(gate "$rp" "$(ev_bash 'git commit -m wip')")"
assert_eq "deny" "$(jq -r .decision <<<"$d")"
assert_contains "$(jq -r .reason <<<"$d")" "git commit"

it "git commit during BUILD -> allow"
d="$(gate "$rb" "$(ev_bash 'git commit -m wip')")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"

it "git push during REVIEW -> allow"
rv="$(mkstate review)"
d="$(gate "$rv" "$(ev_bash 'git push origin HEAD')")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"

it "a harmless bash command is always allow"
d="$(gate "$rp" "$(ev_bash 'ls -la')")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"

it "no active workflow -> allow (fail-open)"
empty="$(us_fixture_root "")"
d="$(gate "$empty" "$(ev_write "$empty/src/app.js")")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"

it "corrupt state -> allow (fail-open)"
bad="$(us_fixture_root 'not json')"
d="$(gate "$bad" "$(ev_write "$bad/src/app.js")")"
assert_eq "allow" "$(jq -r .decision <<<"$d")"

it "gate always exits 0 (adapter owns the block translation)"
gate "$r" "$(ev_write "$r/src/app.js")" >/dev/null; assert_rc 0 "$?"

us_test_summary
