#!/usr/bin/env bash
# Tests for the normalized event schema + hooks/lib/us-event.sh  (tasks 2.1, 2.2)
set -u
here="$(cd "$(dirname "$0")" && pwd)"
export US_SRC="${US_SRC:-$(cd "$here/.." && pwd)}"
. "$here/lib.sh"
. "$US_SRC/hooks/lib/us-event.sh"
FIX="$here/fixtures"

norm() { # norm <harness> <fixture-file>
  sed "s#__ROOT__#/tmp/ukroot#g" "$FIX/$2" | us_event_normalize "$1"
}
schema_ok() { # schema_ok <schema> <json-on-stdin>
  local s="$1"; python3 -c '
import json,sys,jsonschema
schema=json.load(open(sys.argv[1])); jsonschema.validate(json.load(sys.stdin),schema)
' "$US_SRC/templates/$s"
}

# --- task 2.1: schema validates one example per event ---
it "event.schema.json accepts all six event kinds"
for e in session_start pre_write pre_bash stop pre_compact post_write; do
  printf '{"event":"%s","harness":"x","cwd":"/w","session_id":"s"}' "$e" | schema_ok event.schema.json \
    && _pass || _fail "schema rejected event=$e"
done

it "decision.schema.json accepts all four decisions"
for d in allow deny block nudge; do
  printf '{"decision":"%s","reason":"r"}' "$d" | schema_ok decision.schema.json \
    && _pass || _fail "schema rejected decision=$d"
done

it "decision.schema.json rejects an unknown decision"
if printf '{"decision":"maybe"}' | schema_ok decision.schema.json 2>/dev/null; then
  _fail "schema accepted decision=maybe"
else _pass; fi

# --- task 2.2: normalizer output conforms + is harness-agnostic ---
it "every claude-code fixture normalizes to a schema-valid event"
for f in cc_pre_write_src cc_pre_write_workflow cc_pre_bash_commit cc_session_start cc_stop cc_pre_compact cc_post_write; do
  norm claude-code "$f.json" | schema_ok event.schema.json && _pass || _fail "invalid normalized event from $f"
done

it "claude-code PreToolUse/Write -> pre_write with target_path"
o="$(norm claude-code cc_pre_write_src.json)"
assert_eq "pre_write" "$(jq -r .event <<<"$o")"
assert_eq "/tmp/ukroot/src/app.js" "$(jq -r .target_path <<<"$o")"

it "claude-code PreToolUse/Edit on a workflow artifact -> pre_write"
o="$(norm claude-code cc_pre_write_workflow.json)"
assert_eq "pre_write" "$(jq -r .event <<<"$o")"
assert_contains "$(jq -r .target_path <<<"$o")" "ultraspec/workflows/w/spec.md"

it "claude-code PreToolUse/Bash -> pre_bash with command"
o="$(norm claude-code cc_pre_bash_commit.json)"
assert_eq "pre_bash" "$(jq -r .event <<<"$o")"
assert_contains "$(jq -r .command <<<"$o")" "git commit"

it "claude-code UserPromptSubmit -> user_prompt"
assert_eq "user_prompt" "$(norm claude-code cc_user_prompt.json | jq -r .event)"

it "claude-code SessionStart/Stop/PreCompact/PostToolUse map correctly"
assert_eq "session_start" "$(norm claude-code cc_session_start.json | jq -r .event)"
assert_eq "stop"          "$(norm claude-code cc_stop.json | jq -r .event)"
assert_eq "pre_compact"   "$(norm claude-code cc_pre_compact.json | jq -r .event)"
assert_eq "post_write"    "$(norm claude-code cc_post_write.json | jq -r .event)"

it "claude-code session_start carries session_id and reason"
o="$(norm claude-code cc_session_start.json)"
assert_eq "s2" "$(jq -r .session_id <<<"$o")"
assert_eq "startup" "$(jq -r .reason <<<"$o")"

it "SAME normalized event from claude-code and opencode for an equivalent code write"
cc="$(norm claude-code cc_pre_write_src.json | jq -S '{event,target_path,command}')"
oc="$(norm opencode   oc_pre_write_src.json  | jq -S '{event,target_path,command}')"
assert_eq "$cc" "$oc"

it "SAME normalized event from claude-code and opencode for a commit"
cc="$(norm claude-code cc_pre_bash_commit.json | jq -S '{event,command:( .command|test("git commit") )}')"
oc="$(norm opencode   oc_pre_bash_commit.json  | jq -S '{event,command:( .command|test("git commit") )}')"
assert_eq "$cc" "$oc"

it "non-JSON payload -> ignore (never crashes the gate)"
assert_eq "ignore" "$(printf 'garbage' | us_event_normalize claude-code | jq -r .event)"

us_test_summary
