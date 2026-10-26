# Blipmade — incident runbook

The procedures for the platform on the control-plane host **VM 103**, in
`/opt/blipmade`. Every command in this document is meant to be pasted into a
shell on that host.

Nothing here prints a secret. When a key has to be checked, the command only
tells you whether it is set.

---

## 0. The first three commands

Whatever the incident is, start here.

```bash
cd /opt/blipmade
DC="docker compose -f compose.yml -f compose.api.yml -f compose.web.yml"

$DC ps                                  # which container is unhealthy
$DC logs --tail 100 api                # the API log
$DC logs --tail 100 worker             # the worker log
```

The environment for the database and the queue is read from the `.env` file.
The compose hostnames do not resolve from the host, so they are rewritten the
same way the backup scripts do it:

```bash
cd /opt/blipmade
set -a; . ./.env; set +a
export DATABASE_URL="${DATABASE_URL/@postgres:/@localhost:}"
export REDIS_URL="${REDIS_URL/@redis:/@localhost:}"
```

---

## 1. Reading the health endpoints

### The API

```bash
curl -s http://127.0.0.1:3100/health
curl -s http://127.0.0.1:3100/api/health          # the same answer under the prefix
curl -s http://127.0.0.1:3100/api/status          # the public status page
```

The answer of `/health`:

```json
{
  "status": "ok",
  "service": "blipmade-api",
  "version": "1.0.0",
  "uptimeSeconds": 8123,
  "database": true,
  "redis": true,
  "mail": "file",
  "stripe": "not_configured",
  "pterodactyl": "configured",
  "pterodactylClient": "not_configured"
}
```

| Field | Meaning when it is wrong |
|---|---|
| `status` | `degraded` means the database did not answer. |
| `database` | `false` means PostgreSQL is down or the connection string is wrong. |
| `redis` | `false` means Redis is down. The queue and the rate limiter stop working. |
| `mail` | `file` means `SMTP_URL` is empty and the mail is written to `BACKUP_DIR/mail` instead of being sent. |
| `stripe` | `not_configured` means `STRIPE_SECRET_KEY` is empty and the local test gateway is used. `test` means the test mode is on. |
| `pterodactyl` | `not_configured` means `PTERODACTYL_URL` or `PTERODACTYL_APP_KEY` is empty. Nothing can be provisioned. |
| `panelKeyBridge` | `not_installed` means the bridge of the panel is not there, so the panel cannot issue the client key of a customer. Power, files, console, backups and databases do not work. See `docs/PANEL_BRIDGE.md`. |

The answer of `/api/status` has an `overall` of `operational`, `degraded` or
`major_outage`, and one entry per component. Every component is measured on its
own and carries a `detail` that says what was measured, so a green light always
means that the check behind it was run:

| Component | It turns `degraded` when |
|---|---|
| `api` | The database does not answer. It is `down` in that case. |
| `dashboard` | The database does not answer. |
| `cache` | Redis does not answer. |
| `panel` | The Pterodactyl panel does not answer. It is `down` in that case. |
| `worker` | The worker does not answer on `WORKER_URL`. It is `down` in that case. |
| `queue` | The queue holds failed jobs. The detail gives the number of waiting, running, delayed and failed jobs. |
| `nodes` | Every node of the panel is in maintenance, or the nodes cannot be read. |
| `allocator` | There is no free port left for a new service. |
| `provisioning` | A service is not online. The detail gives the number and the age of the oldest one. |
| `support` | `SMTP_URL` is empty, so the mail is written to a file instead of being sent. |

### The worker

The worker does not serve the API. It has its own health port.

```bash
curl -s http://127.0.0.1:3101/health
```

```json
{ "status": "ok", "database": true, "redis": true, "worker": true }
```

`worker: false` means the BullMQ consumer is not running. `redis: false` means
it lost the connection to the queue.

### The web container

It is bound to the LAN address of the host, so read it from inside:

```bash
$DC exec web wget -qO- http://127.0.0.1:3000/healthz
```

### The queue

The queue is `blipmade.provision` (see `api/src/services/queue.ts`) and it lives
in Redis. Redis is bound to loopback, so it is read from the host:

```bash
redis-cli -h 127.0.0.1 LLEN  bull:blipmade.provision:wait      # waiting
redis-cli -h 127.0.0.1 LLEN  bull:blipmade.provision:active    # being worked on
redis-cli -h 127.0.0.1 ZCARD bull:blipmade.provision:delayed   # waiting for the backoff
redis-cli -h 127.0.0.1 SCARD bull:blipmade.provision:failed    # failed
redis-cli -h 127.0.0.1 --scan --pattern 'bull:blipmade.provision*'
```

The worker runs two jobs at a time, so `active` is never above `2` in a healthy
system. The exact key layout belongs to BullMQ, so when a key above does not
answer, list the keys with the `--scan` command and read the one that exists.

---

## 2. The panel is unreachable

**Symptoms.** `/api/status` shows `panel` as `down` and `provisioning` as
`degraded`. New orders stay in `PROVISIONING`. The instances record an error
that mentions the panel.

**Check whether it is the panel or the platform.**

```bash
# from the host
curl -sS -o /dev/null -w 'panel http status: %{http_code}\n' https://panel.blipmade.com/

# from the API container, which resolves the panel name through extra_hosts
$DC exec api wget -qO- --spider https://panel.blipmade.com/ 2>&1 | head -3

# is the key set? the value is never printed
grep -c '^PTERODACTYL_APP_KEY=..' .env
```

**If the panel answers but the platform says it does not:** the key is wrong or
expired. See §8, rotating the Pterodactyl credentials.

**If the panel does not answer at all:** the panel is on VM 100 and it is not
part of this repository. Check it there. Nothing on VM 103 can be fixed to
bring the panel back.

**While the panel is down.**

* The API and the frontend keep working. Customers can sign in, read their
  instances, open tickets and pay.
* The worker keeps retrying. A job fails after five attempts with an
  exponential backoff, and the instance records the reason.
* Do not restart the API. It does not help and it loses the running requests.

**After the panel is back.** The worker reconciles on its own every minute, but
the instances that failed have to be retried by hand:

```bash
# the instances that are stuck
psql "$DATABASE_URL" -c 'SELECT id, name, status, "provisionStep", "provisionError" FROM "Instance" WHERE status IN ('"'"'PROVISIONING'"'"','"'"'PENDING'"'"','"'"'FAILED'"'"') ORDER BY "createdAt";'

# retry through the admin interface, or with the API
curl -sS -X POST http://127.0.0.1:3100/api/admin/instances/<instance-id>/retry \
  -H "Authorization: Bearer <the session cookie or the internal token>" \
  -H "x-csrf-token: <the csrf token>"
```

The retry resumes after the last successful step (`provisionStep`), so a server
that is already installed is not reinstalled.

---

## 3. The node is down

**Symptoms.** The provisioning stops after `started`, the instance ends in
`FAILED` and `provisionError` names the step and the message. The panel is
reachable, so §2 does not apply.

**Check the node.** The node is on VM 101 and belongs to the node owner. The
platform can only read it:

```bash
# the node and the server state, read only
python3 scripts/ops/probe-node.py
python3 scripts/ops/probe-allocation.py
python3 scripts/ops/probe-binding.py
```

The allocation ports are the ports a customer connects to. They are published
on the node, not by the platform. A container that runs but does not answer on
its port is a node fault, not a platform fault.

**What the platform does about it.**

```bash
# the instances of this node
psql "$DATABASE_URL" -c 'SELECT id, name, status, "pterodactylServerId", "provisionError" FROM "Instance" WHERE "pterodactylServerId" IS NOT NULL AND status <> '"'"'ONLINE'"'"';'
```

Leave the instances as they are and retry them once the node is back. Do not
delete them: the server on the node still exists, and the retry reuses it.

---

## 4. The worker has a backlog

**Check the queue and the worker.**

```bash
redis-cli -h 127.0.0.1 LLEN bull:blipmade.provision:wait
redis-cli -h 127.0.0.1 LLEN bull:blipmade.provision:active
redis-cli -h 127.0.0.1 SCARD bull:blipmade.provision:failed
curl -s http://127.0.0.1:3101/health
$DC logs --tail 200 worker
```

**The jobs of the instances.**

```bash
psql "$DATABASE_URL" -c 'SELECT id, "instanceId", step, status, attempts, error, "updatedAt" FROM "ProvisioningJob" WHERE status <> '"'"'completed'"'"' ORDER BY "updatedAt" DESC LIMIT 20;'
```

**A single stuck instance.** The worker holds a lock while it works on an
instance. The lock expires after 30 minutes, and the worker reconciles every
minute and puts the interrupted instances back into the queue. So an instance
that is `PROVISIONING` with an old `provisionLockAt` is picked up again
without any action.

```bash
psql "$DATABASE_URL" -c 'SELECT id, name, status, "provisionStep", "provisionLockAt" FROM "Instance" WHERE status = '"'"'PROVISIONING'"'"' ORDER BY "provisionLockAt";'
```

**The worker itself is stuck.** Restart it. The reconciliation runs at the
start, so the interrupted instances are queued again:

```bash
$DC restart worker
$DC logs --tail 50 worker
curl -s http://127.0.0.1:3101/health
```

**The queue is stuck because of a bad job.** A job that fails five times is
moved to the failed set and the instance records the reason. Fix the cause and
retry the instance:

```bash
# the failed jobs of the queue
redis-cli -h 127.0.0.1 --scan --pattern 'bull:blipmade.provision:failed*'
```

The retry from the admin interface removes the old job and enqueues a new one.
The job id is the instance id, so a retry never produces a second server.

---

## 5. A webhook failed to process

**Symptoms.** An order stays in `AWAITING_PAYMENT` although the customer paid,
or an invoice never arrives.

**Find the event.** Every webhook is written to the ledger before it is
processed, so nothing is lost.

```bash
psql "$DATABASE_URL" -c 'SELECT id, provider, "eventId", type, status, attempts, "lastAttemptAt", error, "createdAt" FROM "WebhookEvent" WHERE status <> '"'"'processed'"'"' ORDER BY "createdAt" DESC LIMIT 20;'
```

| `status` | Meaning |
|---|---|
| `received` | The event was stored and is waiting. |
| `processing` | The event is being worked on. It becomes `processed` or `failed`. |
| `processed` | The event was applied. A redelivery is ignored. |
| `failed` | The event was not applied. The error column says why. |

**How the endpoint answers.** `POST /api/webhooks/stripe`:

| Answer | Meaning |
|---|---|
| `200 {"received":true}` | The event was applied. |
| `200 {"received":true,"duplicate":true}` | The event was already processed. It was **not** applied twice. |
| `500 {"received":false,...}` | The event failed. The provider retries it. |
| `400 {"received":false,...}` | The payload or the signature was rejected. |
| `200 {"received":false,"reason":"Stripe is not configured."}` | `STRIPE_SECRET_KEY` is empty, so there is no live Stripe. |

**Reprocessing.**

1. Fix the cause. The `error` column says what went wrong, and the payload of
   the event is kept in the ledger.
2. Let the provider deliver the event again. Stripe retries a failed delivery
   for three days; after that the event has to be resent from the Stripe
   dashboard.
3. A redelivery of a `failed` event is picked up again: the ledger marks it as
   `processing` and increases `attempts`. A redelivery of a `processed` event
   is ignored on purpose, so a payment is never applied twice.

```bash
# the attempts of one event
psql "$DATABASE_URL" -c 'SELECT "eventId", type, status, attempts, error, "lastAttemptAt" FROM "WebhookEvent" WHERE "eventId" = '"'"'<the stripe event id>'"'"';'
```

**The order that the event belongs to.**

```bash
psql "$DATABASE_URL" -c 'SELECT id, number, status, "fulfillmentStatus", total, currency, "createdAt" FROM "Order" ORDER BY "createdAt" DESC LIMIT 20;'
psql "$DATABASE_URL" -c 'SELECT id, name, status, "provisionStep" FROM "Instance" WHERE "orderId" = '"'"'<the order id>'"'"';'
```

An order that is `PAID` but has no instance means the fulfilment did not run.
Retry the instance (§4) or the order, but never pay it twice.

---

## 6. Restoring from a backup

**This replaces the data with the state of the backup.** Every order, invoice
and instance that was created after the backup is gone. Take a fresh backup
first if the current data still has value.

```bash
cd /opt/blipmade
DC="docker compose -f compose.yml -f compose.api.yml -f compose.web.yml"

# the archives, newest first
ls -1t /var/backups/blipmade/blipmade-*.tar.gz | head

# a fresh backup of the current state, so nothing is lost that cannot be read
bash scripts/backup.sh before-restore

# stop the writers, otherwise they write while the restore runs
$DC stop api worker

# the script checks the checksum, lists the dump and asks for a confirmation
bash scripts/restore.sh /var/backups/blipmade/blipmade-before-restore-<stamp>.tar.gz
```

The confirmation has to be typed exactly:

```
This will overwrite the current database:
  postgresql://...
Type 'restore' to continue: restore
```

Then start the services again and check them:

```bash
$DC start api worker
$DC ps
curl -s http://127.0.0.1:3100/health
curl -s http://127.0.0.1:3101/health
```

**After a restore** the customers whose data was newer than the backup have to
be told, and the instances have to be checked against the panel. The server on
the node still exists, but the instance row may be older than the backup:

```bash
psql "$DATABASE_URL" -c 'SELECT id, name, status, "pterodactylServerId" FROM "Instance" ORDER BY "createdAt" DESC LIMIT 20;'
```

---

## 7. Running a restore drill

The drill proves that the backups are restorable. It never writes to the live
database: it restores into a scratch database, compares it with the live one
and drops it again.

```bash
cd /opt/blipmade

# the newest archive
bash scripts/restore-drill.sh

# a specific archive
bash scripts/restore-drill.sh /var/backups/blipmade/blipmade-daily-20261022T021700Z.tar.gz
```

The answer has to end with:

```
  tables         live=26     restored=26
  users          live=1      restored=1
  products       live=5      restored=5
  migrations     live=3      restored=3
  RESULT: the backup restores into a database that matches the live one.
```

The exit code is `0` only when every number matches. A difference means the
archive is not a faithful copy of the database, and the backup has to be fixed
before anything is restored from it.

The drill needs the `postgres` superuser, because it creates and drops the
scratch database `blipmade_restore_check`.

**Schedule it.** The nightly workflow in `.github/workflows/nightly-backup-drill.yml`
runs the same scripts against a disposable database, so a broken backup script
is noticed within a day. It does **not** replace this drill, because it does not
touch the archives of the production host.

---

## 8. Rotating the Pterodactyl credentials

The panel has two kinds of key and they are not interchangeable. The panel
answers *"You are attempting to use an application API key on an endpoint that
requires a client API key"* when the wrong one is used on a client endpoint.

| Variable | Panel | Prefix | Used for |
|---|---|---|---|
| `PTERODACTYL_APP_KEY` | Profile → API keys → **Application** key | `ptla_` | Creating and changing servers. The platform needs it. |
| `PANEL_KEYMINT_URL` | The endpoint of the bridge of the panel | the address of the bridge | The client key of every customer: power, files, console, backups and databases. |
| `PANEL_KEYMINT_SECRET` | The secret both sides sign with | the same value as on the panel | The signature of the request for a key. There is no shared key any more. |

**Rotate the application key.**

```bash
cd /opt/blipmade

# 1. create the new key in the panel: Profile → API keys → Create Application
#    with the administrative permissions. Keep the old key until the check
#    below has passed.

# 2. write the new key into the environment file. Never print the file.
#    Edit .env with an editor, or with a command that does not echo the value:
#    read -rs -p 'new application key: ' KEY && printf 'PTERODACTYL_APP_KEY=%s\n' "$KEY" >> .env
#    and remove the old line afterwards.

# 3. is it set? the value is never printed
grep -c '^PTERODACTYL_APP_KEY=..' .env

# 4. the environment file is read when the container is created, so the
#    containers have to be recreated, not restarted
$DC up -d --force-recreate api worker

# 5. check it
curl -s http://127.0.0.1:3100/health
```

`pterodactyl` has to be `configured` in the answer. Then revoke the old key in
the panel.

**Rotate the client key.**

```bash
# Account → API → Client API Key in the panel, then the same steps 2 to 5
$DC up -d --force-recreate api worker
curl -s http://127.0.0.1:3100/health
```

`pterodactylClient` has to be `configured`. Until it is, the customer power
control, the file manager, the console and the metrics answer an error.

**Rotating `SESSION_SECRET` is a different thing.** The panel password of every
customer account is encrypted with a key that is derived from
`SESSION_SECRET` (`api/src/lib/secrets.ts`). Rotating the secret makes every
stored password unreadable, so the reset path has to exist and be used before
the secret is rotated. Every other session ends at the same moment, so every
customer is signed out.

**Everything that changes a credential is written to the audit log:**

```bash
psql "$DATABASE_URL" -c 'SELECT "createdAt", action, "actorId", "targetType", "targetId", meta FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 30;'
```

---

## 9. The off-host restore, before go-live

The host uses RAID 0. A copy that stays on the host is not a backup, and a
restore drill against the local archive does not prove that the off-site copy
is readable. This procedure is the proof, and it has to be run once before the
first paying customer.

**On the control-plane host**, make an off-site copy:

```bash
cd /opt/blipmade
set -a; . ./.env; set +a
bash scripts/backup-offsite.sh
```

The script prints the name, the size and the target of the copy. It also says
that it made no copy when `OFFSITE_TARGET` is not set, and it fails the run in
that case: the host uses RAID 0, so a copy that stays here is not a backup.

The script dumps the database with the host of the platform, and the host of
the platform is the name of the database service of the compose network. That
name does not resolve from the host, so the script rewrites it to the loopback
address of the host before it dumps. The rewrite covers the hosts of the
services of the compose network that carry a port (`postgres:5432`,
`redis:6379`); a url that points somewhere else is left as it is, so a wrong
host shows in the log of the run instead of being hidden. A run that cannot
reach the database fails; it never writes a partial copy. The password of the
database is handed to `pg_dump` through `PGPASSWORD`, so it never shows up in
the process list of the machine.

**On another machine**, fetch the copy and read it back.

The copy is encrypted with `age` when `age` is installed and
`OFFSITE_AGE_RECIPIENT` is set, which is the configuration of the platform.
The key is the identity file of `OFFSITE_AGE_IDENTITY`. It is never written
into the archive of the backup and never travels with the copy; the identity
is carried to the machine that does the restore by a path of its own, and a
copy of it is kept offline, outside of the host.

```bash
# fetch it. The target of the platform is an ssh destination, so the alias
# of ~/.ssh/config is used. An rclone remote or a mounted volume works the
# same way, with the tool that matches the target.
scp blipmade-offsite:/srv/blipmade-backups/blipmade-offsite-<stamp>.tar.gz.enc ./blipmade-offsite.tar.gz.enc

# decrypt it
age --decrypt --identity /path/to/the/identity.age \
  --output ./payload.tar.gz ./blipmade-offsite.tar.gz.enc

# the dump has to be readable
mkdir -p ./payload && tar -xzf ./payload.tar.gz -C ./payload
pg_restore --list ./payload/database.dump | head -20
```

When the platform has no `age` and only the fallback of the script is
available, the copy is opened with `openssl` instead:

```bash
export OFFSITE_ENCRYPTION_KEY='<the key, typed here, never stored in a file>'
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 \
  -pass env:OFFSITE_ENCRYPTION_KEY \
  -in ./blipmade-offsite.tar.gz.enc -out ./payload.tar.gz
unset OFFSITE_ENCRYPTION_KEY
```

> The `openssl` fallback has no authenticated cipher. It is only a fallback;
> the platform runs `age`, which encrypts with ChaCha20-Poly1305.

> **The identity file of `age` is the key of the backups.** The copy on the
> target cannot be read without it. A copy of the identity file has to be kept
> offline, outside of the host, or a lost host means lost backups.

**Restore it into a scratch database on that machine** and compare it with the
numbers of the source host. This is the "restore onto another host" evidence:

```bash
createdb blipmade_restore_check
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d postgresql://<user>:<password>@localhost:5432/blipmade_restore_check ./payload/database.dump

psql postgresql://<user>:<password>@localhost:5432/blipmade_restore_check \
  -c 'SELECT count(*) AS tables FROM information_schema.tables WHERE table_schema = '"'"'public'"'"';'
psql postgresql://<user>:<password>@localhost:5432/blipmade_restore_check \
  -c 'SELECT count(*) AS users FROM "User";'
```

The numbers have to be the ones the drill on the control-plane host reported.
Only then is the off-site copy proven to be restorable. The scratch database
is dropped afterwards; the live database is never written to.

**Keep the evidence:** the date of the drill, the name of the copy, the numbers
and the machine it was restored on. Write it into `docs/PRODUCTION_READINESS.md`
when the platform goes live.

---

## 10. Putting a release out

A release is a commit of `main`. The platform runs from `/opt/blipmade`, and
that directory is a clone of the repository, so the release is a pull, a
build and a restart.

```bash
cd /opt/blipmade

# the data of the customers comes first
./scripts/backup.sh

# the release
git fetch origin
git checkout main
git pull --ff-only origin main
git log --oneline -1

# the images
DC="docker compose -f compose.yml -f compose.api.yml -f compose.web.yml"
VCS_REF="$(git rev-parse HEAD)"
$DC build --no-cache --build-arg VCS_REF="$VCS_REF" api worker web
$DC up -d --force-recreate api worker web

# the health
$DC ps
curl -s http://127.0.0.1:3100/health
curl -s http://127.0.0.1:3101/health

# the commit that runs, read from the image and not guessed
docker inspect blipmade-api \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
```

**The commit is written in the image.** The build receives the commit of the
release as an argument and the image keeps it as a label, so the state of the
production is a fact that can be read and not a conclusion that has to be
reached:

```bash
docker inspect blipmade-api blipmade-worker blipmade-web \
  --format '{{.RepoTags}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

The label has to be the commit of `main` that was released. A label of
`unknown` means the build was made without the argument, and the image
cannot be tied to a commit.

**Two things go wrong here when they are not known.**

**The API and the worker have an image of their own.** The name of the image
of the worker is `blipmade-worker` and not `blipmade-api`, so a build of the
service `api` alone leaves the worker with the release before the last one.
The build names both.

**The cache of the build of this machine can be stale.** On the 25th of
October 2026 the layer `COPY src ./src` was taken from the cache even though
the source had changed, and the image was built with the source of the
release before the last one. The build with `--no-cache` is the one that
produces the right image, and the image is checked before it is put out:

```bash
docker run --rm --entrypoint sh blipmade-api \
  -c "grep -c <the name of a new function> /app/dist/worker.js"
```

The number has to be bigger than zero. An image that does not hold the code of
the release is an image of the release before the last one, and the services
of it have to be replaced.

**After the restart of the edge** the routes of the customer domains are gone,
because they live in the configuration of Caddy and not in a file of the
platform. The worker of the platform writes them again within a minute, and
this is checked:

```bash
TOKEN=$(grep '^CADDY_ADMIN_TOKEN=' /opt/blipmade/.env | cut -d= -f2-)
curl -s -H "Authorization: Bearer $TOKEN" \
  http://10.77.0.12:2020/config/apps/http/servers/blipmade/routes | jq .
```
