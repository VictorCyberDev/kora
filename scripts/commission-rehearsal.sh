#!/usr/bin/env bash
# Local rehearsal of production commissioning with the PRODUCTION IMAGE (built from the repo Dockerfile) and a fresh
# Postgres database: flag v2 baseline -> flag v3 -> flag back to v2, each phase driven by scripts/commission-v7.mjs.
# This is a rehearsal on one machine, not production: it proves the image, the migrations and the sequence.
# usage: scripts/commission-rehearsal.sh <image> <outDir>
set -euo pipefail
IMG="${1:-kora-v7-check:local}"; OUT="${2:-/var/tmp/commission}"; mkdir -p "$OUT"
DBN="kora_rehearsal"; DBU="postgresql://kora:kora@127.0.0.1:5432/$DBN"
su postgres -c "psql -q -c 'DROP DATABASE IF EXISTS $DBN WITH (FORCE)' -c 'CREATE DATABASE $DBN OWNER kora'" >/dev/null
docker rm -f kora-rh-api kora-rh-host >/dev/null 2>&1 || true
API=8097; HOST=8098
start_host() {
  docker run -d --name kora-rh-host --network host -e DATABASE_URL="$DBU" -e PORT=$HOST -e SITE_HOST_PUBLIC_URL="http://127.0.0.1:$HOST" -e LOG_LEVEL=warn "$IMG" node apps/site-host/dist/server.js >/dev/null
}
start_api() { # $1 = engine flag
  docker rm -f kora-rh-api >/dev/null 2>&1 || true
  docker run -d --name kora-rh-api --network host -e DATABASE_URL="$DBU" -e KORA_AUTO_MIGRATE=true -e PORT=$API -e API_PORT=$API -e API_HOST=0.0.0.0 \
    -e KORA_CREATIVE_ENGINE="$1" -e KORA_PUBLIC_URL="http://127.0.0.1:$API" -e KORA_MEDIA_PUBLIC_URL="https://media.rehearsal.example" \
    -e SITE_HOST_PUBLIC_URL="http://127.0.0.1:$HOST" -e KORA_CHAOS_ENABLED=true -e MONITOR_ENABLED=true -e MONITOR_INTERVAL_MS=800 -e MONITOR_TIMEOUT_MS=1500 \
    -e MONITOR_FAILURE_THRESHOLD=2 -e MONITOR_RECOVERY_THRESHOLD=2 -e MONITOR_HEALTH_URL="http://127.0.0.1:$API/health" \
    -e ACTION_VERIFICATION_TICK_MS=500 -e ACTION_VERIFICATION_TIMEOUT_MS=60000 -e LOG_LEVEL=warn "$IMG" >/dev/null
  for i in $(seq 1 40); do curl -fs "http://127.0.0.1:$API/health" >/dev/null && return 0; sleep 1; done
  docker logs kora-rh-api 2>&1 | tail -20; return 1
}
SHA="$(docker run --rm "$IMG" node -e "console.log(JSON.parse(require('fs').readFileSync('build-info.json','utf8')).commit||'')" 2>/dev/null || true)"
start_host
for ph in baseline:v2 v3:v3 rollback:v2; do
  phase="${ph%%:*}"; flag="${ph##*:}"
  echo "=== phase $phase (KORA_CREATIVE_ENGINE=$flag) ==="
  start_api "$flag"
  node scripts/commission-v7.mjs "http://127.0.0.1:$API" "$phase" --out "$OUT/$phase.json" --state "$OUT/state.json" ${SHA:+--expect-commit "$SHA"} | tee "$OUT/$phase.log"
done
docker rm -f kora-rh-api kora-rh-host >/dev/null 2>&1 || true
echo "rehearsal complete: $OUT"
