# Blipmade — the mail of the platform

Everything the platform sends to a customer goes through one place: `api/src/lib/mailer.ts`.
The messages are built by `api/src/lib/email-templates.ts`, the delivery is done by Nodemailer
against the relay of `SMTP_URL`, and the state of every message is known.

This document is for the operator. It says what has to be configured, what has to be added to the
DNS of `blipmade.com`, how to check that it works, and what to do while no relay is configured.

Nothing in this document is a real credential. Every value that has to be replaced is written as
`<PLACEHOLDER>`.

---

## 1. There is no mail server

The platform runs **no mail server of its own**. There is no Postfix, no Exim, no Dovecot and no
container that talks SMTP to the internet. Nodemailer speaks to the relay of a provider, and the
relay does the delivery.

| what | where |
|---|---|
| the transport | `api/src/lib/mailer.ts` (Nodemailer, one `Transporter` for the whole process) |
| the messages | `api/src/lib/email-templates.ts` (inline HTML + a plain-text alternative) |
| the queue | `api/src/services/queue.ts` (`blipmade.email`, BullMQ, the same Redis as the rest) |
| the worker | `api/src/worker.ts` (`createEmailWorker`) |
| the settings | `api/src/env.ts` (`SMTP_URL`, `MAIL_FROM`, `MAIL_SUPPORT_EMAIL`, `PUBLIC_WEB_URL`, `BACKUP_DIR`) |

`SMTP_URL` is used **as it is**. Both providers work without another setting:

```bash
# Brevo
SMTP_URL=smtp://<SMTP_LOGIN>:<SMTP_KEY>@smtp-relay.brevo.com:587

# Resend
SMTP_URL=smtp://resend:<RESEND_API_KEY>@smtp.resend.com:465
```

Two details are handled by the code, so the operator does not have to think about them:

- The port **465** is an encrypted connection from the start. Nodemailer reads `smtp://` as a plain
  connection, so the transport of the platform turns on the encryption for that port.
- The password of the relay is never written to a log line, to an error message or to a file. It
  only exists in `SMTP_URL` in the `.env` of the deployment.

An empty `SMTP_URL` is a valid configuration: the messages are then written to a file instead of
being sent (see [section 7](#7-while-no-relay-is-configured)). The platform never claims that a
message was sent when it was only written to a file.

---

## 2. The states of a message

Every message carries a state. The state is never guessed: it is the answer of the transport.

| state | what it means |
|---|---|
| `queued` | the message is on the queue and waits for the worker. |
| `delivered` | the relay took the message. This is the only state that means "sent". |
| `written-to-file` | the message was written to `BACKUP_DIR/mail`. **Nobody received it.** |
| `failed` | the attempt failed. The class of the failure and the number of attempts are kept. |

The API answers accordingly. While the relay is not configured, the answer of the endpoints that
trigger a message says so:

> Email delivery is not configured yet. Please contact support to confirm your email address.

The answer never depends on whether an account exists, so it can never be used to find out who has
an account.

---

## 3. The operator steps — Brevo

1. **Create the account** on <https://www.brevo.com> and verify the sending domain
   **blipmade.com** (`Senders & Domains` → `Domains` → `Add a domain`).
2. **Copy the records** that Brevo shows on that page:
   - the **DKIM** record (`TXT`, host `<SELECTOR>._domainkey` — the selector is written on the
     page of Brevo, it is often `mail`),
   - the **Brevo code** (`TXT`, host `brevo-code`),
   - the **three MX records** (`mx1`, `mx2`, `mx3` of `sendinblue.com`).
3. **Add them to the DNS of `blipmade.com`** — add, never replace. See
   [section 5](#5-the-dns-records-add-only).
4. **Check the sender identity.** Brevo only sends from an address whose domain is verified.
   The platform sends from `MAIL_FROM`, so that address has to be the verified one:
   `no-reply@blipmade.com`.
5. **Create the SMTP key**: `Senders & Domains` → `SMTP & API` → `SMTP` → `Generate a new SMTP key`.
   The login and the password are the key itself, unless the account has a separate login.
6. **Put the URL in the `.env` of the deployment**:

   ```bash
   SMTP_URL=smtp://<SMTP_LOGIN>:<SMTP_KEY>@smtp-relay.brevo.com:587
   MAIL_FROM=Blipmade <no-reply@blipmade.com>
   MAIL_SUPPORT_EMAIL=support@blipmade.com
   PUBLIC_WEB_URL=https://blipmade.com
   ```

7. **Restart the API and the worker**, otherwise they keep the old configuration:

   ```bash
   cd /opt/blipmade
   DC="docker compose -f compose.yml -f compose.api.yml -f compose.web.yml"
   $DC up -d --force-recreate api worker
   ```

8. **Check the health endpoint** (see [section 8](#8-how-to-check-that-it-works)).

---

## 4. The operator steps — Resend

1. **Create the account** on <https://resend.com> and add the domain **blipmade.com**
   (`Domains` → `Add Domain`).
2. **Copy the records** that Resend shows on that page:
   - the **three DKIM CNAME records** (`resend._domainkey`, `rp1._domainkey`, `rp2._domainkey`),
   - the **feedback MX record** (`feedback-smtp.us-east-1.amazonses.com`).
3. **Add them to the DNS of `blipmade.com`** — add, never replace. See
   [section 5](#5-the-dns-records-add-only).
4. **Check the sender identity.** Resend only sends from a domain that is verified. The platform
   sends from `MAIL_FROM`, so that address has to be under the verified domain:
   `no-reply@blipmade.com`.
5. **Create the API key**: `API Keys` → `Create API Key`, with the permission **Sending**. The
   key starts with `re_`.
6. **Put the URL in the `.env` of the deployment**:

   ```bash
   SMTP_URL=smtp://resend:<RESEND_API_KEY>@smtp.resend.com:465
   MAIL_FROM=Blipmade <no-reply@blipmade.com>
   MAIL_SUPPORT_EMAIL=support@blipmade.com
   PUBLIC_WEB_URL=https://blipmade.com
   ```

7. **Restart the API and the worker**:

   ```bash
   cd /opt/blipmade
   DC="docker compose -f compose.yml -f compose.api.yml -f compose.web.yml"
   $DC up -d --force-recreate api worker
   ```

8. **Check the health endpoint** (see [section 8](#8-how-to-check-that-it-works)).

### The sender identity

Both providers check the domain of the sender. The platform sends everything from one address:

```bash
MAIL_FROM=Blipmade <no-reply@blipmade.com>
```

That address has to be under `blipmade.com` and under the domain that is verified at the
provider. `support@blipmade.com` is a different thing: it is the inbox that receives the
notifications about the support tickets (`MAIL_SUPPORT_EMAIL`). It does not have to be the sender.

Every link of every message is built from `PUBLIC_WEB_URL`, so the links of a mail never point at
the loopback address of the server:

```bash
PUBLIC_WEB_URL=https://blipmade.com
```

---

## 5. The DNS records (add only)

> ### ⚠️ The MX record of the domain must be preserved, never overwritten
>
> `blipmade.com` already receives mail. The MX records that are there now are what delivers it.
>
> **Brevo and Resend both ask for MX records on the sending domain.** Those records are *added*
> to the domain. The existing ones are **kept**.
>
> * Never delete an existing MX record.
> * Never paste the record of the provider over the existing one — the two live side by side.
> * Give the record of the provider a priority number that is not in use yet, so the mail that
>   arrives today keeps its own route.
> * Replacing the MX record of the domain breaks the mail that works today, and with it the
>   bounces and the replies of the platform.

Check what is there before anything is changed, and check again afterwards:

```bash
dig MX blipmade.com +short
```

The old records have to be in both answers.

### SPF — one record, merged

A domain may only have **one** SPF record. A second `v=spf1` record makes the check fail with
`permerror` and the mail is refused. So the value of the provider is **added to the existing
value**, and the record is never added a second time.

If the domain has no SPF record yet, this is the whole record:

```dns
; Brevo
blipmade.com. 3600 IN TXT "v=spf1 include:brevo.com ~all"

; Resend
blipmade.com. 3600 IN TXT "v=spf1 include:amazonses.com ~all"
```

If the domain already has one, merge into it, for example:

```dns
; the existing record keeps its own includes
blipmade.com. 3600 IN TXT "v=spf1 include:<EXISTING_INCLUDE> include:brevo.com ~all"
```

Check that there is exactly one:

```bash
dig TXT blipmade.com +short
```

### DKIM — the record of the provider

The selector and the key are shown by the provider. They are copied into the DNS **as they are**;
the existing DKIM records of the domain are not touched.

```dns
; Brevo — the selector is the one on the page of Brevo (often "mail")
<SELECTOR>._domainkey.blipmade.com. 3600 IN TXT "v=DKIM1; k=rsa; p=<DKIM_PUBLIC_KEY>"

; Resend — three CNAME records
resend._domainkey.blipmade.com. 3600 IN CNAME resend._domainkey.amazonses.com.
rp1._domainkey.blipmade.com.    3600 IN CNAME rp1._domainkey.amazonses.com.
rp2._domainkey.blipmade.com.    3600 IN CNAME rp2._domainkey.amazonses.com.
```

### DMARC — one record

A domain may only have one DMARC record. Start with `p=none`, so the reports are collected but
nothing is refused. Move to `quarantine` and then to `reject` only when the SPF and the DKIM are
aligned and the reports show no problem.

```dns
_dmarc.blipmade.com. 3600 IN TXT "v=DMARC1; p=none; rua=mailto:dmarc@blipmade.com; fo=1"
```

`dmarc@blipmade.com` has to be an address that somebody reads: it receives the aggregate reports
of the domain.

---

## 6. How to check that it works

**No real delivery test is possible until `SMTP_URL` is set.** While the variable is empty the
messages are written to a file and nobody receives anything, so a test of the delivery says
nothing about the relay.

### The checklist

| # | check | command | what a good answer looks like |
|---|---|---|---|
| 1 | the DKIM selector | `dig TXT <SELECTOR>._domainkey.blipmade.com +short` | the public key of the provider. For Resend: `dig CNAME resend._domainkey.blipmade.com +short` shows the target of the provider. |
| 2 | the SPF | `dig TXT blipmade.com +short` | **exactly one** record, and it holds the include of the provider (`include:brevo.com` or `include:amazonses.com`). |
| 3 | the DMARC | `dig TXT _dmarc.blipmade.com +short` | one record that starts with `v=DMARC1`. |
| 4 | the MX | `dig MX blipmade.com +short` | the records that were there before **and** the record of the provider. |
| 5 | the alignment | send a real message and read its headers | the `Authentication-Results` header of the received message shows `spf=pass`, `dkim=pass` and `dmarc=pass`. The domain of the `From` (`blipmade.com`) is the same as the `d=` of the DKIM signature. |
| 6 | the placement | send a real message | the message is in the **inbox**, not in the spam folder. The log of the provider (`Transactional email log` at Brevo, `Logs` at Resend) shows the message as delivered. |

A real message is sent by registering an account with an address that receives mail:

```bash
curl -s -X POST http://127.0.0.1:3100/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"<A_REAL_INBOX>","password":"<A_PASSWORD>","firstName":"Test","lastName":"Operator"}'
```

### The health endpoint

```bash
curl -s http://127.0.0.1:3100/health
```

| field | meaning |
|---|---|
| `mail` | `smtp` when `SMTP_URL` is set, `file` when it is empty. `file` means **nothing is delivered**. |
| `mailDelivery` | The summary of the deliveries: the transport, whether a relay is configured, and how many messages are queued, delivered, written to a file or failed. |

The worker has its own health port, and it carries the state of the messages it sent:

```bash
curl -s http://127.0.0.1:3101/health
```

```json
{ "status": "ok", "database": true, "redis": true, "worker": true, "mail": "smtp", "email": { "queued": 0, "delivered": 3, "writtenToFile": 0, "failed": 0 } }
```

---

## 7. While no relay is configured

This is the configuration of the platform today: `SMTP_URL` is empty. The messages are then
written to `BACKUP_DIR/mail` and the API says so instead of pretending that a message was sent.

### What the operator sees in the file

One file per message, named `<timestamp>-<8 characters of a hash>.json`:

```json
{
  "state": "written-to-file",
  "transport": "file",
  "reference": "verification-1a2b3c4d",
  "from": "Blipmade <no-reply@blipmade.com>",
  "to": "customer@example.com",
  "subject": "Confirm your Blipmade email address",
  "text": "Hi Ada,\n\nConfirm your email address to activate your Blipmade account:\nhttps://blipmade.com/verify-email?token=[redacted]\n...",
  "html": "<!doctype html>...",
  "date": "2026-10-23T01:20:00.000Z",
  "note": "The link of this message was removed on purpose: this file cannot be used to sign in. Ask for a new message instead."
}
```

| what | why |
|---|---|
| the name of the file holds no token | the name of a file ends up in a log and in a backup. |
| the link in the message holds `[redacted]` | the file cannot be replayed: it cannot confirm an address or set a password. |
| the `reference` | the short hash of the message. It is the same reference as in the log line and it points at the row in the database. |

The same reference is in the log of the API, without the token:

```text
[mail:file] verification message written for customer@example.com (reference 1a2b3c4d)
```

### Finishing a flow by hand

The token is never written down — not in a log, not in a file, not in the name of a job — so the
operator does not need it and cannot read it. The flow is finished without it:

- **A verification**: set `emailVerifiedAt` on the row of the account and delete the row of the
  `VerificationToken` that belongs to it. The account is then usable.
- **A password reset**: write a new password hash on the row of the account, in the format of
  `api/src/lib/password.ts` (`scrypt$16384$8$1$<salt>$<hash>`), and end the sessions of that
  account. The customer is then asked for the new password.
- **The cleaner way**: configure the relay. The customer asks for a new message, and it arrives
  in the inbox.

---

## 8. The rules of the platform about the mail

### A token is never written down

| never | always |
|---|---|
| a token in a log line | the first eight characters of the hash of the token (`tokenReference`) |
| a token in an error message | the class of the failure (`SmtpError`, `Error/ENOTDIR`, …) |
| a token in the name of a job | a hash of the key of the message |
| a token in the name of a file | a timestamp and a hash |
| a token in the file of the file transport | `[redacted]` in the link |

### Every link leaves through the public origin

The links of a message are built by `publicLink()` in `api/src/lib/email-templates.ts`, and that
helper only knows `PUBLIC_WEB_URL`. The host of a request is never used, so a customer can never
be sent to `127.0.0.1`, to `localhost` or to a staging host. The same helper builds the link of
the message and the link that is written in the code, so the two can never drift apart.

### A retry never sends a message twice

A message has a key. The queue uses it as the name of the job, so the same message is never
queued twice, and the platform remembers what it already delivered, so a retry of a job that was
already sent does not send it again.

A message that keeps failing is tried four times with a growing pause. After that it stays in the
failed state of the queue, where it can be read.

### The state of the messages can be read

The state of every message the platform knows about is readable by the staff:

```bash
curl -s http://127.0.0.1:3100/api/admin/email/delivery -H 'Cookie: bm_session=<A_SESSION>'
```

It shows, per message, the state, the number of attempts, the class of the last failure and the
times. It never shows the body of a message, a token or a credential, and it is only readable by
a member of the staff with the permission `settings.read`.

---

## 9. What is still missing

- **The state of the messages lives in the memory of the process.** It is lost when the API or the
  worker restarts, and the API and the worker do not share it. A table of the platform would fix
  that: `MailDelivery` with the key of the message, the kind, the address, the state, the number
  of attempts, the class of the last failure and the times. It would also keep the history of
  the messages, which is what a customer asks for when a message is missing. The schema of the
  platform is not changed by this work.
- **The notifications of the invoices and of the services are not wired yet.** The messages
  themselves exist (`invoicePaidTemplate`, `invoiceFailedTemplate`,
  `subscriptionChangedTemplate`, `instanceProvisionedTemplate`, `instanceStoppedTemplate`), and
  the helpers that send them (`notifyInvoicePaid`, `notifyInvoiceFailed`,
  `notifySubscriptionChange`) are ready. The events of the payment provider and of the
  provisioning have to call them.
- **The notifications of the tickets are still plain.** The templates exist
  (`ticketCreatedTemplate`, `ticketReplyTemplate`, `supportTicketTemplate`), but the route of
  the tickets still sends a message without a brand.
