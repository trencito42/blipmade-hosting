# Infrastructure monitoring (Prometheus, Grafana, Alertmanager)

This is the stack the plan in `docs/MONITORING.md` describes, ready to start on a machine of its own
(or on the platform VM, if there is memory for it). Nothing here runs by itself and nothing in the
platform depends on it.

## What it watches

| Target | Exporter | Where it runs |
| --- | --- | --- |
| Proxmox (nodes, VMs, storage) | `prometheus-pve-exporter` | this stack; reads the API with a read-only token |
| The host and every VM | `node_exporter` | on each machine (install steps below) |
| Containers of the platform | `cadvisor` | on the platform VM |
| API and worker | the `bm_*` measures of the platform | `METRICS_HOST` / `METRICS_PORT`, bearer token `METRICS_TOKEN` |
| Public endpoints (site, panel, node, mail) | `blackbox_exporter` | this stack |

## Start

1. Create the read-only Proxmox user and token for the exporter (run on the host, once):

   ```bash
   pveum user add monitor@pve --comment "Monitoring (read only)"
   pveum acl modify / --users monitor@pve --roles PVEAuditor
   pveum user token add monitor@pve exporter --privsep 0   # prints the secret once
   ```

2. Copy `.env.example` to `.env`, fill the token, the token of the metrics of the platform and the
   password of Grafana. Edit `prometheus/prometheus.yml` if an address is different.
3. `docker compose up -d`. Grafana is on port 3000 of the machine (put it behind the gateway with a
   login before opening it to the internet), Prometheus on 9090, Alertmanager on 9093.
4. The API listens for its measures on `127.0.0.1:3109` by default. Set `METRICS_HOST` to the private address of the VM (for example `10.77.0.13`) in its `.env`, keep `METRICS_TOKEN` set, and allow only this stack to reach the port.
5. Install `node_exporter` on the host and on each VM: `apt install prometheus-node-exporter`
   (listens on 9100; allow only the address of this stack).

## Alerts

`prometheus/alerts.yml` holds the rules: a target down, a VM stopped, disk over 85%, memory over 90%,
a rise of 5xx, the dead-letter queue not empty, a certificate that expires in under 14 days, a public
endpoint that does not answer. `alertmanager/alertmanager.yml` sends them to the Discord webhook of the
operator (set in `.env`). Check the rules with `promtool check rules prometheus/alerts.yml`.
