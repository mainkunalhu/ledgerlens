#!/usr/bin/env bash
# LedgerLens local stack: DB (docker) + worker + api + web (native).
#   ./scripts/local.sh up     start everything, health-check, print URLs
#   ./scripts/local.sh down   stop everything, including the docker DB
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="/tmp/ledgerlens"
mkdir -p "$RUN_DIR"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }

# compose wrapper: standalone binary preferred, v2 plugin fallback
compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose --project-directory "$ROOT" -f infra/docker-compose.yml "$@"
  else
    docker compose --project-directory "$ROOT" -f infra/docker-compose.yml "$@"
  fi
}

load_env() {
  if [ ! -f "$ROOT/.env" ]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    echo "created .env from .env.example — add your GROQ_API_KEY, then re-run"
    exit 1
  fi
  set -a; . "$ROOT/.env"; set +a
}

port_open() { curl -sf "http://localhost:$1$2" >/dev/null 2>&1; }
kill_port() {
  local pids
  pids="$(lsof -ti:"$1" 2>/dev/null || true)"
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null
  return 0
}

start_db() {
  if [ "$(docker ps -q -f name=^ledgerlens-db$)" != "" ]; then
    echo "db: already running"
    return 0
  fi
  if [ "$(docker ps -aq -f name=^ledgerlens-db$)" != "" ]; then
    docker start ledgerlens-db >/dev/null
  else
    docker run -d --name ledgerlens-db \
      -e POSTGRES_USER="${POSTGRES_USER:-ledger}" \
      -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-ledgerpw}" \
      -e POSTGRES_DB="${POSTGRES_DB:-ledgerlens}" \
      -p 5432:5432 pgvector/pgvector:pg16 >/dev/null
  fi
  for _ in $(seq 1 30); do
    docker exec ledgerlens-db pg_isready -U "${POSTGRES_USER:-ledger}" >/dev/null 2>&1 && {
      echo "db: healthy"
      return 0
    }
    sleep 1
  done
  echo "db: failed to become healthy" >&2
  exit 1
}

launch() { # name port healthpath start-cmd...
  local name="$1" port="$2" path="$3"
  shift 3
  if port_open "$port" "$path"; then
    echo "$name: already up (http://localhost:$port)"
    return 0
  fi
  echo "$name: starting..."
  kill_port "$port"
  sleep 1
  (cd "$ROOT" && nohup "$@" >"$RUN_DIR/$name.log" 2>&1 & echo $! >"$RUN_DIR/$name.pid")
  for _ in $(seq 1 40); do
    port_open "$port" "$path" && {
      echo "$name: up (http://localhost:$port, log $RUN_DIR/$name.log)"
      return 0
    }
    sleep 1
  done
  echo "$name: FAILED — see $RUN_DIR/$name.log" >&2
  tail -n 5 "$RUN_DIR/$name.log" >&2
  exit 1
}

stop_one() { # name port
  local name="$1" port="$2" pid=""
  [ -f "$RUN_DIR/$name.pid" ] && pid="$(cat "$RUN_DIR/$name.pid" 2>/dev/null || true)"
  [ -n "$pid" ] && kill "$pid" 2>/dev/null
  kill_port "$port"
  rm -f "$RUN_DIR/$name.pid"
  echo "$name: stopped"
}

case "${1:-}" in
  up)
    need docker; need bun; need uv; need curl
    load_env
    start_db
    launch worker 8000 "/health/" \
      uv run --project services/vision-worker uvicorn app.main:app \
        --host 127.0.0.1 --port 8000 --app-dir services/vision-worker
    launch api 8787 "/health" \
      bun run --filter api dev
    launch web 3000 "/" \
      bun run --filter web dev -- --port 3000
    echo
    echo "LedgerLens is up: web http://localhost:3000 · api :8787 · worker :8000"
    if [ "${2:-}" = "--follow" ] || [ "${2:-}" = "-f" ]; then
      echo "following logs (Ctrl-C stops everything)..."
      trap '"$0" down >/dev/null 2>&1; exit 0' INT TERM
      tail -F "$RUN_DIR/worker.log" "$RUN_DIR/api.log" "$RUN_DIR/web.log"
    fi
    ;;
  down)
    stop_one web 3000
    stop_one api 8787
    stop_one worker 8000
    if [ "$(docker ps -q -f name=^ledgerlens-db$)" != "" ]; then
      docker stop ledgerlens-db >/dev/null && echo "db: stopped"
    else
      echo "db: not running"
    fi
    # also stop any compose stack, if present (ignore errors)
    (cd "$ROOT" && compose down >/dev/null 2>&1 || true)
    ;;
  *)
    echo "usage: $0 up|down" >&2
    exit 1
    ;;
esac
