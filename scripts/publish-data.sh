#!/usr/bin/env bash
# Publishes the site data and the price archive to the orphan 'data' branch,
# replacing it wholesale. One copy on the remote, and main stays small.
#
#   data/      frontend/public/data, what the site serves
#   archive/   every price observation ever made, which exists nowhere else
#
# Because the branch is replaced rather than appended to, a run that started from
# a missing or partial copy would quietly delete history. So nothing is pushed
# unless every file on the remote branch is still there and no archive file got
# smaller. ALLOW_DROP=1 overrides that, for a removal that is deliberate.
set -euo pipefail

SOURCE="frontend/public/data"
ARCHIVE="archive"
[ -d "$SOURCE" ] || { echo "no snapshot at $SOURCE"; exit 1; }

ROOT="$PWD"
TMP="$(mktemp -d)"
BRANCH="publish-data-$$"

# The temp branch outlives its worktree, so clean both up however this ends.
cleanup() {
  cd "$ROOT"
  git worktree remove --force "$TMP" >/dev/null 2>&1 || true
  git branch -D "$BRANCH" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# A uniquely named branch in a throwaway worktree. 'git checkout --orphan data'
# directly works exactly once, then the stale local branch makes every later run fail.
git worktree add --detach "$TMP" >/dev/null
cd "$TMP"
git checkout --orphan "$BRANCH" >/dev/null
git rm -rq --cached . 2>/dev/null || true
rm -rf ./* 2>/dev/null || true
mkdir -p data
cp -r "$ROOT/$SOURCE/." data/
git add data
if [ -d "$ROOT/$ARCHIVE" ]; then
  mkdir -p archive
  cp -r "$ROOT/$ARCHIVE/." archive/
  # Forced, because main's .gitignore is still in this worktree and ignores
  # archive/. Without -f the archive would silently never be published.
  git add -f archive
fi

if git fetch -q origin data 2>/dev/null; then
  problems="$(comm -23 <(git ls-tree -r --name-only FETCH_HEAD | sort) <(git ls-files | sort) \
    | sed 's/^/  missing  /')" || true
  while read -r path; do
    [ -f "$path" ] || continue
    before="$(git cat-file -s "FETCH_HEAD:$path")"
    after="$(wc -c < "$path")"
    if [ "$after" -lt "$before" ]; then
      problems="$problems"$'\n'"  smaller  $path ($before -> $after bytes)"
    fi
  done < <(git ls-tree -r --name-only FETCH_HEAD -- archive)

  if [ -n "${problems//[$'\n' ]/}" ] && [ "${ALLOW_DROP:-0}" != "1" ]; then
    echo "refusing to publish, this would lose data already on the data branch:"
    echo "$problems"
    echo "restore the data branch first, or set ALLOW_DROP=1 if this is deliberate"
    exit 1
  fi
fi

git commit -qm "Snapshot $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push -f origin "HEAD:refs/heads/data"
echo "published to the data branch"
