#!/usr/bin/env bash
# Tests for packaging + jq-missing degradation
set -u
here="$(cd "$(dirname "$0")" && pwd)"
export US_SRC="${US_SRC:-$(cd "$here/.." && pwd)}"
. "$here/lib.sh"

it "plugin.json is valid, named 'ultraspec', points at hooks + commands"
p="$US_SRC/.claude-plugin/plugin.json"
jq -e . "$p" >/dev/null && _pass || _fail "invalid JSON"
assert_eq "ultraspec" "$(jq -r .name "$p")"
assert_contains "$(jq -r .hooks "$p")" "adapters/claude-code/hooks.json"
assert_eq "./commands" "$(jq -r .commands "$p")"

it "the referenced claude-code hooks.json is valid and covers the 6 events"
h="$US_SRC/adapters/claude-code/hooks.json"
jq -e . "$h" >/dev/null && _pass || _fail "invalid JSON"
for k in SessionStart UserPromptSubmit PreToolUse PostToolUse Stop PreCompact; do
  jq -e --arg k "$k" '.hooks[$k]' "$h" >/dev/null && _pass || _fail "missing hook $k"
done

it "marketplace.json is valid and lists the 'ultraspec' plugin"
m="$US_SRC/.claude-plugin/marketplace.json"
jq -e . "$m" >/dev/null && _pass || _fail "invalid JSON"
assert_eq "ultraspec" "$(jq -r '.plugins[0].name' "$m")"

it "all 14 /ultraspec: commands exist with a description in frontmatter"
n=0
for c in start discover spec plan build review archive advance approve reopen status board handoff set-track; do
  f="$US_SRC/commands/$c.md"
  [ -f "$f" ] && head -5 "$f" | grep -q '^description:' && n=$((n+1)) || _fail "command $c missing or no description"
done
assert_eq 14 "$n"

it "the 6 neutral phase procedures exist in workflow/"
n=0
for w in discover spec plan build review archive; do
  [ -f "$US_SRC/workflow/$w.md" ] && n=$((n+1)) || _fail "workflow/$w.md missing"
done
assert_eq 6 "$n"

it "phase commands point at the neutral procedure"
grep -q 'workflow/spec.md' "$US_SRC/commands/spec.md" && _pass || _fail "commands/spec.md does not reference workflow/spec.md"

it "no command references another platform"
if grep -rIlE 'superpowers|opsx|openspec|mattpocock|pr-review-toolkit|feature-dev|graphify' "$US_SRC/commands" "$US_SRC/workflow" "$US_SRC/templates" "$US_SRC/docs"; then
  _fail "found a reference to a starting platform"
else _pass; fi

it "commands invoke the CLI via \${CLAUDE_PLUGIN_ROOT}/bin/us"
grep -q 'CLAUDE_PLUGIN_ROOT}/bin/us' "$US_SRC/commands/advance.md" && _pass || _fail "advance.md does not use CLAUDE_PLUGIN_ROOT"

it "config + state schemas validate the shipped files"
python3 -c '
import json,jsonschema
for s,d in [("templates/config.schema.json","us.config.json"),
            ("templates/state.schema.json","templates/state.example.json")]:
    jsonschema.validate(json.load(open(f"'"$US_SRC"'/"+d)), json.load(open(f"'"$US_SRC"'/"+s)))
print("ok")
' >/dev/null && _pass || _fail "schema validation failed"

# --- jq missing -> banner warns, never blocks ---
it "session_start with jq absent -> allow + a clear warning, no crash"
fakebin="$(mktemp -d)"
for t in bash cat date grep sed mktemp dirname; do ln -s "$(command -v $t)" "$fakebin/$t"; done
r="$(us_fixture_root '{"workflow":"w","track":"greenfield","phase":"spec","phases_done":[],"gates":{},"session_log":[],"history":[],"updated_at":"x"}')"
out="$(printf '{"event":"session_start","cwd":"'"$r"'"}' | PATH="$fakebin" US_ROOT="$r" bash "$US_SRC/hooks/us-banner.sh")"; rc=$?
assert_rc 0 "$rc"
assert_contains "$out" "jq non installato"
assert_contains "$out" '"decision":"allow"'

it "gate with jq absent -> allow (fail-open)"
printf '{"event":"pre_write","cwd":"'"$r"'","target_path":"'"$r"'/src/x.js"}' | PATH="$fakebin" US_ROOT="$r" bash "$US_SRC/hooks/us-gate.sh" >/dev/null; assert_rc 0 "$?"

us_test_summary
