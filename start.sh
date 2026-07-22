#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  trap - EXIT INT TERM
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

command -v docker >/dev/null || {
  echo "Docker is required to start the local PostgreSQL database."
  exit 1
}
command -v python3 >/dev/null || {
  echo "Python 3.11 or newer is required."
  exit 1
}
command -v npm >/dev/null || {
  echo "Node.js 18 or newer (with npm) is required."
  exit 1
}

echo "Starting PostgreSQL..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d db

if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
  echo "Creating backend virtual environment..."
  python3 -m venv "$BACKEND_DIR/.venv"
fi

DEPENDENCY_STAMP="$BACKEND_DIR/.venv/.resumecraft-dependencies-installed"
if [[ ! -f "$DEPENDENCY_STAMP" || "$BACKEND_DIR/requirements.txt" -nt "$DEPENDENCY_STAMP" ]]; then
  echo "Installing backend dependencies..."
  "$BACKEND_DIR/.venv/bin/python" -m pip install -r "$BACKEND_DIR/requirements.txt"
  touch "$DEPENDENCY_STAMP"
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  npm --prefix "$FRONTEND_DIR" install
fi

echo "Starting API at http://localhost:8000..."
(
  cd "$BACKEND_DIR"
  exec .venv/bin/python -m uvicorn app.main:app --reload
) &
BACKEND_PID=$!

echo "Starting app at http://localhost:5173..."
npm --prefix "$FRONTEND_DIR" run dev -- --host 127.0.0.1 --open &
FRONTEND_PID=$!

echo "ResumeCraft is starting. Press Ctrl-C to stop the app and API."
wait "$BACKEND_PID" "$FRONTEND_PID"