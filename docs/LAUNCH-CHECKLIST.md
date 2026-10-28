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

The wildcard `*.apps.blipmade.com` must point at the edge of the platform
(`A 193.34.214.143`, DNS only, not proxied) and the certificate of the edge
has to cover it. Until that is done, the address of a customer is not served
over HTTPS and the instance is reached on its own address.

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
