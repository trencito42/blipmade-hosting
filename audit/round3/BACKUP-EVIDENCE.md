# Backup, restore and off-site evidence — round three of the operational audit

* Date: 2026-10-24
* Branch: `fix/r3-ops` (based on `origin/main` = 106809c)
* Host: `debian@10.77.0.13`, worktree `/home/debian/wt-r3-ops`
* The live database was never dumped into, never restored into and never
  compared in a way that writes to it. Every run below used the test database
  `blipmade_r3_ops_test`.

---

## 1. The short answer

| Question | Answer |
|---|---|
| Does the backup produce a real archive, and what is in it? | **Proven.** A database dump, the configuration without the secrets, and the upload storage. |
| Does a backup restore into a working database? | **Proven, after a repair.** The archive itself restores: the restore drill restores it into a scratch database that matches the live one. `scripts/restore.sh` was broken and restored **nothing** (section 8.1); it was repaired on 2026-10-24 and now restores the 28 tables of the dump and answers queries (section 5.1). |
| Does the off-site path fail loudly when `OFFSITE_TARGET` is missing? | **Proven.** The script ends with the status **3** and says that no copy left the host. |
| Does a copy on the same host count as a disaster-recovery copy? | **No.** The host runs **RAID 0**; a copy on this host dies with the host. Today every backup stays here. |

---

## 2. The isolation of the runs

```
$ set -a; . /opt/blipmade/.env; set +a
$ T="${DATABASE_URL/@postgres:/@localhost:}"; T="${T%/*}/blipmade_r3_ops_test"
$ echo "$T" | sed 's/:[^:@]*@/:<password>@/'
postgresql://blipmade:<password>@localhost:5432/blipmade_r3_ops_test
```

* the database that was dumped and restored is `blipmade_r3_ops_test`;
* the drill writes into `blipmade_r3_ops_restore_test`, a scratch database that
  is dropped again at the end of the drill;
* the uploads that were put into the archive are **not** the uploads of a
  customer: `ATTACHMENT_DIR` pointed at `/tmp/blipmade-r3/uploads`, a
  directory with two files that the audit created. The helper
  `blipmade_upload_source` takes the directory that is given to it before it
  looks at the volume of Docker (`scripts/backup-common.sh:17-44`), so the
  real volume was never touched;
* the local archives were written into `/tmp/blipmade-r3/backups`, not into
  `/var/backups/blipmade`.

The scripts that were read before they were run: `scripts/backup.sh`,
`scripts/backup-common.sh`, `scripts/backup-offsite.sh`, `scripts/restore.sh`,
`scripts/restore-drill.sh`, `scripts/backup-alert.sh`, plus the unit
`scripts/systemd/blipmade-backup.service` and the timer
`scripts/systemd/blipmade-backup.timer`.

---

## 3. PROVEN: what the backup produces, and where

```
$ cd /home/debian/wt-r3-ops && DATABASE_URL="$T" BACKUP_DIR=/tmp/blipmade-r3/backups \
    ATTACHMENT_DIR=/tmp/blipmade-r3/uploads bash scripts/backup.sh r3audit
==> Dumping the database
==> Copying the configuration (secrets are never included)
==> Adding the customer uploads (2 files from /tmp/blipmade-r3/uploads)
==> Backup written: /tmp/blipmade-r3/backups/blipmade-r3audit-20261024T213751Z.tar.gz
627ee849ba2d9903e6e4a979c4d2fbd5f83236af5ca5f760882d5a1e4bb6b482  /tmp/blipmade-r3/backups/blipmade-r3audit-20261024T213751Z.tar.gz
==> Removing local backups older than 14 days
==> OFFSITE_TARGET is not set, so this copy stayed on this host.
    The host uses RAID 0. Configure OFFSITE_TARGET before relying on these backups.
```

The archive and its checksum:

```
$ ls -l /tmp/blipmade-r3/backups/
-rw-rw-r-- 1 debian debian 40425 Oct 24 21:37 blipmade-r3audit-20261024T213751Z.tar.gz
-rw-rw-r-- 1 debian debian   132 Oct 24 21:37 blipmade-r3audit-20261024T213751Z.tar.gz.sha256
```

What is inside:

```
$ tar -tzf blipmade-r3audit-20261024T213751Z.tar.gz
./
./uploads.tar.gz
./config.tar.gz
./database.dump

$ tar -xzOf blipmade-r3audit-20261024T213751Z.tar.gz ./config.tar.gz | tar -tzf - | head
compose.yml
compose.api.yml
compose.web.yml
api/prisma/
api/prisma/seed.ts
api/prisma/schema.prisma
api/prisma/migrations/
...

$ tar -xzOf blipmade-r3audit-20261024T213751Z.tar.gz ./uploads.tar.gz | tar -tzf -
./
./probe-two.txt
./probe-one.txt
```

**The secrets are not in the archive.** The environment file is excluded
(`scripts/backup.sh:50-56`, `--exclude='.env'`), and the check of the archive
confirms it:

```
$ tar -xzOf blipmade-r3audit-20261024T213751Z.tar.gz ./config.tar.gz | tar -tzf - | grep -c "\.env"
0
```

---

## 4. PROVEN: the restore drill restores a working database

```
$ cd /home/debian/wt-r3-ops && DATABASE_URL="$T" BACKUP_DIR=/tmp/blipmade-r3/backups \
    SCRATCH_DB=blipmade_r3_ops_restore_test ATTACHMENT_DIR=/tmp/blipmade-r3/uploads \
    bash scripts/restore-drill.sh
==> Archive: /tmp/blipmade-r3/backups/blipmade-r3audit-20261024T213751Z.tar.gz
==> Creating the scratch database
NOTICE:  database "blipmade_r3_ops_restore_test" does not exist, skipping
==> Restoring into blipmade_r3_ops_restore_test
==> Comparing the live database with the restored one
==> Checking the rest of the archive
  uploads.tar.gz   present, 2 entries, readable
  config.tar.gz    present, 21 entries, readable
  tables         live=33     restored=33
  users          live=2      restored=2
  products       live=5      restored=5
  migrations     live=14     restored=14
  RESULT: the backup restores into a database that matches the live one,
           and it holds the uploads and the configuration.
==> Dropping the scratch database
exit: 0
```

The drill compares the live database (here: the test database) with the
restored one, and it checks that the archive holds the uploads and the
configuration as well — a backup that holds the database but not the files of
the customers is not a backup of the platform.

**How the drill was kept away from production.** The drill reads
`DATABASE_URL` and derives the scratch database from it
(`scripts/restore-drill.sh:27-31`). The database was therefore pointed at
the test database and the scratch database was named
`blipmade_r3_ops_restore_test`. The live database `blipmade` was never the
target of the drill, and the scratch database is dropped again at the end of
the drill.

---

## 5. PROVEN: `scripts/restore.sh` restores — and a defect that stops it

The script was run as it is, against a database of its own
(`blipmade_r3_ops_restore2_test`):

```
$ DATABASE_URL="${BASE}/blipmade_r3_ops_restore2_test" ATTACHMENT_DIR=/tmp/blipmade-r3/uploads \
    bash scripts/restore.sh "$A" --yes
EXIT CODE: 141
--- the last 8 lines of the output ---
;
; Selected TOC Entries:
;
891; 1247 5188690 TYPE public BillingPeriod blipmade
888; 1247 5188676 TYPE public Category blipmade
1023; 1247 5189424 TYPE public DeadLetterState blipmade
912; 1247 5188776 TYPE public DomainStatus blipmade
1002; 1247 5189274 TYPE public FulfillmentStatus blipmade
--- the lines around the listing ---
3:==> Listing the dump
```

**The script stopped before it restored anything.** The database was still
empty:

```
$ docker exec blipmade-postgres-1 psql -U blipmade -d blipmade_r3_ops_restore2_test \
    -c "SELECT count(*) AS users FROM \"User\";"
ERROR:  relation "User" does not exist
```

This is the defect of section 8.1. To be able to prove that the archive
itself restores, the script was run once more with a `head` that survives a
closed pipe (`audit/_tools/r3-safe-head/head`), without changing the script:

```
$ PATH="$PWD/audit/_tools/r3-safe-head:$PATH" DATABASE_URL="${BASE}/blipmade_r3_ops_restore2_test" \
    ATTACHMENT_DIR=/tmp/blipmade-r3/uploads bash scripts/restore.sh "$A" --yes
EXIT CODE: 0
==> Restoring
==> Restoring the customer uploads into /tmp/blipmade-r3/uploads
    2 files are in place
==> The archive also holds the configuration of the platform.
    It was not applied: the configuration of a live platform is changed
    by a human, and the secrets are never part of a backup.
      compose.yml
      compose.api.yml
      compose.web.yml
      api/prisma/
      ...
==> Verifying the restored database
 tables
--------
     33
```

and the restored database answers queries:

```
$ docker exec blipmade-postgres-1 psql -U blipmade -d blipmade_r3_ops_restore2_test \
    -c "SELECT count(*) AS users FROM \"User\";" -c "SELECT count(*) AS products FROM \"Product\";" \
    -c "SELECT count(*) AS migrations FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;" \
    -c "SELECT email FROM \"User\" ORDER BY email;"
 users
-------
     2
 products
----------
        5
 migrations
------------
        14
              email
------------------------------
 r3-admin@blipmade.test
 r3-audit-customer@blipmade.test
(4 rows)
```

The checksum is checked before the restore (`==> Checking the checksum …
OK`).

### 5.1 The script of the day, run again after the repair

The repair of section 8.1 went into the script itself, so the script no
longer needs the `r3-safe-head` shim that was put on the path to prove that
the archive is good. The run below is the script of the repository, with
nothing else on the path, against a database of its own
(`blipmade_r3_restore_test`, created for this run and dropped afterwards):

```
$ cd /home/debian/wt-r3 && DATABASE_URL="${BASE}/blipmade_r3_restore_test" \
    bash scripts/restore.sh /var/backups/blipmade/blipmade-drill-20261022T232117Z.tar.gz --yes
==> Checking the checksum
/var/backups/blipmade/blipmade-drill-20261022T232117Z.tar.gz: OK
==> Listing the dump
;
; Archive created at 2026-10-22 23:21:17 UTC
...
==> Restoring
==> Verifying the restored database
 tables
--------
     28
(1 row)

==> Restore complete
EXIT CODE: 0
```

and the restored database answers queries:

```
$ docker exec blipmade-postgres-1 psql -U blipmade -d blipmade_r3_restore_test \
    -c "SELECT count(*) AS tables FROM information_schema.tables WHERE table_schema='public';" \
    -c "SELECT count(*) AS users FROM \"User\";"
 tables
--------
     28
(1 row)

 users
-------
     2
(1 row)
```

The script of the day and the script of today were run side by side, on the
same archive and against the same database:

| Script | Status of the run | Tables in the target afterwards |
|---|---:|---:|
| the script of the day (`\| head -20`) | **141** | **0** — `ERROR: relation "User" does not exist` |
| the script of today (`\| sed -n '1,20p'`) | **0** | **28**, with 2 users |

---

## 6. PROVEN: the off-site path fails visibly when it is not configured

### 6.1 No target — the unattended run fails

```
$ cd /home/debian/wt-r3-ops && DATABASE_URL="$T" BACKUP_DIR=/tmp/blipmade-r3/backups \
    ATTACHMENT_DIR=/tmp/blipmade-r3/uploads bash scripts/backup-offsite.sh
==> OFFSITE_TARGET is not set, so no off-site copy was made.
    The host uses RAID 0, so the local copy is not a disaster recovery
    backup. Configure OFFSITE_TARGET and the encryption keys:
      OFFSITE_TARGET          where the copy goes
      OFFSITE_AGE_RECIPIENT   the age recipient, for example age1....
      OFFSITE_AGE_IDENTITY    the path to the age identity file
      OFFSITE_ENCRYPTION_KEY  the passphrase of the openssl fallback
    The backup failed: no copy left this host.
EXIT CODE: 3
```

The script does **not** report a success. The status 3 makes the unit of the
timer fail, which raises the alarm (`scripts/systemd/blipmade-backup.service`):

```
ExecStart=/opt/blipmade/scripts/backup.sh scheduled
ExecStartPost=/opt/blipmade/scripts/backup-offsite.sh
OnFailure=/opt/blipmade/scripts/backup-alert.sh
```

The unit does not pass `--allow-no-target`, so an unattended run without a
target fails. A human who only wants the local copy has to say so:

```
$ bash scripts/backup-offsite.sh --allow-no-target
==> OFFSITE_TARGET is not set, so no off-site copy was made.
    ...
    --allow-no-target was given, so this run ends without a failure.
EXIT CODE: 0
```

### 6.2 A target without a key — the copy is refused

```
$ OFFSITE_TARGET=/tmp/blipmade-r3/offsite-target OFFSITE_TRANSPORT=local bash scripts/backup-offsite.sh
OFFSITE_TARGET is set but no encryption key is configured.
Set OFFSITE_AGE_RECIPIENT together with OFFSITE_AGE_IDENTITY, or set
OFFSITE_ENCRYPTION_KEY for the openssl fallback.
EXIT CODE: 1
```

A plain copy never leaves the host.

### 6.3 A target and a key — the copy leaves the host, encrypted and checked

`age` is not installed on this host, so the fallback (`openssl enc`, AES-256-CBC
with PBKDF2) was used. The passphrase below is a passphrase that the audit
made up for this run; it is not a credential of the platform.

```
$ OFFSITE_TARGET=/tmp/blipmade-r3/offsite-target OFFSITE_TRANSPORT=local \
    OFFSITE_ENCRYPTION_KEY="r3-audit-local-passphrase-not-a-production-key" \
    bash scripts/backup-offsite.sh
==> Dumping the database
==> Adding the upload storage (2 files from /tmp/blipmade-r3/uploads)
==> Adding the configuration of the platform
==> Encrypting the payload
==> Reading the encrypted copy back
    The copy decrypts into a readable dump.
==> Sending the copy to the off-site target
    The copy is on the target and has the expected size.
==> Off-site backup complete
    file      : blipmade-offsite-20261024T214028Z.tar.gz.enc
    size      : 39248 bytes
    target    : local "offsite-target"
    kept      : 14 copies on the target
    local copy: removed after the copy on the target was verified
EXIT CODE: 0
```

The copy on the target is really encrypted:

```
$ ls -l /tmp/blipmade-r3/offsite-target/
-rw------- 1 debian debian 39248 Oct 24 21:40 blipmade-offsite-20261024T214028Z.tar.gz.enc

$ file /tmp/blipmade-r3/offsite-target/*.enc
... : openssl enc'd data with salted password

$ tar -tzf /tmp/blipmade-r3/offsite-target/*.enc
gzip: stdin: not in gzip format
tar: Child returned status 1
```

The local copy of the payload is only removed after the copy on the target was
verified:

```
$ ls -l /tmp/blipmade-r3/backups/offsite/
total 0
```

**This run used the `local` transport, so the copy is on the same host. It
proves that the machinery works; it is NOT a disaster-recovery copy.** The
transport that the operator has to use is `rclone` (an object storage
bucket) or `ssh` (a second host); `local` is only a mounted volume.

---

## 7. What the operator has to do

### 7.1 The variables

| Variable | Where | Expected format | Secret |
|---|---|---|---|
| `OFFSITE_TARGET` | `/opt/blipmade/.env` (the unit reads it through `EnvironmentFile=-/opt/blipmade/.env`) | `rclone:<remote>` (for example `rclone:blipmade-backups`), `user@host:/srv/blipmade` for ssh, or `/mnt/offsite/blipmade` for a mounted volume. The transport is detected from the shape when `OFFSITE_TRANSPORT` is not set. | no (it names a host) |
| `OFFSITE_AGE_RECIPIENT` | `/opt/blipmade/.env` | the public recipient of age, for example `age1...`. It is used when `age` is installed. | no |
| `OFFSITE_AGE_IDENTITY` | `/opt/blipmade/.env` | the path of the identity file that reads the copy back, for example `/etc/blipmade/backup.agekey`. The file must exist and be readable by the account of the service. | **yes** |
| `OFFSITE_ENCRYPTION_KEY` | `/opt/blipmade/.env` | the passphrase of the openssl fallback, used when `age` is not installed or no recipient is set. It is read from the environment, never from the command line. | **yes** |
| `OFFSITE_TRANSPORT` | `/opt/blipmade/.env` | `rclone`, `ssh` or `local`. Only needed when the detection guesses wrong. | no |
| `OFFSITE_KEEP_COPIES` | `/opt/blipmade/.env` | how many copies stay on the target. Default `14`. | no |
| `BACKUP_DIR` | `/opt/blipmade/.env` | where the local archives are written. Default `/var/backups/blipmade`. | no |
| `BACKUP_KEEP_DAYS` | `/opt/blipmade/.env` | how many days the local archives are kept. Default `14`. | no |
| `BACKUP_ALERT_WEBHOOK_URL` | `/opt/blipmade/.env` | the webhook that receives the alarm of a failed backup. Without it the alarm only reaches the journal of the machine. | yes |

**No credential is written in this document on purpose.** The values above are
the formats; the values themselves belong to the operator.

### 7.2 The state of the production today

```
$ grep -E "^OFFSITE" /opt/blipmade/.env
(no output)
```

None of the variables is set, so **every backup of the platform stays on the
RAID 0 host**. The nightlies therefore produce a copy that dies with the
machine.

### 7.3 How the operator verifies that a copy really left the host

A copy on the same host is not a disaster-recovery copy. The proof that a copy
left the host is one of these:

1. **An object in the remote bucket.** With the `rclone` transport:

   ```
   $ rclone lsjson --files-only blipmade-backups | jq -r '.[].Path' | tail -3
   blipmade-offsite-20261025T021500Z.tar.gz.enc
   ```

   and its size has to be the size that the script printed:

   ```
   $ rclone lsjson --files-only blipmade-backups \
     | jq -r '.[] | select(.Path=="blipmade-offsite-20261025T021500Z.tar.gz.enc") | .Size'
   39248
   ```

2. **A second host that shows the file.** With the `ssh` transport:

   ```
   $ ssh backup-host 'ls -l /srv/blipmade/ | tail -3'
   -rw------- 1 blipmade blipmade 39248 Oct 25 02:15 blipmade-offsite-20261025T021500Z.tar.gz.enc
   ```

3. **The copy has to be readable.** The decryption on the second host is the
   proof that the copy is complete, not only present:

   ```
   $ ssh backup-host 'age --decrypt -i /etc/blipmade/backup.agekey \
       /srv/blipmade/blipmade-offsite-20261025T021500Z.tar.gz.enc' | tar -tzf - | head
   ./
   ./uploads.tar.gz
   ./config.tar.gz
   ./database.dump
   ```

4. **A restore drill against the copy that came from outside.** The drill of
   section 4 was run against an archive of the copy on this host. Once the
   off-site copy exists, the operator repeats the drill **with the archive
   that came back from the other host**, which is the only drill that proves
   the disaster-recovery path:

   ```
   $ scp backup-host:/srv/blipmade/blipmade-offsite-20261025T021500Z.tar.gz.enc /tmp/
   $ age --decrypt -i /etc/blipmade/backup.agekey \
       /tmp/blipmade-offsite-20261025T021500Z.tar.gz.enc | tar -xzf - -C /tmp/restore
   $ SCRATCH_DB=blipmade_restore_check bash scripts/restore-drill.sh /tmp/restore/...
   ```

   **The drill must never be pointed at the live database**: it compares the
   live database with the restored one, so it has to be pointed at the test
   database (see section 4) until a separate copy of the live database is
   available to compare with.

### 7.4 The alarm of a failed backup

As long as `SMTP_URL` is empty and no webhook is configured, a failed backup
is only visible in the journal of the machine:

```
$ cd /opt/blipmade && bash scripts/backup-alert.sh "the audit proved this"
BACKUP-ALERT: The backup of the Blipmade platform failed on blipmade-platform at 2026-10-24T21:40:49Z: the audit proved this
BACKUP-ALERT: no BACKUP_ALERT_WEBHOOK_URL and no SMTP_URL are configured,
BACKUP-ALERT: the alarm was only written to the journal of the machine.
```

---

## 8. Defects found on this path

### 8.1 `scripts/restore.sh` can stop before it restores anything — HIGH — **REPARED 2026-10-24**

**Where:** `scripts/restore.sh:50` (and with the same pattern `scripts/restore.sh:86`).

```bash
 46  echo "==> Listing the dump"
 50  pg_restore --list "$WORK/database.dump" | head -20
 51  echo "    ... $(pg_restore --list "$WORK/database.dump" | grep -c 'TABLE DATA' || true) tables with data"
```

The script runs with `set -euo pipefail` (`scripts/restore.sh:7`). When
`head` has read its twenty lines it closes the pipe, `pg_restore` is killed
by SIGPIPE and ends with the status 141. With `pipefail` the pipeline
fails, and with `set -e` **the script stops there** — before the restore, in
the middle of the output, with a status of 141 that looks like a crash
instead of "the restore did not happen".

This was observed on a real archive: the script stopped after
`==> Listing the dump`, the database was left empty
(`ERROR: relation "User" does not exist`), and the operator would have read
the status 141 as a broken archive.

**Proposed fix:** do not let the reader close the pipe under the writer, or
neutralise the status of the listing:

```bash
pg_restore --list "$WORK/database.dump" | sed -n '1,20p' || true
```

(`sed` reads the whole input, so `pg_restore` is never killed.) The same
change is needed on line 86 (`tar -tzf "$WORK/config.tar.gz" | head -10 | sed …`).

**Repair, 2026-10-24 (commit `26fc2e6`):** the change proposed above went
into the script, together with the same change on
`scripts/backup-offsite.sh`, `scripts/smoke-production.sh`,
`scripts/test-migrations.sh` and `scripts/restore-drill.sh`. The proof is in
section 5.1: the script of the day answers with the status 141 and restores
nothing, the script of today answers with the status 0 and restores the 28
tables of the dump.

The rule is guarded by `api/tests/script-pipe-safety.test.ts`: a script that
watches the pipes of its commands may not pipe into `head`. The test fails
on the script of the day and passes on the script of today, and it shows the
status 141 and the status 0 side by side.

The size of the output decides whether the pipe breaks, so the defect is
rare and looks like a crash: an output that fits in the buffer of the pipe
(64 KiB) is written completely before `head` closes it and the script
continues. A listing of a dump is larger than the buffer, and that is the
case that stopped the restore.

### 8.2 The documentation of the off-site behaviour is wrong in three places — MEDIUM

* `README.md:332-334`:

  > * Without `OFFSITE_TARGET` the script prints that the off-site copy was not
  >   made and exits `0`. It never fails a deployment because the optional feature
  >   is not configured, and it never claims that a backup was made.

  The script ends with the status **3** and the unit of the timer therefore
  fails. The text describes the behaviour before the repair of commit
  `5dbfa94` ("Make a backup that cannot lie about what it leaves the host")
  and contradicts the code that is in the repository now.

* `scripts/backup-offsite.sh:40-42`:

  > ```
  > # Note: scripts/backup.sh reads OFFSITE_TARGET as well and copies the
  > # unencrypted archive to it. That copy must not be used. This script is the
  > # one that is allowed to have the target.
  > ```

  `scripts/backup.sh` does **not** copy anything to the target. It only
  prints that the copy stayed on the host (`scripts/backup.sh:92-99`). The
  note is the remains of the old behaviour and it is the most dangerous
  sentence of the file: a reader would believe that an **unencrypted**
  archive travels to the off-site target.

* `scripts/README.md:25` (the table of the runbooks):

  > `backup.sh [label]` | Dumps the database, archives the configuration without secrets, writes a SHA-256 checksum, applies the retention policy and **copies the archive to `OFFSITE_TARGET` when one is configured**. | …

  The same wrong claim, in the document the operator reads first.

**Proposed fix:** correct the three texts to what the code does — the local
archive stays on the host, the encrypted copy is a separate step
(`scripts/backup-offsite.sh`), and the run of the unit fails when no target
is configured.

### 8.3 The runbook does not mention the off-site script at all — MEDIUM

`scripts/README.md` lists the scripts of the platform in a table of runbooks
(`backup.sh`, `restore.sh`, `restore-drill.sh`, `run-tests.sh`, …) but
`backup-offsite.sh` and `backup-alert.sh` are **not in it**:

```
$ grep -n "backup-offsite\|backup-alert" scripts/README.md
(no output)
```

The variables of the off-site copy are documented in the root `README.md`
(lines 268-279), but the runbook of the scripts — the document that tells the
operator what to run — never says that the encrypted copy is a second step of
the unit, nor that the unit fails without a target.

**Proposed fix:** add the two rows to the table of `scripts/README.md` and
say there which variables each of them needs.

### 8.4 The drill compares the live database with the restored one — LOW (by design, but risky)

`scripts/restore-drill.sh:27-31` derives the scratch database from
`DATABASE_URL` and compares the **live** database with the restored one. The
script never writes to the live database, so it is safe, but the comparison
only means something when the archive really is a copy of that database. If
the drill is pointed at a test database while the archive is a copy of the
live one, the result is a false "it does not match".

**Proposed fix:** say in the output of the drill which database was compared
(`echo "  comparing the live database $HOST_URL"`), so the operator cannot
read a comparison of two different databases as a failure of the backup.

---

## 9. What could not be verified

* **The copy was never sent to another host.** `rclone` is not installed on
  this host and no second host was available, so the `rclone` and the `ssh`
  transport could not be exercised. The `local` transport was exercised and
  is the same code path apart from the two commands that copy the file.
  The proof that a copy leaves the host therefore still has to be made by the
  operator with the bucket or the second host.
* **`age` was not exercised.** `age` is not installed on this host
  (`command -v age` → nothing), so the fallback of the openssl was used. The
  stronger mode (ChaCha20-Poly1305) could not be tested here.
* **The behaviour of a bucket that is not reachable, of a full disk and of a
  host that is switched off during the night** was not exercised.
* **The restore of the uploads into the real volume** was not exercised: the
  drill only checks that the archive holds them, and the restore was pointed
  at a directory of the audit.
