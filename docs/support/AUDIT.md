# Support audit

Commit audited: `fbb909ac081858923db7547db89853f486a9efe6` (`origin/main`, 2026-11-02).
Method: the code was read at that commit. **Nothing in this file was executed unless it says so.** Items marked "to reproduce" still need a test or a run on a disposable database before they are called confirmed.

## What exists today

| Part | Where | State |
|---|---|---|
| Ticket model | `api/prisma/schema.prisma` (`Ticket`, `TicketMessage`, `TicketEvent`, `Attachment`) | Enums for category, priority, status; one assignee (`StaffMember`); `internal` flag on a message |
| Customer routes | `api/src/routes/tickets.ts` (556 lines) | list, create, read, reply, upload, download, close; status change for staff |
| Staff routes | `api/src/routes/admin.ts` (`/admin/tickets`, `/admin/tickets/:id/assign`) | list with filters, assign |
| Permissions | `api/src/lib/permissions.ts` | `tickets.read`, `tickets.write`; `ADMIN` holds all |
| Attachments | `api/src/lib/attachments.ts` | 5 MB, allow-list of types, stored on a volume, hash kept, download route checks the ticket |
| Notifications | `api/src/services/notifications.ts` | events for created, reply, customer replied, closed, reopened, status |
| Web | `web/src/app/Tickets.tsx`, `TicketDetail.tsx`, `web/src/admin/Tickets.tsx` | separate customer and staff screens, no live updates |
| Real time | `@fastify/websocket` (console), `routes/notifications.ts` (SSE), `api/src/redis.ts` | Transport pieces exist; none is used for support |
| Missing | | departments, SLA, business hours, presence, live chat, bots, automations, macros server side, inbound email, AI |

## Findings

Severity: H high, M medium, L low. Status: `open` until a fix and a test land.

| # | Sev | Finding | Evidence | Status |
|---|---|---|---|---|
| F1 | M | A reply to a **closed** ticket sets the status to `AWAITING_STAFF`/`AWAITING_CUSTOMER` but never clears `closedAt` and writes no "reopened" event or notification. The ticket is open with a closing date. | `tickets.ts` reply handler: `data: { lastReplyAt, status }` only | open, to reproduce |
| F2 | M | A reply is three writes (message, ticket, event) outside one transaction. A failure between them leaves a message with no status change or no event. | `tickets.ts` lines of `ticketMessage.create`, `ticket.update`, `ticketEvent.create` | open |
| F3 | M | No idempotency: a retried POST (network drop, double click) creates two messages and two notifications. | no key in the body schema | open |
| F4 | M | The type of an attachment is the one the client **declares**; the content is not checked against it. | `validateAttachment(file.mimetype, size)` | open |
| F5 | L | The customer sees every ticket event, including "Internal note added." and the assignment events. The text of the note is not exposed, but its existence is. | `GET /tickets/:id` returns all `events` | open |
| F6 | L | The download route does not check whether the attachment belongs to an internal message. Today an upload always makes a public message, so it is not reachable; a later feature that attaches files to notes would expose them. | download handler checks only `ticketId` | open, latent |
| F7 | L | The upload creates the message and the row before the file is stored; if the storage fails the message remains without its file. | order of `ticketMessage.create` / `storeAttachment` | open |
| F8 | M | No pagination of messages in a ticket (`GET /tickets/:id` returns all). The list of tickets is paginated. | `messages` include without a limit | open |
| F9 | M | Nothing tells staff that two operators are on the same ticket; the last write wins on status and assignment. | no version or lock | open |
| F10 | M | There is no inbound email: a customer cannot reply by email. | no inbound mail code under `api/src` | open (gap, not a bug) |
| F11 | M | Availability, hours and departments exist nowhere, so the platform cannot promise anything about response times honestly. | no model | open (gap) |
| F12 | L | "Duplicate ticket creation events" (old audit): **not reproduced in the code**. One `created` event is written in one place. To be confirmed on the database. | `ticketEvent.create` appears once for `created` | not reproduced |

## Checked and fine (by reading)

- A customer cannot read another customer's ticket: `ticket.userId !== user.id && !isStaff` returns not found, on read, reply, upload and download.
- A staff member without `tickets.read`/`tickets.write` is refused by `requireTicketPermission` on every customer route, and `/admin/tickets*` use `requirePermission`.
- Internal messages are filtered out of the message list for customers, and a customer cannot create one.
- Replies, uploads and closing are rate limited by account and by address.

## What to reuse

Auth and sessions, `requirePermission`, `audit()`, the notification dispatcher and queue (BullMQ on the shared Redis), the attachment storage and download route, the existing SSE and websocket plumbing, `web/src/ui-app.tsx` components, the knowledge base under `web/src/content/docs` and `admin/Knowledge.tsx`.

## Not audited yet

Notification delivery during a mail outage, behaviour under concurrent writes, the mail system for inbound mail, the app shell on phone widths, existing tests (`tickets.test.ts`, `tickets-create.test.ts`, `notification-ticket-events.test.ts`) — each needs a run, not a read.
