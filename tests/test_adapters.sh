#!/usr/bin/env bash
# Tests for the per-harness adapters  (tasks 3.1, 3.2, 3.3)
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

# ---------- claude-code adapter (3.1) ----------
DISP="$US_SRC/adapters/claude-code/dispatch.sh"

it "claude-code: Write to src/ during SPEC -> exit 2 (deny)"
r="$(mkroot spec)"
feed "$r" cc_pre_write_src.json | US_ROOT="$r" bash "$DISP" gate >/dev/null 2>&1
assert_rc 2 "$?"

it "claude-code: Edit on workflows/ during SPEC -> exit 0 (allow)"
feed "$r" cc_pre_write_workflow.json | US_ROOT="$r" bash "$DISP" gate >/dev/null 2>&1
assert_rc 0 "$?"

it "claude-code: git commit via Bash during SPEC -> exit 2"
feed "$r" cc_pre_bash_commit.json | US_ROOT="$r" bash "$DISP" gate >/dev/null 2>&1
assert_rc 2 "$?"

it "claude-code: Write to src/ during BUILD -> exit 0"
rb="$(mkroot build)"
feed "$rb" cc_pre_write_src.json | US_ROOT="$rb" bash "$DISP" gate >/dev/null 2>&1
assert_rc 0 "$?"

it "claude-code: SessionStart -> additionalContext JSON on stdout"
out="$(feed "$r" cc_session_start.json | US_ROOT="$r" bash "$DISP" banner)"
assert_eq "SessionStart" "$(jq -r '.hookSpecificOutput.hookEventName' <<<"$out")"
assert_contains "$(jq -r '.hookSpecificOutput.additionalContext' <<<"$out")" "phase=spec"

it "claude-code: UserPromptSubmit -> additionalContext under hookEventName UserPromptSubmit"
out="$(feed "$r" cc_user_prompt.json | US_ROOT="$r" bash "$DISP" banner)"
assert_eq "UserPromptSubmit" "$(jq -r '.hookSpecificOutput.hookEventName' <<<"$out")"
assert_contains "$(jq -r '.hookSpecificOutput.additionalContext' <<<"$out")" "phase=spec"

it "claude-code: Stop in SPEC -> exit 0 (spec is not stop-gated)"
feed "$r" cc_stop.json | US_ROOT="$r" bash "$DISP" stop >/dev/null 2>&1
assert_rc 0 "$?"

it "claude-code: PostToolUse Write -> additionalContext + exit 0"
out="$(feed "$r" cc_post_write.json | US_ROOT="$r" bash "$DISP" nudge)"; rc=$?
assert_rc 0 "$rc"
assert_contains "$out" "spec.md"

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

# ---------- opencode adapter (3.3) ----------
NODE="$(command -v node || true)"
if [ -n "$NODE" ]; then
  it "opencode: --selftest reaches the core hooks"
  "$NODE" --experimental-strip-types "$US_SRC/adapters/opencode/plugin.ts" --selftest >/dev/null 2>&1
  assert_rc 0 "$?"

  it "opencode: toEvent maps write/bash to the normalized shape"
  res="$("$NODE" --experimental-strip-types --input-type=module -e '
    import { toEvent } from "'"$US_SRC"'/adapters/opencode/plugin.ts";
    const a = toEvent("pre","write",{filePath:"/r/src/app.js"},"/r","s");
    const b = toEvent("pre","bash",{command:"git commit -m x"},"/r","s");
    console.log(JSON.stringify([a.event,a.target_path,b.event,b.command]));
  ' 2>&1)"
  assert_eq '["pre_write","/r/src/app.js","pre_bash","git commit -m x"]' "$res"

  it "opencode: runCore on a src/ write during SPEC returns deny"
  r2="$(mkroot spec)"
  res="$("$NODE" --experimental-strip-types --input-type=module -e '
    import { runCore, toEvent } from "'"$US_SRC"'/adapters/opencode/plugin.ts";
    const ev = toEvent("pre","write",{filePath:"'"$r2"'/src/app.js"},"'"$r2"'","s");
    console.log(runCore("us-gate.sh", ev).decision);
  ' 2>&1)"
  assert_eq "deny" "$res"
else
  it "opencode: (skipped — node not found)"; _pass
fi

us_test_summary
