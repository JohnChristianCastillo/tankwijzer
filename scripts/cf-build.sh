#!/usr/bin/env bash
# Cloudflare build step: fetch the published snapshot, then build the frontend.
# The snapshot lives on the orphan 'data' branch, never on main.
set -euo pipefail

echo "fetching the data branch"
if git fetch --depth 1 origin data 2>/dev/null; then
  mkdir -p frontend/public
  # archive|tar, never 'git checkout FETCH_HEAD -- data', which also stages the files
  # and would drag the whole snapshot onto main with the next commit.
  git archive FETCH_HEAD data | tar -x
  rm -rf frontend/public/data
  mv data frontend/public/data
  echo "snapshot restored: $(ls frontend/public/data | wc -l) file(s)"
else
  echo "no data branch yet, building without a snapshot"
fi

cd frontend
npm ci
npm run build
