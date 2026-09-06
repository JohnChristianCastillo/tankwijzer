#!/usr/bin/env bash
# Publishes frontend/public/data to the orphan 'data' branch, replacing it wholesale.
# One copy on the remote, and main stays small.
set -euo pipefail

SOURCE="frontend/public/data"
[ -d "$SOURCE" ] || { echo "no snapshot at $SOURCE"; exit 1; }

TMP="$(mktemp -d)"
BRANCH="publish-data-$$"

# A uniquely named branch in a throwaway worktree. 'git checkout --orphan data'
# directly works exactly once, then the stale local branch makes every later run fail.
git worktree add --detach "$TMP" >/dev/null
(
  cd "$TMP"
  git checkout --orphan "$BRANCH" >/dev/null
  git rm -rq --cached . 2>/dev/null || true
  rm -rf ./* 2>/dev/null || true
  mkdir -p data
  cp -r "$OLDPWD/$SOURCE/." data/
  git add data
  git commit -qm "Snapshot $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git push -f origin "HEAD:refs/heads/data"
)
git worktree remove --force "$TMP"
# The temp branch outlives its worktree, so clean it up too. Harmless in CI,
# but locally it leaves one dead branch behind on every run.
git branch -D "$BRANCH" >/dev/null 2>&1 || true
echo "published to the data branch"
