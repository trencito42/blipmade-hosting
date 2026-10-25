# The hosted mail

The platform hosts the mail of its customers with a mail server of its own.
This file says how it is put together, what the operator has to write down,
and how every step is checked.

Everything here is the state of the machine of the platform, measured. Nothing
here is a secret: the keys are written as shapes, and the only real values are
the ones that are public anyway (a certificate, a fingerprint, a record of
DNS).

---

## 1. What is where

| Piece | Where |
|---|---|
| The mail server | VM `blipmade-mail`, `10.77.0.14` (private), `193.34.214.20` (public) |
| The software | Mailcow, `/opt/mailcow-dockerized`, 18 containers |
| The administrative API | `https://mail.blipmade.com/api/v1`, key in the header `X-API-Key` |
| The code of the platform | `api/src/services/mailcow.ts` (the client), `api/src/services/mail.ts` (the service), `api/src/services/mail-dns.ts` (the records of DNS) |
| The customer page | `web/src/app/Mail.tsx`, at `/email` |
| The back office page | `web/src/admin/Mail.tsx`, at `/admin/mail` |
| The tables of the platform | `MailDomain`, `Mailbox`, `MailAlias`, `MailJob` |

The public address of the mail server is the address of the platform itself
(`193.34.214.20`). The traffic of the mail is translated to the machine of the
mail by the rules of the network of the platform
(`/usr/local/sbin/blipmade-network.sh`, unit `blipmade-network.service`). The
rules are written down there and they are applied on every boot.

---

## 2. The variables of the environment

The file of the environment of the platform is `/opt/blipmade/.env` on the
host of the platform (VM `10.77.0.13`). It is never in the repository. The
shapes are in `.env.example` at the root of the repository.

| Variable | Format | Meaning |
|---|---|---|
| `MAILCOW_API_URL` | `https://<name of the machine>` | The administrative API of the mail server. |
| `MAILCOW_API_KEY` | long hexadecimal string | The key of the platform. It never reaches the browser. |
| `MAILCOW_API_CERT_SHA256` | 64 hexadecimal characters | The fingerprint of the certificate of the mail server. It is the SHA-256 of the certificate, in lower case. It is empty when the certificate is signed by an authority the machine trusts. |
| `MAIL_HOSTNAME` | a name of a host | The name of the machine of the mail server. It is the name in the certificate and the name that the DNS of the hosted domains points at. |
| `MAIL_WEBMAIL_URL` | a URL | Where the customer reads the mail. |
| `MAIL_RUA_ADDRESS` | a bare address | The mailbox that receives the reports of DMARC. |
| `MAIL_MAX_DOMAINS_PER_CUSTOMER` | a whole number | How many domains of mail one customer may host. Default `3`. |
| `MAIL_MAX_MAILBOXES_PER_DOMAIN` | a whole number | How many mailboxes one domain may hold. Default `10`. |
| `MAIL_MAX_ALIASES_PER_DOMAIN` | a whole number | How many aliases one domain may hold. Default `100`. |
| `MAIL_MAX_QUOTA_MB_PER_MAILBOX` | a whole number | The space of one mailbox, in megabytes. Default `1024`. |
| `MAIL_MAX_QUOTA_MB_PER_DOMAIN` | a whole number | The space of one domain, in megabytes. Default `10240`. |
| `SMTP_URL` | `smtp://<mailbox>%40<domain>:<password>@<host>:587` | The relay of the transactional mail. The name of the mailbox is the **whole address**, written with `%40` for the `@`, because the relay refuses to send in the name of another mailbox. |
| `SMTP_CA_FILE` | a path of a file in PEM | The certificate of the relay, when the relay is signed by nobody the machine trusts. |

### The value that is written today

```
MAILCOW_API_URL=https://mail.blipmade.com
MAILCOW_API_CERT_SHA256=7c9a7865a7ad3c5a9a05a4f4bb414640d643c85c392bad1ce2c409cbbaca25be
MAIL_HOSTNAME=mail.blipmade.com
MAIL_WEBMAIL_URL=https://mail.blipmade.com
MAIL_RUA_ADDRESS=postmaster@blipmade.com
SMTP_CA_FILE=/opt/blipmade-mail/mailcow-ca.pem
```

`MAILCOW_API_KEY` and `SMTP_URL` carry secrets and are not written in this
file. They are in `/opt/blipmade/.env` on the host of the platform, with the
rights of the file that only the owner can read.

---

## 3. What the platform does, and what it does not

**It does** create the domains, the mailboxes and the aliases of the customer,
it tells the customer which records of DNS to publish, and it checks with a
real lookup what is really published.

**It does not** write the records of DNS of a customer. The DNS of a domain
belongs to the customer, and a record that the platform writes itself could
overwrite something the customer needs. The platform shows the record and it
checks the record; publishing it is the work of the customer.

The checks of the DNS compare the way the record is really written and not the
way the platform wrote it: the parts of a record of TXT are compared without
their order, the key of a record of DKIM is compared and not the whole record,
and the name of a host is the same with a trailing dot and without it.

---

## 4. The steps that are still in the hands of the operator

Each step says what is missing, the exact value, where it goes and how it is
checked. The values are the shapes; the real values are written by the
operator.

### 4.1 A public address of its own for the mail

**What is missing.** The mail leaves the platform through `193.34.214.20`, the
address of the platform itself. That address is also the address of the web
site, of the panel and of the node. A mail server that shares its address
with everything else has the reputation of everything else.

**What the operator has to do.** Ask the provider for one more address in the
block `193.34.214.0/24`. The addresses that are routed today are `.20`,
`.86`, `.87` and `.143`; the others of the block are not routed and the
platform cannot route them by itself.

**Where.** In the rules of the network of the platform,
`/usr/local/sbin/blipmade-network.sh`, and then in the rules of the provider.

**How it is checked.**

```bash
# from outside the platform
curl -sS "https://check-host.net/check-tcp?host=<the new address>:25&max_nodes=3"
```

The answer must be `OK` from three nodes. The same check is done for `587`
and `993`.

### 4.2 The reverse name of the address of the mail

**What is missing.** There is no `PTR` for any of the four addresses of the
platform. A receiver that cannot find the reverse name of the address that
sends the mail holds the message or throws it away.

**What the operator has to do.** Ask the provider for
`PTR mail.blipmade.com` on the address of the mail, and for the matching
forward name.

**How it is checked.**

```bash
host -t PTR <the address of the mail> | tail -2
# the answer must be mail.blipmade.com
```

### 4.3 The name of the mail server in the DNS

**What is missing.** `mail.blipmade.com` does not exist in the DNS. The
certificate of the mail server is signed by nobody until the name is
published, and the customers cannot point their records of MX at a name that
does not exist.

**What the operator has to do.** Publish an `A` record for `mail.blipmade.com`
with the address of the mail, and the records that the platform shows in the
customer page for every hosted domain:

| Type | Name | Value |
|---|---|---|
| `MX` | `<the domain of the customer>` | `mail.blipmade.com` (priority `10`) |
| `TXT` | `<the domain of the customer>` | `v=spf1 mx -all` |
| `TXT` | `_dmarc.<the domain of the customer>` | `v=DMARC1; p=none; rua=mailto:postmaster@blipmade.com` |
| `CNAME` | `autodiscover.<the domain of the customer>` | `mail.blipmade.com` |
| `CNAME` | `autoconfig.<the domain of the customer>` | `mail.blipmade.com` |
| `TXT` | `dkim._domainkey.<the domain of the customer>` | the record that the customer page shows, with the key of the domain |

**How it is checked.** The customer page shows the state of every record, and
the state is a real lookup: `verified` means that every record is published
with the value the platform expects. From outside:

```bash
host -t MX <the domain of the customer> | tail -2
host -t TXT dkim._domainkey.<the domain of the customer> | tail -2
```

### 4.4 The certificate of the mail server

**What is missing.** The certificate of the mail server is signed by itself,
because the name of the machine was not in the DNS when it was made. The
platform does not trust it blindly: it compares the fingerprint of the
certificate with the one the operator wrote down
(`MAILCOW_API_CERT_SHA256`). The mail server can also answer with a real
certificate once the name is published.

**What the operator has to do.** Publish the name of the machine (4.3), then
let the mail server make its own certificate:

```bash
cd /opt/mailcow-dockerized
sudo docker compose up -d acme-mailcow        # the container that makes the certificate
sudo docker compose restart nginx-mailcow postfix-mailcow dovecot-mailcow
```

After that the fingerprint changes, and the platform has to be told the new
one:

```bash
sudo openssl x509 -in /opt/mailcow-dockerized/data/assets/ssl/cert.pem \
  -noout -fingerprint -sha256
```

The answer is the new `MAILCOW_API_CERT_SHA256` (the colons are removed and
the letters are lower case). When the certificate is signed by an authority
the machine trusts, the variable may be emptied.

**How it is checked.**

```bash
curl -sS -H "X-API-Key: $MAILCOW_API_KEY" https://mail.blipmade.com/api/v1/get/status/version
# the answer must be {"version":"..."} and not an error about the certificate
```

### 4.5 The key of the API of the mail server

**What is missing.** The key that the platform uses was written down when it
was made, and it was shown in the transcript of the work. A key that was
shown is a key that has to be replaced before the service carries the mail of
real customers.

**What the operator has to do.** Make a new key with the same rights
(`read` and `write`, and the list of the addresses that may call) and write it
in `/opt/blipmade/.env` as `MAILCOW_API_KEY`. The old key is removed from the
mail server.

**How it is checked.**

```bash
curl -sS -H "X-API-Key: <the new key>" https://mail.blipmade.com/api/v1/get/domain/all
# the answer must be the list of the domains, and not "access_denied"
```

### 4.6 The key of DKIM of the domain of the platform

**What is missing.** The mail that the platform sends is signed with a key of
DKIM for `blipmade.com`, and the public part of it is not published yet. The
mail is delivered, but it is not signed, and a receiver that wants a signature
holds it.

**What the operator has to do.** Publish this record of `TXT` at
`dkim._domainkey.blipmade.com`:

```
v=DKIM1;k=rsa;t=s;s=email;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5wgS9BK4QkobmkbTO0hmP8g0Dqsd8JcGOtRaMOw+RpjFECqqATtyuwpBmnFypE7Lq7aD9WE0g53PqD/WVY8UwgnvPxpuvxftEv2kvlEyCCsVK5z5o7CZXCv2xZSFHnFhCScRmue2IRL7ZkrP2YWXIkcZh+fFAwASGZrpYu2KrAg8Kss7+UFonGyECwiqvwYE2V/fGSLil0Qa3jTo1OdbNtjqV02qqt7ZE9bOtcGhkLYUZvXxETUptSEfkFCfguSfDEz5rjIdNolqvFlkdXuPGOuC9WtMDhBnMJ6mzG3VgKDQ0RlYHDUEnwcq/uR3dsvPBDwm0i9pO1+T6vg1lkicPwIDAQAB
```

**How it is checked.** The same record is read back by the customer page of
the hosted domain, and the signature of a message that the platform sends is
read with any reader of mail:

```bash
host -t TXT dkim._domainkey.blipmade.com | tail -2
```

### 4.7 The relay of the transactional mail

**What is missing.** The relay of the platform is `no-reply@blipmade.com` in
the mail server of the platform. The path was measured end to end: the
platform sent a message, the mail server took it, signed it and delivered it,
and the message was read back over IMAP with its real headers.

What is missing is the **switching on** of the relay in the production
environment, and it is on purpose: the key of DKIM of `blipmade.com` is not
published yet (4.6), and a message that carries a signature that cannot be
checked is worse than a message without a signature.

**What the operator has to do.** After the record of DKIM is published:

1. Write the relay in `/opt/blipmade/.env`:

```
SMTP_URL=smtp://no-reply%40blipmade.com:<the password of the mailbox>@mail.blipmade.com:587
SMTP_CA_FILE=/opt/blipmade-mail/mailcow-ca.pem
```

The password of the mailbox is in `/opt/blipmade-mail/platform-mailboxes.pass`
on the host of the platform, and it is not written in this file.

2. Tell the host of the platform where the mail server is, until the name is
   in the DNS (4.3). The line is in `/etc/hosts` and it is marked:

```
10.77.0.14 mail.blipmade.com # blipmade: mail server, until the name is in the DNS
```

3. Recreate the containers of the API and of the worker, so they read the new
   environment:

```bash
cd /opt/blipmade
sudo docker compose up -d --force-recreate api worker
```

**How it is checked.** The message of a customer is read in the back office,
at `/admin/deliveries`, and the state of it is `delivered`. It is not
`written-to-file`: the second one means that the message was written on the
disk and nobody received it.

### 4.8 The name of the mail server in the container of the platform

**What is missing.** The container of the API does not read the file of the
hosts of the host. When the name of the machine is in the DNS, this step
disappears on its own.

**What the operator has to do.** Until then, add the name to the container:

```yaml
# compose.api.yml
services:
  api:
    extra_hosts:
      - "mail.blipmade.com:10.77.0.14"
```

**How it is checked.**

```bash
sudo docker compose exec api getent hosts mail.blipmade.com
```

---

## 5. The backupe of the mail

The mail server has its own scripts, in
`/opt/mailcow-dockerized/helper-scripts/`:

- `backup_and_restore.sh` — makes a backupe of the whole mail server and
  restores it. It asks what it has to do.
- `backup-all.sh` — the backupe of everything: the database, the mail, the
  configuration and the certificates.

A backupe is not a backupe until it was restored. The drill is the script of
the platform, `scripts/restore-drill.sh`, and it has to end with a message
that was read back from the restored copy.

The copy of the mail has to leave the machine: the backupe of the platform
(`scripts/backup.sh`) and the copy that goes off the site
(`scripts/backup-offsite.sh`) carry the database of the platform, and the mail
of the customers lives in the mail server and not in the database of the
platform. The two copies are two things and both are needed.

---

## 6. What is measured, and how

| What | How it was measured | Result |
|---|---|---|
| The mail server answers | `get/status/version` | `55982ac` |
| The disk of the mail | `get/status/vmail` | 6.6 G of 127 G |
| A domain is created and really exists | The platform creates it and reads the list of the mail server | The domain is in the mail server, with 10 mailboxes and 100 aliases |
| The key of DKIM is made and is readable | The platform reads `get/dkim/<domain>` | The public part is there and the record of DNS is produced |
| A mailbox is created | The platform creates it | The password is shown once and it is nowhere else |
| An alias is created and removed | The platform creates it and removes it | It works, and it is removed by the address |
| The platform sends through the relay | The platform sends a message to a mailbox of the mail server | `delivered`, and the message is read back over IMAP with a real signature of DKIM |
| The certificate is the one that was expected | The client of the mail server compares the fingerprint | A certificate that is not the one is refused |
