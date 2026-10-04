#!/usr/bin/env bash
set -u

# Keep the Codespace checkout current without ever overwriting local work.
REPO_ROOT="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi

LOG_FILE="/tmp/jobmatchportal-auto-sync.log"
INTERVAL_SECONDS="10"

cd "$REPO_ROOT" || exit 0

echo "[$(date -Is)] auto-sync started (interval=${INTERVAL_SECONDS}s)" >> "$LOG_FILE"

while true; do
  current_branch="$(git branch --show-current 2>/dev/null || true)"

  # Never touch detached HEADs or a dirty working tree.
  if [ -n "$current_branch" ] && [ -z "$(git status --porcelain 2>/dev/null)" ]; then
    if git fetch origin "$current_branch" >> "$LOG_FILE" 2>&1; then
      local_sha="$(git rev-parse HEAD 2>/dev/null || true)"
      remote_sha="$(git rev-parse "origin/$current_branch" 2>/dev/null || true)"

      if [ -n "$local_sha" ] && [ -n "$remote_sha" ] && [ "$local_sha" != "$remote_sha" ]; then
        if git merge-base --is-ancestor "$local_sha" "$remote_sha" 2>/dev/null; then
          git merge --ff-only "origin/$current_branch" >> "$LOG_FILE" 2>&1 || true
          echo "[$(date -Is)] fast-forwarded $current_branch to $remote_sha" >> "$LOG_FILE"
        else
          echo "[$(date -Is)] remote/local history diverged on $current_branch; not modifying worktree" >> "$LOG_FILE"
        fi
      fi
    fi
  fi

  sleep "$INTERVAL_SECONDS"
done
