#!/usr/bin/env bash
set -u

# Codespaces helper: keep the checked-out development branch current with GitHub
# without ever overwriting uncommitted local work.
REPO_ROOT="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi

BRANCH="feat/source-backed-job-verification"
LOG_FILE="/tmp/jobmatchportal-auto-sync.log"
INTERVAL_SECONDS="30"

cd "$REPO_ROOT" || exit 0

echo "[$(date -Is)] auto-sync started for $BRANCH" >> "$LOG_FILE"

while true; do
  current_branch="$(git branch --show-current 2>/dev/null || true)"

  if [ "$current_branch" = "$BRANCH" ] && [ -z "$(git status --porcelain 2>/dev/null)" ]; then
    if git fetch origin "$BRANCH" >> "$LOG_FILE" 2>&1; then
      local_sha="$(git rev-parse HEAD 2>/dev/null || true)"
      remote_sha="$(git rev-parse "origin/$BRANCH" 2>/dev/null || true)"

      if [ -n "$local_sha" ] && [ -n "$remote_sha" ] && [ "$local_sha" != "$remote_sha" ]; then
        if git merge-base --is-ancestor "$local_sha" "$remote_sha" 2>/dev/null; then
          git merge --ff-only "origin/$BRANCH" >> "$LOG_FILE" 2>&1 || true
        else
          echo "[$(date -Is)] remote/local history diverged; not modifying worktree" >> "$LOG_FILE"
        fi
      fi
    fi
  fi

  sleep "$INTERVAL_SECONDS"
done
