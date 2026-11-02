# Support test report

Everything here was run. Where something was not run, it says so. Date: 2026-11-02. Database: a disposable PostgreSQL (`blipmade_test`) and a disposable Redis on the platform VM; production was never used for a test.

## What ran

| Run | Result |
|---|---|
| Support and ticket suites since the addition of guests, email attachments and the map (see the last run below). Before: (14 files: `support-p0, -stream, -queue, -chat, -bots, -hours, -automations, -sla, -email, -context, -ai`, `tickets`, `tickets-create`, `notification-ticket-events`) | **141 passed**, 0 failed |
| Whole API suite, in the working copy used for tests | 1409 passed, 94 failed, 6 skipped (164 files, 17 minutes) |
| The same 20 failing files on the base that was in production before this work (`05e02433`, full checkout) | 79 failed: **15 files fail the same way without any of this work** (provisioning, panel identity, payments, webhooks, upgrades, runtime state, starter port). Their errors name the panel URL or the environment of the test machine |
| The other 5 of the 20 files (`backup-offsite-drill, egg-environment, panel-eggs, perf-data-compose, script-node-exit`) | They failed only in the working copy, which lacks `compose.yml` and `pterodactyl-eggs/` (ENOENT). In a full checkout of `main` with this work: **passed** (with `support-p0` and `support-bots`: 72 tests) |
| Web typecheck | Clean |
| Web unit tests | The same failures as before this work (fonts, static headers, compression: they need the built site); the new hamburger and docs-index tests pass |
| API typecheck | No error in the support files. The working copy has an older `zod` than `main`, which shows errors in two files that are not part of this work |

So the 94 failures are **not** a regression of this work: 79 are present at the base, and the remaining 15 are the missing files of the test copy, shown to pass in a full checkout. They were not fixed, and the 15 base failures were not investigated further.

## Load (`api/tests/support-load.test.ts`, `LOAD=1 LOAD_USERS=n`)

One process, one database on the same machine; one staff stream and n customer streams; every customer writes at once and the staff answers every conversation at once. Messages are written to the database and announced as the routes announce them (the routes have a limit per address and one machine is one address, so this measures the live transport only).

| Customers | Messages stored | Delivered to the staff stream | Delivered to the customers | Latency to the staff stream | Latency to customers |
|---|---|---|---|---|---|
| 100 | 300 | 100 of 100 | 100 of 100 | p50 9 ms, p95 23 ms, max 36 ms | p50 13 ms, p95 19 ms, max 20 ms |
| 300 | 900 | 300 of 300 | 300 of 300 | p50 43 ms, p95 134 ms, max 157 ms | p50 108 ms, p95 146 ms, max 171 ms |

**Documented target: 300 simultaneous customers on one API process.** It is a floor measured on a test machine, not a measure of production, which sits behind a proxy and several processes; Redis fan-out between processes was exercised only inside one.

## Scenarios of the brief

| # | Scenario | State |
|---|---|---|
| 1 | Anonymous visitor starts chat | Tested at the API (`support-guest`: consent, credential, isolation, claim, retention); the widget was not opened in a browser |
| 2 | Authenticated customer starts chat | Tested (`support-chat`) |
| 3 | Refresh recovers the history | Tested at the API (`chat/current`, `bot/current`, thread read); not in a browser |
| 4 | Same account in two tabs | Tested at the API (one open chat, the same conversation); not in a browser |
| 5 | Operator receives a new chat in real time | Tested (`support-stream`, `support-load`) |
| 6 | Two operators on one conversation | Tested: stale change refused (409), both streams receive; no "is replying" warning in the console UI |
| 7 | Operator goes offline | Tested (presence expires; the chat becomes a ticket) |
| 8 | Message during a network interruption | Tested: `Last-Event-ID` replay and `Idempotency-Key` retry; not with a real network cut |
| 9 | Chat to ticket | Tested |
| 10 | Old tickets still work | Tested (existing ticket suites pass) |
| 11 | Upload and download an attachment | Tested; the widget has no upload button |
| 12 | Another account's conversation | Tested (404; the stream is silent) |
| 13 | Staff without the permission | Tested |
| 14 | Internal notes invisible to customers | Tested |
| 15 | Bot answers buttons | Tested |
| 16 | Bot edited and published | Tested at the API; the editor was not used in a browser |
| 17 | Disabled bot stops new conversations | Tested |
| 18 | Human takeover | Tested |
| 19 | Offline creates a persistent ticket | Tested |
| 20 | Saved replies with variables | Tested (server-side fill, a short list of values) |
| 21 | Automation runs exactly once | Tested |
| 22 | Failed automation retries | Tested (three tries, then dead) |
| 23 | SLA respects business hours | Tested (time zones, DST offset, weekend, holiday) |
| 24 | Email reply joins the right conversation | Tested with handed-over messages; **not** with the real mail server |
| 25 | AI failure degrades | Tested (error, slow, limit) against a local fake provider; no real provider was called |
| 26 | No false availability promise | By construction: the widget says only "connected / not connected", and never a time |
| 27–29 | 320 px, keyboard over the composer, screen reader | **Not run**: no browser was connected. The widget uses `100dvh`, safe-area padding, 44 px targets, `role="dialog"` and `aria-live`, but none of it was observed |
| 30 | Billing, deployment, authentication unaffected | The existing suites for them pass or fail as they did before (see above); no manual check |

## Not done

Browser end-to-end tests, accessibility audit, contrast checks, mobile viewport tests at the listed widths, guest uploads, drawing a connection by dragging, load on production, a real mail hand-over, a real AI provider.
