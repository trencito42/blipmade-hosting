# Support architecture (plan)

Status: **plan, nothing here is built yet.** Written after the audit in `AUDIT.md`.

## Principles

1. Additive. `Ticket`, `TicketMessage`, `TicketEvent` and `Attachment` stay the source of truth. Their ids and numbers never change, and `/app/tickets/*` and `/admin/tickets` keep working.
2. One conversation model. A chat is a ticket with `channel = CHAT`; an email is a ticket with `channel = EMAIL`. No second table of messages.
3. Nothing is hardcoded: departments, SLA policies, hours, bots, macros and automations are rows edited in the admin.
4. Every real-time event is written to the database first; the push is only a hint to fetch.

## Schema additions (one additive migration per phase)

- `Ticket`: `channel`, `departmentId`, `firstHumanResponseAt`, `lastCustomerAt`, `lastStaffAt`, `resolvedAt`, `reopenedAt`, `version` (optimistic lock), `seq` per conversation on messages.
- `TicketMessage`: `clientMessageId` (unique per ticket, idempotency), `seq`, `kind` (`customer|staff|note|system|bot`).
- New: `SupportDepartment`, `SupportDepartmentMember`, `SupportPresence`, `SupportSavedReply`, `SupportSlaPolicy`, `SupportBusinessHours`, `SupportBot`, `SupportBotVersion`, `SupportAutomation`, `SupportAutomationRun`, `SupportSetting`, `SupportGuestToken`.
- Existing rows are back-filled with `channel = TICKET` and no department; nothing is deleted.

## Transport

Server-sent events for the customer widget and the staff console, with `Last-Event-ID` = message `seq` for recovery; POST for writes. Reason: the writes are rare and need ordinary auth and rate limits, SSE passes through the current proxy, and reconnection is built in. Fan-out across API nodes through Redis pub/sub. The websocket stays for the console only.

## Order of work

| Phase | Content | Needs from the operator |
|---|---|---|
| P0 | Fix F1–F9 with tests; transaction + idempotency; event filtering; attachment signature check | nothing |
| P1 | Schema for channel/department/seq, SSE, unified `/admin/support` inbox, widget, presence | a migration approval |
| P2 | Departments admin, macros, knowledge-base search API, bot engine and editor | |
| P3 | Automations, SLA and hours, analytics, inbound email | a mailbox or webhook for inbound mail |
| P4 | AI adapter (off by default) | a provider and a credential, set by the operator in the admin |

Each phase ends with typecheck, tests run on a `_test` database, a commit, and a note of what is **not** verified. Deploys and migrations on production wait for an explicit yes.

## P1a/P1b status (built, on the test database only)

- Migration `20261102190000_support_conversations`: `SupportChannel`, `SupportAvailability`, `SupportDepartment`, `SupportDepartmentMember`, `SupportPresence`; `Ticket` gains `channel`, `departmentId`, `firstHumanResponseAt`, `lastCustomerAt`, `lastStaffAt`, `reopenedAt`; `TicketMessage` gains `seq` (global, unique, backfilled in the order of `createdAt`). The moments of the conversation are back-filled from the existing messages. Applied and checked against an empty-schema diff on the disposable database; **not applied to production**.
- Transport: SSE. `GET /api/support/stream` (customer, own public events) and `GET /api/admin/support/stream` (`tickets.read`). Events are hints, fan-out through Redis (`support:events`), `Last-Event-ID` = message `seq` recovers what was written while the connection was down (200 messages, then `resync`), heartbeat every 25 s, at most 5 streams per user, a slow reader is dropped events and told to `resync`.
- Presence: `PUT /api/admin/support/presence`, `GET /api/admin/support/presence`; a person counts as present only for 60 s after the last heartbeat of a connection.
- Not built yet: departments admin, inbox UI, widget, writes that use `channel`/`department`.
