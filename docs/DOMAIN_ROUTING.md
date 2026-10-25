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

### 2.4 The routes come back on their own

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

### 4.3 The certificate

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

### 4.4 The check

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
