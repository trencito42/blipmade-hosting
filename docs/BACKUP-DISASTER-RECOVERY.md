# Backups and disaster recovery

This document is the procedure for the day that **VM 103 is gone**. It is
written for the operator who has to bring the platform back with a database
that was dumped on a machine that no longer exists, and it is written for the
operator who has to do that without a second machine to try it on.

The platform runs on four machines and only one of them is built from the
repository:

| Machine | Role | Where it is |
|---|---|---|
| **VM 103** | Control plane: API, worker, web, PostgreSQL, Redis | `10.77.0.13`, the repository in `/opt/blipmade` |
| **VM 100** | Pterodactyl panel | `panel.blipmade.com` (`10.77.0.10`) |
| **VM 101** | Wings node | `node1.blipmade.com` (`10.77.0.11`) |
| **VM 102** | Caddy edge | `10.77.0.12`, the public address of the platform |

A loss of VM 103 loses the database, the uploads, the configuration and the
code. **It does not lose the encrypted copy on the off-site target**, and that
copy is the only thing that can bring the data back.

---

## 1. What the backup chain is

There are three scripts, and each of them answers a different question.

| Script | Question it answers | Where the result goes |
|---|---|---|
| `scripts/backup.sh` | *Is there a copy of the platform on this host?* | `/var/backups/blipmade/blipmade-<label>-<stamp>.tar.gz` with a `.sha256` next to it |
| `scripts/backup-offsite.sh` | *Is there a copy that survives the loss of this host?* | `blipmade-offsite:<stamp>.tar.gz.enc` on the off-site target, encrypted |
| `scripts/restore-drill.sh` | *Does the local archive restore?* | nothing, it restores into a scratch database and drops it again |
| `scripts/restore-offsite-drill.sh` | *Does the encrypted copy restore?* | nothing, it reads the copy down from the target, restores it into a scratch database and drops it again |

The schedule is in `scripts/systemd/blipmade-backup.timer`: every night at
02:15 UTC, with a random delay of up to fifteen minutes. The unit runs the
local backup and then the off-site copy as two separate steps, because the
copy that leaves the host is encrypted with a key that must never show up in
the process list.

**The host uses RAID 0.** A copy that stays on this machine is not a backup.
The only copy that survives the loss of the host is the encrypted one.

### What the encrypted copy holds

The payload of the off-site copy is a tar archive with three members:

| Member | What it is |
|---|---|
| `database.dump` | the database, `pg_dump --format=custom` |
| `uploads.tar.gz` | the files the customers attached to their tickets |
| `config.tar.gz` | `compose.yml`, `compose.api.yml`, `compose.web.yml`, `api/prisma/` (the schema and the migrations) and `web/package.json` |

### What the encrypted copy does not hold

This is the part that makes a restore an operator job and not a script job:

* **No secrets.** The `.env` file is never part of a backup. The password of
  the database, the session secret and the keys of Stripe, of the panel and of
  the mail relay are not in any copy, on the host or off it.
* **No commit.** The archive does not record the commit it was made from.
  See §4 for the procedure that reconstructs it.
* **No checksum of its own.** The copy that leaves the host has no `.sha256`
  next to it. The checksum of the copy is computed on the target and compared
  with the copy that was read down, which is what
  `scripts/restore-offsite-drill.sh` does.

---

## 2. "The host VM 103 is gone. What do I do now?"

The order matters. The key comes first, because without it the copy on the
target is a file that cannot be read, and every minute that passes without it
is a minute of a platform that stays down.

### Step 0 — get the encryption identity out of the safe place

Read §3 first. If the identity is not in the safe place, **stop and find it
before anything else**. Everything below fails without it.

### Step 1 — get a host with the same access

The new host has to reach three things: the off-site target, the panel, and
the customer domains.

* the off-site target, over ssh with the key of the alias `blipmade-offsite`;
* the Pterodactyl panel on `panel.blipmade.com` (`10.77.0.10`) and the node
  on `node1.blipmade.com` (`10.77.0.11`);
* the public name of the platform, `blipmade.com`, which points at the edge
  on VM 102.

```bash
# on the new host, as the user that runs the platform
sudo -n true && echo "sudo works"

# the ssh key of the alias of the off-site target has to be in place, or
# nothing can be read from the target
grep -A4 'Host blipmade-offsite' ~/.ssh/config
ssh blipmade-offsite 'ls -1 /srv/blipmade-backups | tail -3'

# the repository
git clone git@github.com:trencito42/blipmade-hosting.git /opt/blipmade
cd /opt/blipmade
```

The address of the new host is a DNS and a routing question, not a script
question: see §7.

### Step 2 — put the encryption identity in place

```bash
# the identity comes from the safe place, never from the host that is gone
install -m 600 /mnt/secure-media/blipmade-backup.age /home/debian/.blipmade-backup.age
chown debian:debian /home/debian/.blipmade-backup.age
ls -l /home/debian/.blipmade-backup.age       # -rw------- 1 debian debian
```

The identity is the key of the backups. Without it the copy on the target is
unreadable, and there is no second copy of the data anywhere.

### Step 3 — list the off-site target and read the newest copy down

```bash
# the target of the platform is an ssh destination, so the alias of
# ~/.ssh/config is used
ssh blipmade-offsite 'ls -1 /srv/blipmade-backups'

# the names carry the UTC timestamp of the copy, so the last name is the
# newest copy
ssh blipmade-offsite 'ls -1 /srv/blipmade-backups | sort | tail -1'
# -> blipmade-offsite-20261026T021545Z.tar.gz.enc

mkdir -p /tmp/recovery && cd /tmp/recovery
scp blipmade-offsite:/srv/blipmade-backups/blipmade-offsite-20261026T021545Z.tar.gz.enc .

# the copy has to match the one on the target
ssh blipmade-offsite "sha256sum /srv/blipmade-backups/blipmade-offsite-20261026T021545Z.tar.gz.enc"
sha256sum blipmade-offsite-20261026T021545Z.tar.gz.enc
# the two hashes have to be the same
```

### Step 4 — decrypt it

```bash
cd /tmp/recovery
age --decrypt --identity /home/debian/.blipmade-backup.age \
  --output payload.tar.gz blipmade-offsite-20261026T021545Z.tar.gz.enc

# the payload has to be a readable archive with a readable dump in it
tar -xzf payload.tar.gz
pg_restore --list payload/database.dump | head -20
```

When the platform has no `age` and only the fallback of the script was
available, the copy is opened with `openssl` instead:

```bash
export OFFSITE_ENCRYPTION_KEY='<the passphrase, typed here, never written into a file>'
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 \
  -pass env:OFFSITE_ENCRYPTION_KEY \
  -in blipmade-offsite-20261026T021545Z.tar.gz.enc -out payload.tar.gz
unset OFFSITE_ENCRYPTION_KEY
```

### Step 5 — restore the database

The database of the platform is the `postgres` service of the compose
network, so it comes up with the compose files of the repository:

```bash
cd /opt/blipmade
docker compose -f compose.yml -f compose.api.yml -f compose.web.yml up -d postgres redis
docker compose -f compose.yml -f compose.api.yml -f compose.web.yml ps
```

The `.env` of the platform is needed for this step, because the password of
the database is in it. **This is the first moment the operator has to rebuild
the configuration**: see §7.

The restore itself is done by `scripts/restore.sh`, which checks the
checksum, lists the dump, asks for a confirmation and verifies the result
afterwards. It takes the decrypted payload, because the payload holds
`database.dump` at its root:

```bash
cd /opt/blipmade
set -a; . ./.env; set +a
bash scripts/restore.sh /tmp/recovery/payload.tar.gz
# it asks: Type 'restore' to continue:
```

The restore is into the database of the platform. **It overwrites the database
of the new host.** On the new host there is nothing to lose, so this is the
one moment where `scripts/restore.sh` is the right tool. On the running
platform it is the wrong tool, and `scripts/restore-drill.sh` or
`scripts/restore-offsite-drill.sh` are the ones that write into a scratch
database instead.

> `scripts/restore.sh` restores the uploads after the database. That step
> fails on a host where the service account cannot write into the volume of
> the platform (see step 8). The database is restored before it, so the
> numbers of the verification are the ones that count, and the uploads are
> restored with the command of step 8.

### Step 6 — rebuild the platform from the repository

```bash
cd /opt/blipmade
git checkout <the commit of the backup>          # see §4
docker compose -f compose.yml -f compose.api.yml -f compose.web.yml build --no-cache api worker web
docker compose -f compose.yml -f compose.api.yml -f compose.web.yml up -d
docker compose -f compose.yml -f compose.api.yml -f compose.web.yml ps
curl -s http://127.0.0.1:3100/health
```

The worker image is built from the same context as the API image, so `api` and
`worker` are always built together. The migrations run when the API container
starts (`prisma migrate deploy` in the entrypoint), never on the host.

### Step 7 — restore the configuration

`config.tar.gz` holds the compose files, the schema and the migrations of the
platform. It holds **no secrets**, so it is a convenience and not a
configuration: the operator rebuilds the `.env` from the secret store. The
list of the variables, of what they are and of where their value comes from
is in §7.

### Step 8 — bring the uploads back

The uploads of the customers live in the docker volume `upload_data`, which is
mounted at `/data` in the API and in the worker, and the attachments are in
`/data/uploads` inside it. The volume of the new host is empty, so it has to
be filled from `uploads.tar.gz`:

```bash
# the volume has to exist before the files are put into it
docker volume create blipmade_upload_data || true

# the archive holds the content of the volume, so it is unpacked into the
# root of the volume
mkdir -p /tmp/recovery/uploads
tar -xzf /tmp/recovery/payload.tar.gz -C /tmp/recovery/uploads

# the files are put in as root and given to the user of the API container
# (uid 100, gid 101), because the platform writes into that volume as that
# user and the service account of the host cannot write into it
docker run --rm -v blipmade_upload_data:/data alpine \
  sh -c 'tar -xzf - -C /data && chown -R 100:101 /data' \
  < /tmp/recovery/uploads/uploads.tar.gz

# the files are in place
docker run --rm -v blipmade_upload_data:/data alpine find /data -type f | wc -l
```

The volume is a docker volume of the host. When the host is gone, the volume
is gone with it, and `uploads.tar.gz` in the copy is the only source of the
files of the customers.

> `scripts/restore.sh` restores the uploads as well, but it does it as the
> service account of the host, and that account cannot write into the volume
> of the platform (the volume belongs to the user of the API container, uid
> 100). On a new host the uploads are therefore restored with the command
> above.

### Step 9 — prove it

```bash
cd /opt/blipmade
bash scripts/smoke-production.sh
```

The smoke test only reads: `GET` and `HEAD` requests over the public address
and against the host. It never authenticates and never writes, so it cannot
leave a trace in the restored database.

On the new host the local addresses of the smoke test have to be the addresses
of the new host:

```bash
PUBLIC_BASE=https://blipmade.com \
LOCAL_BASE=http://<the new host>:3000 \
API_LOCAL=http://127.0.0.1:3100 \
bash scripts/smoke-production.sh
```

The answer has to end with `failed: 0`.

### Step 10 — put the backup chain back in place

A new host that does not take its own backups is a host that fails the same
way again:

```bash
cd /opt/blipmade
sudo scripts/install-backup-timer.sh
systemctl list-timers blipmade-backup.timer --no-pager
```

And the off-site copy has to be proved on the new host before the next night,
because the new host has its own identity file and its own target:

```bash
bash scripts/restore-offsite-drill.sh
```

The answer has to end with `PASS`.

### Step 11 — tell the customers

**The operator does this, the scripts do not.** The database was restored
from a copy of the moment the backup was made. Everything that happened after
that moment is gone: the orders that were paid for, the tickets that were
written, the servers that were created. The customers whose data is newer
than the backup have to be told, and the instances have to be checked against
the panel:

```bash
psql "$DATABASE_URL" -c 'SELECT id, name, status, "pterodactylServerId" FROM "Instance" ORDER BY "createdAt" DESC LIMIT 20;'
```

---

## 3. "Where do I get the `age` identity?"

**The identity of `age` is the key of the backups. It exists only on VM 103
and nowhere else.**

| What | Where |
|---|---|
| The path, in the environment of the platform | `OFFSITE_AGE_IDENTITY=/home/debian/.blipmade-backup.age` in `/opt/blipmade/.env` |
| The file on the host | `/home/debian/.blipmade-backup.age`, owner `debian`, mode `600` |
| The public half, which is safe | `OFFSITE_AGE_RECIPIENT` in `/opt/blipmade/.env`, an `age1...` string |

The file holds a private key. **It is never written into a backup and it
never travels with a copy.** This document names the path of the file, never
its content.

### Take a copy of it now, before anything happens

```bash
# on VM 103, onto an encrypted medium that is not the host and not the
# off-site target
sudo install -m 600 -o debian -g debian \
  /home/debian/.blipmade-backup.age \
  /mnt/secure-media/blipmade-backup.age

# the copy is only useful when it can be read back
ls -l /mnt/secure-media/blipmade-backup.age       # -rw------- 1 debian debian
```

The safe place has to be somewhere that is **not** the host and **not** the
off-site target: the off-site target is a backup target, not a place for the
key of the backups. A password manager with an attachment, an encrypted
removable medium, or a second machine that is not part of the platform will
do.

### Check that the copy is the right one

The private file holds the public half as well, so the file can be checked
without printing the key:

```bash
# the public half of the identity file
age-keygen -y /home/debian/.blipmade-backup.age

# the recipient the host encrypts with
grep '^OFFSITE_AGE_RECIPIENT=' /opt/blipmade/.env
```

The two strings have to be the same. If they are not, the copy on the target
was encrypted for another key and cannot be read with this identity.

### Put it back on a new host

```bash
install -m 600 /mnt/secure-media/blipmade-backup.age /home/debian/.blipmade-backup.age
chown debian:debian /home/debian/.blipmade-backup.age
```

and point the platform at it in `/opt/blipmade/.env`:

```
OFFSITE_AGE_IDENTITY=/home/debian/.blipmade-backup.age
OFFSITE_AGE_RECIPIENT=age1...
```

The file has to be readable by the account that runs the backup unit
(`debian`) and by nobody else. The unit reads it with
`EnvironmentFile=-/opt/blipmade/.env`, so the path is the one in the
environment file, and the unit never gets the content of the key.

### The fallback

`scripts/backup-offsite.sh` falls back to `openssl enc` with AES-256-CBC and
PBKDF2 when `age` is not installed or when no recipient is configured. The
passphrase is in `OFFSITE_ENCRYPTION_KEY` and it is **not** in the
environment file of the platform: the platform uses `age`, so the fallback
key does not exist on this host. If a host ever uses the fallback, its
passphrase has to be in the secret store of the operator, next to the
identity of `age`, because the copy on the target cannot be read without it
either.

The fallback has no authenticated cipher. The read-back comparison of the
backup script is the integrity check of it, which is why `age` is the
configuration of the platform.

---

## 4. "How do I know which commit to restore?"

**The backup does not record the commit.** There is no commit file in
`database.dump`, in `uploads.tar.gz` or in `config.tar.gz`, and the local
archive has no manifest either. The procedure below reconstructs the commit
from what the copy carries. It is an anchor, not a guess: the migrations of
the database and the configuration of the platform have to match the commit
exactly, and the platform refuses to start against a schema that does not
match its code.

### The anchor: the migrations of the copy

The database carries the history of its own migrations in the table
`_prisma_migrations`. The list is the fingerprint of the schema of the copy:

```bash
# after the restore, or in the scratch database of the drill
psql "$SCRATCH_URL" -At -c \
  'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY started_at;'
```

The commit has to hold exactly these migrations in `api/prisma/migrations/`
and no migration that the list does not have:

```bash
cd /opt/blipmade
git ls-tree --name-only <candidate-commit> api/prisma/migrations/
```

The commit that introduced the **last** migration of the list is the oldest
commit that can hold this copy. A later commit that only changed the code
(the API, the frontend, the documentation) is also correct, and it is the
better one: it is the commit the platform was running when the backup was
made.

### The second anchor: the configuration of the platform

`config.tar.gz` holds `compose.yml`, `compose.api.yml`, `compose.web.yml`,
`api/prisma/` and `web/package.json`. The commit that matches the copy is the
one whose files are the same, byte for byte:

```bash
mkdir -p /tmp/recovery/config && tar -xzf /tmp/recovery/payload.tar.gz -C /tmp/recovery/config

# the commits that touched the configuration of the platform
git log --format='%h %ad %s' --date=short -- \
  compose.yml compose.api.yml compose.web.yml api/prisma web/package.json

# the candidate has to hold the same files
git show <candidate-commit>:compose.api.yml | diff - /tmp/recovery/config/config/compose.api.yml
git show <candidate-commit>:web/package.json | diff - /tmp/recovery/config/config/web/package.json
git show <candidate-commit>:api/prisma/schema.prisma | diff - /tmp/recovery/config/config/api/prisma/schema.prisma
```

No output means the file is the same.

### The third anchor: the history of the host

When the host is still there, the answer is in its own history:

```bash
cd /opt/blipmade
git log --oneline -5                       # what is deployed right now
git rev-parse HEAD                         # the exact commit
journalctl -u blipmade-backup.service --since "2026-10-26 02:10" --until "2026-10-26 02:25"
```

The unit of the backup logs the name of the copy, and the name of the copy
carries the timestamp of the night. The commit that was `HEAD` at that moment
is the commit of that copy.

When the host is gone, its own history is gone with it. The remote is the
history then:

```bash
git ls-remote --heads git@github.com:trencito42/blipmade-hosting.git
git log --oneline --all --since="2026-10-25" --until="2026-10-27"
```

**Take the commit that matches the migrations first, then move forward to the
newest commit that still holds the same migrations and the same schema.** A
commit that is newer than the copy is a commit whose code is newer than the
data, which is fine as long as it does not expect a column that the copy does
not have.

---

## 5. The drill that proves the encrypted copy

The drill of the local archive (`scripts/restore-drill.sh`) proved that the
archive of the host restores. It proved nothing about the encrypted copy on
the target, and the copy on the target is the only copy that survives the
loss of the host. `scripts/restore-offsite-drill.sh` proves that one:

```bash
cd /opt/blipmade
set -a; . ./.env; set +a
bash scripts/restore-offsite-drill.sh
```

It lists the target, reads the newest copy down, compares its checksum with
the checksum of the copy on the target, decrypts it, restores it into the
scratch database `blipmade_offsite_drill`, compares that database with the
live one, drops the scratch database and removes its temporary files.

The answer has to end with:

```
  tables         live=40     restored=40
  users          live=4      restored=4
  products       live=5      restored=5
  migrations     live=17     restored=17
  PASS  the copy blipmade-offsite-20261026T021545Z.tar.gz.enc was read from the off-site target, ...
```

The exit code is `0` only when every number matches.

**The drill never writes to the live database, and it says so in its own
rules.** The name of the scratch database has to end with `_test` or
`_drill`, and the script refuses to run before it reads anything else when it
does not:

```
$ SCRATCH_DB=blipmade bash scripts/restore-offsite-drill.sh
The name of the scratch database must end with _test or _drill,
not "blipmade". Refusing to run.
```

The drill is safe to run at any time, also while the platform is serving
customers. The only thing it writes is the scratch database, and it drops it
at the end.

Run it:

* after every change of the backup scripts,
* once a month, on the host,
* and **on every new host, before it is trusted with the traffic**.

---

## 6. The five most likely disasters

| Symptom | Probable cause | Command | Expected output |
|---|---|---|---|
| `No key is available to read the off-site copy.` or `the age identity did not read the copy` | The identity of `age` is not on the machine | `ls -l /home/debian/.blipmade-backup.age` | `-rw------- 1 debian debian 184 ...`. Nothing else: the file is missing, or it was copied without its rights. See §3. |
| `no identity matched any of the recipients` (from `age`) | The identity is the wrong one: the copy was encrypted for another key | `age-keygen -y /home/debian/.blipmade-backup.age` and `grep '^OFFSITE_AGE_RECIPIENT=' /opt/blipmade/.env` | The two `age1...` strings are the same. If they are not, the copy cannot be read with this identity. |
| `The copy that was read down has a different checksum than the copy on the target.` | The copy is damaged in the storage of the target, or it was truncated on the way | `ssh blipmade-offsite "sha256sum /srv/blipmade-backups/<name>"` and `sha256sum <the copy that was read down>` | The two hashes are different: the copy is damaged. Take the copy before it (`ls -1 /srv/blipmade-backups | sort | tail -2`) and try again. |
| `relation "User" does not exist` after the restore, or the API refuses to start with a drift of the schema | The commit does not match the migrations of the copy | `psql "$SCRATCH_URL" -At -c 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY started_at;'` and `ls api/prisma/migrations/` | The two lists are the same. If the commit has a migration that the list does not have, the commit is too new; take the commit that introduced the last migration of the list. See §4. |
| The customers see a broken attachment, or the volume is empty | The upload volume of the new host is empty: it was a docker volume of the host that is gone | `docker run --rm -v blipmade_upload_data:/data alpine find /data -type f \| wc -l` | `0` means the uploads were not restored yet: put `uploads.tar.gz` of the copy into the volume. See step 8 of §2. |

---

## 7. What the scripts do and what the operator must do

### The scripts do

* dump the database, pack the uploads and the configuration, encrypt the
  payload, send it to the off-site target and verify it there;
* restore a copy into a **scratch** database, compare it with the live one
  and drop the scratch database again;
* restore a copy into the database of the platform, but only after a
  confirmation (`scripts/restore.sh` asks for the word `restore`);
* read the health of the platform and the public pages (`scripts/smoke-production.sh`),
  without writing anything.

### The operator must do

| What | Where the value comes from | What happens without it |
|---|---|---|
| `OFFSITE_AGE_IDENTITY` and the file it points at | the safe place of §3, and the identity of the new host | the copy on the target cannot be read: **the backups are gone** |
| `OFFSITE_AGE_RECIPIENT` | the public half of the identity, `age-keygen -y` | the backup script cannot encrypt and fails loudly |
| `OFFSITE_TARGET` and the ssh key of the alias `blipmade-offsite` | the configuration of the platform (`blipmade-offsite:/srv/blipmade-backups`) and the key of the operator | the backup script fails loudly: no copy leaves the host |
| `POSTGRES_PASSWORD`, `DATABASE_URL` | the secret store of the operator | the database does not come up, the backup cannot be made |
| `SESSION_SECRET` | the secret store of the operator | the API refuses to start. **Rotating it makes the encrypted client key of every customer unreadable**, so it is not a value that is simply replaced after a restore |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | the secret store of the operator, and the dashboard of Stripe | the checkout does not work. The keys are the same before and after a restore: the payment provider is not part of the backup and its data is not in the database |
| `PTERODACTYL_APP_KEY`, `PTERODACTYL_CLIENT_KEY`, `PTERODACTYL_URL`, `PANEL_KEYMINT_URL`, `PANEL_KEYMINT_SECRET` | the secret store of the operator, and the panel on VM 100 | the worker cannot provision the servers and the customer tools cannot use the panel |
| `SMTP_URL` | the secret store of the operator, and the mail host | the mail of the platform is written to `BACKUP_DIR/mail` instead of being sent |
| `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN`, `DOMAIN_BASE`, `DOMAIN_TARGET` | the secret store of the operator, and the edge on VM 102 | the customer domains are not routed and are not added to the edge |
| `ADMIN_ENROLLMENT_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the secret store of the operator | the first administrator cannot be enrolled |
| `BLIPMADE_INTERNAL_API_TOKEN` | the secret store of the operator | the internal calls between the API and the worker are refused |
| `PUBLIC_WEB_URL`, `APP_ORIGIN`, `APP_PUBLIC_URL` | the public address of the platform | the links of the mail and of the checkout point at the wrong address |
| `PAYMENTS_ENABLED`, `NODE_ENV`, `TRUSTED_PROXIES`, `BACKUP_DIR`, `ATTACHMENT_DIR` | the configuration of the new host | the platform runs with the wrong behaviour. `PAYMENTS_ENABLED=false` answers that the payments are not available instead of taking money |
| **the DNS of the platform** | the registrar of `blipmade.com` | the public name does not reach the new host. The edge on VM 102 has to point at the new address, and `DOMAIN_TARGET` has to be changed with it |
| **the address of the new host in the firewall and in the edge** | the operator | the platform answers from the old address, or not at all |
| **the copy of the identity of `age`** | the safe place of §3 | the next loss of the host loses the backups as well |

The values themselves are **never in a backup**. The environment file of the
platform is recreated by the operator from the secret store, and the copy of
the repository on the new host is not a substitute for it.

---

## 8. The other documents

* `scripts/README.md` — what every script in `scripts/` does and what it
  needs.
* `docs/RUNBOOK.md` §7 and §9 — the drill of the local archive and the
  off-host restore.
* `README.md` §8 — the three stages of the backup chain.
* `docs/PRODUCTION_READINESS.md` — the state of the platform and what is
  still unverified.
