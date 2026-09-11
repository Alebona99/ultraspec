#!/usr/bin/env bash
# End-to-end simulation: a full workflow driven through bin/us + the claude-code
# adapter, asserting the gate decision at each phase.  (tasks 8.2, 8.3)
#
# This is NOT a substitute for the live runbook (RUNBOOK.md) — it feeds recorded
# payloads, it does not register hooks in a real agent session.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
export US_SRC="${US_SRC:-$(cd "$here/.." && pwd)}"
. "$here/lib.sh"
US="$US_SRC/bin/us"
DISP="$US_SRC/adapters/claude-code/dispatch.sh"
FIX="$here/fixtures"

R="$(us_fixture_root "")"
CH="$R/ultraspec/workflows/demo"
mkdir -p "$CH"
us() { ( cd "$R" && US_CWD="$PWD" bash "$US" "$@" ); }
# gate a claude-code native fixture, return exit code (0 allow / 2 deny)
ccgate() { sed "s#__ROOT__#$R#g" "$FIX/$1" | US_ROOT="$R" bash "$DISP" gate >/dev/null 2>&1; echo $?; }
phase() { jq -r .phase "$R/ultraspec/.us-state.json"; }

it "start --track brownfield -> phase intake"
us start demo --track brownfield --harness claude-code >/dev/null
assert_eq "intake" "$(phase)"

it "INTAKE/DISCOVER/SPEC/PLAN: writing src/ is denied (exit 2)"
# intake -> discover
: > "$CH/discovery.md"; us advance >/dev/null; assert_eq "discover" "$(phase)"
assert_eq 2 "$(ccgate cc_pre_write_src.json)"
# discover -> spec
us advance >/dev/null; assert_eq "spec" "$(phase)"
assert_eq 2 "$(ccgate cc_pre_write_src.json)"
assert_eq 0 "$(ccgate cc_pre_write_workflow.json)"      # planning artifacts always OK

it "SPEC gate: advance blocked without artifacts, then without approval, then OK"
us advance >/dev/null 2>&1; assert_eq "spec" "$(phase)"          # no proposal/design
: > "$CH/spec.md"
us advance >/dev/null 2>&1; assert_eq "spec" "$(phase)"          # not approved
us approve spec >/dev/null
us advance >/dev/null;      assert_eq "plan" "$(phase)"

it "PLAN: still denies src/ writes and commits"
assert_eq 2 "$(ccgate cc_pre_write_src.json)"
assert_eq 2 "$(ccgate cc_pre_bash_commit.json)"

it "PLAN gate: plan.md + approval -> build"
: > "$CH/plan.md"
us advance >/dev/null 2>&1; assert_eq "plan" "$(phase)"
us approve plan >/dev/null
us advance >/dev/null;      assert_eq "build" "$(phase)"

it "BUILD: src/ writes and commits are finally allowed"
assert_eq 0 "$(ccgate cc_pre_write_src.json)"
assert_eq 0 "$(ccgate cc_pre_bash_commit.json)"

it "BUILD -> REVIEW; stop is held until review.md exists"
us advance >/dev/null; assert_eq "review" "$(phase)"
sed "s#__ROOT__#$R#g" "$FIX/cc_stop.json" | US_ROOT="$R" bash "$DISP" stop >/dev/null 2>&1
assert_rc 2 "$?"                                            # blocked: no findings
: > "$CH/review.md"
sed "s#__ROOT__#$R#g" "$FIX/cc_stop.json" | US_ROOT="$R" bash "$DISP" stop >/dev/null 2>&1
assert_rc 0 "$?"

it "REVIEW -> ARCHIVE -> DONE"
us approve review >/dev/null
us advance >/dev/null; assert_eq "archive" "$(phase)"
: > "$CH/summary.md"
us approve archive >/dev/null
us advance >/dev/null; assert_eq "done" "$(phase)"

it "history recorded every transition + approval + start"
n="$(jq -r '[.history[].event] | join(",")' "$R/ultraspec/.us-state.json")"
assert_contains "$n" "start"
assert_contains "$n" "approve"
assert_contains "$n" "advance"

# --- 8.3 resume across two sessions ---
it "RESUME: session 2 sees the handoff written during session 1"
R2="$(us_fixture_root "")"
CH2="$R2/ultraspec/workflows/w"; mkdir -p "$CH2"
uk2() { ( cd "$R2" && US_CWD="$PWD" bash "$US" "$@" ); }
uk2 start w --track greenfield --harness claude-code >/dev/null
: > "$CH2/discovery.md"; uk2 advance >/dev/null; uk2 advance >/dev/null   # -> spec
# session 1: banner runs (stamps last_session_at), work happens, handoff written
printf '{"event":"session_start","cwd":"%s","session_id":"s1"}' "$R2" | US_ROOT="$R2" bash "$US_SRC/hooks/us-banner.sh" >/dev/null
hp="$(uk2 handoff-path)"
printf '# Handoff w\nProssima azione: scrivere spec.md, poi /ultraspec:approve spec\n' > "$hp"
uk2 handoff-done "$hp" >/dev/null
sleep 1
# session 2 starts
ctx="$(printf '{"event":"session_start","cwd":"%s","session_id":"s2"}' "$R2" | US_ROOT="$R2" bash "$US_SRC/hooks/us-banner.sh" | jq -r .context)"
assert_contains "$ctx" "Handoff dalla sessione precedente"
assert_contains "$ctx" "scrivere spec.md"
assert_contains "$ctx" "phase=spec"

us_test_summary
