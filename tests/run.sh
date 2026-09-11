#!/usr/bin/env bash
# Run the whole ultraspec test suite.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
export US_SRC="$(cd "$here/.." && pwd)"

total_fail=0
ran=0
for t in "$here"/test_*.sh; do
  [ -e "$t" ] || continue
  ran=$((ran+1))
  printf '\n=== %s ===\n' "${t##*/}"
  bash "$t" || total_fail=$((total_fail+1))
done

printf '\n----------------------------------------\n'
if [ "$ran" -eq 0 ]; then
  echo "no test files found"; exit 1
fi
if [ "$total_fail" -eq 0 ]; then
  echo "ALL SUITES PASSED ($ran files)"; exit 0
else
  echo "$total_fail suite(s) FAILED"; exit 1
fi
