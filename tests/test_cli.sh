#!/usr/bin/env bash
# Tests for bin/us  (tasks 4.1 4.2 4.3 4.4 4.5)
set -u
here="$(cd "$(dirname "$0")" && pwd)"
export US_SRC="${US_SRC:-$(cd "$here/.." && pwd)}"
. "$here/lib.sh"
US="$US_SRC/bin/us"

# run us inside a fresh root
in_root() { ( cd "$1" && shift && US_CWD="$PWD" bash "$US" "$@" ); }
state() { jq -r "$2" "$1/ultraspec/.us-state.json"; }

# --- 4.1 start ---
it "start without --track is rejected and writes no state"
r="$(us_fixture_root "")"
in_root "$r" start feat >/dev/null 2>&1
assert_rc 1 "$?"
assert_false test -f "$r/ultraspec/.us-state.json"

it "start --track brownfield creates state at phase intake"
in_root "$r" start feat --track brownfield --harness claude-code >/dev/null
assert_eq "intake" "$(state "$r" .phase)"
assert_eq "brownfield" "$(state "$r" .track)"
assert_eq "claude-code" "$(state "$r" .harness)"
assert_eq "start" "$(state "$r" '.history[0].event')"
assert_eq "false" "$(state "$r" '.gates.spec.human_approved')"

it "start refuses a second active workflow"
in_root "$r" start other --track greenfield >/dev/null 2>&1
assert_rc 1 "$?"

# --- 4.2 advance + 4.5 approve ---
setup_spec() { # -> root in phase spec, artifacts dir made
  local root; root="$(us_fixture_root "")"
  in_root "$root" start w --track greenfield --harness claude-code >/dev/null
  # intake -> discover needs discovery.md
  mkdir -p "$root/ultraspec/workflows/w"
  : > "$root/ultraspec/workflows/w/discovery.md"
  in_root "$root" advance >/dev/null            # intake -> discover
  in_root "$root" advance >/dev/null            # discover -> spec
  printf '%s\n' "$root"
}

it "advance from intake needs no gate; reaches discover then spec"
rs="$(setup_spec)"
assert_eq "spec" "$(state "$rs" .phase)"
assert_eq "intake discover" "$(state "$rs" '.phases_done | join(" ")')"

it "advance from spec is refused while spec.md is missing"
in_root "$rs" advance >/dev/null 2>&1
assert_rc 1 "$?"
assert_eq "spec" "$(state "$rs" .phase)"

it "advance from spec is refused when artifacts exist but not approved"
: > "$rs/ultraspec/workflows/w/spec.md"
out="$(in_root "$rs" advance 2>&1)"; rc=$?
assert_rc 1 "$rc"
assert_contains "$out" "approvazione"

it "approve sets human_approved and logs history"
in_root "$rs" approve spec >/dev/null
assert_eq "true" "$(state "$rs" '.gates.spec.human_approved')"
assert_eq "approve" "$(state "$rs" '.history[-1].event')"

it "advance from spec now succeeds -> plan"
in_root "$rs" advance >/dev/null
assert_eq "plan" "$(state "$rs" .phase)"

it "only 'approve' ever writes human_approved (advance never does)"
# fresh: reach plan without approving plan gate, try advance -> refused, gate still false
: > "$rs/ultraspec/workflows/w/plan.md"
in_root "$rs" advance >/dev/null 2>&1
assert_eq "false" "$(state "$rs" '.gates.plan.human_approved')"
assert_eq "plan" "$(state "$rs" .phase)"

# --- 4.3 reopen ---
it "reopen without --reason is rejected"
in_root "$rs" reopen spec >/dev/null 2>&1
assert_rc 1 "$?"

it "reopen forward is rejected (ratchet)"
in_root "$rs" reopen review --reason "x" >/dev/null 2>&1
assert_rc 1 "$?"

it "reopen backward to spec works, resets downstream approval, logs reason"
in_root "$rs" reopen spec --reason "design gap trovato" >/dev/null
assert_eq "spec" "$(state "$rs" .phase)"
assert_eq "false" "$(state "$rs" '.gates.spec.human_approved')"
assert_eq "reopen" "$(state "$rs" '.history[-1].event')"
assert_contains "$(state "$rs" '.history[-1].reason')" "design gap"
assert_eq "intake discover" "$(state "$rs" '.phases_done | join(" ")')"

it "reopen to an earlier phase (intake) also works"
in_root "$rs" reopen intake --reason "ripartn da capo" >/dev/null
assert_eq "intake" "$(state "$rs" .phase)"
assert_eq "" "$(state "$rs" '.phases_done | join(" ")')"

# --- 4.4 status ---
it "status --json reports phase, missing artifacts, enforcement"
r4="$(setup_spec)"
j="$(in_root "$r4" status --json)"
assert_eq "spec" "$(jq -r .phase <<<"$j")"
assert_contains "$(jq -r '.missing_artifacts|join(",")' <<<"$j")" "spec.md"
assert_contains "$(jq -r .enforcement <<<"$j")" "completo"

it "status (text) explains the code-edit block in spec"
out="$(in_root "$r4" status)"
assert_contains "$out" "modifiche a codice di prodotto bloccate"
assert_contains "$out" "fase     : spec"

it "set-track switches greenfield<->brownfield while in intake/discover"
rt="$(us_fixture_root "")"
in_root "$rt" start w --track greenfield --harness claude-code >/dev/null
in_root "$rt" set-track brownfield >/dev/null
assert_eq "brownfield" "$(state "$rt" .track)"
assert_eq "set-track" "$(state "$rt" '.history[-1].event')"

it "set-track is refused once past discover"
mkdir -p "$rt/ultraspec/workflows/w"; : > "$rt/ultraspec/workflows/w/discovery.md"
in_root "$rt" advance >/dev/null   # intake->discover
in_root "$rt" advance >/dev/null   # discover->spec
in_root "$rt" set-track greenfield >/dev/null 2>&1
assert_rc 1 "$?"
assert_eq "brownfield" "$(state "$rt" .track)"

it "board runs and shows the workflow + a history section"
out="$(in_root "$rt" board 2>&1)"
assert_contains "$out" "fase     : spec"
assert_contains "$out" "History"
assert_contains "$out" "Tutti i workflow"
assert_contains "$out" "Test"
_pass

it "status with no workflow says so"
empty="$(us_fixture_root "")"
out="$(in_root "$empty" status)"
assert_contains "$out" "nessun workflow attivo"

us_test_summary
