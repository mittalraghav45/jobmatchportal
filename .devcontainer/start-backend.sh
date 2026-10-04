#!/usr/bin/env bash
set -u

if curl -fsS --max-time 2 http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
  echo "Backend API already running on port 3001"
  exit 0
fi

nohup bash -lc 'cd backend && npm start' >/tmp/jobmatchportal-backend.log 2>&1 &
echo "Backend API starting on port 3001; log: /tmp/jobmatchportal-backend.log"
