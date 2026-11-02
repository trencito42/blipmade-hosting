# Support architecture

A conversation is a `Ticket`. A chat is a ticket of channel `CHAT`, an email one of channel `EMAIL`, a chat that was left becomes a `TICKET`. Messages, notes, attachments and events are the existing tables; nothing was copied. Ids and numbers of old tickets are unchanged.

## Schema (additive)

`Ticket`: `channel, departmentId, firstHumanResponseAt, lastCustomerAt, lastStaffAt, reopenedAt`. `TicketMessage`: `seq` (global order, used to resume streams), `externalId` (Message-ID of an email). `User.isGuest`. New tables: `SupportGuestToken`, `SupportDepartment`, `SupportDepartmentMember`, `SupportPresence`, `SupportBot`, `SupportBotVersion`, `SupportBotSession`, `SupportAutomation`, `SupportAutomationRun`. Business hours, SLA policies, the assistant's settings and its daily usage are rows of `Setting` (`support.hours`, `support.sla`, `support.ai`, `support.ai.usage`). No credential is stored.

## Moving parts

- **Transport:** SSE. A write is an ordinary request; the stream says "something changed" and the client reads the data. Fan-out across API processes through Redis (`support:events`); without Redis it stays inside the process.
- **Presence:** a heartbeat per staff stream; present for 60 s after the last one.
- **Bots:** `services/support-bot.ts` is a pure engine (validate, start, advance) with the effects injected as hooks. A conversation keeps its published version.
- **Automations:** `services/support-automation.ts`. Events call `fireAutomations` after the change is saved; the worker calls `sweepAutomations`. The pair (rule, event) is unique.
- **Clocks:** `services/support-hours.ts` (business minutes, time zones, holidays) and `services/support-sla.ts`.
- **Email in:** `routes/internal-support-email.ts`.
- **Assistant:** `services/support-ai.ts`, OpenAI-compatible chat completions, drafts for staff only.
- **Documentation search:** `api/src/data/docs-index.json`, generated from the pages of the site by `scripts/sync-docs-index.mjs`; a web test fails when it is out of date.

## Decisions

- Tickets stay the source of truth, so every old link and number works.
- Rules and bots are data with a closed set of block and action types; there is no way to run code from the admin.
- Every real-time event is written to the database first.
- Clocks and numbers are computed when asked and are not on the path of a message.
