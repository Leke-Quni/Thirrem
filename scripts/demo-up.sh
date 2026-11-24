#!/usr/bin/env bash
# Starts the public demo: Docker Compose stack, Tailscale Funnel and caffeinate (keeps the Mac awake).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

[[ -f .env ]] || { echo "Missing .env. Copy .env.example to .env and fill it in." >&2; exit 1; }
command -v tailscale >/dev/null || { echo "Tailscale is not installed. See docs/deploy.md." >&2; exit 1; }

docker compose -f docker-compose.demo.yml up -d --build --wait
tailscale funnel --bg 5001

if [[ -f .demo-caffeinate.pid ]] && kill -0 "$(cat .demo-caffeinate.pid)" 2>/dev/null; then
  echo "caffeinate already running"
else
  nohup caffeinate -dims >/dev/null 2>&1 &
  echo $! > .demo-caffeinate.pid
fi

echo "Demo is up. Public URL:"
tailscale funnel status
