# The system of the notifications

The platform sends its messages in one way: a business service **publishes an
event** and stops. The event is written in the outbox, in the same
transaction as the business change that caused it. A worker reads the
outbox, decides what the event means for the customer, renders the template
of the event and sends the message, or writes it in the notification centre.

Everything else follows from that sentence:

* A mail server that is down never breaks a payment, an order or a
  provisioning. The event waits in the outbox and is tried again.
* A message that happens twice is one message. The identity of an
  occurrence is the key of the event, and the key is unique in the database.
* A customer hears only what they asked to hear. The preference of the
  customer decides, in the engine and not in the place that publishes.
* There is one wording. There is one place that renders. There is one
  ledger of the deliveries.

This file says how it is built. The catalogue of the messages is in
`docs/EMAIL_TEMPLATE_CATALOG.md`, the list of the events and their real
triggers is in `docs/NOTIFICATION_EVENT_MATRIX.md`, and the work of the
operator when something does not arrive is in
`docs/EMAIL_DELIVERY_RUNBOOK.md`.

---

## 1. The pieces

| Piece | Where | What it does |
|---|---|---|
| The registry | `api/src/services/notification-events.ts` | The typed list of the events: their group, their kind, their audience, their channels, their template |
| The publishers | `api/src/services/notifications.ts` | The functions a business service calls. They write the event and never render |
| The outbox | the table `NotificationEvent` | The durable list of the events that wait to become messages |
| The dispatcher | `api/src/services/notification-dispatch.ts` | Reads the outbox, resolves the recipient, applies the preferences, renders and sends |
| The worker | `api/src/worker.ts` | Runs the dispatcher every five seconds |
| The mailer | `api/src/lib/mailer.ts` | The only thing that talks to the relay. It writes down what really happened |
| The templates | `api/src/lib/email-design.ts` | The wording of the seventy-two messages, with the text, the HTML, the subject and the preheader |
| The centre of the customer | `api/src/routes/notifications.ts`, `web/src/app/Notifications.tsx` | The bell, the count, the list, the filters, the reading |
| The back office | `api/src/routes/admin-notifications.ts`, `web/src/admin/EmailNotifications.tsx` | The overview, the queues, the events, the catalogue, the test message |

---

## 2. The outbox

The event is written with `publishEvent`, and the write is idempotent on the
key of the occurrence:

```
businessKey = type : subject : occurrence
```

* `type` is the kind of the event, e.g. `payment.succeeded`.
* `subject` is the identity of the thing that happened, e.g. the number of
  the order or the id of the instance.
* `occurrence` is what makes the moment unique: the id of the event of the
  provider, the id of the message of a ticket, the end of the paid period.

The consequence is the rule the brief asks for: the same invoice paid twice
is one message, and the same service suspended twice is two messages. A key
that was built from the state alone — `subscription-changed:{user}:{name}:
{status}` — kept every future occurrence of the same state silent. That key
is gone.

The write is a lookup and then an insert. A duplicate that arrives at the
same moment — a webhook of the provider that is delivered twice, an event
that is replayed — finds the row that is already there and returns it
without writing a second one.

---

## 3. The states of an event

| State | What it means |
|---|---|
| `pending` | The event waits for the worker |
| `processing` | The worker took the event and is delivering it |
| `processed` | Every channel of the event went through |
| `failed` | The event failed too many times and waits for the operator |

An event is **claimed** before it is delivered: the worker writes
`processing` with a condition on the old state, so two workers never send
the same message. An event that was claimed and never finished — because the
worker died in the middle — is taken back after five minutes.

### The retries

An event is tried at most five times. The pause between two tries grows:
nothing, 30 seconds, 2 minutes, 10 minutes, 30 minutes. A relay that is
down is therefore not asked again and again, and a message that failed for a
moment is still sent.

When the fifth try fails, the event goes to `failed`. It stays in the
outbox, with the reason of the failure, and the operator sees it in
`/admin/notifications` and can put it back on the queue by hand.

### The secrets

Four events carry a token: the confirmation of the address, the reset of the
password, the change of the address and the proof of the ownership of a
domain. Their payload is emptied as soon as the message is on the queue, so
the token does not stay in the outbox longer than the seconds it needs to
reach the mail server.

The payload is emptied **only when the message really went out**. A message
that failed is tried again, and it needs its token to be sent again. This is
the difference between a system that works when the relay is down and a
system that quietly loses the message.

---

## 4. The channels

### The e-mail

The dispatcher renders the template of the event and hands the message to the
mailer. The mailer is the only thing that talks to the relay, and it writes
down what really happened in the table `MailDelivery`:

| State | What it means |
|---|---|
| `delivered` | The relay took the message. This is the only state that means *sent* |
| `written-to-file` | There is no relay. The message was written on the disk of the server. **Nobody received it** |
| `failed` | The relay refused the message, or the transport is broken |
| `queued` | The message is waiting |

The state of the channel in the event follows the same truth: `sent` when the
relay took it, `written` when it was only written on the disk, `failed` when
the relay refused it. **The platform never says that a message was delivered
when it was only written to a file.**

The relay is configured with `SMTP_URL`. The connection is made with
STARTTLS on the port 587 (or TLS on 465), the certificate of the relay is
the one the machine trusts unless the operator wrote down another one in
`SMTP_CA_FILE`, and the timeout is the one of `SMTP_TIMEOUT_MS`. **The
validation of the certificate is never turned off.**

The platform sends at most `SMTP_RATE_LIMIT_PER_MINUTE` messages a minute,
so it does not look like a spammer to the relay and does not overload it when
a campaign goes out at once.

### The notification centre

The same event writes a row in the table `Notification`: the title, the body,
the group, the link of the action and the moment. The row is written with an
upsert on the key of the occurrence, so the same occurrence never writes two
rows.

The list is read from the database with the session of the customer. Every
answer is built with `userId = user.id`, so a customer who guesses the id of
the message of another customer gets nothing at all, not even the fact that
it exists. The count of the messages that wait to be read is the same in two
sessions and on two devices, because it comes from the database and not from
a memory of the process.

The bell of the header follows the count through a stream (`/notifications/stream`)
that reads the count every three seconds. The stream is a thin layer over a
count that is indexed: it costs one question and it never misses a message,
whatever the order of the events.

---

## 5. The preferences

The preferences are in `/app/settings`, and they are enforced by the engine,
in `wantsMessage`:

| Group | Kind | Channels |
|---|---|---|
| Account and security | essential | e-mail, centre |
| Orders and billing | essential | e-mail, centre |
| Hosting services | optional | e-mail, centre |
| Support | optional | e-mail, centre |
| Domains and email hosting | optional | e-mail, centre |
| Incidents and maintenance | optional | e-mail, centre |
| Product announcements | optional | e-mail, centre |
| Marketing | marketing | e-mail only |

**The essential messages are never suppressed.** They protect the account,
they carry the obligation of the platform and they are required by the law.
The form of the settings shows them as "always on", and the backend forces
them to true whatever the body of the request says.

**The optional messages follow the choice of the customer**, the group and
the channel. The five switches of the old platform are honoured next to the
new groups, so a customer who switched off the billing of the old platform
keeps that choice.

**The marketing needs an agreement that is kept with a date.** The agreement
is written when the customer turns the marketing on, and it is removed when
the customer turns it off. A marketing message never goes to the centre of
the notifications: it is a message of the mailbox and nothing else.

The platform does not use the mail of the transactions to get around the
preferences: a message of the transactions is an essential or optional
message, and it is decided by its own kind, not by the channel it travels
on.

---

## 6. The back office

`/admin/notifications` has five panels:

| Panel | What it shows |
|---|---|
| Overview | The queues, the deliveries, the events, the unread, the state of the transport, and the truth about the relay |
| Messages | The ledger of the deliveries, with the filters, the retry and the truth of every row |
| Events | The outbox, with the outcome of every channel, and the retry of an event |
| Templates | The catalogue, the preview, the validation and the test message |
| Groups | The groups of the preferences, the number of customers per group, the trends |

Two rules hold in the back office:

* **No bulk sending.** The only message the platform sends on demand is the
  test message, and it goes to the one address the operator types.
* **The truth of the transport is written in words.** When there is no relay,
  the page says that the messages are written to files on the server and
  that **nobody is being sent anything**.

---

## 7. The safety

| Rule | Where it is held |
|---|---|
| The author of a reply is never notified about their own reply | `api/src/routes/tickets.ts`, `api/tests/notification-ticket-events.test.ts` |
| A message of one customer is never shown to another | `api/src/routes/notifications.ts` — every query carries the id of the customer |
| The back office is behind the permission of the operator | `api/src/routes/admin-notifications.ts` |
| No token stays in the outbox | `api/src/services/notification-dispatch.ts` |
| No value of a customer can become a tag | `api/src/lib/email-design.ts`, `api/tests/email-design.test.ts` |
| The certificate of the relay is never accepted without a check | `api/src/lib/mailer.ts` |
| The platform does not flood | the key of the occurrence, the backoff, the limit of the relay, the limit of the requests |
| A private note of the staff is never in a message of the customer | the notes are `internal` and are never published |

---

## 8. What the operator has to do

The system is complete and works with the transport of a file, which is what
happens when there is no relay. To send real mail, the operator has to:

1. write `SMTP_URL` and the addresses of the operator in the environment of
   the platform;
2. restart the worker, so it picks the relay up;
3. publish the address of the relay in the DNS of the platform, if the
   operator wants the DKIM of the domain to be signed.

The exact variables, the expected format and the way to check them are in
`OPERATOR_SETUP.md`. **Nothing of that is applied to the production
environment without the operator's approval**, and no message is ever sent to
a real customer address before the relay is configured and the operator says
so.
