#!/usr/bin/env bash
# Face commiturile lotului de performanta, pe ramura de reparare.
#
#   bash commit-perf.sh
#
# Commiturile sunt focalizate, in ordinea in care se pot citi:
#   1. livrarea web (compresie, chunking, re-renderizare)
#   2. runtime-ul API (timeout-uri, oprire, sanatate, metrici, identificator)
#   3. datele, coada si containerele (dead letter, paginare, indexuri, limite)
#   4. verificarea de sanatate a containerului cere viabilitatea
#   5. identificatorul de cerere al web-ului
set -euo pipefail

SSH=(ssh -i /root/.ssh/blipmade_vm103 -o StrictHostKeyChecking=no debian@10.77.0.13)
SCP=(scp -i /root/.ssh/blipmade_vm103 -o StrictHostKeyChecking=no)

commit() {
  "${SSH[@]}" "cd /opt/blipmade && git add -A -- $1 && git commit -q -F /tmp/$2 && git log --oneline -1"
}

echo "=== 1. livrarea web ==="
# serverul se ia in forma workerului (fara identificatorul de cerere, care vine
# in commitul 5), ca fiecare commit sa aiba un singur subiect.
"${SSH[@]}" 'cp /opt/blipmade/web/server.mjs /tmp/server-with-request-id.mjs && cp /tmp/server-workerA.mjs /opt/blipmade/web/server.mjs'
commit "web/server.mjs web/src/admin/CustomerDetail.tsx web/src/app/InstanceDetail.tsx web/vite.config.ts web/src/lib/perf-precompress.mjs web/src/lib/perf-precompress.d.mts web/tests/perf-compression.test.mjs" msg-1-web.txt

echo
echo "=== 2. runtime-ul API ==="
commit "api/src/app.ts api/src/index.ts api/src/routes/health.ts api/src/lib/perf-config.ts api/src/lib/perf-metrics.ts api/src/lib/perf-request-id.ts api/src/lib/perf-shutdown.ts api/tests/perf-api-config.test.ts api/tests/perf-api-health.test.ts api/tests/perf-api-metrics.test.ts api/tests/perf-api-request-id.test.ts api/tests/perf-api-shutdown.test.ts api/tests/perf-api-timeouts.test.ts" msg-2-api.txt

echo
echo "=== 3. datele, coada si containerele ==="
# healthcheck-ul ramane pentru commitul 4: fisierele compose sunt ale
# workerului de date, deci schimbarea healthcheck-ului se vede separat.
"${SSH[@]}" 'cp /opt/blipmade/compose.api.yml /tmp/compose-api-with-live.yml && python3 - <<PY
import io
p = "/opt/blipmade/compose.api.yml"
s = io.open(p, encoding="utf-8").read()
s = s.replace(
"""      # The liveness of the process: it asks no database and no cache, so a
      # slow dependency cannot restart the container in a loop.
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3100/health/live"]""",
"""      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3100/health"]""")
io.open(p, "w", encoding="utf-8").write(s)
PY'
commit "api/prisma api/src/lib/perf-data-pagination.ts api/src/lib/perf-data-query-count.ts api/src/routes/admin.ts api/src/routes/billing.ts api/src/routes/instances.ts api/src/routes/orders.ts api/src/routes/tickets.ts api/src/services/dead-letter.ts api/src/services/provisioning.ts api/src/services/queue.ts api/src/worker.ts api/tests/perf-data-compose.test.ts api/tests/perf-data-dead-letter.test.ts api/tests/perf-data-pagination.test.ts api/tests/perf-data-query-count.test.ts compose.api.yml compose.web.yml compose.yml scripts/perf-data-dead-letters.ts scripts/perf-data-explain.sql scripts/perf-data-load.mjs scripts/perf-data-query-count.ts scripts/perf-data-seed.sql" msg-3-data.txt

echo
echo "=== 4. verificarea de sanatate a containerului ==="
"${SSH[@]}" 'cp /tmp/compose-api-with-live.yml /opt/blipmade/compose.api.yml'
commit "compose.api.yml" msg-4-healthcheck.txt

echo
echo "=== 5. identificatorul de cerere al web-ului ==="
"${SSH[@]}" 'cp /tmp/server-with-request-id.mjs /opt/blipmade/web/server.mjs'
commit "web/server.mjs web/tests/request-id.test.mjs" msg-5-request-id.txt

echo
echo "=== starea ramurii ==="
"${SSH[@]}" 'cd /opt/blipmade && git log --oneline -7 && echo "--- ramas necomis ---" && git status --short'
