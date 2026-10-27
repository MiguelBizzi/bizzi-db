#!/usr/bin/env bash
# Usage: bash .githooks/prepare-commit-msg.test.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(mktemp -d)"
trap 'rm -rf "$repo"' EXIT
cd "$repo"
git init -q -b main
git config user.name "Ada"
git config user.email "ada@example.com"
git config commit.gpgsign false
git config core.hooksPath "$root/.githooks"

commit() {
  echo x > "f$RANDOM$RANDOM"
  git add -A
  git commit -q "$@"
}

failures=0
check() {
  local name="$1" ok="$2"
  if [ "$ok" = 1 ]; then echo "ok   $name"; else echo "FAIL $name"; failures=$((failures + 1)); fi
}
count_signoffs() { git log -1 --format='%(trailers:key=Signed-off-by,valueonly)' | grep -c . || true; }

commit -m "base"
base="$(git rev-parse HEAD)"

commit -m "plain commit"
check "a commit made without -s is signed for its author" "$([ "$(git log -1 --format=%B | grep -c '^Signed-off-by: Ada <ada@example.com>$')" -eq 1 ] && echo 1 || echo 0)"
check "the signed commit passes the DCO check" "$(bash "$root/.github/scripts/check-dco.sh" "$base" HEAD >/dev/null 2>&1 && echo 1 || echo 0)"

commit -s -m "already signed"
check "-s does not add a second sign-off" "$([ "$(count_signoffs)" -eq 1 ] && echo 1 || echo 0)"

git commit -q --amend --no-edit
check "amending does not duplicate the sign-off" "$([ "$(count_signoffs)" -eq 1 ] && echo 1 || echo 0)"

commit -m "with trailer" -m "Co-Authored-By: Bob <bob@example.com>"
msg="$(git log -1 --format=%B)"
check "other trailers are kept" "$(grep -q '^Co-Authored-By: Bob <bob@example.com>$' <<<"$msg" && echo 1 || echo 0)"
check "sign-off is added next to other trailers" "$(grep -q '^Signed-off-by: Ada <ada@example.com>$' <<<"$msg" && echo 1 || echo 0)"

commit -m "other author" --author="Bob <bob@example.com>"
check "the sign-off follows the author, which is what the DCO check compares" "$(git log -1 --format=%B | grep -q '^Signed-off-by: Bob <bob@example.com>$' && echo 1 || echo 0)"

git checkout -q -b side "$base"; commit -m "side"
git checkout -q main; commit -m "main side"
git merge -q --no-ff -m "Merge branch side" side
check "merge commits are left alone" "$([ "$(count_signoffs)" -eq 0 ] && echo 1 || echo 0)"

# What git hands the hook when the message is written in an editor: an empty line, then comments.
msgfile="$(mktemp)"
printf '\n# Please enter the commit message for your changes.\n# Lines starting with # are ignored.\n' > "$msgfile"
bash "$root/.githooks/prepare-commit-msg" "$msgfile" ""
check "the sign-off goes above the editor's comment block" "$(awk '/^Signed-off-by:/{s=NR} /^#/{if(!c)c=NR} END{exit !(s && s<c)}' "$msgfile" && echo 1 || echo 0)"

[ "$failures" -eq 0 ]
