# The hosted mail

The platform can host the mail of a customer on the Mailcow of the operator.
This document says what the platform offers today, what it does not offer
yet, and what has to happen before the mail can be sold.

## What exists today

Three plans exist in the catalog of the platform. They are written by the
seed (`api/prisma/seed.ts`), and their shape lives in
`api/src/lib/mail-plan-drafts.ts`, because the same shape is needed by the
seed, by the tests and by the back office.

| Plan | Domains | Mailboxes | Aliases | Forwarding | Space of the plan | Space of a mailbox | Sending limit |
|---|---|---|---|---|---|---|---|
| `email-hosting-starter` | 1 | 2 | 20 | 3 | 512 MB | 256 MB | 100 messages / hour |
| `email-hosting-plus` | 2 | 5 | 50 | 6 | 5120 MB | 512 MB | 250 messages / hour |
| `email-hosting-business` | 3 | 10 | 100 | 10 | 30720 MB | 1024 MB | 500 messages / hour |

The ladder is the same in every column: the bigger the plan, the more it
holds. Every number is under the ceiling of the platform, which is the
default of the environment today: three domains, ten mailboxes and a hundred
aliases for a domain, a thousand and twenty four megabytes for a mailbox, ten
thousand two hundred and forty megabytes for a domain and five hundred
messages for an hour.

A plan that was still there under an old name is renamed instead of being
written a second time, so a plan that the operator has already put on sale
keeps its address.

## What is NOT there

**No price.** A price that the platform invented would be an offer, and an
offer that nobody decided is not an offer. The three plans have no
`ProductPrice` row, and the catalogue says so.

**No sale.** The three plans are written with `visible: false` and
`deployable: false`:

- `visible: false` keeps them out of the public catalogue.
- `deployable: false` makes the order refuse. The catalogue, the quote and
  the order all refuse the same way, so there is no path by which a customer
  can order a plan that is not ready.

The sale of the mail is closed by `MAIL_SALES_ENABLED`, which is off by
default and is read at the moment it is asked for, so it can be opened and
closed without a restart.

## What has to happen before the mail is sold

In this order, because each one unblocks the next.

1. **The name of the mail server in the public DNS.** `mail.blipmade.com` has
   to point at the machine of the mail, as a record that is **not** proxied
   by Cloudflare. A name that is proxied does not serve SMTP, and the
   certificate of the server cannot be issued for it.
2. **The certificate of the mail server**, so that the clients of the
   customers do not see a warning. The relay of the platform verifies the
   certificate of the mail server against the certificate that the operator
   wrote down (`SMTP_CA_FILE`); the verification is never turned off.
3. **The price of every plan**, written in the back office. The price is a
   decision of the operator and it is not invented.
4. **The backup of the mail.** The mail of the customers is in the Mailcow
   and not in the backup of the platform. `scripts/backup-mail.sh` exists for
   it, and it has to run and be proved.
5. **The restore of the mail**, proved the same way.
6. **The payment of the mail**, proved with a real order and a real payment,
   with the webhooks of the provider answering.
7. **The provisioning of the mail**, proved from the order to the mailbox
   that receives the first message.
8. **Then, and only then:** `deployable: true`, `visible: true` and
   `MAIL_SALES_ENABLED=true`.

## What is watched

The plans of the mail are part of the health of the platform: the sweep
checks the certificate of the mail server, the delivery of the messages and
the mail server itself, and it says so in `/admin/ops`. See
`docs/OPERATIONS-HEALTH.md`.
