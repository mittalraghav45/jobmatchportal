#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

install_node_dependencies() {
  local dir="$1"
  if [[ ! -f "$ROOT/$dir/package.json" ]]; then
    return 0
  fi

  echo "==> Installing dependencies in $dir"
  cd "$ROOT/$dir"
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
}

install_node_dependencies backend
install_node_dependencies frontend

cd "$ROOT"

echo
if [[ -n "${MONGODB_URI:-}" ]]; then
  echo "MONGODB_URI: configured"
else
  echo "MONGODB_URI: not configured"
  echo "Add MONGODB_URI as a GitHub Codespaces repository secret before running database commands."
fi

echo "Codespace bootstrap complete."
echo "Backend: cd backend && npm test"
echo "Database check: cd backend && npm run db:check"
