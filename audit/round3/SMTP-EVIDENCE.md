# SMTP evidence — round three of the operational audit

* Date: 2026-10-24
* Branch: `fix/r3-ops` (based on `origin/main` = 106809c)
* Host: `debian@10.77.0.13`, worktree `/home/debian/wt-r3-ops`
* Everything below was run against an **isolated copy** of the platform. The
  live database, the live queue, the live containers and the files under
  `/opt/blipmade` were never written.

---

## 1. The short answer

| Question | Answer |
|---|---|
| Does the platform deliver a message over SMTP when `SMTP_URL` points at a relay? | **Proven.** A real message was captured by a local SMTP sink and the token inside it verified the account. |
| With `SMTP_URL` empty, does it fall back to the file transport and say so? | **Proven.** The API answers "Email delivery is not configured yet…", no message reaches a relay, and the report says `written-to-file`, never `delivered`. |
| Is the file transport bounded? | **Proven.** Both bounds (number of files, age of a file) were enforced in a live run and are quoted from the code. |
| What is still missing in production? | The relay. `SMTP_URL` is **empty** in `/opt/blipmade/.env`, so today the platform writes every message to a file and no mail has ever left the host. |

---

## 2. The isolated stack

The stack of this audit has its own database, its own index of Redis, its own
ports and its own directory:

```
$ cd /home/debian/wt-r3-ops && bash audit/_tools/r3-stack-up.sh
==> Creating the database blipmade_r3_ops_test
==> Applying every migration to it
      All migrations have been successfully applied.
==> Seeding the catalog and the administrator
Seeded 5 products.
Created administrator r3-admin@blipmade.test.
==> Starting the SMTP sink on port 2625
==> Starting the API on port 3113
==> Starting the web server on port 3013
==> Starting the worker on the same copy

==> The stack is up
    api  /health      -> 200
    api  /health/ready -> 200
    web  /healthz     -> 200
    database  : blipmade_r3_ops_test
    redis     : index 14
    mail      : transport smtp (smtp sink 127.0.0.1:2625 -> /tmp/blipmade-r3/smtp)
    gateway   : empty (CADDY_ADMIN_URL='')
    dns stub  : on
    files     : /tmp/blipmade-r3/logs
```

The rules of the isolation, and how they are kept:

* the database is `blipmade_r3_ops_test` — the name ends in `_test`;
* the index of Redis is 14 — the live queue is index 0 and was never touched;
* the ports are 3113 (api), 3013 (web), 2625 (sink), 2619 (Caddy stand-in) —
  the live ports are 3000 (web), 3100 (api), 5432, 6379;
* the environment of the platform is **read** from `/opt/blipmade/.env` and
  every variable that points at something is overridden afterwards; the keys
  of Stripe, of the panel and of the bridge are emptied, so the copy cannot
  reach them;
* the processes are stopped **by the port they listen on**
  (`ss -tlnp` → `kill <pid>`), never with a `pkill -f` pattern.

The tools are in `audit/_tools/` and are meant to be re-run:

| Tool | What it does |
|---|---|
| `audit/_tools/r3-stack-up.sh` | Brings the copy up (`--no-smtp`, `--with-caddy`, `--no-dns-stub`). |
| `audit/_tools/r3-stack-down.sh` | Takes it down, drops the test database, empties the index of Redis 14. |
| `audit/_tools/r3-mail-probe.mjs` | Registers a customer, waits for the message and prints the raw message and the report of the platform. |
| `audit/_tools/r3-dns-stub.mjs` | A stand-in for the resolver (only used for the proof of ownership of a hostname). |
| `audit/_tools/r3-caddy-admin-stub.mjs` | A stand-in for the administrative API of Caddy (used by the Caddy evidence). |
| `audit/_tools/r3-domain-probe.mjs`, `r3-seed-instance.mjs` | Used by the Caddy evidence. |
| `audit/_tools/r3-safe-head/head` | A `head` that survives a closed pipe (used to work around the defect found in `scripts/restore.sh`). |

---

## 3. PROVEN: the platform delivers a real message over SMTP

### 3.1 The message the relay received

```
$ cd /home/debian/wt-r3-ops && node audit/_tools/r3-mail-probe.mjs
=== what the platform says about its mail ===
  GET /api/health -> 200
  transport   : smtp
  configured  : true
  counts      : {"queued":0,"delivered":0,"writtenToFile":0,"failed":0}

=== the customer asks for a message ===
  POST /api/auth/register -> 201
  answer      : {"user":{"id":"cmvmx30vo0000dx95al3lat92","email":"r3-audit-customer@blipmade.test",...},
                 "mail":{"state":"queued","message":"A confirmation link is on its way to your email address."}}

=== the message the relay received ===
  file        : /tmp/blipmade-r3/smtp/message-0001.eml
  bytes       : 4814
  --- the raw message ------------------------------------------------
  | From: Blipmade <no-reply@blipmade.com>
  | To: r3-audit-customer@blipmade.test
  | Subject: Confirm your Blipmade email address
  | Message-ID: <44bc3eef-a88c-ccbf-4b32-998e40ab21f6@blipmade.com>
  | Date: Sat, 24 Oct 2026 21:34:46 +0000
  | MIME-Version: 1.0
  | Content-Type: multipart/alternative;
  |  boundary="--_NmP-5b3ac5c735ba99df-Part_1"
  |
  | ----_NmP-5b3ac5c735ba99df-Part_1
  | Content-Type: text/plain; charset=utf-8
  | Content-Transfer-Encoding: quoted-printable
  |
  | Blipmade
  |
  | Confirm your email address
  |
  | Hi R3 Audit, welcome to Blipmade. Confirm your email address to activate your account.
  |
  | The link works once and expires in 24 hours. If you did not create this account, ignore this message.
  |
  | Confirm my email address:
  | http://127.0.0.1:3013/verify-email?token=4W1ILM_lYoNSEM9MoZZqRZfJhtBZAAQdJsPhLEN6_Es
  |
  | —
  | Blipmade · http://127.0.0.1:3013
  | support@blipmade.com
```

The markers that make it the expected message: the recipient
`r3-audit-customer@blipmade.test` (the address that was registered), the
subject `Confirm your Blipmade email address`, the body text
`Confirm your email address` / `Hi R3 Audit, welcome to Blipmade.` and the
verification link that carries a token. The message was delivered by the
**worker**, through the queue: the report below shows the job as `completed`.

### 3.2 The token of the message really works

The token was taken out of the captured message and used against the API:

```
$ TOKEN=$(cat /tmp/blipmade-r3/token.txt)
$ curl -sS -X POST http://127.0.0.1:3113/api/auth/verify-email \
    -H "content-type: application/json" -d "{\"token\":\"$TOKEN\"}" -w "\n  HTTP %{http_code}\n"

  HTTP 204
```

A message that only looked right would not carry a token that the platform
accepts. It is the same message the relay received.

### 3.3 What the platform reports about the delivery

```
$ node audit/_tools/r3-mail-probe.mjs        # as the administrator
=== the report of the platform about the message ===
  POST /api/auth/login (administrator) -> 200
  GET /api/admin/email/delivery -> 200
  transport : smtp
  configured: true
  counts    : {"queued":0,"delivered":1,"writtenToFile":0,"failed":0}
  queue     : {"waiting":0,"active":0,"delayed":0,"completed":1,"failed":0}
  message   : kind=verification to=r3-audit-customer@blipmade.test state=delivered attempts=1 deliveredAt=2026-10-24T21:34:47.058Z
```

`state=delivered` with `transport=smtp` is only written when the relay took
the message (`api/src/lib/mailer.ts:622-636`).

---

## 4. PROVEN: with `SMTP_URL` empty the platform falls back to the file transport and says so

The same stack was started without a relay:

```
$ cd /home/debian/wt-r3-ops && bash audit/_tools/r3-stack-up.sh --no-smtp
==> The stack is up
    api  /health      -> 200
    api  /health/ready -> 200
    web  /healthz     -> 200
    database  : blipmade_r3_ops_test
    redis     : index 14
    mail      : transport file (smtp sink 127.0.0.1:2625 -> /tmp/blipmade-r3/smtp)
    gateway   : empty (CADDY_ADMIN_URL='')
```

### 4.1 The platform says that it cannot deliver

```
$ node audit/_tools/r3-mail-probe.mjs
=== what the platform says about its mail ===
  GET /api/health -> 200
  transport   : file
  configured  : false
  counts      : {"queued":0,"delivered":0,"writtenToFile":0,"failed":0}

=== the customer asks for a message ===
  POST /api/auth/register -> 201
  answer      : {..., "mail":{"state":"queued",
                 "message":"Email delivery is not configured yet. Please contact support to confirm your email address."}}

=== the message the relay received ===
  NO MESSAGE was received by the sink in /tmp/blipmade-r3/smtp
```

The words come from `api/src/lib/mailer.ts:755-771` (`mailNotice()` and
`registrationNotice()`): they depend only on the transport, never on whether
an account exists, and they never claim that a message was sent.

### 4.2 The message is written to a file, and the report says so

```
=== the report of the platform about the message ===
  GET /api/admin/email/delivery -> 200
  transport : file
  configured: false
  counts    : {"queued":0,"delivered":0,"writtenToFile":1,"failed":0}
  message   : kind=verification to=r3-audit-customer@blipmade.test state=written-to-file attempts=1 deliveredAt=2026-10-24T21:41:59.915Z

=== the file transport ===
  directory  : /tmp/blipmade-r3/logs/mail
  files      : 1
    1792878171240-c1e6658d.json  4469 bytes  mode 600
  --- the first file of the file transport -----------------------------
  | {
  |   "state": "written-to-file",
  |   "transport": "file",
  |   "reference": "verification-c7cf30b5",
  |   "from": "Blipmade <no-reply@blipmade.com>",
  |   "to": "r3-audit-customer@blipmade.test",
  |   "subject": "Confirm your Blipmade email address",
  |   "text": "... Confirm my email address:\nhttp://127.0.0.1:3013/verify-email?token=[redacted] ...",
  |   "date": "2026-10-24T21:42:51.240Z",
  |   "note": "The link of this message was removed on purpose: this file cannot be used to sign in. Ask for a new message instead."
  | }
```

Two things are worth reading here: the state is `written-to-file` and never
`delivered`, and the token of the link is replaced by `[redacted]`
(`api/src/lib/mailer.ts:574-575`), so the file on the disk cannot be used to
sign in. The file is written for the owner of the service only
(`mode 0o600`, `api/src/lib/mailer.ts:581`; the directory is `0o700`,
`api/src/lib/mailer.ts:558`).

---

## 5. PROVEN: the file transport is bounded

### 5.1 The bounds in the code

`api/src/lib/mailer.ts:335-361`

```ts
export const DEFAULT_MAIL_FILE_MAX_FILES = 500;

/** How long a file of the file transport is kept, in hours. */
export const DEFAULT_MAIL_FILE_MAX_AGE_HOURS = 72;

export function mailFileRetention(): MailFileRetention {
  return {
    maxFiles: numberFromEnv('MAIL_FILE_MAX_FILES', DEFAULT_MAIL_FILE_MAX_FILES),
    maxAgeMs: numberFromEnv('MAIL_FILE_MAX_AGE_HOURS', DEFAULT_MAIL_FILE_MAX_AGE_HOURS) * 60 * 60 * 1000,
  };
}
```

* **How many files**: `MAIL_FILE_MAX_FILES`, default **500**.
* **How long a file is kept**: `MAIL_FILE_MAX_AGE_HOURS`, default **72 hours**.
* A value that is not a positive number is ignored and the default is used
  (`numberFromEnv`, `api/src/lib/mailer.ts:348-354`), so a mistake in the
  configuration cannot remove everything at once.
* The pruning is called after every message that is written
  (`pruneWrittenFiles`, `api/src/lib/mailer.ts:537-543`).
* A file whose message the queue still has to deliver is **never** removed,
  whatever its age is (`api/src/lib/mailer.ts:466-527`), and when the state of
  the queue cannot be read, **nothing** is removed.
* The local archive of the platform keeps **14** days
  (`BACKUP_KEEP_DAYS`, `scripts/backup.sh`), and the off-site target keeps
  **14** copies (`OFFSITE_KEEP_COPIES`, `scripts/backup-offsite.sh`).

### 5.2 The bounds in a live run

The stack was started with small bounds so the bounds could be watched:

```
$ cd /home/debian/wt-r3-ops && MAIL_FILE_MAX_FILES=2 MAIL_FILE_MAX_AGE_HOURS=1 \
    bash audit/_tools/r3-stack-up.sh --no-smtp
```

Three customers asked for a message:

```
$ for n in one two three; do
    node audit/_tools/r3-mail-probe.mjs http://127.0.0.1:3113 r3-bound-$n@blipmade.test \
      | grep -E "POST /api/auth/register ->"
  done
  POST /api/auth/register -> 201
  POST /api/auth/register -> 201
  POST /api/auth/register -> 201

$ ls -l --time-style=+%H:%M:%S /tmp/blipmade-r3/logs/mail/
total 16
-rw------- 1 debian debian 4464 21:44:30 1792878270361-a1e3b5d4.json
-rw------- 1 debian debian 4466 21:45:01 1792878301096-e3577943.json
```

Three messages were written, **two files** are kept: the bound of the number
of files removed the oldest one.

The bound of the age was shown the same way — one file was made three hours
old and the next message removed it:

```
$ touch -d "3 hours ago" /tmp/blipmade-r3/logs/mail/1792878270361-a1e3b5d4.json
$ node audit/_tools/r3-mail-probe.mjs http://127.0.0.1:3113 r3-bound-four@blipmade.test
$ ls -l --time-style=+%Y-%m-%dT%H:%M:%S /tmp/blipmade-r3/logs/mail/
total 16
-rw------- 1 debian debian 4466 2026-10-24T21:45:01 1792878301096-e3577943.json
-rw------- 1 debian debian 4465 2026-10-24T21:45:36 1792878336972-a971df93.json
```

The file that was too old is gone, and the platform wrote the truth about it
in the database:

```
$ docker exec blipmade-postgres-1 psql -U blipmade -d blipmade_r3_ops_test \
    -c "SELECT key, state, transport, \"lastErrorClass\", \"lastError\" FROM \"MailDelivery\";"
          key          |      state      | transport | lastErrorClass |                                         lastError
-----------------------+-----------------+-----------+----------------+----------------------------------------------------
 verification-e663a22d | failed          | file      | MailFilePruned | The message was written to a file that was removed by the retention of the file transport.
 verification-273a797a | failed          | file      | MailFilePruned | The message was written to a file that was removed by the retention of the file transport.
 verification-990ebcf6 | written-to-file | file      |                |
 verification-0b72744b | written-to-file | file      |                |
```

---

## 6. What is still missing in production, and what the operator has to do

### 6.1 What is missing

`SMTP_URL` is **empty** in the environment of the platform:

```
$ for v in SMTP_URL MAIL_FROM; do
    line=$(grep -m1 "^$v=" /opt/blipmade/.env); val=${line#*=}
    printf "%-10s len=%s\n" "$v" "${#val}"
  done
SMTP_URL   len=0
MAIL_FROM  len=34
```

`api/src/env.ts:69` gives the variable its default (`''`) and
`api/src/env.ts:164` turns it into `mailEnabled`. With an empty value the
platform runs the file transport, so **no verification mail, no reset mail
and no notification has ever reached a customer**. The deployment report says
the same ("The mail is never delivered", `README.md:396-399`).

The relay itself is the only thing that is missing. The code of the delivery
path works — it was proven above with a real delivery.

### 6.2 The exact instruction for the operator

| What | Where | Expected format |
|---|---|---|
| `SMTP_URL` | `/opt/blipmade/.env` (read by the API and the worker through `env_file: .env` in `compose.api.yml`) | A URL that Nodemailer understands. The platform uses it as it is (`api/src/lib/mailer.ts:283-301`): `smtp://user:password@host:587` (STARTTLS) or `smtps://user:password@host:465` (implicit TLS, the port 465 is turned on automatically). The password has to be percent-encoded when it holds `@`, `:` or `/`. **No credential is written in this file on purpose.** |
| `MAIL_FROM` | `/opt/blipmade/.env` | The sender. It is already set to `Blipmade <no-reply@blipmade.com>` and it should be a sender the relay is allowed to use, with the SPF and DKIM of the domain. |
| `BACKUP_ALERT_EMAIL` (optional) | `/opt/blipmade/.env` | The inbox that receives the alarm of a failed backup. It only matters once a relay exists. |

After the variable is set, the containers have to be restarted, because the
environment is read when the process starts:

```
$ sudo docker compose -f /opt/blipmade/compose.yml -f /opt/blipmade/compose.api.yml \
    -f /opt/blipmade/compose.web.yml up -d api worker
```

### 6.3 How the operator verifies that the relay really works

1. **The transport must change.** The health endpoint names the transport:

   ```
   $ curl -s http://127.0.0.1:3100/health | jq '.mail, .mailDelivery.configured'
   "smtp"
   true
   ```

2. **A real message must be delivered.** Ask for a password reset for an
   address that exists and watch the report:

   ```
   $ curl -s -X POST http://127.0.0.1:3100/api/auth/forgot-password \
       -H 'content-type: application/json' -d '{"email":"<an address that exists>"}'
   $ # then, as the administrator:
   $ curl -s http://127.0.0.1:3100/api/admin/email/delivery | jq '.email.messages[0]'
   { "state": "delivered", "transport": "smtp", ... }
   ```

   `state` must be `delivered` and `transport` must be `smtp`. `written-to-file`
   means the relay is still not configured.

3. **The mail must arrive.** The customer receives a message whose link works
   once. The answer of the API never says that a message was sent (the
   answer is the same for an address that does not exist), so the arrival of
   the mail itself is the proof.

4. **The alarm of a failed backup must be able to leave the host.**
   `scripts/backup-alert.sh` sends the alarm by mail when `SMTP_URL` is set.
   As long as it is empty, the alarm only reaches the journal:

   ```
   $ cd /opt/blipmade && bash scripts/backup-alert.sh "the audit proved this"
   BACKUP-ALERT: The backup of the Blipmade platform failed on blipmade-platform at 2026-10-24T21:40:49Z: the audit proved this
   BACKUP-ALERT: no BACKUP_ALERT_WEBHOOK_URL and no SMTP_URL are configured,
   BACKUP-ALERT: the alarm was only written to the journal of the machine.
   ```

---

## 7. Defects found on this path

### 7.1 The report of the deliveries can contradict the database — MEDIUM

**Where:** `api/src/services/queue.ts:349-368` (the loop over the jobs of the
queue) inside `emailDeliveryReport()`.

The report is built from three sources: the rows of the database
(`queue.ts:311-323`), the memory of the API process (`queue.ts:325-337`) and
the jobs of the queue (`queue.ts:349-368`). The **job is written last and
overwrites the row of the database**. A finished job still carries the result
of the moment it was finished, so after the retention of the file transport
removed a file, the row of the database was correctly changed to `failed` /
`MailFilePruned` (proved in section 5.2) while the report still showed
`written-to-file`:

```
  message   : kind=verification to=r3-bound-one@blipmade.test state=written-to-file attempts=1 deliveredAt=2026-10-24T21:43:59.585Z
```

The operator would read "the message is on the disk" while the file is gone.

**Proposed fix:** in the loop over the jobs, do not overwrite a message that
the database already knows, or at least do not overwrite a state `failed`:

```ts
for (const job of jobs) {
  const state = await stateOfJob(job);
  const known = messages.get(job.data.key);
  if (known && known.state !== 'queued') continue;   // the row of the database is newer
  messages.set(job.data.key, { ... });
}
```

### 7.2 The documentation of the fallback is honest — no defect

`README.md:396-399` and `api/src/lib/mailer.ts:755-771` agree: without a relay
the platform says so and does not pretend. Nothing to change.

---

## 8. What could not be verified

* **A real relay was never used.** Every delivery in this document went to a
  local sink on `127.0.0.1`. The authentication of a relay (STARTTLS,
  `AUTH PLAIN`/`LOGIN`, a password with special characters, a provider that
  rejects a sender it does not know) was **not** exercised. The code path of
  the transport is the same, but only a real relay can prove that part.
* **The DKIM and the SPF of the sending domain** are a matter of the mail
  provider and of the DNS of the domain; nothing in the repository can prove
  them.
* **The behaviour of a relay that is slow or that answers 421/450** was not
  exercised. The timeouts are in the code
  (`api/src/lib/mailer.ts:283-301`: 10 s to connect, 10 s for the greeting,
  20 s for the socket).
* **The rate at which a provider accepts the mail of one domain** is a
  question for the provider, not for the platform.
