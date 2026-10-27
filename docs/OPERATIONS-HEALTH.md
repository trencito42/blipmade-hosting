# The health of the platform

The platform sends the messages of the customers and takes their money on a
machine that nobody is watching. This document says what watches it, what the
operator sees, and how an alarm reaches the operator when the mail server is
down.

## What is watched

The sweep of the health of the platform runs in the worker every five
minutes. It answers twelve questions, and every question has a state and a
sentence that can be read in the back office.

| Check | What it answers | When it is a problem |
|---|---|---|
| `provisioning` | Is a service being built for longer than it should be? | A service that has been building for more than `OPS_STUCK_MINUTES` (20 by default). |
| `webhooks` | Did the events of the payment provider fail? | An event of the provider that failed or was deferred in the last 24 hours. |
| `delivery` | Did the messages of the platform fail? | A message that failed four times and waits in the failed queue. |
| `backup` | Did the backup of the night happen? | A backup that failed, or a backup that is older than `OPS_BACKUP_MAX_AGE_HOURS` (30 by default). |
| `offsite` | Is the copy that leaves the host there? | A copy that failed, a copy that was not read back on the target, or a copy that is older than `OPS_OFFSITE_MAX_AGE_HOURS`. |
| `restore` | Does the backup still restore? | A drill of the restore that failed. |
| `mailcow` | Does the mail server answer? | A relay that does not take the session. The certificate of the relay is verified against the authorities the machine trusts, and the verification is never turned off. |
| `capacity` | Is there room on the machine? | A disk over `OPS_DISK_MAX_PERCENT` (85), a memory over `OPS_MEMORY_MAX_PERCENT` (90). |
| `certificate` | Do the certificates of the platform expire soon? | A certificate with less than `OPS_CERT_MIN_DAYS` (21) days left. The sweep reads the certificate of the public address, of the control panel and of the mail server. |
| `incident` | Did the operator declare an incident? | An incident that is open. |
| `panel` | Can the platform talk to the control panel? | A panel that refuses the key of the platform. The check uses the same call that the provisioning uses, so a panel that is there and a panel the platform can use are never taken for one another. A key that is not accepted any more (401) and a key that is accepted but may not read the servers (403) are two problems that are fixed in two different places, and the summary says which one it is. |
| `security` | Did something that touches the security change? | A new administrator, changed rights, a new key of a customer or a changed setting in the last hour. |

## Where the state of the operations lives

`OPS_STATUS_DIR` is the directory of the state of the operations. On the host
it is `/var/backups/blipmade/status`, and inside the containers it is
`/var/backups/blipmade-status`, which is the same directory, mounted.

| File | Who writes it | What it holds |
|---|---|---|
| `backup.json` | `scripts/backup.sh` | The moment of the last local backup, its result, its name, its size. |
| `offsite.json` | `scripts/backup-offsite.sh` | The moment of the last copy that left the host, its result, whether it was read back on the target. |
| `restore-drill.json` | `scripts/restore-drill.sh` | The moment of the last drill, its result, the checks it made. |
| `incident.json` | The API, when an operator declares an incident | The text of the incident and the moment it ends. |
| `ops-alerts.ndjson` | The API, when it sends an alarm | One line per alarm: the moment, the check, the severity, the text and the channels that carried it. |

The receipts hold no secret: only moments, names, sizes and the words
`success` and `failed`. A receipt is written even when the step failed,
because a failure that leaves no trace cannot be seen by anybody.

## How an alarm reaches the operator

An alarm travels by four channels, and the back office shows the state of
each one.

1. **The journal of the alerts** — `ops-alerts.ndjson` on the host. It is
   written first, before anything else is tried, because it is the channel
   that needs nothing else to work. It is read by the back office over the
   ordinary web address of the platform.
2. **The webhook of the operator** — `OPS_ALERT_WEBHOOK_URL`. A chat room, a
   service of incidents, a script of the operator. It has nothing to do with
   the mail of the platform, so an alarm about the mail server can still
   leave the host. The body is signed with `OPS_ALERT_WEBHOOK_SECRET` in the
   header `X-Blipmade-Signature`.
3. **The channel of Discord** — `OPS_DISCORD_WEBHOOK_URL`, or the file
   `OPS_DISCORD_WEBHOOK_FILE` that holds the address. The file is the better
   way: the address carries the token that lets anybody write in the channel,
   so it stays in a file that only the owner of the platform can read and not
   in a copy of the configuration. Discord takes a message of its own, with an
   embed that carries the severity, the component that is broken and the name
   of the occurrence, so the alarm can be read in the channel and not only
   received. The channel that is switched off is shown as switched off, and
   not as a channel that is broken.
4. **The mail of the platform** — the event of the catalogue that carries the
   alarm, sent to `MAIL_OPERATOR_EMAIL` (or `MAIL_SUPPORT_EMAIL`).

**The channel of the operator is the one that matters.** Without a webhook of
the operator and without the channel of Discord, every alarm of the platform
travels by the mail of the platform, and an alarm about the mail server cannot
leave the host. The dashboard says so in plain words, on the page of the
channels.

## Why the platform does not flood the operator

A platform that watches itself badly is worse than one that does not watch
itself: a problem that repeats every five minutes fills the mailbox with the
same message and teaches the operator to ignore the messages of the platform.

- A finding is reported once. The next alarm waits half an hour, then two
  hours, then eight hours, then a day. A problem that is not fixed by a human
  is still talked about every day.
- At most `OPS_ALERT_MAX_PER_HOUR` alarms (5 by default) leave the platform in
  an hour. The ones that do not fit are counted and shown in the dashboard.
- An alarm that an operator has acknowledged is not sent again until the
  finding itself changes. The person who is working on a problem is not
  buried under it.

The rule is in `api/src/lib/ops-alert-policy.ts`, away from everything else,
because it is the part that has to be right and the part that has to be
checked without a database and without a cache.

## The back office

The page is `/admin/ops`. It shows the state of the platform, the twelve
checks, the alarms that were sent, the channels, and it lets an operator
acknowledge a finding and declare an incident.

The routes are under `/api/ops`, and they carry the permission
`infrastructure.read` (and `infrastructure.write` for the three that write).
Every route carries a rate limit, like every other route of the back office.

## What the operator still has to do

The checks of the backup, of the copy that leaves the host and of the drill
of the restore depend on the receipts of the scripts of the host. Until
those scripts write them, those three checks have nothing to read and they
say so.

The certificate that the mail server presents is checked by the mailer of the
platform on every message it sends. The sweep reads the certificate of the
mail server as well, on the address the operator wrote down in
`MAILCOW_API_URL`: the name `mail.blipmade.com` is published in the DNS and
the certificate is signed by an authority the machine trusts, so the relay is
watched like every other address the platform serves.

The key of the control panel is not a problem of the platform but of the
panel: a key that was revoked leaves the platform unable to build a service,
and the order of a customer waits. The key is made in the panel
(Administration → API Keys → Application API, with the permission to create
servers) and it is applied on the host with `scripts/apply-panel-key.sh`,
which reads it from the standard input, keeps a copy of the file before it
writes, and checks the key with the code of the platform: a key the panel
refuses is caught there, and not at the first order of a customer.
