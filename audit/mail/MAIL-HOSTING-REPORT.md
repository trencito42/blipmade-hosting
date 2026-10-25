# The hosted mail — the report of the phase

This file says what was built for the hosted mail, what was measured, what
the tests found and what is still in the hands of the operator.

The guide for the operator is `docs/MAIL_HOSTING.md`. The variables are in
`.env.example` at the root of the repository.

---

## 1. What was built

| Piece | Where | What it does |
|---|---|---|
| The client of the mail server | `api/src/services/mailcow.ts` | Talks to Mailcow over HTTPS, with the fingerprint of the certificate pinned, and turns every refusal into an error that carries the words of the refusal. |
| The service of the hosted mail | `api/src/services/mail.ts` | The domains, the mailboxes and the aliases of the customer, the limits of the plan, the isolation between the customers, the journal of the work and the audit. |
| The records of DNS | `api/src/services/mail-dns.ts` | Produces the records a customer has to publish and checks, with real lookups, what is really published. |
| The routes of the customer | `api/src/routes/mail.ts` | `/api/mail/...` |
| The routes of the back office | `api/src/routes/admin-mail.ts` | `/api/admin/mail/...` |
| The tables | `api/prisma/schema.prisma` | `MailDomain`, `Mailbox`, `MailAlias`, `MailJob` |
| The migration | `api/prisma/migrations/20261026090000_mail_hosting/` | One migration, additive, with the reasons written next to every statement. |
| The page of the customer | `web/src/app/Mail.tsx` | `/email` — the domains, the mailboxes, the aliases and the records of DNS. |
| The page of the back office | `web/src/admin/Mail.tsx` | `/admin/mail` — the health, the domains of everybody, the work and the repetitions. |
| The backupe | `scripts/backup-mail.sh`, `scripts/restore-mail.sh` | The copy of the mail server and the drill that reads it back. |
| The relay | `api/src/lib/mailer.ts` | `SMTP_CA_FILE`: the certificate of a relay that is signed by nobody the machine trusts. |

---

## 2. The machine of the mail

| | |
|---|---|
| The virtual machine | `blipmade-mail`, VM 104, Debian 13, 4 vCPU, 12 GB of memory, 120 GB of disk |
| The addresses | `10.77.0.14` (private), `193.34.214.20` (public, translated by the rules of the network of the platform) |
| The software | Mailcow dockerized, version `55982ac`, 18 containers |
| The ports that answer | 25, 465, 587, 993, 4190, 80, 443 — checked from the internet with three nodes |
| The administrative API | `https://mail.blipmade.com/api/v1`, with the header `X-API-Key` |
| The key of the API | `access=rw`, `allow_from` limited to the addresses of the platform, created in the database of the mail server because the API has no endpoint that creates keys |

The mail server was created on the hypervisor of the platform, with the same
template and the same shape as the other machines of the platform.

---

## 3. What was measured, and how

Every line of this table was measured on the machine, and the measurement can
be repeated.

| What | How | Result |
|---|---|---|
| The mail server answers | `GET /api/v1/get/status/version` | `55982ac` |
| The disk of the mail | `GET /api/v1/get/status/vmail` | 6.6 G of 127 G (6 %) |
| The port 25 is not filtered by the provider | a connection from the outside | refused with a reset before the rules were written, not a timeout |
| The ports answer from the internet | `check-host.net`, three nodes | 25, 587, 993 and 443 open |
| The platform creates a domain that really exists | `api/probe/hosted-mail.ts` | the domain is in the mail server, with 10 mailboxes and 100 aliases, and it is gone at the end |
| The key of DKIM is made and is readable | `GET /api/v1/get/dkim/<domain>` | the public part is there and the record of DNS is produced from it |
| The records of DNS are checked with real lookups | `api/probe/hosted-mail.ts` | the domain of the probe is not published, so the check says that 6 records are missing — the check tells the truth |
| The password of a mailbox is shown once | `api/tests/mail-service.test.ts` | it is in the answer of the creation and in no row, in no log and in no address of a page |
| The platform sends through the relay | `api/probe/transactional.ts` | `delivered`, and the message was read back over IMAP with the real headers |
| The message is signed | the same message, read over IMAP | `DKIM-Signature: v=1; a=rsa-sha256; d=blipmade.com; s=dkim` |
| The certificate is the one that was expected | `api/tests/mailcow-client.test.ts` | a certificate that is not the one is refused, and the refusal names both fingerprints |
| The backupe holds the mail | `scripts/backup-mail.sh` on the mail server | 2 domains, 4 mailboxes, the database, the mail, the keys of DKIM and the certificates |
| The backupe is read back | `scripts/restore-mail.sh` | the sum is right, the manifest is read, and the archive holds 2 domains, 4 mailboxes, 4 aliases and 4 messages |

The probes are in `api/probe/` and they run against the machine that is
really there. They need the environment of the platform and a disposable
database; they never touch a domain of a customer, and the domain of the
probe is under `.test`, which is reserved and never resolves.

---

## 4. What the tests found

The tests of this phase are not a formality: they found defects that would
have broken the service on the first day. Every one of them has a test of
regression now.

| The defect | How it was found | What it does now |
|---|---|---|
| Every answer of the mail server that only reads was taken for a refusal | `api/tests/mailcow-client.test.ts` | The verdict is told apart by its type, and not by the shape of the answer. `get/status/version` answers `{"version":"..."}` and it is read as the version. |
| The certificate was checked by a function that the chain of the certificates never reaches | `api/tests/mailcow-client.test.ts` | The chain is not checked by the machine when a fingerprint is written down, and the fingerprint is compared by hand, on the certificate that the machine really received. |
| The alias was removed by the number of the platform | `api/probe/hosted-mail.ts` | The mail server removes an alias by its address, and the address is the one that is used. |
| The key of DKIM was never read, so the customer was never told what to publish | `api/probe/hosted-mail.ts` | The key is made and then read with `get/dkim/<domain>`, and the record of DNS carries the real key. |
| The aliases of a mailbox stayed in the platform when the mail server removed them by itself | `api/tests/mail-service.test.ts` | The aliases go first, and the truth about it is written to the audit. |
| A domain that the mail server made and the platform could not write down stayed in the mail server for ever | the probe that failed on the foreign key | The change is undone when the platform cannot write it down. |
| The comparison of the records of DNS was too strict | `api/tests/mail-dns.test.ts` | The parts of a record of TXT are compared without their order, the key of a record of DKIM is compared and not the whole record, and the name of a host is the same with a trailing dot and without it. |
| The listener of the certificate piled up on a socket that is kept alive | the probe that warned | The check is made only when the socket is opened. |

---

## 5. The rules that the service holds

- **One customer never sees the mail of another.** Every read and every
  change is bound to the customer that asked for it, inside the service and
  not only in the route. `api/tests/mail-service.test.ts` proves it with the
  requests of a second customer.
- **The plan is checked before the mail server is asked to do anything.** A
  customer that is at the limit is told so, and the mail server is not asked.
- **An alias delivers only to a mailbox of the same domain.** An alias that
  delivers to another domain is a way to send mail in the name of somebody
  else.
- **The platform does not write the DNS of a customer.** It shows the record
  and it checks the record.
- **The password of a mailbox is shown once.** The mail server keeps only its
  hash and the platform keeps no copy, so a row of the journal can never
  become a way to read the mail of a customer.
- **Every piece of work against the mail server is written down.** A refusal
  stays in the journal with its words, and the back office can show it and
  repeat it when the work can be repeated.

---

## 6. What is still in the hands of the operator

The steps, with the exact value, the place and the way of checking them, are
in `docs/MAIL_HOSTING.md`. In one line each:

| What is missing | Why it matters | The step |
|---|---|---|
| A public address of its own for the mail | the mail shares the address of the website, of the panel and of the node | ask the provider for one more address in `193.34.214.0/24` |
| The reverse name of the address | a receiver that cannot find it holds the mail | `PTR mail.blipmade.com` on the address of the mail |
| The name of the mail server in the DNS | the customers cannot point their records of MX at a name that does not exist | an `A` record for `mail.blipmade.com` |
| The certificate signed by an authority | the platform pins the fingerprint of a self-signed certificate | the certificate of ACME, after the name is published |
| A new key of the API | the key that the platform uses was shown in the transcript of the work | a new key, and the old one removed |
| The record of DKIM of `blipmade.com` | the mail of the platform is delivered but it is not signed | one record of `TXT` at `dkim._domainkey.blipmade.com` |
| The relay of the transactional mail in production | the platform writes the messages on the disk and nobody receives them | `SMTP_URL` and `SMTP_CA_FILE` in `/opt/blipmade/.env`, after the record of DKIM is published |
| The name of the mail server in the container | the container does not read the file of the hosts of the host | `extra_hosts` in `compose.api.yml`, until the name is in the DNS |
| The copy of the mail that leaves the machine | the host uses RAID 0 | `OFFSITE_TARGET` and the unit of the timer |

The relay of the transactional mail is the only one of these steps that the
platform can do alone, and it is not done on purpose: the key of DKIM is not
published yet, and a message that carries a signature that cannot be checked
is worse than a message without a signature.

---

## 7. What was not done, and why

- **Nothing was merged into `main` and nothing was deployed.** The work is on
  the branch `feature/mail-hosting`.
- **The relay of the production was not switched on.** See above.
- **The public name of the mail server was not created.** The DNS of the
  domains belongs to the operator.
- **No domain of a customer was touched.** The probe uses a name under
  `.test`, which is reserved and never resolves, and the messages of the
  proof were sent to a mailbox of the mail server of the platform.
