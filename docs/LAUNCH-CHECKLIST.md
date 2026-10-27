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

The server of the operator checks the sender against its own mailbox table,
and `no-reply@blipmade.com` is not in it. The fix is on `mail.xodo.ro`, in
the configuration of Postfix:

```
# main.cf
smtpd_reject_unlisted_sender = no
```

and then `postfix reload`. The other way is to add `no-reply@blipmade.com` to
the virtual mailbox table of that server. Gmail accepts the messages of the
platform, so the platform itself is not the problem.

**The domain of the platform has no mail of its own.** `blipmade.com` has no
MX record, so nothing that is sent from it can be answered, and the alerts of
the platform (`ops.*`) land in a local mailbox of the server of the operator
and stay there. The records that are needed:

| Record | Value | Where |
| --- | --- | --- |
| MX | the host of the mail of the platform | DNS of the domain |
| DKIM | the key of the domain in Mailcow | DNS of the domain |
| PTR | the host of the mail | the provider of the address |

The value of the DKIM is taken from the interface of Mailcow: **Domains →
blipmade.com → DKIM**. The record that exists today does not hold the key of
Mailcow.

## 4. The addresses of the customers — the operator

The wildcard `*.apps.blipmade.com` must point at the edge of the platform
(`A 193.34.214.143`, DNS only, not proxied) and the certificate of the edge
has to cover it. Until that is done, the address of a customer is not served
over HTTPS and the instance is reached on its own address.

## 5. The webhook of Discord — the operator

The platform sends the alarms of the operations to a webhook of Discord. The
address is a secret, and it is **not** in the `.env`: it is written in a file
that only the owner of the machine can read, and the platform is told where
that file is. The address therefore travels neither with the rest of the
environment nor with a copy of the configuration.

The address is read from the standard input, so it never appears in the list
of the processes and never in the history of a shell:

```bash
printf '%s' "$WEBHOOK" | ./scripts/set-discord-webhook.sh
```

The script refuses an address that is not a webhook of Discord, writes the
file with the rights of a secret, points the platform at it, restarts the api
and the worker and sends a test message **with the code of the platform
itself**, so a message that arrives proves that the alarms arrive too. It
prints the host of the channel and never the address.

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
