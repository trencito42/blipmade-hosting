#!/bin/bash
# Brings the customer-journey sandbox into a known state before a run:
#   - the panel stub is reset (free addresses, one sample server on the egg)
#   - the API and the worker are restarted, which clears the rate-limit counters
#   - the shared check stack (3101) and the shared web (30003) are not touched
set -u

# 1. the panel stub: stop it by the exact PID that owns the socket
STUB_PID=$(ss -ltnp 2>/dev/null | grep ":3199 " | grep -oP "pid=\K[0-9]+" | head -1)
if [ -n "${STUB_PID:-}" ]; then
  echo "stopping the panel stub (pid $STUB_PID)"
  kill -TERM "$STUB_PID" 2>/dev/null || true
  sleep 1
fi

cd /tmp/cj && node stub-reset.mjs

setsid nohup node /tmp/cj-panel-stub.mjs > /tmp/cj/panel-stub.log 2>&1 < /dev/null &
sleep 2

# 2. the node that answers the health probe
NODE_PID=$(ss -ltnp 2>/dev/null | grep ":25565 " | grep -oP "pid=\K[0-9]+" | head -1)
if [ -z "${NODE_PID:-}" ]; then
  setsid nohup node /tmp/cj/node-responder.mjs > /tmp/cj/node-responder.log 2>&1 < /dev/null &
  sleep 1
fi

# 3. the API and the worker
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
ss -ltnp 2>/dev/null | grep -E ":(3112|3113|3199|25565) "
echo "--- health 3112 ---"
curl -s -m 5 http://127.0.0.1:3112/health | head -c 160
echo
echo "--- the node answers the health probe ---"
curl -s -m 5 -o /dev/null -w "http://10.77.0.11:25565/ -> %{http_code}\n" http://10.77.0.11:25565/
echo "--- shared stack 3101 must still answer ---"
curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3101/health
echo "--- shared web 30003 ---"
curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:30003/
