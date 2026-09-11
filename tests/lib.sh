#!/usr/bin/env bash
# Minimal test helpers for the ultraspec suite.
# Counters live in a temp file so they survive subshells.
US_TESTS_COUNT_FILE="$(mktemp)"
printf '0 0\n' > "$US_TESTS_COUNT_FILE"
_us_cur=""

it() { _us_cur="$1"; }

_bump() { # _bump <pass|fail>
  local p f; read -r p f < "$US_TESTS_COUNT_FILE"
  [ "$1" = pass ] && p=$((p+1)) || f=$((f+1))
  printf '%d %d\n' "$p" "$f" > "$US_TESTS_COUNT_FILE"
}
_pass() { _bump pass; printf '  ok   %s\n' "$_us_cur"; }
_fail() { _bump fail; printf '  FAIL %s\n       %s\n' "$_us_cur" "$1"; }

assert_eq() {
  if [ "$1" = "$2" ]; then _pass; else _fail "expected [$1] got [$2] ${3:-}"; fi
}
assert_rc() {
  if [ "$1" = "$2" ]; then _pass; else _fail "expected rc $1 got rc $2 ${3:-}"; fi
}
assert_contains() {
  case "$1" in *"$2"*) _pass;; *) _fail "[$1] does not contain [$2]";; esac
}
assert_not_contains() {
  case "$1" in *"$2"*) _fail "[$1] unexpectedly contains [$2]";; *) _pass;; esac
}
assert_true()  { if "$@"; then _pass; else _fail "expected success from: $*"; fi; }
assert_false() { if "$@"; then _fail "expected failure from: $*"; else _pass; fi; }

us_test_summary() {
  local p f; read -r p f < "$US_TESTS_COUNT_FILE"
  rm -f "$US_TESTS_COUNT_FILE"
  printf '\n%s: %d passed, %d failed\n' "${0##*/}" "$p" "$f"
  [ "$f" -eq 0 ]
}

# Build a throwaway repo root holding a COMPLETE ultraspec/ (config copied,
# hooks/adapters/templates symlinked to the source) plus an optional state file.
us_fixture_root() { # us_fixture_root [state-json | ""]
  local root src
  root="$(mktemp -d)"
  src="${US_SRC:?US_SRC must point at the ultraspec/ source dir}"
  mkdir -p "$root/ultraspec"
  cp "$src/us.config.json" "$root/ultraspec/us.config.json"
  ln -s "$src/hooks"     "$root/ultraspec/hooks"
  ln -s "$src/adapters"  "$root/ultraspec/adapters"
  ln -s "$src/templates" "$root/ultraspec/templates"
  ln -s "$src/commands"  "$root/ultraspec/commands"
  ln -s "$src/bin"       "$root/ultraspec/bin"
  [ -n "${1:-}" ] && printf '%s' "$1" > "$root/ultraspec/.us-state.json"
  printf '%s\n' "$root"
}
