#!/usr/bin/env bash
# Stops the Thirrem dev servers (API 5001, Rider 5002, Driver 5003, Admin 5004).
# Only touches processes whose working directory is inside this repo.
root="$(cd "$(dirname "$0")/.." && pwd)"
stopped=0

for port in 5001 5002 5003 5004; do
  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null); do
    cwd="$(lsof -p "$pid" -a -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
    if [[ "$cwd" == "$root"* ]]; then
      kill "$pid" && echo "Stopped process $pid on port $port"
      stopped=$((stopped + 1))
    else
      echo "Left port $port alone: process $pid is not part of Thirrem"
    fi
  done
done

[[ $stopped -eq 0 ]] && echo "No Thirrem dev servers were running."
exit 0
