# Blipmade — the operator actions and the rebuild of the documentation

**Date:** 2026-10-26
**Branch that was integrated:** the work of the operator's round of 2026-10-26
**Production:** `10.77.0.13` (`/opt/blipmade`), edge `10.77.0.12`, mail `10.77.0.14`, panel `10.77.0.10`, node `10.77.0.11`, hypervisor `193.34.214.20`

This round did what the operator asked: it checked what the operator had
already put in place before asking for anything, it walked the four systems
that carry the platform (the DNS, the payments, the mail and the services of
the customers), it built the Discord channel of the alarms, it prepared the
secure copy of the recovery secrets, it identified the service that nobody
knew, and it rebuilt the documentation of the platform from the truth of the
running code.

---

## 1. The DNS of the platform is in place, with one record to change

The zone of `blipmade.com` is on Cloudflare (`cartman.ns.cloudflare.com`,
`nucum.ns.cloudflare.com`). The records were read at the authoritative name
servers of Cloudflare, not from a cache.

| Name | Type | Content | Proxy | What it is |
|---|---|---|---|---|
| `*.apps.blipmade.com` | A | `188.114.96.11`, `188.114.97.11` | **Proxied** | the wildcard of the customer hostnames |
| `*.apps.blipmade.com` | AAAA | `2a06:98c1:3120::b`, `2a06:98c1:3121::b` | **Proxied** | the same wildcard over IPv6 |
| `test.apps.blipmade.com` | A | `193.34.214.143` | DNS only | the edge of the platform |
| `mail.blipmade.com` | A | `193.34.214.20` | DNS only | the host of the mail |
| `blipmade.com` | A | `104.21.76.244`, `172.67.202.82` | Proxied | the site of the platform |
| `blipmade.com` | AAAA | `2a06:98c1:3120::`, `2a06:98c1:3121::` | Proxied | the site of the platform over IPv6 |
| `apps.blipmade.com` | — | nothing | — | no record of its own |

**The one record that has to change** is the wildcard, and it has to change
in two fields:

```
Type:    A
Name:    *.apps.blipmade.com
Content: 193.34.214.143
Proxy:   DNS only (the grey cloud)
```

Why, with the proof:

- The wildcard resolves to the addresses of the CDN of Cloudflare, not to
  `193.34.214.143`. The requirement of the operator is the address of the
  edge.
- A customer hostname that goes through the CDN **does not get a handshake of
  TLS**: the request for `probe-1793038529.apps.blipmade.com` fails with
  `SSL routines::ssl/tls alert handshake failure`. The reason is the shape of
  the zone: `apps.blipmade.com` is not a zone of its own, it lives inside
  `blipmade.com`, and the certificate of Cloudflare covers `blipmade.com` and
  `*.blipmade.com` — one level, not two.
- The edge holds certificates for `blipmade.com`, `www.blipmade.com` and
  `test.apps.blipmade.com`, and for nothing else.

**The DNS change is necessary but it is not enough.** The route that the
platform writes for a hostname of a customer is a plain `reverse_proxy`
(`api/src/services/gateway.ts`), with no certificate in it, and the edge
serves only `:443` (there is no server on `:80`). So a hostname of a customer
has no HTTPS today, whatever the DNS says. For the HTTPS of a customer
hostname to work, the platform has to ask the edge for a certificate when the
hostname is proven — the proof of the ownership is already there (a TXT
record, `api/src/routes/domains.ts`), and the certificate has to be given
only to a hostname that was proven. That is the next piece of code, and it is
not a change of the DNS.

---

## 2. The payments stay in the sandbox, and the whole chain was walked there

**The environment runs the sandbox of Stripe and nothing else.** The key of
the secret is `sk_test_…`, the key of the public side is `pk_test_…`, and
the switch of the payments is off (`PAYMENTS_ENABLED=false`), so a customer
cannot start a checkout today. The flag `STRIPE_TEST_MODE=false` in the
environment does **not** mean "live": it means that the stand-in gateway of
the tests is off, because there are real keys (the stand-in is only used when
there is no key at all).

The chain was walked against the sandbox of the provider itself, with real
sessions, a real payment taken with a card of the test mode and a delivery
signed with the real secret of the webhook. The test is in the repository and
runs on demand:

`api/tests/stripe-sandbox-live.test.ts` — six cases, all green:

| Case | What it proves |
|---|---|
| the checkout exists | the session the platform builds is in the sandbox, with the right amount, the right currency and the order as the reference |
| the payment is taken | a real payment of the sandbox, the order is `PAID`, the subscription is `ACTIVE`, the invoice is written, the service is on the queue of the worker and the customer is notified |
| the same delivery twice | the second delivery writes nothing a second time |
| the payment is refused | an order whose payment was refused is not paid and no service is created |
| the checkout is given up | an expired checkout does not pay the order and creates no service |
| the money comes back | a real refund in the sandbox, and a second refund does not take the money back twice |

The permanent test of the chain with a fake provider is still there
(`api/tests/stripe-payment-chain.test.ts`), so the chain is checked on every
run of the suite as well.

**What is not ready:** the live payments. They need the keys of the live mode
and the prices of the products. The operator has been clear that they stay
in the sandbox, so nothing about that is asked for in this report.

---

## 3. The mail: the system works, the DNS of the domain does not

The mail of the platform is a real Mailcow on `10.77.0.14`, reached through
the public address `193.34.214.20`. The state was read from the system
itself.

| What | State |
|---|---|
| The mail domains | one: `blipmade.com`, "Transactional mail of the platform" |
| The mailboxes | three: `no-reply@`, `platform@`, `support@blipmade.com`, each with a quota of 1 GB |
| The queue | empty |
| The delivery out | works: a message to `nissqbv@gmail.com` was accepted by the receiving server on 2026-10-26 12:10 |
| The delivery in | works for the messages that come from the platform itself; **no message from the internet arrived in three days** |
| The DKIM | the key of Mailcow and the published record **do not match** |
| The MX of `blipmade.com` | **there is none** |
| The PTR of `193.34.214.20` | **there is none** |
| The SPF of `blipmade.com` | `v=spf1 mx a ip4:193.34.214.20 ~all` — `mx` points at nothing and `a` points at the CDN |
| The DMARC | `v=DMARC1; p=quarantine;` — no address of report, no policy for the subdomains |

**The three records the operator has to publish** (they are the only ones;
nothing is to be changed in Mailcow):

```
Type: MX   Name: blipmade.com   Content: 10 mail.blipmade.com   Priority: 10
Type: TXT  Name: dkim._domainkey.blipmade.com
      Content: v=DKIM1;k=rsa;t=s;s=email;p=<the key that Mailcow holds>
Type: PTR  Name: 193.34.214.20   Value: mail.blipmade.com
```

The DKIM record that is published today carries another key than the one
Mailcow signs with, so the signature of the outgoing mail does not verify.
The key of Mailcow is read from the system itself and must be copied as it
is.

**The MX must be added and not replaced.** There is no MX today, so nothing
of another provider is touched by adding one. If the domain of the platform
is meant to receive its mail somewhere else, the operator has to say so
first: the instruction was not to replace an existing MX, and there is none.

**The PTR needs the provider of the address.** The address `193.34.214.20` is
the public address of the hypervisor, and the reverse name of it is set
there, not in Cloudflare. The value that has to be there is
`mail.blipmade.com`, and it has to match the `A` of `mail.blipmade.com`.

**The ports, from the outside:** the port 25 was opened from two of the three
public probes (one probe timed out). The ports 465, 587 and 993 are listened
on by the mail host and are forwarded by the address of the hypervisor, and
the public probes gave no verdict for them — that is an honest "not proven
from outside", not a failure.

**The mail of the customers does not exist yet.** There is no mail domain of
a customer in Mailcow, and the sale of the hosted mail is off
(`MAIL_SALES_ENABLED`). The documentation now says so plainly.

---

## 4. The Discord channel of the alarms

Discord does not take the body of the platform, so the channel has an
adapter of its own: `api/src/services/ops-alert-discord.ts`.

- The message is an **embed** with the severity, the title, the component
  that is broken, the moment, the name of the occurrence and the details.
- The colours of the severities: critical, warning and **recovered**. The end
  of a problem is a message of its own, in the channel too.
- The text is cleaned before it is built into the embed: a key of Stripe, a
  secret of a webhook, a bearer token, a password, the address of a customer
  and the identifiers of the database are replaced by a marker. Nobody is
  called out by a message of the platform (`allowed_mentions` is empty).
- The link to the page of the operations is in the message.
- **The address of the channel is never shown**: not in the dashboard, not in
  a log, not in a report. The dashboard says the host of the address and
  nothing else.
- The channel is busy: a `429` is not an error, the message is sent again
  after the time that Discord asked for. A `5xx` is tried again. A refusal
  (`404`, `401`) is not tried again, because it would not help.
- The same occurrence is not sent twice in five minutes, and no more than
  thirty messages leave for the channel in an hour.
- The journal of the alarms and the message by mail stay where they are: the
  channel is one more, not a replacement.

The tests are in `api/tests/ops-alert-discord.test.ts` — fifteen cases, all
green, with a real server in front of the adapter.

The address of the channel was given by the operator in the conversation, and
the file of the channel is the way the platform reads it:

```
OPS_DISCORD_WEBHOOK_URL    the address of the webhook
OPS_DISCORD_WEBHOOK_FILE   a file that holds the address (only the owner of
                           the platform can read it)
```

The live proof — an alert about the mail system being down, sent through the
same code the sweep uses, without the mail system being involved — is in
`api/probe/ops-alert-discord.ts`.

---

## 5. The secure copy of the recovery secrets

The script `scripts/recovery-package.sh` builds an encrypted package with
everything that is needed to put the platform back on a new machine: the
environment of the platform, the credentials of the database, the identity of
the age that decrypts the off-site copies, the key of the off-site copy
itself, the key of the repository, the shape of the database, the migrations
and the tools of the backup and of the restore.

Two rules are enforced by the script:

1. the recipient must be given on the command line;
2. the recipient **must not** be the public key of the identity that is on
   the machine. The key of the machine matches `OFFSITE_AGE_RECIPIENT`
   exactly, so a package encrypted for it could be opened on the server
   without the operator — and a copy that the server can open by itself is
   not a recovery copy. The script refuses and says why.

Nothing is printed by the run but the path of the package, the path of the
receipt and the checksum. The receipt lists what is in the package in the
clear and holds no secret.

The way the operator takes it, checks it and opens it is written down in
`docs/RECOVERY-HANDOFF.md`. Nothing was deleted and nothing was rotated.

**The off-site copy has to move.** `OFFSITE_TARGET` is
`blipmade-offsite:/srv/blipmade-backups`, and `blipmade-offsite` resolves to
`10.77.0.14` — the **host of the mail**, inside the same cluster as the
platform. If the cluster is lost, the platform and its off-site copy are
lost together. A real off-site copy belongs to a provider outside this
cluster; the change is a new target and a new key, and the drill
(`scripts/restore-offsite-drill.sh`) then says in its receipt whether the
copy was whole.

---

## 6. The service nobody knew: the instance 20

The investigation was read-only. The state of the service:

| What | Value |
|---|---|
| The service of the platform | `cmvn057pp003xns01drp9b7y9`, "Discord Bot" |
| The server of the panel | id **20**, uuid `01667a40-36cb-4fc2-a067-ad039479aacf` |
| The product | Discord Bot, 256 MB of memory, 1 processor, 1 GB of disk |
| The customer | `nissqbv@gmail.com` (the same customer has another service, 21, which is online) |
| The order | `BM-00011`, paid, fulfilled, 0 € |
| The subscription | `ACTIVE`, `cancelAtPeriodEnd = true`, no period end, 0 € |
| The node and the allocation | node 1 (`games-node-01`), allocation 76 |
| The creation | 2026-10-24 23:00:27 — online at 23:01:41 |
| The cancellation | 2026-10-24 23:35:39, **asked by the customer** (the audit says so) |
| The reinstall | 2026-10-24 23:35:50, **asked by the same customer**, eleven seconds later |
| The state of the container | `offline`, never started since, the uptime is 0 |
| The files | only the files of the egg (`index.js`, `package.json`, `package-lock.json`, `README.md`, `.npm/`): there is no `node_modules` and no code of the customer |
| The reason it is stopped | the reinstall of that time wiped the container and the old code left it stopped. The code of today refuses to reinstall a service that is cancelled |
| The deletion | none was scheduled: the setting of the automatic deletion is not set, so the service would have stayed for ever |

**The decision of the operator was to delete the server of the panel**, and
it was carried out with the tools of the platform
(`api/probe/retire-cancelled-instance.ts`): the export of the data was
written first, the server 20 of the panel was deleted, the address went back
to the pool, the record of the service and its export stayed, the customer
was told and the audit kept the trace. The five servers that are left are
the template of the platform, 17, 18, 19 and 21.

---

## 7. The documentation, rebuilt from the truth

The documentation of the platform was one file of 2756 lines, and it was
wrong in the places that matter. The audit of every claim it made is in
`docs/DOCS_CLAIM_AUDIT.md` (156 claims, 16 pages, with the implementation,
the status and the action of each one). The facts it is built from are in
`docs/DOCS_FACTS.md`, and every one of them was checked on the running
system.

The findings that changed the documentation the most:

- **There is no one-click installation.** A deployment writes a minimal
  Node.js application into the container (`api/src/services/starter-apps.ts`)
  and starts it. The documentation said that WordPress, Ghost, Forgejo,
  Grafana, n8n, Uptime Kuma and the databases were installed. They are not.
- **Of the five products of the catalog, two are deployable today**
  (`wordpress` and `discord-bot`); the other three have no egg. The pages of
  the applications are published only when the catalog offers the product,
  so a page of a product that cannot be bought was never seen by a customer —
  but its content was still a promise.
- **The customer has a backup**, and the documentation said it had none. The
  backup of the files of the instance is made by the panel on demand; it is
  manual, and the platform keeps no history of it. The backup of the
  platform (the database and the configuration) is something else, and the
  documentation of a customer never mentions it.
- **The platform does not hand out a certificate for a hostname today** (the
  route of the edge carries none).
- **A resize is an order that has to be paid**, and a service that is
  cancelled is kept for a term of retention, with the data exported before
  anything is deleted.
- **The password needs ten characters**, the sessions last fourteen days and
  are not extended by the activity, and there is no API of keys.
- **The hosted mail is not on sale today**, and the documentation said it
  was.

The documentation is now structured content (`web/src/content/docs/`), read
by a renderer that keeps the design of the platform and adds a breadcrumb, a
table of contents, the related pages and the metadata of the page. The
content is checked by `scripts/validate-docs.mjs`, which is run by the CI:
a link that points at a page that does not exist, an anchor that does not
exist, a page of a group that does not exist, a promise of an availability
that the platform does not give, the name of the hosting panel behind the
platform — all of them stop the build.

---

## 8. What is left for the operator

1. **The wildcard** (the exact record is in section 1): `A`, `*.apps.blipmade.com`,
   `193.34.214.143`, DNS only.
2. **The MX of `blipmade.com`** (`10 mail.blipmade.com`), **the DKIM record
   with the key of Mailcow** and **the PTR of `193.34.214.20`**
   (`mail.blipmade.com`) — the exact records are in section 3.
3. **The key of the age** of the operator, for the secure copy: the steps are
   in `docs/RECOVERY-HANDOFF.md`. The package is built in one command after
   the key is given.
4. **The off-site copy**, moved to a provider that is not in this cluster.
5. The status of the products of the mail, the prices of the products and the
   live payments — only when the operator decides it.

## 9. What the agent can still do

1. The certificate of a hostname of a customer, asked of the edge when the
   hostname is proven — the code is designed in section 1 and can be written.
2. The proof of the mail of the platform, end to end, once the MX and the PTR
   are published.
3. The drill of the restore of the off-site copy, once the new target is in
   place.
4. The pages of the documentation of the topics that the platform does not
   have yet, when the platform has them.

---

## 10. The release, and what it was checked with

The release is a commit of `main`, and it was put out in the order the
runbook asks for: the tests, the CI, the push, the backup, the build, the
restart, and the checks of the running system.

| What | How it was checked | The result |
|---|---|---|
| the suite of the API | `scripts/run-tests.sh` on the machine of the release | 106 files, **1014 tests passed**, 6 skipped, exit 0 |
| the suite of the frontend | the same runner, `node --test` | **304 tests passed**, exit 0 |
| the chain of the payments | `tests/stripe-sandbox-live.test.ts` with the keys of the sandbox | **6/6** — a checkout really paid, a refund really made, nothing written twice |
| the types | `tsc --noEmit` for the API, for the tests and for the frontend | no error |
| the content of the documentation | `scripts/validate-docs.mjs` | structure ok, links ok, terminology ok, catalog skipped |
| the secrets of the history | `gitleaks` over the whole history | no finding outside the files of `.env`, which are ignored by git |
| the CI | the seven jobs of the workflow, on the commit of the release | **7/7 green** |
| the backup of the clients | `scripts/backup.sh` before the restart | `blipmade-pre-release-cf3274c-20261026T211152Z.tar.gz`, sha256 `e2681c44…a22f` |
| the copy that leaves the host | `scripts/backup-offsite.sh` | encrypted, read back, verified on the target, 100801 bytes |
| the migrations | `scripts/apply-migrations.sh` | 17 applied, **0 pending, 0 failed** |
| the data of the clients | the tables of the live database | 4 users, 10 orders, 5 products, 5 payments, 5 invoices, 5 instances, 731 audit records, 25 sessions |
| the containers | `docker compose ps` | **5/5 healthy** |
| the commit that runs | the label of the images, read with `docker inspect` | `cf3274ce5548b3a27f139daa181233e0a6714ca1` on the API, on the worker and on the web |
| the live platform | `scripts/smoke-production.sh` | **31/31**, nothing failed |
| the documentation | a real browser, on 390px, 768px and 1440px | **no problem** — the navigation, the search, the anchors, the links, the keyboard and the landmarks are all there |

**The commit that runs is read, not guessed.** The images carry the commit
they were built from as a label, so the state of the production is a fact
that anyone can read:

```bash
docker inspect blipmade-api blipmade-worker blipmade-web \
  --format '{{index .RepoTags 0}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

Before this release the label did not exist, and the state of the production
had to be concluded from the working tree. That is now a one-line check, and
the runbook (section 10) says so.

**Nothing was forced.** `main` went from `1214c4b` to the commit of the
release with a fast-forward, with no force-push, no `migrate reset` and no
seed. The branches and the worktrees that hold the deferred work (the
Prisma 7 and the Stripe 23 bumps, the scripts of the performance) were left
exactly where they were.
