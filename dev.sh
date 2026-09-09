#!/bin/sh

set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    trap - INT TERM EXIT
    [ -z "$FRONTEND_PID" ] || kill "$FRONTEND_PID" 2>/dev/null || true
    [ -z "$BACKEND_PID" ] || kill "$BACKEND_PID" 2>/dev/null || true
    [ -z "$FRONTEND_PID" ] || wait "$FRONTEND_PID" 2>/dev/null || true
    [ -z "$BACKEND_PID" ] || wait "$BACKEND_PID" 2>/dev/null || true
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

node "$PROJECT_DIR/backend/scripts/checkDevPorts.js"

echo "[Stay Sync] 백엔드와 도로망 서버를 시작합니다."
(cd "$PROJECT_DIR/backend" && exec node node_modules/nodemon/bin/nodemon.js --config nodemon.json --exitcrash server.js) &
BACKEND_PID=$!

echo "[Stay Sync] 프런트엔드를 시작합니다."
(cd "$PROJECT_DIR/frontend" && exec node node_modules/vite/bin/vite.js --port 5173 --strictPort) &
FRONTEND_PID=$!

echo "[Stay Sync] 종료하려면 Ctrl+C를 누르세요."

while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
    sleep 1
done

echo "[Stay Sync] 서버 하나가 종료되어 전체 개발 서버를 정리합니다."
exit 1
