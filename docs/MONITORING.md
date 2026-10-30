# Monitoring: what is ready, what to add, and in which order

The platform already writes its own measures and logs. Nothing below needs a change of the
platform to start; the steps only add collectors around it.

## What the platform already gives

| Source | What | How to read it |
| --- | --- | --- |
| API and worker | Prometheus text format (`bm_http_requests_total`, `bm_http_request_duration_seconds`, in-flight requests, dead-letter queue depth, memory, event loop lag) | the metrics listener (`METRICS_HOST`, `METRICS_PORT`, token `METRICS_TOKEN`), not the public port |
| API and worker | JSON logs with the id of the request (`pino`), the same id as in the `X-Request-ID` header and in the 500 answer | `docker logs` today; a log collector later |
| Web container | `/api/ops/health`, the health of the fonts and the proxy | HTTP check |
| Caddy | JSON access log (`/var/log/caddy/access.log`) with status and duration | a log collector, or a one-off script |
| Platform | the "Operations" page of the admin and the alert channels | already in the product |

## What was found about the "500 from nowhere"

Every 5xx in the Caddy log of the last days is a **502** and each one falls in the seconds of a
deploy: the API or the web container was being replaced. Two fixes are in the code: the web
container now asks again for a few seconds when a *read* finds the API gone, and a tab that was
open before a deploy reloads once when a file of the old build is missing. What is left is the
seconds in which the web container itself restarts: a retry in Caddy closes that
(`lb_try_duration 10s` on the `reverse_proxy` of the site), and a second replica of the web and
the API behind it closes it for good.

## Sentry or Elasticsearch?

They answer different questions, so the real choice is not between the two.

- **Errors of the application (the 500s, the crashes of the browser): Sentry**, or **GlitchTip**,
  which speaks the same protocol and needs a fraction of the memory (Postgres + one container,
  against more than a dozen services for self-hosted Sentry). The code is ready: set
  `SENTRY_DSN` for the API and the worker, and `VITE_SENTRY_DSN` when building the web. With no
  DSN nothing is sent and nothing is loaded. No cookies, headers or request bodies are sent.
- **Metrics of Proxmox, the VMs, the containers and the services: Prometheus + Grafana**
  (+ Alertmanager). Collectors to add: `prometheus-pve-exporter` (Proxmox: nodes, VMs, storage),
  `node_exporter` on the host and each VM, `cadvisor` or the Docker metrics, `postgres_exporter`
  and `redis_exporter`, and the `blackbox_exporter` to probe the public endpoints.
- **Logs: Loki** (with Promtail or Alloy) is the light choice; one process, small memory, searched
  from Grafana. **Elasticsearch** pays off only when full-text search over a large volume of logs
  is a daily need. On this host it would compete for memory with the game server node.
- **A quick safety net today: Uptime Kuma** (one container) probing the site, the panel, the node,
  the mail and the VPS gateway, with a notification to the channels the operator already uses.

## Order I would do it in

1. GlitchTip (or Sentry) and the DSN in the three places. Every 500 then arrives with its request id.
2. Prometheus + Grafana + Alertmanager with the exporters above; alerts on: a VM or the node down,
   disk over 85%, memory over 90%, Wings or the panel not answering, a backup older than a day, a
   rise of 5xx, the dead-letter queue not empty, a certificate that expires in under 14 days.
3. Loki for the logs of the API, the worker, Caddy and Proxmox.
4. Elasticsearch only if the logs outgrow Loki.
