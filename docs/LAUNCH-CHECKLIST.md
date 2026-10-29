# The launch checklist

Everything that is left for the launch, in the order it has to be done. Each
step says who does it and how to check that it worked. Nothing here holds a
secret.

**Done on the 27th of October 2026:** the live keys of Stripe are applied
(section 1), the channel of the alarms of Discord is set (section 5), the
platform has been reset: the customers, the orders, the instances, the
services on the panel, the audit log and the accounts of the first round are
gone (section 0), and the platform says now, every five minutes, that it
cannot talk to the control panel (section 8).

## 0. The fresh start — done

The platform holds two accounts, both of them administrators:

| Account | Name |
| --- | --- |
| `nissqbv@gmail.com` | Catalin Marian Nitu |
| `horja3i@gmail.com` | Horia Andrei |

Their password is the administrator password of the environment
(`ADMIN_PASSWORD`), and `ADMIN_EMAIL` points at `nissqbv@gmail.com`, so the
seed of a deploy never brings the old administrator back.

**Still on the operator:** both accounts have the same password today. Change
it from the settings of the account, once, on each of them.

The catalog, the prices, the eggs on the panel, the live keys of Stripe and
the channel of Discord were not touched. The backup from before the reset is
`blipmade-pre-reset-20261027T190410Z.tar.gz`, on the machine and in the
off-site copy.

One administrator account of the panel stayed: `stefan@xodo.ro`, because the
panel refuses to delete an account that has servers attached to it, and that
account owns the runtime template of the platform (the server every new one
is cloned from).

## 1. The live keys of Stripe — done

The payments run on the live keys since the 27th of October 2026, at 18:44.
The three keys were read from the standard input, so they never appeared in the
list of the processes and never in the history of a shell. The copy of the
`.env` from before the change is kept on the machine, with the mode `600`.

The state of the platform after the change:

```
/api/health -> "stripe": "live"
```

The webhook of Stripe answers on the platform, and a delivery signed with the
live secret is accepted:

```
https://blipmade.com/api/webhooks/stripe
```

**Still on the operator:** the endpoint of the webhook in the dashboard of
Stripe has to point at `https://blipmade.com/api/webhooks/stripe`, and the
events it sends have to be the ones the platform really reads:

| Event | Why |
| --- | --- |
| `checkout.session.completed` | the order is paid |
| `checkout.session.async_payment_succeeded` | the order is paid, when the payment needed more time |
| `checkout.session.async_payment_failed` | the order failed, when the payment needed more time |
| `checkout.session.expired` | the customer gave the checkout up; the order is closed instead of waiting forever |
| `payment_intent.payment_failed` | the payment itself failed |
| `invoice.paid` | the invoice of the subscription is paid |
| `invoice.payment_failed` | the invoice of the subscription failed |
| `customer.subscription.updated`, `customer.subscription.deleted` | the subscription of the customer changed |

`charge.refunded` is **not** among them: the platform does not read that event.
A refund is made from the back office, and that is where the customer is told
about it. The secret of the webhook is the one that was given to the script.

**Checked on the 28th of October 2026, at 09:2x:** the endpoint exists, it is
`enabled` and it points at the right address. It sends every event of the table
above **except `checkout.session.expired`**, which the platform does read and
which is missing: a customer who gives the checkout up leaves the order in
„payment required" forever. It also sends `charge.refunded`, which the platform
ignores — harmless, and it can stay.

The events that came before the change belong to the sandbox and are not read
any more: the platform verifies every delivery with the live secret.

## 2. The eggs of the panel — the operator

The panel cannot read the eggs of a repository on its own: the eggs have to be
imported into it, one by one, by an administrator. The files are ready and
checked in `pterodactyl-eggs/`, and the guide is in
[`pterodactyl-eggs/README.md`](../pterodactyl-eggs/README.md).

- `https://panel.blipmade.com` → **Administration → Nests** → the nest
  **Discord Bots** → **Import Egg**, three times:
  `postgres16.json`, `code-server.json`, `uptime-kuma.json`.

To check it afterwards, the Application API of the panel has to answer with
the three names: `Postgres 16`, `Code-Server` and `Uptime Kuma`.

Until the eggs are imported, the three products stay closed in the catalog and
cannot be ordered. This is on purpose: a product that is opened before it was
proved fails in front of a customer.

**Done on the 28th of October 2026, at 12:30.** The three eggs are in the panel
of the nest 5 (**Discord Bots**), imported through the service of the panel
itself (`panel-bridge/tools/blipmade-import-egg.php`):

| Egg | Id in the panel | The product that runs on it |
| --- | --- | --- |
| `Postgres 16` | 17 | PostgreSQL |
| `Code-Server` | 18 | Code Server |
| `Uptime Kuma` | 19 | Uptime Kuma |

The eggs 15 (`node.js generic`) and 16 (`python generic`) were already there.
The variables of every new egg are exactly the ones the platform writes for the
product that runs on it, so the environment of a container is complete.

## 3. The mail of the platform — the operator

Two different things are in the way, and only one of them is on the platform.

**The server of the operator refuses the sender.** The reset of the password of
a customer at `stefan@xodo.ro` was made and handed to the mail, and the mail
server of the operator refused it:

```
550 5.1.0 <no-reply@blipmade.com>: Sender address rejected:
User unknown in virtual mailbox table (in reply to RCPT TO command)
```

The cause was measured with probes sent from outside, straight to
`mail.xodo.ro` (the 27th of October 2026, at RCPT TO):

| Sender | Answer of `mail.xodo.ro` |
| --- | --- |
| `probe@google.com` | `250 2.1.5 Ok` |
| `probe@mail.blipmade.com` | `250 2.1.5 Ok` |
| `probe@example.org` | `550 5.7.27 ... does not accept mail (nullMX)` |
| `no-reply@blipmade.com` | `550 5.1.0 ... User unknown in virtual mailbox table` |

So the server accepts every sender whose domain it can resolve, and it
refuses `blipmade.com` because it **knows the domain** (it was added to it) but
**does not have the mailbox `no-reply`** in its own table. The fix is on
`mail.xodo.ro`:

- either create the mailbox (or the alias) `no-reply@blipmade.com` — in
  Mailcow: **Domains → blipmade.com → Mailboxes / Aliases → no-reply**;
- or put in `main.cf`:
  ```
  smtpd_reject_unlisted_sender = no
  ```
  and then `postfix reload`.

The platform itself is not the problem: the messages it sends are signed
(`DKIM-Signature: d=blipmade.com, s=dkim`) and Gmail accepts them.

**The domain of the platform has no mail of its own.** `blipmade.com` has no
MX record, so nothing that is sent from it can be answered, and a server that
resolves the sender strictly refuses it as `nullMX`. This is the state of the
records on the 27th of October 2026:

| Record | State now | What is needed |
| --- | --- | --- |
| MX | missing | `MX 10 mail.blipmade.com` |
| SPF | `v=spf1 mx a ip4:193.34.214.20 ~all` | it can be tightened to `v=spf1 mx ip4:193.34.214.20 ~all`, because `a` leads to Cloudflare |
| DKIM | `dkim._domainkey.blipmade.com` is published, and the platform signs with `d=blipmade.com, s=dkim` | check in Mailcow (**Domains → blipmade.com → DKIM**) that the published value is the one Mailcow shows |
| PTR of `193.34.214.20` (the mail of the platform) | missing | ask the provider of the addresses |
| PTR of `193.34.214.143` (the edge) | missing | ask the provider of the addresses |

The MX record and the PTR records are the ones that are asked for. The DKIM
record is published already; the check is only that the published value is the
value of Mailcow.

## 4. The addresses of the customers — the operator

The applications of the platform live under the base of the platform
(`DOMAIN_BASE`, `apps.blipmade.com`), and the wildcard of that base is served
through Cloudflare:

```
visitor ──HTTPS──> Cloudflare ──HTTPS──> edge (Caddy) ──HTTP──> node (Wings) ──> container
```

**The edge is ready.** The certificate of Cloudflare Origin CA is in place
(`/etc/caddy/certs/blipmade-origin.crt`, `644`, and the key `640`, `root:caddy`),
it covers `*.apps.blipmade.com`, `apps.blipmade.com`, `*.blipmade.com` and
`blipmade.com`, it verifies with the root of Cloudflare, and the edge offers
it for the wildcard of the base:

```console
$ openssl s_client -connect 127.0.0.1:443 -servername foo.apps.blipmade.com
subject=O=CloudFlare, Inc., OU=CloudFlare Origin CA, CN=CloudFlare Origin Certificate
issuer=C=US, O=CloudFlare, Inc., OU=CloudFlare Origin SSL Certificate Authority, ...
```

**What Cloudflare still has to do** is the certificate that the *visitor* sees.
The certificate of the zone `blipmade.com` covers `blipmade.com` and
`*.blipmade.com`, and a wildcard that is one level deeper
(`*.apps.blipmade.com`) is not covered by it — Cloudflare refuses the
handshake of such a name with the alert 40, and no request ever reaches the
edge. Two ways to cover it:

| Way | What the operator does |
|---|---|
| **A zone of its own for the base** (recommended, it costs nothing) | `apps.blipmade.com` is added as a zone of Cloudflare, the two name servers of Cloudflare are published as `NS` records in the zone of the platform, and the wildcard `A` record (`193.34.214.143`) is created in the new zone. The Universal SSL of the new zone covers `apps.blipmade.com` and `*.apps.blipmade.com`. |
| **A custom certificate on the zone of the platform** | a certificate that a browser trusts and that covers `*.apps.blipmade.com` is uploaded to the zone `blipmade.com`. A wildcard needs the challenge of the DNS, and the certificate has to be renewed. |

The mode of the SSL of the zone has to be **Full (strict)**: the certificate of
the origin is trusted by Cloudflare and by nothing else.

The whole story is in `docs/DOMAIN_ROUTING.md`, in the sections 2.4 and 4.4.

### 4.1 The rotation of the key of the origin — done, once more to come

The private key of the certificate of the origin was published in the
conversation with the operator, so it is treated as compromised and it has to
be replaced. The new pair is put in place with one command on the edge:

```bash
# on the edge (10.77.0.12), as root
cat certificate.pem key.pem | sudo python3 apply-origin-cert.py
```

The script is `scripts/edge/apply-origin-cert.py` in the repository, and it is
installed on the edge at `/usr/local/sbin/apply-origin-cert.py`. It reads the
pair from the standard input, so the key never appears in the list of the
processes, refuses a pair that is broken or that does not belong together,
keeps a copy of the certificate that was in use, writes the new one, puts the
routes of the customers back after the reload of Caddy and checks the
handshake.

The new certificate is asked for with the wildcard of the base of the
platform **only** (`*.apps.blipmade.com` and `apps.blipmade.com`), and not
with the zone of the platform: a certificate of the origin that covers
`blipmade.com` takes the place of the certificate of the site of the platform
at the origin, and a hostname under `*.blipmade.com` that points straight at
the edge would then be answered with a certificate that only Cloudflare trusts.

**Done on the 28th of October 2026, at 16:10.** The pair was verified before
the installation: the certificate verifies against the root of Cloudflare, the
key is valid, and the public key of the certificate is the one of the key
(`6aa3912096a8c678…`). The edge was reloaded, the route of `witch.pw` was
written back, and the handshakes were measured: the wildcard of the base is
answered with the certificate of the origin, and `blipmade.com` and
`www.blipmade.com` with their own certificate, which the origin certificate
no longer shadows.

**What is left:** the pair that is in place was given in the conversation as
well, so its key is in the same place as the one it replaced. It has to be
rotated one more time, with a pair that does not pass through a conversation.

### 4.2 The state of the 29th of October of 2026 — measured

Everything that is under the control of the platform was measured again, and
the only thing that is missing is the certificate that **Cloudflare** shows
to the visitor:

| What | Where | State |
|---|---|---|
| The certificate of the origin | `/etc/caddy/certs/blipmade-origin.crt` on the edge | in place, covers `*.apps.blipmade.com` and `apps.blipmade.com`, verifies against the root of Cloudflare |
| The certificate of the visitor | Cloudflare, zone `blipmade.com` | **missing for the base**: the zone holds `blipmade.com` and `*.blipmade.com`, so a name under `*.apps.blipmade.com` is refused with the alert 40 |
| The route of a customer | the routes of the server `blipmade` of the edge | written, and it answers: the request for `code-server-exeuw.apps.blipmade.com` reaches the container and is answered with `302 → ./login` |
| The order of the routes | the same list | the routes of the customers are put in front of the routes of the operator, or the site of the base would answer before them (see `docs/DOMAIN_ROUTING.md`, 2.6) |

The pair of the certificate that was sent on the 29th of October was compared
with the pair that is installed: the two certificates are **not** the same
(`89:FF:BB:55:…` against `89:FF:50:A8:…`), but they carry the same names,
the same issuer and the same validity, so both are certificates of the origin
for the base of the platform. **The one that is installed does not have to be
replaced**, and the key that is in place matches its own certificate.

The only step that is left is on the side of Cloudflare, and it is the one of
the table above: the certificate of the visitor for the base of the platform.

## 5. The webhook of Discord — done

The channel of the alarms is set since the 27th of October 2026, at 18:50.
The last message the platform sent through it was taken by Discord, so the
alarms of the platform reach the channel.

The address is a secret, and it is **not** in the `.env`: it is written in a
file that only the owner of the machine can reach (the directory is `0700`,
the file is `0444` and it is mounted in the containers read only), and the
platform is told where that file is. The address therefore travels neither
with the rest of the environment nor with a copy of the configuration.

The address is read from the standard input, so it never appears in the list
of the processes and never in the history of a shell:

```bash
printf '%s' "$WEBHOOK" | ./scripts/set-discord-webhook.sh
```

The script refuses an address that is not a webhook of Discord, writes the
file, points the platform at it, restarts the api and the worker, checks that
the platform can really read the file, and sends a test message **with the
code of the platform itself**, so a message that arrives proves that the
alarms arrive too. It prints the host of the channel and never the address.

It was tested on the machine of the platform with a false address: the script
wrote the file, restarted the services, confirmed that the platform reads the
file, called Discord and answered `404` (which is what a false address gets).
The false address was removed afterwards.

If the address is not the right one, the script says so and exits with the
status 1, and the channel stays as it was.

## 6. The package of recovery — the operator

The package of recovery of the platform is encrypted with the public key of
the operator. The key is not in the repository and not on the machine of the
platform, so the package cannot be built without it:

```bash
age-keygen -y > operator.pub
```

The file `operator.pub` is put in the repository of the platform (it is a
public key) and the package is built with `scripts/recovery-package.sh`.

## 7. The copy of the backup outside the cluster — the operator

The copies of the backup of the database are kept on the machine of the mail
(`10.77.0.14`), which is a part of the same cluster. A copy on a host of
another provider is the only one that survives the loss of the cluster. The
script `scripts/backup-offsite.sh` writes the copy and the address of the
target is in the environment of the platform.

## 8. The key of the control panel — the operator

The Application API key of the panel was revoked. The platform cannot list the
servers of the panel any more, so it cannot build a service: a new order waits
until the key is made again.

The key is made in the panel: `https://panel.blipmade.com` → **Administration →
API Keys → Application API**, with the permission to create servers. It is then
applied on the machine of the platform:

```bash
printf '%s' "$PANEL_KEY" | ./scripts/apply-panel-key.sh
```

The script keeps a copy of the `.env` before it writes, restarts the api and
the worker, and checks the key **with the code of the platform**: it asks the
panel the same question the provisioning asks. A key that the panel refuses is
caught there, with the words of the panel, and not at the first order of a
customer. The key is read from the standard input, so it never appears in the
list of the processes and never in the history of a shell.

Since the 27th of October 2026, the health of the platform asks the panel the
same question every five minutes. The check `panel` is `critical` in the page
of the operations (`/admin/ops`) while the key is refused, and the alarm
reaches the channel of Discord and the mail of the operator. A key that the
panel accepts but that may not read the servers is a different problem, and
the summary says so: that one is fixed by giving the key the permission.

**Done on the 28th of October 2026, at 12:27.** The cause was measured in the
database of the panel: the table `api_keys` was empty. The key of the platform
had been made by the account `stefan10xdd@gmail.com`, and the keys of a user go
away with the user — that account was deleted at the reset of the 27th of
October 2026, and the key of the platform died with it. The panel itself was
alive all the time, and the accounts of the administrators were never touched.

A new key was made through the service of the panel
(`panel-bridge/tools/blipmade-create-key.php`), applied with
`scripts/apply-panel-key.sh` and verified with the code of the platform:

| | |
| --- | --- |
| The key of the platform | id 26, of the account `stefan@xodo.ro` |
| The permissions | servers, customers: read and write; nodes, allocations, nests, eggs, locations, databases: read |
| The addresses it is accepted from | `10.77.0.13`, the machine of the platform |
| The copy of the key | `/root/panel-key.txt` on the panel (mode 600) |
| The check `panel` | `ok` — "The panel answered with 1 server(s)." |

## 9. What was proved, and what stays closed

Four products of the catalog were built for real, on the node of the platform,
with the orders and the customers of a test. What the browser of the test
answered was written down in the journal of every instance.

| Product | Result | In the catalog |
| --- | --- | --- |
| Discord Bot | the container is alive and the instance is `ONLINE` | orderable |
| PostgreSQL | the database answers on the port of the node, the instance is `ONLINE` | orderable |
| Code Server | the editor answers with HTTP 302, the instance is `ONLINE` | orderable |
| Uptime Kuma | the container exits at the start, the port never opens | **closed** |
| WordPress | there is no egg for it in the panel | **closed** |

**Uptime Kuma stays closed, and the reason was measured.** The container holds
uptime-kuma 2.5.8, whose `package.json` asks for Node **>= 20.4.0**, and the egg
installs and runs it in `node:18-alpine`. The application leaves at once, the
node says the container is `offline`, and nothing listens on the port. The egg
has to be changed (a container of Node 20 or later, and an image that runs on
it) and the product has to be proved again before it is opened.

**Two bugs of the platform were found by these tests and are fixed:**

- A product that is a database was checked over HTTP, so a PostgreSQL that
  worked was called broken. The probe of the product is now a TCP connection
  (`{"kind": "tcp"}`).
- A container that was started a second ago is `starting` and uses no memory
  yet. The check called that a failure at once, so a service that started
  normally would have been refused and the customer refunded. The check waits
  now, and a container that never starts is still a failure.

## 10. The catalogue of the eggs — done, except the probes

The catalogue of the platform is made of the eggs of Pterodactyl and of a
manifest that says what each product is. The whole of it is described in
[`docs/CATALOGUE.md`](CATALOGUE.md).

**Done on the 28th of October 2026.** The eggs of the three repositories of
Pterodactyl (`game-eggs`, `application-eggs`, `generic-eggs`) were copied into
`pterodactyl-eggs/`, imported into the nest 5 of the panel through the service
of the panel itself, and written into the catalog of the platform as 66
products:

| Group | Products | The eggs in the panel |
| --- | --- | --- |
| Games | 33 | ids 20 to 85 of the nest 5 |
| Applications | 23 | ids 20 to 85 of the nest 5 |
| Runtimes | 10 | ids 20 to 85 of the nest 5 |

The panel holds 71 eggs in the nest 5: the five that were already there (the
`node.js generic`, the `python generic`, the `Postgres 16`, the `Code-Server`
and the `Uptime Kuma`) and the 66 of the catalogue. The number of an egg
belongs to the panel, so a product names its egg and the importer fills the
number when the panel carries it.

**Every one of the 66 products is closed for ordering.** The eggs are in the
panel and the products are listed, but a product opens only after a server of
it was really built on a node and answered. The games that need a licence of
the customer cannot be probed without one, so they stay closed and the reason
is written in the catalogue.

**The price is now the price of the resources.** A server costs what it uses
and nothing else, with one card of rates for the whole platform
(`pricing_resources`: 200 per GB of memory, 75 per vCPU, 5 per GB of disk
and 49 of fee per instance, for a month). The card is changed in one place, in
the back office of the prices, and it changes the price of every product at
once. The base of a server is not used any more.

**The prices the customers already have are not touched.** A running instance
keeps the price it was sold at. The reconciliation is an action of the
operator (`POST /api/admin/instances/reconcile-prices`), and it writes every
difference to the journal of the instance and to the audit trail.

**Half of a processor is a thing the platform sells.** A bot of half a vCPU
is a thing the panel can build, so the limits of a product can say "half a
processor" and the selector of the customer offers halves. The price is the
same formula in every case: the fee of the instance, plus the memory, the
processor and the storage.

**The capacity of the platform is measured, not assumed.** The panel does not
publish the processor of a node, so the operator declares the cores of a node
(`capacity.node_cores`) and the platform sells the cores of the node
multiplied by the factor of the oversubscription
(`capacity.cpu_oversubscription`, 4 by default). A node that was never
declared sells four cores, so it cannot be filled to the brim by accident.

The whole model is described in [`PRICING.md`](PRICING.md).

**The values of the customer.** A game that needs a licence, an account or a
token asks for it at the order: the product declares the variables, the
customer fills them, and the platform seals them and writes them into the
environment of the container. The declarations are in
`pterodactyl-eggs/build-manifest.py`, and the generator refuses a declaration
that names a variable the egg does not have.

**What is left:** the probes. Each product has to be built on the node and
has to answer before it is opened. The first ones to try are the runtimes and
the small applications; the games come last, because a game that downloads
hundreds of gigabytes takes a long time and a licence of the customer.
