#!/usr/bin/env bash
# Usage: check-dco.sh <base-sha> <head-sha>
# Fails when a non-merge commit in base..head has no Signed-off-by trailer whose email matches the commit author's.
set -euo pipefail

base="$1"
head="$2"
failed=0

while read -r sha; do
  author="$(git log -1 --format=%ae "$sha" | tr '[:upper:]' '[:lower:]')"
  signoffs="$(git log -1 --format='%(trailers:key=Signed-off-by,valueonly)' "$sha" \
    | sed -n 's/.*<\(.*\)>.*/\1/p' | tr '[:upper:]' '[:lower:]')"
  if ! grep -Fxq "$author" <<<"$signoffs"; then
    echo "::error::commit $(git rev-parse --short "$sha") has no Signed-off-by for $author; amend it with 'git commit -s'"
    failed=1
  fi
done < <(git rev-list --no-merges "$base..$head")

exit "$failed"
