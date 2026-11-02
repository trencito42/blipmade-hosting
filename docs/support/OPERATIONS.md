# Operating the support

## Switching things on, in order

1. **Departments** (`/admin/support`): add the queues and, through the API, their members. Nothing is hardcoded.
2. **Business hours** (`/admin/support/automations`, bottom): optional. Without them the clocks count around the clock. Whether a person is here to chat is never read from the hours.
3. **Answer time policies** (`/admin/support/analytics`): by priority. Without a policy nothing is judged late.
4. **Staff presence:** a member of the staff is "available" only while `/admin/support` (or another tab with the staff stream) is open and the status is Available. A closed tab is offline after 60 seconds. When nobody is available the chat saves a ticket and says so.
5. **Bots** (`/admin/support/bots`): create from the template, edit, try in "Try it", Publish, Switch on. A bot that is off starts nothing new.
6. **Rules** (`/admin/support/automations`): a new rule is off. Try it on a real conversation first. Runs and failures are in History; a dead run is retried by hand.
7. **Assistant:** set `SUPPORT_AI_API_KEY` in the environment of the API, then configure address and model in `/admin/support/analytics` and switch it on. Without the key it stays "not configured".
8. **Email in:** set `SUPPORT_INBOUND_TOKEN` in the environment of the API. The mail system (Mailcow) must hand each message for the support address to `POST /api/internal/support/inbound` with that token, the parsed headers and its SPF/DKIM result. The platform does not read a mailbox. This hand-over is not configured by the code and has not been run against the real mail server.

## Environment

| Variable | Effect |
|---|---|
| `SUPPORT_INBOUND_TOKEN` | Empty: the inbound route does not exist |
| `SUPPORT_AI_API_KEY` | Empty: the assistant cannot be used |

## Jobs

The worker runs `sweepAutomations` every five minutes: rules that wait for the customer or for the staff, and the retry of failed runs. If the worker is down, rules that react to an event still run (they run in the API); the waiting ones are late.

## Deploy and rollback

Three additive migrations, in this order: `20261102190000_support_conversations`, `20261102220000_support_bots`, `20261102230000_support_automations`, `20261102235000_support_email`. Take a `pg_dump` first. The images of the previous version are tagged `before-*` on the platform VM; to roll back, tag the previous image as `latest` and recreate `api` and `web`. The migrations stay: the old code runs on the new schema.

## What to watch

`/admin/support/analytics` (open, at risk, first response, resolution, handoff), the dead runs of the rules, `support.email_ignored` in the audit log (mail that was refused and why), and the usage of the assistant.

## Known limits

No anonymous visitors, no attachments by email, no paused resolution clock while a customer is slow to answer, no drawing board for bots (blocks are edited as forms), no load test was run, and the pages were not opened in a browser by the author.
