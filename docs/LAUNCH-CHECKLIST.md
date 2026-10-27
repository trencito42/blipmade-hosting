# The launch checklist

Everything that is left for the launch, in the order it has to be done. Each
step says who does it and how to check that it worked. Nothing here holds a
secret, and no step of this file has been applied to the production
environment.

## 1. The live keys of Stripe — the operator

The payments run on the sandbox until this step is done. The three keys are
read from the standard input, so they never appear in the list of the
processes and never in the history of a shell.

On the machine that runs the platform (`/opt/blipmade`):

```bash
printf '%s\n' "$STRIPE_SECRET_KEY" "$STRIPE_PUBLISHABLE_KEY" "$STRIPE_WEBHOOK_SECRET" \
  | ./scripts/apply-stripe-live.sh
```

The script refuses a sandbox key, keeps a copy of the `.env` before it writes,
writes the three keys and `PAYMENTS_ENABLED=true` in one go and restarts the
api and the worker. It prints nothing that holds a key.

The webhook of Stripe has to answer on the platform:

```
https://<the host of the platform>/api/webhooks/stripe
```

The events that matter are `checkout.session.completed`,
`invoice.paid`, `invoice.payment_failed` and `charge.refunded`. The secret of
the webhook is the one that was given to the script.

To check it afterwards:

```bash
curl -sS https://<the host of the platform>/api/health | jq
```

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

## 5. The webhook of Discord — the operator

The platform sends the alarms of the operations to a webhook of Discord. The
address is a secret, and it is **not** in the `.env`: it is written in a file
that only the owner of the machine can reach (the directory is `0700`, the file
is `0444` and it is mounted in the containers read only), and the platform is
told where that file is. The address therefore travels neither with the rest
of the environment nor with a copy of the configuration.

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
