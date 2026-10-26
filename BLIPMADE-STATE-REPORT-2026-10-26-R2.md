# Blipmade — the state of the platform, second round

**Date:** 2026-10-26
**Live commit:** `7afe5a3` ("Close the failures of the instances that are gone, so the operator is not waited for nothing")
**Branch that was integrated:** `fix/ops-readiness-and-stripe` (fast-forward into `main`)
**Production:** `10.77.0.13` (`/opt/blipmade`), edge `10.77.0.12`, mail `10.77.0.14`, panel `10.77.0.10`, node `10.77.0.11`, hypervisor `193.34.214.20`

---

## 1. What this round changed

| Area | What was done |
|---|---|
| The live database | The suite of the tests ran as the owner of the live database, because the runner looked for the file of the scratch database in the wrong directory. It now reads the file of the root, the role of the suite owns the tables of the scratch database, and the suite runs with a role that cannot touch the live one. |
| The reinstall of a server | The panel wipes the container and leaves it stopped, so a reinstall left the customer with a dark service. The reinstall is now the whole round trip: the panel is asked to wipe the container, the platform waits for the installation to start, the cursor of the provisioning goes back before the installation, and the worker puts the application back, starts the container and waits for it to serve. A cancelled instance is not reinstalled. |
| The history of the provisioning | The rows of the steps are closed by the step they belong to. Before, a step that finished closed every row that was running, so a step that never finished was written down as a step that did finish. |
| The mail of a customer | The mail system refuses to delete a domain that still holds mailboxes, and the platform swallowed that refusal: the service was deleted from the platform while the mail stayed on the server, for ever. The mailboxes and the aliases are now taken away before the domain, and a refusal keeps the service with the reason on it. |
| The alarms | A finding that is reported again and again becomes a critical one, and the operator is told when the problem is over. |
| The notifications | 18 of the 22 events of the catalogue that nothing published have a producer now, and one event that the catalogue did not have was created. |
| The node of the panel | The daemon of the node is reached over the private network by the panel and by the platform, and the port 8080 is no longer forwarded from the internet. |
| The queue of the operator | A failure of an instance that is gone is closed by itself, so the operator is not waited for nothing. |
| The cluster | 65 idle scratch databases of old test runs were dropped (about 700 MB). |

---

## 2. The state of every system

| System | State | Proof |
|---|---|---|
| The platform API and the worker | DONE & VERIFIED LIVE | 5/5 containers healthy, `/health` answers, the smoke is 31/31 |
| The live database | DONE & VERIFIED LIVE | three roles (`blipmade`, `blipmade_app`, `blipmade_test`); the role of the application cannot do DDL, the role of the test cannot even connect to the live database |
| The tests of the platform | DONE & VERIFIED LIVE | 103 files / 988 tests green, with the isolated role |
| The reinstall of a server | DONE & VERIFIED LIVE | the service comes back on its own; the regression tests refuse a cancelled instance and check that the cursor goes back and that the worker is called |
| The history of the provisioning | DONE & VERIFIED LIVE | the rows of a step are closed by that step |
| The hosted mail | DONE & VERIFIED LIVE | the whole chain was walked on a test domain: hosting, quotas, rate limit, DKIM, mailbox, alias, suspension, resumption, giving up, release; the mail system was left with only the real domain |
| The alarms | DONE & VERIFIED LIVE | the severity of a finding that repeats, and the message that says the problem is over |
| The notifications | DONE & VERIFIED LIVE | 74 events, 74 templates, one publisher for every event that is not written down as out of reach |
| The payments | CODE DONE, NOT DEPLOYED → DEPLOYED & VERIFIED IN TEST MODE | the chain checkout → payment → webhook → paid → subscription → invoice → provisioning → notification is covered by a test of the platform and was walked with the real provider in its test mode |
| The live payments | BLOCKED BY OPERATOR | `PAYMENTS_ENABLED=false`; the keys of the environment are the keys of the test mode, the live keys are missing |
| The domain of the customers | DONE & VERIFIED LIVE | `test.apps.blipmade.com` answers 200 with a valid certificate; `DOMAIN_BASE=apps.blipmade.com` |
| The wildcard of the domains | BLOCKED BY OPERATOR | `*.apps.blipmade.com` does not exist; the platform applies the route, but a new host does not resolve |
| `witch.pw` | BLOCKED BY OPERATOR | the route is applied, the certificate is missing: the challenge of the certificate was answered with a 404 by the edge of Cloudflare over IPv6 |
| The panel and the node | DONE & VERIFIED LIVE | the panel reaches the node over the private network; the port 8080 is closed from the internet |
| The certificates | DONE & VERIFIED LIVE | the certificate of the mail server is public and valid until 2027-01-24 |
| The mail server | DONE & VERIFIED LIVE | the queue is empty, the delivery works, the dashboard is 11/11 |
| The state of the instances | DONE & VERIFIED LIVE | the instances report themselves from the node, without a restart and without a guess |
| The dead letter of the failures | DONE & VERIFIED LIVE | a failure of an instance that is gone is not put back on the queue, and it is closed by itself; the failure of an instance that is there is kept |
| The ports of the internet | DEPLOYED, NOT VERIFIED | the hairpin of the private network does not work, so the reach from outside cannot be checked from here |
| The dead letter of the service that was deleted | DONE & VERIFIED LIVE | the row was closed by the watch of the queue, right after the deployment |
| The databases of the old test runs | DONE & VERIFIED LIVE | 65 scratch databases were dropped; the cluster holds the live database, the scratch one and the one of the system |
| The instance 20 | BROKEN / INCOMPLETE | the container was stopped by a reinstall of an earlier version; the container is not started again from here, because it is the service of a customer |
| The backup | DONE & VERIFIED LIVE | the backup with the role of the application ends with `result: success` |

---

## 3. The evidence

### 3.1 The panel and the node over the private network

The traffic of the panel to the node was captured while the platform asked for the files of a server:

```
10.77.0.10.60580 > 10.77.0.11.8080: Flags [P.], seq ..., length 0
```

The rule of the forwarding of the port 8080 was removed from the hypervisor afterwards. The port answers "connection refused" from the internet and the private way still works.

### 3.2 The chain of the payments, with the real provider in its test mode

```
checkout:            cs_test_… (a real session of the provider, read back from the provider)
delivery:            a real delivery, signed with the secret of the platform
order:               PAID, fulfilment PROVISIONING
subscription:        ACTIVE (sub_…)
invoice:             PAID
provisioning job:    provision-<id> is on the queue
notification:        subscription.activated
```

### 3.3 The hosted mail, on a test domain

```
domain in the mail system:  active, 10 GB of quota, 1 GB per mailbox, 5 mailboxes, 10 aliases
rate limit:                9 messages an hour (200 a day)
DKIM:                      the key is written down
mailbox:                   active, 1 GB of quota
alias:                     postmaster@… → e2e@…
suspended:                 the domain is switched off in the mail system, the status is SUSPENDED
resumed:                   the domain is switched on again, the status is ACTIVE
given up:                  GRACE, 14 days of grace, 30 days of retention
released:                  the domain, the mailboxes and the aliases are gone from the mail system
cleanup:                   the mail system holds only blipmade.com
```

### 3.4 The domain of a customer

```
GET https://test.apps.blipmade.com/  →  200, TLS verified
{"status":"ok","app":"discord-bot","uptime":134685}
```

### 3.5 The queue of the operator, after the deployment

```
worker-1 | [dead-letter] 1 failure(s) of instances that are gone were closed
```

Both failures of the queue are closed now: the one of the service that was
deleted and the one that had worked later.

### 3.6 The queue of the operator, before the deployment

The worker wrote, after the deployment:

```
[dead-letter] a job failed for good and is waiting for an operator:
  queue="blipmade.provision" job="provision-cmvo3q7kd0007uz961f7myfxi"
  attempts=5 error="Pterodactyl client GET /api/client/servers/af021d1f-…/files/contents failed with 500"
```

The instance of that failure (`cmvo3q7kd0007uz961f7myfxi`) is not in the platform any more: the service was deleted and the failure was still waiting for an operator, and it could not be put back on the queue either. The failures of the instances that are gone are closed by themselves now.

### 3.7 The isolation of the database

```
the role of the application:   DROP SCHEMA public CASCADE → "must be owner of schema public"
                               CREATE TABLE               → "permission denied for schema public"
the role of the test:          SELECT 1                   → "permission denied for database \"blipmade\""
the suite of the tests:        103 files / 988 tests, with the role of the test
```

---

## 4. The tests, the CI and the deployment

| Step | Result |
|---|---|
| The suite of the tests, before the integration | 105 files / 999 tests green, with the isolated role |
| The type check (`tsc -p tsconfig.json`, the command of the Dockerfile) | clean |
| The migration of the schema | nothing to migrate: the schema did not change |
| The integration in `main` | fast-forward, no force-push, no branch deleted |
| The CI of GitHub | green on `4266b08` (run 40340478866, seven jobs) and on `7afe5a3` |
| The deployment | the API and the worker were rebuilt and restarted |
| The smoke of the production | 31/31 |
| The backup | `result: success`, three archives written (before the deployment, after it and at the end) |

---

## 5. The defects that were found and fixed

| Defect | How it was found | The test that holds it |
|---|---|---|
| The reinstall left the container stopped | the journal of the instance 20: the panel wrote "the server was reinstalled" and nothing brought the service back | `tests/reinstall.test.ts` |
| A step that finished closed the rows of the other steps | reading the history of a run that was taken over | `tests/provisioning-job-rows.test.ts` |
| The data of a customer stayed on the mail server after the retention | the mail system refused to delete a domain with mailboxes and the platform swallowed the refusal | `tests/mail-domain-removal.test.ts`, `tests/mail-commerce-flow.test.ts` |
| The suite ran as the owner of the live database | reading the command line of the runner | the runner reads the file of the root; `scripts/db-roles.sh` gives the rights |
| The failure of an instance that is gone was put back on the queue | the test of the dead letter failed after the change that refuses it | `tests/provisioning-dead-letter-requeue.test.ts` |
| The queue of the operator held a failure of an instance that was deleted | the log of the worker: one failure was waiting for an operator since 2026-10-25, and the instance was gone | `tests/dead-letter-gone-instance.test.ts` |
| 18 events of the catalogue were never published | the audit of the events | `tests/notification-*.test.ts` |

---

## 6. The verdict

**NO-GO for the payments, GO for everything else.**

The platform runs, the services come back on their own, the mail of a customer is really deleted, the operator is told when a problem is over and the tests are green with a role that cannot touch the live database. What is not ready is the taking of money: the keys of the environment are the keys of the test mode, the switch of the payments is off, and the prices of the products are not set.

---

## 7. What the operator has to do, and what the agent can still do

### The operator

1. The live keys of the payments and the switch `PAYMENTS_ENABLED=true`, after the prices of the products are set.
2. The wildcard `*.apps.blipmade.com` → `193.34.214.143`, so a new domain of a customer resolves.
3. The address of the alarms (`OPS_ALERT_WEBHOOK_URL` and its secret), so the alarms leave the platform and do not only stay in the journal.
4. The certificates of the customers on their own domain: `witch.pw` points to an IPv6 edge of Cloudflare that answers the challenge with a 404; the A and AAAA records have to point to the edge of the platform.
5. The decision about the instances 19 and 20: the container of the instance 20 is stopped and the platform does not start the service of a customer on its own.
6. The check of the ports from outside (25, 465, 587, 993, 80, 443 and 8006): the private network cannot reach its own public addresses, so the check has to be made from a mobile network.
7. The secrets have to be copied out of the host: they are only on the machines of the platform.
8. The seed of the DNS of the mail: the MX and the PTR of the mail server.
9. The prices of the products of the mail.

### The agent

1. The instance 20 can be started again with an explicit word from the operator.
2. The report of the queue of the mail, the dead letters and the backups can be written on the platform.
3. The verification of the ports from outside can be run again as soon as there is a way to reach the internet from here.
4. The wildcard of the domains can be checked as soon as the record exists.
5. The tests can be run again on every change, and the integration of the branches that wait (the dependabot ones, which are risky and are not taken by themselves) can be done one by one.
