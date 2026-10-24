# Caddy and domain evidence — round three of the operational audit

* Date: 2026-10-24
* Branch: `fix/r3-ops` (based on `origin/main` = 106809c)
* Host: `debian@10.77.0.13`, worktree `/home/debian/wt-r3-ops`
* The code was read, never changed: `api/src/routes/domains.ts`,
  `api/src/services/gateway.ts`, `api/src/services/dns.ts`,
  `api/src/services/provisioning.ts`, `api/src/env.ts` and
  `audit/_tools/edge-Caddyfile`.
* Every run was against the isolated copy (`blipmade_r3_ops_test`, index 14 of
  Redis). No customer hostname was claimed, no DNS record was published and
  no Caddy of the platform was touched.

---

## 1. The short answer

| Question | Answer |
|---|---|
| Does the platform fail closed when `DOMAIN_BASE`, `CADDY_ADMIN_URL` and `CADDY_ADMIN_TOKEN` are empty? | **Proven.** The answer is `status: pending_dns` with `lastError: "The gateway is not configured on this environment."` and no route id. It never claims that the hostname is routed. |
| What does the platform need from Caddy? | **Proven.** The administrative API, the token, the exact path and the exact body of the route. |
| Does the reference edge configuration (`audit/_tools/edge-Caddyfile`) match that model? | **No.** Four concrete differences, listed in section 6. |
| What is missing in production? | The three variables are empty and the edge has no namespace for the customer routes. |

---

## 2. The state of the production today

```
$ for v in DOMAIN_BASE CADDY_ADMIN_URL CADDY_ADMIN_TOKEN DOMAIN_TARGET; do
    line=$(grep -m1 "^$v=" /opt/blipmade/.env); val=${line#*=}
    printf "%-20s len=%s\n" "$v" "${#val}"
  done
DOMAIN_BASE         len=0
CADDY_ADMIN_URL     len=0
CADDY_ADMIN_TOKEN   len=0
DOMAIN_TARGET       len=14
```

The three variables are **empty** (`api/src/env.ts:93-95` gives them the
default `''`). `DOMAIN_TARGET` is set (`193.34.214.143`), and it is the
address the platform tells a customer to point a hostname at.

---

## 3. What the platform needs from Caddy

The platform does not write a Caddyfile. It talks to the **administrative
API** of Caddy, from the server side, with the token in the authorization
header (`api/src/services/gateway.ts`):

| What | Where in the code | Value |
|---|---|---|
| The namespace of the routes | `gateway.ts:63` | the app server `blipmade` |
| The path of the routes | `gateway.ts:181-184` | `{CADDY_ADMIN_URL}/config/apps/http/servers/blipmade/routes` |
| The token | `gateway.ts:190-200` | `Authorization: Bearer <CADDY_ADMIN_TOKEN>` |
| The id of a route | `gateway.ts:170-174` | `blipmade-route-` + the first 16 characters of the SHA-256 of the hostname, so the same hostname always maps to the same route |
| The body of a route | `gateway.ts:203-215` | `[{"match":[{"host":["<hostname>"]}],"handle":[{"handler":"reverse_proxy","upstreams":[{"dial":"<address>:<port>"}]}],"terminal":true}]` |
| The port of the customer container | `gateway.ts:69-70` | between **30000** and **39999** (`isValidTargetPort`, `gateway.ts:161-163`) |
| The address of the customer container | `gateway.ts:137-159` | an address of the private network (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`) or a name under `DOMAIN_BASE` |

This was **proved with a stand-in** for the administrative API
(`audit/_tools/r3-caddy-admin-stub.mjs`) that writes down every request it
receives. This is the real traffic of the real code of the platform:

```
--- 2026-10-24T21:36:49.676Z
GET /config/apps/http/servers/blipmade/routes/blipmade-route-c13925dd94aa5854
authorization: Bearer <present>
answer: 404 {"error":"route not found"}
--- 2026-10-24T21:36:49.695Z
POST /config/apps/http/servers/blipmade/routes
authorization: Bearer <present>
body: [{"match":[{"host":["r3-probe.example.test"]}],"handle":[{"handler":"reverse_proxy","upstreams":[{"dial":"10.77.0.11:30000"}]}],"terminal":true}]
answer: 200 [{"match":[{"host":["r3-probe.example.test"]}],"handle":[{"handler":"reverse_proxy","upstreams":[{"dial":"10.77.0.11:30000"}]}],"terminal":true}]
```

So the platform reads the route of the hostname first (so a second request
never creates a second route), and creates it when it is not there yet. The
token is refused when it is missing:

```
$ curl -sS -o /dev/null -w "  HTTP %{http_code}\n" http://127.0.0.1:2619/config/apps/http/servers/blipmade/routes
  HTTP 401
```

### The proof of ownership comes first

A hostname is only routed when the customer proved that it owns it, with a
TXT record (`api/src/services/dns.ts`). An A record proves nothing, because
every customer points at the same address. The proof is checked **before**
the gateway is called (`gateway.ts:230-234`):

```ts
if (!route.verifiedAt) throw new GatewayNotVerifiedError();
if (!gatewayConfigured()) throw new GatewayNotConfiguredError();
```

---

## 4. PROVEN: the platform fails closed when the variables are empty

The isolated copy was started with the three variables empty (the default of
`api/src/env.ts:93-95`):

```
$ cd /home/debian/wt-r3-ops && bash audit/_tools/r3-stack-up.sh
==> The stack is up
    ...
    gateway   : empty (CADDY_ADMIN_URL='')
```

One instance was put into the copy (a deployed instance normally comes from an
order that was paid for, and the payments are off in the copy — see
`audit/_tools/r3-seed-instance.mjs`), the customer claimed a hostname, the
proof of ownership was given, and the platform was asked to route it.

**The claim** — the hostname is not routed, it waits for the proof:

```
$ node audit/_tools/r3-domain-probe.mjs http://127.0.0.1:3113 r3-probe.example.test
=== the customer claims the hostname ===
  POST /api/instances/cmvmx3nms0001dxpn4idiitos/domains -> 201
  answer     : {
  "domain": {
    "hostname": "r3-probe.example.test",
    "status": "verifying",
    "targetPort": 30000,
    "dnsRecords": [
      { "name": "r3-probe.example.test", "type": "A", "value": "193.34.214.143" },
      { "name": "www.r3-probe.example.test", "type": "CNAME", "value": "r3-probe.example.test" },
      { "name": "_blipmade-verify.r3-probe.example.test", "type": "TXT", "value": "tcDcrLSUqsAQgFIhQPLJKmg4F97FgzqV" }
    ],
    "lastError": null,
    "verification": { "host": "_blipmade-verify.r3-probe.example.test", "token": "tcDcrLSUqsAQgFIhQPLJKmg4F97FgzqV", "verified": false, ... }
  }
}
```

**The request to route it** — the exact answer of the platform:

```
=== the platform is asked to route the hostname ===
  POST /api/domains/cmvmx3qb3000qdx954im4wsqf/verify -> 200
  answer     : {
  "domain": {
    "hostname": "r3-probe.example.test",
    "status": "pending_dns",
    "targetPort": 30000,
    "lastError": "The gateway is not configured on this environment.",
    "verification": { "verified": true, "verifiedAt": "2026-10-24T21:35:19.791Z", ... }
  }
}
```

And the row in the database:

```
$ docker exec blipmade-postgres-1 psql -U blipmade -d blipmade_r3_ops_test \
    -c "SELECT hostname, status, \"targetPort\", \"caddyRouteId\", \"lastError\", \"verifiedAt\" IS NOT NULL AS verified FROM \"InstanceDomain\";"
       hostname        |   status    | targetPort | caddyRouteId |                     lastError                      | verified
------------------------+-------------+------------+--------------+----------------------------------------------------+----------
 r3-probe.example.test  | PENDING_DNS |      30000 |              | The gateway is not configured on this environment. | t
 r3-probe2.example.test | PENDING_DNS |      30000 |              | The gateway is not configured on this environment. | t
```

This is the behaviour that was asked for:

* the status is **`pending_dns`**, never `active`
  (`api/src/routes/domains.ts:415-420` catches `GatewayNotConfiguredError`
  and sets `PENDING_DNS`);
* `caddyRouteId` is **empty** — no route was written anywhere;
* `lastError` says the truth: *"The gateway is not configured on this
  environment."* (`api/src/services/gateway.ts:39-44`);
* the proof of ownership is kept (`verified = t`), so nothing the customer did
  is lost.

The claim is also refused when the hostname is not proven, and that check
happens first:

```ts
// api/src/services/gateway.ts:230-234
if (!route.verifiedAt) throw new GatewayNotVerifiedError();
if (!gatewayConfigured()) throw new GatewayNotConfiguredError();
```

### The positive control

The same copy was started with the stand-in for the administrative API
(`--with-caddy`), and the same request was made:

```
    gateway   : stub (CADDY_ADMIN_URL='http://127.0.0.1:2619')
```

```
=== the platform is asked to route the hostname ===
  POST /api/domains/cmvmx5nmj000gdx1qzmp88ggq/verify -> 200
  answer     : {
  "domain": {
    "hostname": "r3-probe.example.test",
    "status": "active",
    "lastError": null,
    ...
  }
}

$ docker exec blipmade-postgres-1 psql -U blipmade -d blipmade_r3_ops_test \
    -c "SELECT hostname, status, \"caddyRouteId\", \"lastError\" FROM \"InstanceDomain\";"
       hostname        | status |          caddyRouteId           | lastError
-----------------------+--------+---------------------------------+-----------
 r3-probe.example.test | ACTIVE | blipmade-route-c13925dd94aa5854 |
```

The difference between the two answers is only the configuration of the
gateway. The platform routes a hostname when — and only when — it can reach
the administrative API of Caddy.

---

## 5. What the reference edge configuration gets right

`audit/_tools/edge-Caddyfile` is the reference for the reverse proxy that
stands in front of the platform. It matches the model of the platform on
these points:

* it **replaces** `X-Forwarded-For` with the address it resolved
  (`header_up X-Forwarded-For {client_ip}`), so a visitor cannot forge its
  own address. The web server trusts the edge alone
  (`TRUSTED_PROXY_IPS=10.77.0.12` in `/opt/blipmade/.env`) and replaces the
  headers again before it calls the API (`web/server.mjs:313-325`), and the
  API believes the web container alone
  (`TRUSTED_PROXIES=127.0.0.1,::1,172.18.0.0/16`). The chain is consistent.
* it writes `X-Forwarded-Proto {scheme}`, which is what makes the cookie of
  the session `Secure` behind a TLS edge.
* **there is no missing reverse proxy to the API**: the edge proxies to
  `10.77.0.13:3000`, the published port of the web container, and the web
  container proxies `/api/*` to the API container
  (`compose.web.yml`: `API_URL: http://api:3100`, `web/server.mjs:312-313`).
* the address it proxies to (`10.77.0.13`) is an address of the private
  network, which is what the platform accepts as a target
  (`gateway.ts:137-159`).

---

## 6. The differences between the edge configuration and the model of the platform

| # | Difference | Where | Consequence |
|---|---|---|---|
| 1 | **There is no `apps` block, so the namespace of the platform does not exist.** The platform writes into `/config/apps/http/servers/blipmade/routes`. A Caddy configuration without an `apps` block uses the default HTTP app, whose server is named `srv0`; the path of the platform answers **404**. | `audit/_tools/edge-Caddyfile` (the whole file, a single site block) against `gateway.ts:63` and `gateway.ts:181-184` | `CADDY_ADMIN_URL` pointed at this edge would answer 404 for every route, and every hostname would stay `pending_dns` with `The gateway answered with HTTP 404.` |
| 2 | **There is no route for the customer hostnames.** The edge has exactly one site block, `blipmade.com`, and it proxies everything to the web at `10.77.0.13:3000`. The platform expects one route per customer hostname, with a `reverse_proxy` to a port between 30000 and 39999. | `audit/_tools/edge-Caddyfile` against `gateway.ts:69-70` and `gateway.ts:203-215` | A hostname that the platform routed would not reach the container of the customer; it would reach the web of the platform. |
| 3 | **There is no administrative API that the platform can reach.** The edge configuration has no `admin` block. Caddy listens on `127.0.0.1:2019` by default, which the host `10.77.0.13` cannot reach, and the administrative API must never be public. | `audit/_tools/edge-Caddyfile` against `gateway.ts:190-200` | There is no way to give the platform the token and the address it needs. The real configuration of the edge is **not** in the repository (the file says so), so it could not be verified what the edge really does. |
| 4 | **`DOMAIN_BASE` is empty, so the platform can only accept an address as a target.** With an empty `DOMAIN_BASE`, `isValidTargetHost` accepts only a private IPv4 address (`gateway.ts:137-159`), and `defaultDomain()` returns the bare hostname instead of `<name>.<base>` (`api/src/services/provisioning.ts:1466-1467`). The names that the platform reserves for itself are also only the literal list plus `blipmade.com` (`api/src/routes/domains.ts:113-120`). | `/opt/blipmade/.env`, `api/src/env.ts:93` | A customer hostname has no base name, and a target that is a name (and not a number) is refused with `The route target is not an address inside the platform network.` |

**A fifth point that is a decision, not a defect:** the platform can talk to
**one** Caddy (`CADDY_ADMIN_URL` is one address), and the address it hands to
the customer is `DOMAIN_TARGET` (`193.34.214.143`). The Caddy that holds the
customer routes therefore has to be the one that owns that public address.
The reference file describes the edge on `10.77.0.12`, while the platform
falls back to `10.77.0.11` for the container of a customer
(`api/src/routes/domains.ts:92`, `FALLBACK_TARGET_HOST`). The operator has
to decide which of the two Caddies serves the customer hostnames, and to give
the platform the address of that one.

---

## 7. What the operator has to do

### 7.1 The variables

| Variable | Where | Expected format | Secret |
|---|---|---|---|
| `DOMAIN_BASE` | `/opt/blipmade/.env` (read by the API and the worker through `env_file: .env` in `compose.api.yml`) | the base name of the customer domains, a plain domain name without a scheme and without a path, for example `example.com`. Everything under it is reserved for the platform (`api/src/routes/domains.ts:113-120`) and a target that is a name under it is accepted as internal (`gateway.ts:155-159`). | no |
| `CADDY_ADMIN_URL` | `/opt/blipmade/.env` | the **base** address of the administrative API of Caddy, without the path and without a trailing slash, for example `http://10.77.0.12:2019`. The platform appends `/config/apps/http/servers/blipmade/routes` itself (`gateway.ts:181-184`). It has to be reachable from the API container and it must **not** be reachable from the internet. | no (it names a host) |
| `CADDY_ADMIN_TOKEN` | `/opt/blipmade/.env` | the bearer token of that administrative API, the one of the `admin` block of Caddy. It travels only in the `Authorization: Bearer` header (`gateway.ts:190-200`). | **yes** |
| `DOMAIN_TARGET` | `/opt/blipmade/.env` | already set to `193.34.214.143`. It must be the public address of the Caddy that serves the customer hostnames, because it is the address the platform tells the customer to point the A record at (`api/src/routes/domains.ts:207-215`). | no |

**No credential is written in this document on purpose.** The values above are
the formats; the values themselves belong to the operator.

### 7.2 What the Caddy has to look like

The Caddy that serves the customer hostnames needs:

1. an `apps` block with the HTTP app server `blipmade`, so that the path the
   platform writes into exists:

   ```caddyfile
   {
       admin 10.77.0.13:2019 {
           # the token of the operator, not of the platform
       }
   }
   ```

   (the address and the way the token is stored belong to the operator; the
   platform only needs the token in the `Authorization: Bearer` header).

2. a site block that takes the customer hostnames and sends them to the
   container of the customer. The platform writes this route itself, as a
   route of the running configuration; the Caddyfile must not claim the same
   hostnames, or the two would fight over them.

3. the site block of the platform itself (`blipmade.com`), which the
   reference file already holds.

### 7.3 How the operator verifies that it works

1. **The namespace of the platform exists** (before any hostname is claimed):

   ```
   $ curl -s -o /dev/null -w "%{http_code}\n" \
       -H "Authorization: Bearer $CADDY_ADMIN_TOKEN" \
       http://10.77.0.12:2019/config/apps/http/servers/blipmade/routes
   200
   ```

   A **404** here means the `apps` block is missing, and no hostname will
   ever be routed. A **401** means the token does not match.

2. **A hostname ends up `active`** with a route id. The customer publishes
   the TXT record, then:

   ```
   $ curl -s -X POST http://127.0.0.1:3100/api/domains/<id>/verify \
       -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
       -H "cookie: bm_session=$SESSION" -d '{}' | jq '.domain | {status, lastError}'
   {
     "status": "active",
     "lastError": null
   }
   ```

   `status: active` and an empty `lastError` are the proof. `pending_dns`
   with `The gateway is not configured on this environment.` means the
   variables are still empty.

3. **The route really exists in Caddy**:

   ```
   $ curl -s -H "Authorization: Bearer $CADDY_ADMIN_TOKEN" \
       http://10.77.0.12:2019/config/apps/http/servers/blipmade/routes/blipmade-route-<id> | jq .
   {
     "match": [ { "host": [ "app.example.com" ] } ],
     "handle": [ { "handler": "reverse_proxy", "upstreams": [ { "dial": "10.77.0.11:30000" } ] } ],
     "terminal": true
   }
   ```

4. **The application answers through the hostname, with a certificate of that
   hostname**:

   ```
   $ curl -sI https://app.example.com/ | head -1
   HTTP/2 200
   $ curl -sIv https://app.example.com/ 2>&1 | grep -iE "subject:|issuer:"
   subject: CN=app.example.com
   issuer: C=US, O=Let's Encrypt, CN=R11
   ```

   The subject has to name the hostname of the customer.

5. **The address of the visitor is the real one** (the check the reference
   file itself describes):

   ```
   $ curl -s -H 'X-Forwarded-For: 9.9.9.9' https://blipmade.com/api/health
   $ docker exec blipmade-postgres-1 psql -U blipmade -d blipmade -c \
       "SELECT ip, count(*) FROM \"AuditLog\" GROUP BY ip ORDER BY count(*) DESC LIMIT 10;"
   ```

   The address that is written down is the address of the caller and never
   `9.9.9.9`.

---

## 8. What could not be verified

* **The real configuration of the edge was not read.** The edge runs on
  another host (`10.77.0.12`) and its configuration is not in the
  repository; only the reference file `audit/_tools/edge-Caddyfile` is. Every
  difference of section 6 is therefore a difference against the **reference**,
  not against the running edge.
* **The administrative API of a real Caddy was never called.** The stand-in
  answers the four calls of the protocol of the platform, but a real Caddy
  answers them with its own rules (the answer of a `POST` is the route that
  was created, the id of a route is chosen by Caddy, and a Caddy that is
  started from a Caddyfile keeps its configuration in the JSON form). The
  platform reads and writes the JSON form, so an edge that is configured from
  a Caddyfile still serves the administrative API — but that was not
  observed on a real Caddy here.
* **No certificate was issued and no hostname was resolved.** The proof of
  ownership was given to a stand-in for the resolver
  (`audit/_tools/r3-dns-stub.mjs`), because a TXT record cannot be published
  from this host. Everything after the proof is the real code of the
  platform.
* **The public address `193.34.214.143` was not resolved and its certificate
  was not seen.** It was read from `/opt/blipmade/.env`.
* **The routing of the traffic was not observed**: no request was ever sent
  to a customer container, because there is no container.
