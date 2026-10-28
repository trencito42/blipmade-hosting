# The domains of the customers

A customer of Blipmade buys a service and points a hostname of their own at
it. This file says how that path is put together, what is on each side of it,
what the operator has to do, and how every step is checked.

Nothing here is a secret. The keys are written as shapes, and the only real
values are the ones that are public anyway.

---

## 1. The path of a hostname

```
visitor ──HTTPS──> Cloudflare ──HTTPS──> edge (Caddy) ──HTTP──> node (Wings) ──> container
        10.77.0.12 edge            10.77.0.11 node            10.77.0.11:30000+
```

| Piece | Where | What it does |
|---|---|---|
| The edge | VM `blipmade-proxy`, `10.77.0.12` | Caddy 2.11.2. Terminates TLS, answers the site of the platform, and proxies the hostnames of the customers to the node. |
| The platform | VM `blipmade-vm103`, `10.77.0.13` | Writes the routes of the customers into the configuration of the edge, through the administrative API of Caddy. |
| The node | VM `blipmade-games-node-01`, `10.77.0.11` | Wings. Publishes the port of the allocation of every instance and forwards it to the container. |

The route of a hostname is written by the platform and it points at the port of
the allocation of the instance, for example `10.77.0.11:30001`. The container
of the instance has to listen on that same port, and the node has to publish
it. Every one of those three things was broken at some point, and each one of
them is checked on its own.

---

## 2. The configuration of the edge

| What | Where | Why |
|---|---|---|
| `/etc/caddy/Caddyfile` | edge | The configuration of Caddy. The reference of the convention is `audit/_tools/edge-Caddyfile`. |
| `/etc/caddy/certs/blipmade-origin.crt` | edge, `root:root`, `644` | The certificate of the origin, the one that the CDN trusts. |
| `/etc/caddy/certs/blipmade-origin.key` | edge, `root:caddy`, `640` | The key of that certificate. Only the service of Caddy can read it. |
| `/etc/caddy/blipmade-admin-token` | edge, root only, `600` | The token of the administrative API. |
| `/etc/caddy/blipmade.env` | edge, root only, `600` | The token in the form the service reads it (`CADDY_ADMIN_TOKEN=…`). |
| `/usr/local/sbin/blipmade-firewall.sh` | edge | The rules that close the ports of the gateway. |
| `/etc/systemd/system/blipmade-firewall.service` | edge | Runs the rules at every boot, before Caddy. |
| `/etc/systemd/system/caddy.service.d/blipmade.conf` | edge | Puts the token in the environment of the service. |
| `/var/log/caddy/access.log` | edge, `caddy:caddy` | The requests of the visitors. The cookie of the session and the authorization header are removed before anything is written. |

### 2.1 The administrative API is not reachable

The administrative API of Caddy listens on the **loopback interface** of the
edge (`admin 127.0.0.1:2019`). The port 2019 is therefore not open to the
internet and not open to the private network either.

Caddy does **not** check a bearer token: the configuration of the endpoint has
`listen`, `enforce_origin`, `origins`, `config`, `identity` and `remote`, and
no token at all. The token of the platform is therefore checked by a gateway
that stands in front of the API:

```
http://10.77.0.12:2020 {
	@gateway header Authorization "Bearer {env.CADDY_ADMIN_TOKEN}"
	handle @gateway {
		reverse_proxy 127.0.0.1:2019 { header_up Host 127.0.0.1:2019 … }
	}
	handle { respond "The administrative API of the gateway is closed." 403 }
}
```

The firewall lets only the platform reach the port 2020:

```
iptables -A INPUT -p tcp --dport 2020 -s 10.77.0.13 -j ACCEPT
iptables -A INPUT -p tcp --dport 2020 -j DROP
```

The check of the whole path, from the platform:

```bash
# on the platform
TOKEN=$(grep '^CADDY_ADMIN_TOKEN=' /opt/blipmade/.env | cut -d= -f2-)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  http://10.77.0.12:2020/config/apps/http/servers   # 200
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer wrong" \
  http://10.77.0.12:2020/config/apps/http/servers   # 403
curl -s -o /dev/null -w "%{http_code}\n" \
  http://10.77.0.12:2020/config/apps/http/servers   # 403
```

### 2.2 One server per address

Caddy allows only one server per listening address. A second server on the
same address is refused with `listener address repeated: tcp/:443`. The
routes of the customers therefore live in the same server as the routes of the
operator, and the server has a name of its own:

```
{
	servers :443 {
		name blipmade
	}
}
```

`CADDY_APP_SERVER` on the platform carries the same name.

### 2.3 The routes are addressed by their place in a list

The routes of a server are a list, and the administrative API addresses a
route by its index. The platform reads the list, finds the route of the
hostname in it, and writes there. The full description is in
`audit/_tools/edge-Caddyfile`.

### 2.4 The certificate of the origin

The zone of the platform is in front of a CDN, and the CDN is what the visitor
reaches. The CDN asks the edge for the certificate of the origin, and the only
certificate it trusts for that is the certificate of **Cloudflare Origin CA** —
a certificate that a browser does not trust, and that is never used between a
visitor and the CDN.

The certificate of the origin lives on the edge:

| File | Rights | What |
|---|---|---|
| `/etc/caddy/certs/blipmade-origin.crt` | `root:root`, `644` | The certificate of the origin. |
| `/etc/caddy/certs/blipmade-origin.key` | `root:caddy`, `640` | Its key. Only the service of Caddy can read it. |

The edge offers that certificate for the wildcard of the base of the platform
(`*.apps.blipmade.com`), which is the space where the applications of the
platform live:

```
*.apps.blipmade.com, apps.blipmade.com {
	tls /etc/caddy/certs/blipmade-origin.crt /etc/caddy/certs/blipmade-origin.key
	respond "This hostname has no route yet." 404
}
```

The pair is put in place by `scripts/edge/apply-origin-cert.py`, which runs on
the edge:

```bash
# on the edge, as root
cat certificate.pem key.pem | sudo python3 apply-origin-cert.py
```

The script reads the pair from the standard input, so the private key never
appears in the list of the processes nor in the history of a shell. It refuses
a certificate that cannot be read, a key that cannot be read, a pair whose two
halves do not belong together, a certificate that expires within a week and a
certificate that does not cover the wildcard of the base. It keeps a copy of
the certificate that was in use, writes the new one, **puts the routes of the
customers back after the reload of Caddy** (a reload replaces the whole
configuration, and the routes that were written through the administrative API
are not a part of the file) and then checks the handshake with the name of the
wildcard.

Two facts about the certificate of the origin are worth keeping in mind:

* **A browser does not trust it.** It is a certificate between the CDN and the
  origin. The visitor never sees it: the CDN answers the visitor with a
  certificate of its own, and that one has to cover the name.
* **Caddy offers every certificate that covers the name it is asked for.** A
  certificate of the origin that covers `blipmade.com` and `*.blipmade.com` as
  well takes the place of the certificate of the site of the platform at the
  origin. The site still works through the CDN, but a host name under
  `*.blipmade.com` that points straight at the edge would be answered with a
  certificate that only the CDN trusts. The certificate of the origin is
  therefore asked for with the wildcard of the base of the platform only.

### 2.5 The routes come back on their own

The configuration of the edge is not a file of the platform: the platform
writes the routes through the API, and Caddy keeps them until its own
configuration is replaced. A restart of Caddy or a reload of its file takes the
routes of the customers away.

The worker of the platform comes back to them every minute
(`reconcileDomainRoutes` in `api/src/services/domain-routing.ts`): every
hostname that was proven is looked up, and its route is written again when it
is missing or when it points at another address. The state that the customer
sees follows the state of the gateway.

> The flag `--resume` of Caddy is **not** used on the edge. It replaces the
> Caddyfile with the last configuration that was saved through the API, so a
> restart would ignore the file of the operator. The repair of the worker is
> the mechanism that keeps the routes, and it also covers a reload.

---

## 3. The configuration of the platform

| Variable | Value | Meaning |
|---|---|---|
| `CADDY_ADMIN_URL` | `http://10.77.0.12:2020` | The gateway in front of the administrative API. |
| `CADDY_ADMIN_TOKEN` | the token of the edge | The token that the gateway checks. |
| `CADDY_APP_SERVER` | `blipmade` | The server of Caddy that holds the routes. |

The file is `/opt/blipmade/.env` on the platform. It is never committed.

---

## 4. What the operator has to do for a customer

### 4.1 The proof of the ownership

The customer publishes a TXT record:

```
_blipmade-verify.<the hostname>   TXT   <the token that the platform shows>
```

The platform reads it and refuses to route a hostname whose proof is missing.
An A record that points at the shared address of the gateway proves nothing
and is never accepted.

### 4.2 The address of the gateway

The customer points the hostname at the address of the edge:

```
<the hostname>   A   <the public address of the edge>
```

The address that the platform shows in the panel is the one in `DOMAIN_TARGET`
of `/opt/blipmade/.env`.

### 4.3 The certificate of a hostname of a customer

The certificate of a hostname of a customer is obtained by Caddy itself, with
HTTP-01, **when the route is written**. The challenge reaches the edge over
the port 80, so the A record has to point at the edge before the certificate
can be obtained. A hostname whose record still points somewhere else never
gets a certificate, and the route answers with an error of the certificate.

When the zone of the customer is in front of a CDN, the CDN has to be told to
reach the edge over HTTPS and not over HTTP:

| Setting of the CDN | Value | Why |
|---|---|---|
| The mode of the SSL | **Full (strict)** | The edge has a certificate. "Flexible" makes the CDN talk to the edge over HTTP, and the edge answers with a redirect to HTTPS, and the visitor gets a loop of redirects. |
| The proxy of the orange cloud | **on** | The visitor reaches the CDN, and the CDN reaches the edge. |
| The origin | the public address of the edge | The A record of the zone. |

### 4.4 The certificate of the base of the platform

The applications of the platform live under the base of the platform
(`DOMAIN_BASE`, `apps.blipmade.com`), and the wildcard of that base is
proxied by the CDN. The path of a hostname of that space has **two**
certificates, and they are not the same one:

| Leg | Who answers | Which certificate | Who trusts it |
|---|---|---|---|
| visitor → CDN | Cloudflare | a certificate of Cloudflare that covers the name | the browser |
| CDN → edge | the edge | the certificate of Cloudflare Origin CA (`/etc/caddy/certs/`) | Cloudflare |

The certificate of the origin is in place since the 28th of October 2026, and
it covers `*.apps.blipmade.com`, `apps.blipmade.com`, `*.blipmade.com` and
`blipmade.com`.

What the CDN still needs is a certificate of **its own** that covers
`*.apps.blipmade.com`, because that is the one the visitor sees. The
certificate that the zone of the platform has today covers `blipmade.com` and
`*.blipmade.com` — two levels of the name — and a wildcard that is deeper
(`*.apps.blipmade.com`) is not covered by it. The CDN refuses the handshake
of such a name with the alert 40, which is what was measured:

```console
$ openssl s_client -connect 188.114.96.11:443 -servername foo.apps.blipmade.com
error:0A000410:SSL routines:ssl3_read_bytes:ssl/tls alert handshake failure
no peer certificate available
```

The CDN covers the name in one of two ways:

| Way | What the operator does | What it costs |
|---|---|---|
| **A zone of its own for the base** | `apps.blipmade.com` is added as a zone of Cloudflare, the two name servers of Cloudflare are published as `NS` records in the zone of the platform, and the wildcard `A` record is created in the new zone. The Universal SSL of the new zone covers `apps.blipmade.com` and `*.apps.blipmade.com`. | nothing |
| **A certificate of its own** | a certificate that a browser trusts and that covers `*.apps.blipmade.com` is uploaded to the zone of the platform as a custom certificate. | a certificate has to be obtained (a wildcard needs the challenge of the DNS) and renewed |

Both are the work of the operator in the account of Cloudflare. The mode of the
SSL of the zone has to be **Full (strict)**: the certificate of the origin is
trusted by Cloudflare and by nothing else, and the mode of the zone decides
whether Cloudflare checks it.

### 4.5 The check

```bash
# the route exists
curl -s -H "Authorization: Bearer $TOKEN" \
  http://10.77.0.12:2020/config/apps/http/servers/blipmade/routes | jq .

# the application answers on the port of the allocation
curl -s -m 8 http://10.77.0.11:30001/

# the whole path, from the edge
curl -s -m 8 -k --resolve <the hostname>:443:10.77.0.12 https://<the hostname>/

# the whole path, from the internet
curl -s -m 12 https://<the hostname>/
```

The last check is the one that counts: it goes through the CDN, through the
edge and through the node, and it has to answer with the application of the
customer.

---

## 5. What was found and what was corrected

| Defect | Effect | Correction |
|---|---|---|
| The application of a new container listened on the port 3000, and the node published the port of the allocation (30000 and above) | Every route of a customer answered with "connection refused" | The port of the allocation is written into the application (`placeStarterApplication`), and the deployment is only accepted when the application answers on that port |
| The product whose probe is the container was accepted while the application listened on another port | The platform said "online" for a service that nobody could reach | The port of the allocation is asked over HTTP as well, even when the probe of the product is the container |
| The route was asked for by its name, and the body of the route was a list | No route of any customer was ever created | The routes are read as a list, the route of a hostname is found in it, and the body of a `POST` is one route |
| The routes were written with the API and nothing brought them back | A restart of the edge took every route away | The worker writes the routes again every minute |
| The token of the platform was sent, but Caddy never checked it | The token was decoration | A gateway in front of the API checks it, and the firewall lets only the platform reach the gateway |
| The reference of the edge said `trusted_proxies static …` and a block `apps` | The configuration was refused by Caddy 2.11.2 | The reference was corrected, and the edge runs the configuration that works |
| The list of the proxies that are believed was at the route and not at the server | The address that the edge wrote down was the address of the CDN, and not the address of the visitor | The list is at the server, the chain is read from the right (`trusted_proxies_strict`), and the address of the visitor is the one that is written down |
| The edge had no journal of the requests | Nothing could be read back about the traffic of the edge | The edge writes `/var/log/caddy/access.log`, without the cookie of the session and without the authorization header |
| The client of the platform sends `Sec-Fetch-Mode`, and the administrative API refuses a request that carries it and no origin | Every call of the platform was refused with "client is not allowed to access from origin" | The gateway drops the headers of a browser before the call reaches the API |
| The edge had no certificate of its own for the base of the platform | The CDN could not open a session with the edge for a hostname under the base: the handshake failed with the alert 80 | The certificate of Cloudflare Origin CA is put in place and the edge offers it for the wildcard of the base |

---

## 6. The limits

* The certificate of a hostname of a customer needs the A record of that
  hostname at the address of the edge. Until the operator of the zone changes
  it, the route exists and the certificate does not.
* The platform writes the routes, but it does not write the DNS of a customer.
  The records of the customer are published by the customer.
* The edge answers the hostnames of the customers on the same server as the
  site of the platform, because Caddy allows only one server per listening
  address. The routes are told apart by the host name they answer for.
* The certificate of the origin is trusted by Cloudflare and by nothing else.
  A visitor that reaches the edge without going through Cloudflare sees a
  certificate that the browser refuses.
* The certificate of the origin that is in place covers the zone of the
  platform as well (`blipmade.com` and `*.blipmade.com`), so the edge offers
  it for those names too, and Caddy prefers it at the origin because its
  chain is shorter. The site of the platform still works through the CDN. A
  hostname under `*.blipmade.com` that points straight at the edge would be
  answered with a certificate that only Cloudflare trusts; the certificate of
  the next rotation covers the wildcard of the base of the platform only.
