# The runbook of the delivery

What the operator does when a message does not arrive, when the relay refuses
a message, or when the queue grows. Every step here is a command that can be
run on the machine, and every check ends in something the operator can read.

The words of this file are the words of the platform: a message that was
written to a file was **not** delivered.

---

## 1. The first question: was the message ever sent?

The platform never says that a message went out without a proof. The proof
is in the table of the deliveries.

```bash
# On the machine of the platform, with the environment of the API loaded.
cd /opt/blipmade/api
psql "$DATABASE_URL" -c "
  SELECT key, kind, \"to\", state, transport, attempts,
         \"lastErrorClass\", \"lastError\", \"updatedAt\"
  FROM \"MailDelivery\"
  ORDER BY \"updatedAt\" DESC
  LIMIT 20;"
```

| `state` | What it means | What to do |
|---|---|---|
| `delivered` | The relay took it. The customer has it | Nothing. If the customer says otherwise, ask for the address and the moment, and look at the relay |
| `written-to-file` | **There is no relay.** The message is on the disk of the server and nobody received it | Configure the relay (§4) and send the message again by hand |
| `failed` | The relay refused it, or the transport is broken | Read `lastErrorClass` and `lastError`, then §3 |
| `queued` | The message waits in the queue of the mail | Wait for the worker, then look at the queue |

The state of the relay itself:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://mail.blipmade.com/api/v1/domains
# 401 or 403 means the server of the mail answers and wants the key.
# 000 means it does not answer at all.
```

---

## 2. The second question: was the event even published?

A message that is not in the table of the deliveries was never built. The
event may never have been published.

```bash
psql "$DATABASE_URL" -c "
  SELECT \"businessKey\", type, state, attempts, \"lastError\", \"createdAt\"
  FROM \"NotificationEvent\"
  ORDER BY \"createdAt\" DESC
  LIMIT 20;"
```

| `state` | What it means |
|---|---|
| `pending` | The event waits for the worker. It is not lost |
| `processing` | The worker took it. If it stays there for more than five minutes, the worker died in the middle and the event is taken back |
| `processed` | The message went through |
| `failed` | It failed five times. The operator has to look at it |

The events that wait for a long time are the sign of a worker that is not
running:

```bash
docker compose ps worker
docker compose logs --tail=100 worker
```

The worker empties the outbox every five seconds. A line that says
`[worker] notifications: …` means it is working.

---

## 3. The relay refuses the message

The class of the error is written down with every failure.

| `lastErrorClass` | What it means | What to do |
|---|---|---|
| `auth` | The relay refused the user or the password | Check `SMTP_URL`. The password of the relay is in the URL |
| `tls` | The certificate of the relay was refused | Check `SMTP_CA_FILE`. The certificate of the relay has to be the one the machine trusts, or the one the operator wrote down |
| `timeout` | The relay did not answer in `SMTP_TIMEOUT_MS` | Look at the load of the machine of the relay. The timeout is never raised above 120 seconds on purpose |
| `ratelimit` | The relay refuses too many messages | The limit of the platform is `SMTP_RATE_LIMIT_PER_MINUTE`. Lower it |
| `connection` | The relay was not reachable | Check the network and the name of the relay in `SMTP_URL` |

The rule that never changes: **the certificate is never accepted without a
check.** A relay whose certificate cannot be verified is a relay that must
not be used. The operator who wants to use such a relay writes its
certificate in `SMTP_CA_FILE` and restarts the API and the worker.

---

## 4. The relay is not configured

Without `SMTP_URL` the platform writes the messages on the disk of the
server, under the directory of `BACKUP_DIR`. They are readable, they are
marked as "written to a file", and **nobody receives them**.

```bash
ls -la "$BACKUP_DIR"/mail 2>/dev/null | tail -20
```

The files hold the message without the link of the verification, on purpose:
a file that sits on a disk cannot be used to sign in.

To configure the relay:

```bash
# In the environment of the platform (see OPERATOR_SETUP.md).
SMTP_URL=smtp://user:password@mail.blipmade.com:587
```

Then restart the API and the worker, and check:

```bash
docker compose restart api worker
docker compose logs --tail=50 worker | grep notifications
```

The messages that were written to a file are **not** sent again by the
restart. The operator sends them by hand from the back office, one by one, if
that is wanted.

---

## 5. The queue grows

The outbox is read every five seconds, twenty-five events at a time. A
growing queue means the worker is slow or the relay is slow.

```bash
# The events that wait.
psql "$DATABASE_URL" -c "
  SELECT state, count(*) FROM \"NotificationEvent\" GROUP BY state;"
# The messages that wait in the queue of the mail.
redis-cli -u "$REDIS_URL" LLEN "bull:blipmade.email:wait"
```

The relay is slow: the answer is the throttle of `SMTP_RATE_LIMIT_PER_MINUTE`
and the timeout of `SMTP_TIMEOUT_MS`. Lowering the limit makes the queue grow
slower and the relay happier.

The worker is slow: the event that fails the most is the one that blocks the
batch. Look at the events with `state = 'failed'` and at their `lastError`.

---

## 6. Sending a message again

The back office is the safe way: `/admin/notifications`.

* **The events panel** → the event → **Retry**. The event goes back to
  `pending` with its attempts at zero, and the worker takes it again. The
  message is built again from the event, so it is the same message.
* **The messages panel** → the message → **Retry**. The message is put back
  on the queue of the mail with its own key. Without the event of the
  message, the retry is refused in words.
* **The test message** sends one message to the one address the operator
  types. It never sends to a list.

The rule of the key: **the same occurrence is one message.** A retry that
would send a second message for the same occurrence is refused, because the
customer would receive it twice.

---

## 7. A customer says they never received a message

1. Ask for the address and the moment.
2. Look at the ledger (§1) with the address of the customer:
   ```sql
   SELECT kind, state, transport, attempts, "updatedAt"
   FROM "MailDelivery" WHERE "to" = 'the.address@example.com'
   ORDER BY "updatedAt" DESC LIMIT 20;
   ```
3. `written-to-file` → the relay was not configured at that moment. Say so
   in words, and offer to send it again by hand.
4. `delivered` → the relay took it. The rest is between the relay and the
   mailbox of the customer: a spam folder, a rule of the provider, or a
   mailbox that is full.
5. `failed` → read the error (§3) and retry by hand.
6. Nothing at all → the event was never published. Look at the outbox (§2).

**Never tell a customer that a message was sent when the platform does not
have the proof of it.**

---

## 8. The state of the messages of the back office

`/admin/notifications`, the panel **Overview**, says in one line what the
platform is doing:

* *The relay is not configured. The messages are written to files on the
  server — nothing is being sent to anybody.*
* *The relay is configured. X messages were delivered, Y were written to a
  file, Z failed.*

The line is not a decoration. It is the same truth as the table of the
deliveries, read at that moment.
