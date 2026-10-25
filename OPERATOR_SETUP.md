# The setup of the operator

This file is the list of the things that only the operator can do, written so
that each one can be done without guessing. Every variable is here with its
place, its format and the way to check it. **No real secret is written here,
and none of these steps has been applied to the production environment.**

The system of the notifications is described in `docs/NOTIFICATION_SYSTEM.md`.
When a message does not arrive, the runbook is `docs/EMAIL_DELIVERY_RUNBOOK.md`.

---

## 1. What is already done, and what is not

| Piece | State |
|---|---|
| The engine, the outbox, the templates, the centre of the customer, the back office | **Done**, on the branch `feature/email-commerce` |
| The tests | **Done** — the suite of the API and the suite of the web are green |
| The production deployment | **Not done.** The production tree is still at the commit it was, with no change of the environment |
| The relay of the platform | **Not configured.** `SMTP_URL` is empty in `/opt/blipmade/.env` |
| The mail of the platform in Mailcow | **Not configured.** The operator adds it personally |

Until the relay is configured, every message of the platform is **written to a
file on the server** and nobody receives it. The back office says so in
words: *"The relay is not configured. The messages are written to files on the
server — nothing is being sent to anybody."*

---

## 2. The mail of the platform in Mailcow

**The operator does this part personally.** The platform never writes in the
mail system of the operator and never creates a mailbox without being told.

1. On the machine of the mail (`blipmade-mail`, `10.77.0.14`), open Mailcow
   at `https://mail.blipmade.com`.
2. **Mail Domains → Add domain**: `blipmade.com`.
3. **Mailboxes → Add mailbox**: `no-reply@blipmade.com` with a password the
   operator chooses. The platform sends in the name of this mailbox, so this
   mailbox has to exist before anything is sent.
4. Create the inboxes the platform writes to:
   * `support@blipmade.com` — the support of the customers,
   * `billing@blipmade.com` — the money, if the operator wants it apart,
   * `operator@blipmade.com` — the alarms of the platform, on the address of
     the operator and not on the address of the mail system, so the alarm
     still arrives when the mail system is the thing that is broken.
5. Keep the password of `no-reply@blipmade.com` out of the git, out of the
   chat and out of the screenshots. It goes into the environment of the
   platform and nowhere else.

### The DKIM

Mailcow makes the key of the domain when the domain is added. The operator
publishes it in the DNS of `blipmade.com`:

| Name | Type | Value |
|---|---|---|
| `dkim._domainkey.blipmade.com` | TXT | the public key that Mailcow shows, in the format `v=DKIM1; k=rsa; p=…` |

The record is checked with:

```bash
dig +short TXT dkim._domainkey.blipmade.com @1.1.1.1
```

The platform never writes the DNS of a domain of a customer. It writes only
its own.

---

## 3. The variables of the platform

**Where:** `/opt/blipmade/.env` on the machine of the platform (`10.77.0.13`).
The file is never committed and never copied to another machine.

| Variable | Format | Value now | Meaning |
|---|---|---|---|
| `SMTP_URL` | `smtp://<user>%40<domain>:<password>@<host>:587` | empty | The relay. **Empty means the file transport** |
| `SMTP_CA_FILE` | the path of a file in PEM | empty | The certificate of the relay, when the machine does not trust it |
| `SMTP_TIMEOUT_MS` | a number of milliseconds, 1000 to 120000 | 15000 | How long the platform waits for the relay |
| `SMTP_RATE_LIMIT_PER_MINUTE` | a number, 1 to 10000 | 120 | How many messages the platform sends a minute |
| `MAIL_FROM` | `Name <address@domain>` | `Blipmade <no-reply@blipmade.com>` | The sender of every message |
| `MAIL_SENDER_NAME` | a word or two | `Blipmade` | The label the customer reads next to the address |
| `MAIL_REPLY_TO` | an address, or empty | empty | Where the answers go. Empty means they go back to the sender |
| `MAIL_SUPPORT_EMAIL` | an address | `support@blipmade.com` | The inbox of the support of the customers |
| `MAIL_OPERATOR_EMAIL` | an address | empty | The inbox of the alarms of the platform |
| `MAIL_BILLING_EMAIL` | an address | empty | The inbox of the money, when it is apart |
| `MAIL_HELP_EMAIL` | an address | empty | The address the customer may write to when a message is wrong |

The example of the format of `SMTP_URL`, with a placeholder and never a real
secret:

```
SMTP_URL=smtp://no-reply%40blipmade.com:<the password of the mailbox>@mail.blipmade.com:587
```

The address of the mailbox is encoded (`%40` is `@`), because the URL of a
mailbox with an `@` in it is not parsed by every client. The port is 587 and
the connection is made with STARTTLS.

### How to check that the variable is right, before it is used

```bash
# The password is never shown: only the shape of the URL.
grep '^SMTP_URL=' /opt/blipmade/.env | sed 's#//[^@]*@#//<hidden>@#'
```

The answer has to look like `SMTP_URL=smtp://no-reply%40blipmade.com:<hidden>@mail.blipmade.com:587`.

---

## 4. The deployment

The production environment is **not** touched by the implementation. When the
operator approves the deployment, the steps are:

```bash
# 1. The branch is brought to the machine of the platform.
cd /home/debian/wt-mail && git fetch origin && git checkout feature/email-commerce && git pull

# 2. The environment is written by hand, with the values of §3.
#    SMTP_URL is written here for the first time.

# 3. The migration of the database is applied. It adds the tables of the
#    outbox and of the centre of the notifications, and the columns of the
#    preferences. It adds nothing and removes nothing.
docker compose run --rm api npx prisma migrate deploy

# 4. The API and the worker are restarted. The worker is the process that
#    empties the outbox, so it has to be up for the messages to go out.
docker compose restart api worker

# 5. The state of the containers.
docker compose ps
```

**The rollback** is the same tree and the same environment: the migration
only adds tables and columns, so the platform works with them and without
them. If the deployment has to be undone, the branch goes back to the commit
it was, and the messages that are in the outbox stay there until the worker
comes back.

---

## 5. The check that the relay works

After the restart, and **before** any message goes to a real customer:

```bash
# 1. The relay answers.
docker compose exec api node -e "
  const {env}=await import('./dist/env.js');
  console.log(env.SMTP_URL ? 'configured' : 'not configured');"

# 2. The state of the transport, read from the platform itself.
curl -sS https://blipmade.com/api/admin/email/delivery -H "Cookie: …" | jq '.email.configured'
```

The test message of the back office is the real proof: `/admin/notifications`
→ the panel **Templates** → **Send a test message**, with the address of the
operator and the template `account-welcome`. The answer of the platform says
in words what happened: `delivered` with the id of the message of the relay,
or `written-to-file` with the notice that nobody received it.

---

## 6. The six tests of the sending

They are run by the operator, with the addresses of the operator. **No test
sends anything to the address of a customer.**

| # | What it proves | How | Where it goes |
|---|---|---|---|
| 1 | The confirmation of the address | Register an address of the operator and open the message | The address of the operator |
| 2 | The reset of the password | Ask for a reset with the address of the operator | The address of the operator |
| 3 | The order and the payment | Create an order with the test gateway of the operator | The address of the operator |
| 4 | The building of a service | The same order, with a service of the catalogue | The address of the operator |
| 5 | The support | Open a ticket with the address of the operator | The address of the operator |
| 6 | The operation of the platform | The test message of the back office | The address of the operator |

After each one, the ledger of the deliveries has to show `delivered`, and the
row has to carry the id of the message of the relay.

```bash
psql "$DATABASE_URL" -c "
  SELECT kind, \"to\", state, transport, id, \"deliveredAt\"
  FROM \"MailDelivery\" ORDER BY \"updatedAt\" DESC LIMIT 10;"
```

---

## 7. The lists that are checked before the deployment

- [ ] The suite of the API is green (the number of the tests is in the report
      of the phase).
- [ ] The suite of the web is green.
- [ ] `gitleaks` finds nothing in the files of the phase.
- [ ] The migration is applied and `prisma migrate diff` finds no difference.
- [ ] The production tree is still at the commit it was, until the operator
      approves the deployment.
- [ ] `PAYMENTS_ENABLED` is still `false` and the keys of Stripe are still
      empty.
- [ ] `SMTP_URL` is written down in the environment of the platform and
      nowhere else.

---

## 8. The list of the variables, in one place

```bash
# The shape of the environment of the platform after the setup.
# The value of the password is never written in a file that leaves the machine.
SMTP_URL=smtp://no-reply%40blipmade.com:<the password>@mail.blipmade.com:587
SMTP_CA_FILE=
SMTP_TIMEOUT_MS=15000
SMTP_RATE_LIMIT_PER_MINUTE=120
MAIL_FROM="Blipmade <no-reply@blipmade.com>"
MAIL_SENDER_NAME=Blipmade
MAIL_REPLY_TO=support@blipmade.com
MAIL_SUPPORT_EMAIL=support@blipmade.com
MAIL_OPERATOR_EMAIL=operator@blipmade.com
MAIL_BILLING_EMAIL=billing@blipmade.com
MAIL_HELP_EMAIL=support@blipmade.com
```
