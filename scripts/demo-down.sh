#!/usr/bin/env bash
# Stops the public demo started by demo-up.sh.
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

tailscale funnel reset 2>/dev/null || true
docker compose -f docker-compose.demo.yml down
if [[ -f .demo-caffeinate.pid ]]; then
  kill "$(cat .demo-caffeinate.pid)" 2>/dev/null || true
  rm -f .demo-caffeinate.pid
fi
echo "Demo stopped."
