#!/bin/bash
# Restarts only the customer-journey stack (API 3112 and worker 3113).
# Every process is stopped by its exact PID, found from the socket it owns.
# The shared check stack (3101) and the uxaudit stack (3105) are not touched.
set -u

for PORT in 3112 3113; do
  PID=$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -oP "pid=\K[0-9]+" | head -1)
  if [ -n "${PID:-}" ]; then
    echo "stopping $PORT (pid $PID)"
    kill -TERM "$PID" 2>/dev/null || true
  fi
done

sleep 2

cd /tmp/cj-api
. /tmp/cj/env.sh
setsid nohup node dist/index.js > /tmp/cj/api.log 2>&1 < /dev/null &
sleep 1
setsid nohup node dist/worker.js > /tmp/cj/worker.log 2>&1 < /dev/null &
sleep 6

echo "--- listeners ---"
ss -ltnp 2>/dev/null | grep -E ":(3112|3113) "
echo "--- health 3112 ---"
curl -s -m 5 http://127.0.0.1:3112/health | head -c 200
echo
echo "--- health 3113 ---"
curl -s -m 5 http://127.0.0.1:3113/health | head -c 200
echo
echo "--- shared stack 3101 must still answer ---"
curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3101/health
echo "--- shared web 30003 ---"
curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:30003/
echo "--- worker smtp env ---"
WPID=$(ss -ltnp 2>/dev/null | grep ":3113 " | grep -oP "pid=\K[0-9]+" | head -1)
tr "\0" "\n" < /proc/"$WPID"/environ 2>/dev/null | grep -E "^SMTP_URL="
