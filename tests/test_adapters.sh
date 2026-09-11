#!/usr/bin/env bash
# Tests for the per-harness adapters  (task 3.2 — generic-git fallback;
# the opencode adapter's cases now live in tests/adapters/openCode.test.ts)
set -u
here="$(cd "$(dirname "$0")" && pwd)"
export US_SRC="${US_SRC:-$(cd "$here/.." && pwd)}"
. "$here/lib.sh"
FIX="$here/fixtures"

mkroot() { # mkroot <phase>
  local phase="$1" root
  root="$(us_fixture_root "{
    \"workflow\":\"w\",\"track\":\"brownfield\",\"phase\":\"$phase\",
    \"phases_done\":[\"intake\",\"discover\"],\"openspec_change\":\"w\",\"harness\":\"claude-code\",
    \"artifacts_dir\":\"ultraspec/workflows/w\",
    \"gates\":{\"spec\":{\"requires\":[\"spec.md\"],\"requires_approval\":true,\"human_approved\":false}},
    \"session_log\":[],\"last_handoff_at\":null,\"last_session_id\":null,\"nudge_marker\":null,
    \"history\":[],\"updated_at\":\"2026-01-01T00:00:00Z\"
  }")"
  mkdir -p "$root/ultraspec/workflows/w" "$root/src"
  printf '%s\n' "$root"
}
feed() { sed "s#__ROOT__#$1#g" "$FIX/$2"; }

# ---------- generic-git fallback (3.2) ----------
PC="$US_SRC/adapters/generic-git/pre-commit"

it "generic-git: pre-commit fails during PLAN"
rp="$(mkroot plan)"
( cd "$rp" && bash "$PC" ) >/dev/null 2>&1
assert_rc 1 "$?"

it "generic-git: pre-commit passes during BUILD"
( cd "$rb" && bash "$PC" ) >/dev/null 2>&1
assert_rc 0 "$?"

it "generic-git: pre-commit is a no-op where ultraspec is absent"
plain="$(mktemp -d)"
( cd "$plain" && bash "$PC" ) >/dev/null 2>&1
assert_rc 0 "$?"

it "generic-git: installer copies the hook into .git/hooks"
gr="$(mkroot build)"; ( cd "$gr" && git init -q )
( cd "$gr" && bash "$US_SRC/adapters/generic-git/install.sh" ) >/dev/null 2>&1
assert_true test -x "$gr/.git/hooks/pre-commit"

us_test_summary
