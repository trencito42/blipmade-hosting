# Support API

All paths are under `/api`. Customer routes need a session. Staff routes need the permission written next to them; an administrator holds every permission. Writes carry the CSRF token of the browser. The two exceptions are `internal/support/inbound`, which carries a shared secret and no cookie, and the live streams, which are reads.

## Tickets (existing, changed in P0)

| Route | Notes |
|---|---|
| `GET /tickets/:id?before=<messageId>` | Newest 200 messages, `hasMoreMessages`, internal notes and staff-only events left out for a customer |
| `POST /tickets/:id/replies` | Header `Idempotency-Key` (8–100 chars) makes a retry answer 200 with the same message. One transaction. Reopens a closed ticket |
| `POST /tickets/:id/attachments?messageId=` | The bytes are checked against the declared type |
| `POST /tickets/:id/status`, `POST /admin/tickets/:id/assign` | Optional `ifUpdatedAt`; a conversation that moved since answers 409 |

## Live stream (SSE)

`GET /support/stream` (customer, own public events) and `GET /admin/support/stream` (`tickets.read`). Events: `hello`, `created`, `message`, `attachment`, `status`, `assigned`, `typing`, `resync`. An event is a hint with the conversation id; the text is read from the API. `Last-Event-ID` is the `seq` of the last message seen; messages written since are replayed (200 at most, then `resync`). Heartbeat every 25 s, 5 streams per user.

## Chat (customer)

`GET /support/availability?departmentId=` · `GET /support/chat/current` · `POST /support/chat` · `POST /support/chat/:id/convert` · `POST /support/chat/:id/rating` · `POST /support/chat/:id/typing` · `GET /support/departments` · `GET /support/suggest?q=` (public documentation only).

## Bots

Customer: `POST /support/bot/start` (404 when none is on) · `GET /support/bot/current` · `POST /support/bot/:id/input` · `POST /support/bot/:id/skip`.
Staff: `GET/POST /admin/support/bots` · `GET/PUT/DELETE /admin/support/bots/:id` · `PUT …/draft` · `POST …/publish` · `POST …/rollback` · `GET …/export` · `POST /admin/support/bots/import` · `POST /admin/support/bots/simulate` (`tickets.write`). Writes need `settings.write`.

## Console (staff)

| Route | Permission |
|---|---|
| `GET /admin/support/conversations?view=&q=&departmentId=&cursor=` | `tickets.read` |
| `GET /admin/support/counts` | `tickets.read` |
| `PUT /admin/support/conversations/:id/department` | `tickets.write` |
| `GET /admin/support/conversations/:id/context` | `tickets.read` (billing part: `orders.read`) |
| `POST /admin/support/conversations/:id/render` | `tickets.write` |
| `POST /admin/support/conversations/:id/typing` | `tickets.write` |
| `GET /admin/support/articles?q=` | `tickets.read` |
| `GET/PUT /admin/support/presence` | `tickets.read` / `tickets.write` |
| `GET/POST/PUT/DELETE /admin/support/departments`, `PUT …/:id/members` | read `tickets.read`, write `settings.write` |

Views: `all, mine, unassigned, chat, tickets, email, waiting_customer, waiting_staff, sla_at_risk, closed`.

## Automations, hours, SLA, numbers

`GET/POST/PUT/DELETE /admin/support/automations` · `GET …/:id/runs` · `POST …/dry-run` · `POST /admin/support/automation-runs/:id/retry` · `GET/PUT /admin/support/hours` · `GET/PUT /admin/support/sla` · `GET /admin/support/analytics?days=&departmentId=&channel=&agentId=`. Writes need `settings.write`; the dry run needs `tickets.write`.

## Assistant

`GET/PUT /admin/support/ai` (`tickets.read` / `settings.write`) · `POST /admin/support/conversations/:id/ai` (`tickets.write`, actions `suggest_reply, summarize, classify, translate`).

## Email in

`POST /internal/support/inbound` with `Authorization: Bearer $SUPPORT_INBOUND_TOKEN`. Body: `from{email,name}`, `subject`, `messageId`, `inReplyTo`, `references[]`, `text`, `headers{}`, `auth{spf,dkim}`. Answers 201 (created or added), 200 (`duplicate`), 202 (`accepted:false`, with a `reason`). Without the secret on the server the route does not exist (404).
