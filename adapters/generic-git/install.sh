#!/usr/bin/env bash
# Install the ultraspec git pre-commit fallback into the current repo.
#   ./install.sh            # install into $(git rev-parse --git-dir)/hooks
#   ./install.sh --uninstall
#
# Generates the installed pre-commit from the pre-commit template in this
# directory, substituting the absolute path to this package's own
# dist/cli.js (resolved from this script's own location, so it works both
# for an npm-global install — $here = node_modules/ultraspec/adapters/generic-git —
# and for the marketplace/plugin install — $here = <plugin-dir>/adapters/generic-git).
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
gitdir="$(git rev-parse --git-dir 2>/dev/null)" || { echo "not a git repo" >&2; exit 1; }
target="$gitdir/hooks/pre-commit"

if [ "${1:-}" = "--uninstall" ]; then
  if [ -L "$target" ] || grep -q "ultraspec" "$target" 2>/dev/null; then
    rm -f "$target"; echo "removed $target"
  else
    echo "no ultraspec pre-commit found at $target"
  fi
  exit 0
fi

mkdir -p "$gitdir/hooks"
if [ -e "$target" ] && ! grep -q "ultraspec" "$target" 2>/dev/null; then
  echo "WARNING: $target already exists and is not ours." >&2
  echo "Chain it manually: call '$here/pre-commit' from your existing hook." >&2
  exit 1
fi

cli_js="$(cd "$here/../.." && pwd)/dist/cli.js"
sed "s#@@ULTRASPEC_CLI_JS@@#$cli_js#" "$here/pre-commit" > "$target"
chmod +x "$target"
echo "installed ultraspec pre-commit -> $target"
