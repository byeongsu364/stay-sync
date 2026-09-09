#!/bin/zsh

SCRIPT_DIR=${0:A:h}
cd "$SCRIPT_DIR" || exit 1

echo "Stay Sync 개발 서버를 시작합니다."
echo "이 창을 닫으면 서버가 종료됩니다."
echo

exec ./dev.sh
