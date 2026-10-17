#!/usr/bin/env bash
# Builds the root Dockerfile (no push) in the three commit-source situations and
# checks the containers: GET /health, GET /__kora, non-root, in-image migrate.
# Needs docker, curl, jq and git; a PostgreSQL on localhost:5432 (database
# kora_test, user/password kora) for the API container.
set -euo pipefail

HEAD_SHA="$(git rev-parse HEAD)"
FAKE_SHA="0123456789abcdef0123456789abcdef01234567"
ENV_SHA="fedcba9876543210fedcba9876543210fedcba98"
DB_URL="postgresql://kora:kora@localhost:5432/kora_test"
fail() { echo "image-check FAILED: $*" >&2; exit 1; }
cleanup() { docker rm -f kora-demo kora-api >/dev/null 2>&1 || true; }
trap cleanup EXIT

wait_for() { # url
  for _ in $(seq 1 40); do curl -fsS "$1" >/dev/null 2>&1 && return 0; sleep 1; done
  docker logs kora-demo 2>&1 | tail -20 || true
  fail "$1 never became ready"
}

# check_claim <url> <service> <commit-or-null> <source>
check_claim() {
  local body; body="$(curl -fsS "$1/__kora")"
  echo "$1/__kora -> $body"
  [ "$(jq -r .schema <<<"$body")" = "kora.runtime-claim/v1" ] || fail "schema"
  [ "$(jq -r .service <<<"$body")" = "$2" ] || fail "service"
  [ "$(jq -r .commit <<<"$body")" = "$3" ] || fail "commit: want $3"
  [ "$(jq -r .commitSource <<<"$body")" = "$4" ] || fail "commitSource: want $4"
  [ "$(jq -r '.startedAt|type' <<<"$body")" = "string" ] || fail "startedAt"
  [ "$(jq -r '.uptimeSeconds|type' <<<"$body")" = "number" ] || fail "uptimeSeconds"
}

# run_demo <image> <expected-commit> <expected-source> [extra docker run args]
run_demo() {
  local image="$1" want="$2" source="$3"; shift 3
  docker run -d --name kora-demo -e PORT=8080 -p 18080:8080 "$@" "$image" \
    node apps/demo-service/dist/server.js >/dev/null
  wait_for http://localhost:18080/health
  [ "$(curl -fsS http://localhost:18080/health | jq -r .status)" = "healthy" ] || fail "demo /health"
  check_claim http://localhost:18080 demo-service "$want" "$source"
  docker rm -f kora-demo >/dev/null
}

echo "== A) build context with .git (HEAD $HEAD_SHA), no GIT_SHA"
docker build -t kora:ctx .
[ "$(docker run --rm kora:ctx id -u)" != "0" ] || fail "image runs as root"
run_demo kora:ctx "$HEAD_SHA" build-info

echo "== B) GIT_SHA build argument wins over .git"
docker build --build-arg "GIT_SHA=$FAKE_SHA" -t kora:arg .
run_demo kora:arg "$FAKE_SHA" build-info

echo "== C) no .git and no GIT_SHA: the build must still succeed"
nogit="$(mktemp -d)"
git archive HEAD | tar -x -C "$nogit"
[ ! -e "$nogit/.git" ] || fail "test setup: .git present"
docker build -t kora:nogit "$nogit"
run_demo kora:nogit null unavailable
echo "== C2) ... and KORA_COMMIT_SHA is then used"
run_demo kora:nogit "$ENV_SHA" env -e "KORA_COMMIT_SHA=$ENV_SHA"

echo "== D) API container: in-image migrate, /health and /__kora"
docker run --rm --network host -e NODE_ENV=production -e "DATABASE_URL=$DB_URL" \
  kora:ctx node apps/api/dist/db/migrate.js
docker run -d --name kora-api --network host -e NODE_ENV=production -e PORT=18081 \
  -e "DATABASE_URL=$DB_URL" -e MONITOR_ENABLED=false -e KORA_ENVIRONMENT=ci kora:ctx >/dev/null
wait_for http://localhost:18081/health
[ "$(curl -fsS http://localhost:18081/health | jq -r .status)" = "ok" ] || fail "api /health"
check_claim http://localhost:18081 kora-api "$HEAD_SHA" build-info
[ "$(curl -fsS http://localhost:18081/__kora | jq -r .environment)" = "ci" ] || fail "environment"
docker image ls kora:ctx --format 'image size: {{.Size}}'
echo "image-check OK"
