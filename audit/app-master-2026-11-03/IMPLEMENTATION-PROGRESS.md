# Customer App 3.0 implementation progress

This checklist records executable implementation work on `audit/admin-master-spec-20261103`. It does not replace the canonical design documents and does not certify staging, provider, payment or production behavior.

## 2026-11-03 — Foundation slice and first dedicated editor

### Completed

- [x] Read the mandatory App 3.0 design, route, API, security and QA specifications and the shared Admin premium component contract.
- [x] Reconciled the implementation base with `main` at `3770515` without changing `/admin`, Mail split routes, provider flows or deployment configuration.
- [x] Added customer-safe premium primitives: contiguous `ButtonGroup`, bounded `NumberStepper` / `UnitStepper`, synchronized `ResourceSliderStepper`, exact `QuoteSummary`, accessible multi-file `FileDropzone`, `PageEditorShell` and `useUnsavedChangesGuard`.
- [x] Added keyboard/focus semantics, 44–48px touch targets, disabled/error states, reduced-motion behavior, mobile-safe editor actions and exact minor-unit money rendering.
- [x] Migrated ticket creation from the `/app/tickets` inline form to `/app/tickets/new`, registered before the dynamic ticket route.
- [x] Preserved the existing `POST /tickets` contract and app/mail service linking.
- [x] Added real client + server validation, Save/Discard, dirty navigation guard and server field errors.
- [x] Added selection and real multipart upload for up to five validated attachments. The create response now returns the initial message ID so uploads attach to the correct message.
- [x] Made attachment retry idempotent at the editor level: a failed upload does not create a second ticket and completed files are not uploaded twice during the same editor session.

### Control parity for `/app/tickets`

| Original control | New destination | Backend | Result |
|---|---|---|---|
| New ticket / Create a ticket | `/app/tickets/new` | `POST /tickets` | Preserved on a dedicated page |
| Subject/category/priority/message | `/app/tickets/new` | Zod validation in `tickets.ts` | Preserved with client + server errors |
| Related app/database | `/app/tickets/new` | `instanceId` ownership check | Preserved |
| Related mail service | `/app/tickets/new` | `mailServiceId` ownership check | Preserved |
| Attachment | `/app/tickets/new`, then conversation | `POST /tickets/:id/attachments?messageId=...` | Added to initial-message workflow |
| Ticket list, open, reply, close | `/app/tickets`, `/app/tickets/:id` | Existing ticket APIs | Unchanged |

### Verification executed

- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- `PATH=/opt/node22/bin:$PATH npm run build` in `api`: pass, including Prisma generation and TypeScript.
- `PATH=/opt/node22/bin:$PATH npm run typecheck:e2e` in `web`: pass.
- `node --test --experimental-strip-types tests/app-premium-components.test.ts`: 8/8 pass.
- `playwright test e2e/app-ticket-editor.spec.ts --project=desktop`: 3/3 pass, including API payload, dirty guard and 390px overflow/action reachability.
- Full web unit suite: 459 pass, 2 skipped, 1 pre-existing failure in `admin-ops-health.test.ts` because it expects `/admin/tickets` while current `ADMIN_PHONE_TABS` intentionally contains `/admin/support`. This slice did not change admin navigation.
- API runtime suite: not executed because neither `TEST_DATABASE_URL` nor `DATABASE_URL` is available in this workspace. The API production TypeScript build passes; the new response assertion is present in `tickets-create.test.ts` for the next database-backed run.

### Remaining gates

- [ ] Complete the rest of the premium component contract and gallery/browser states.
- [ ] Continue route migrations in the ordered phases from `IMPLEMENTATION-QA.md`.
- [ ] Add VPS linkage to customer tickets only after a real schema/API relationship is implemented; do not fake it in the UI.
- [ ] Run the full database-backed API suite and authorized staging tests when fixtures and `TEST_DATABASE_URL` are provided.
- [ ] No merge or deploy before product-owner approval.

## 2026-11-03 — Premium lookup and domain editor

### Completed

- [x] Added a reusable asynchronous combobox with debounced remote loading, request cancellation, grouped descriptions, keyboard traversal, disabled-option reasons, loading/empty/error states and 48px mobile input geometry.
- [x] Added a dedicated `DomainInput` with protocol/path rejection and an IDN/punycode preview.
- [x] Migrated domain creation from the inline `/app/domains` form to `/app/domains/new` while preserving list, verification, deletion and DNS guidance behavior.
- [x] Connected the editor to the existing owned-instance inventory and `POST /instances/:id/domains` API, with real validation, disabled ineligible instances, Save/Discard, dirty navigation guard and server field errors.
- [x] Added browser coverage for the exact create payload, validation and 390px horizontal-overflow boundary, plus static contract tests for the route and component states.

### Control parity for `/app/domains`

| Original control | New destination | Backend | Result |
|---|---|---|---|
| Add domain | `/app/domains/new` | `POST /instances/:id/domains` | Preserved on a dedicated page |
| Instance selection | `/app/domains/new` | `GET /instances` + ownership validation | Searchable, customer-safe labels; raw IDs hidden |
| Hostname | `/app/domains/new` | Existing API validation | Client validation plus IDN normalization/preview |
| Domain list, verify and delete | `/app/domains` | Existing domain APIs | Unchanged |
| Email domains | `/app/mail` | Existing mail APIs | Kept separate and explicitly linked |

### Verification executed

- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- `PATH=/opt/node22/bin:$PATH npx tsc --noEmit` and `npm run typecheck:e2e` in `web`: pass.
- Focused component/route tests: 12/12 pass.
- Focused Playwright ticket + domain editor suite: 5/5 pass, including both 390px checks.

## 2026-11-03 — Dedicated email-domain workflow

### Completed

- [x] Migrated the email-domain dialog from `/app/mail` to `/app/mail/domains/new`, registered before the dynamic email-domain route.
- [x] Preserved both backend paths: plan-associated `POST /mail/services/:serviceId/domains` and the existing standalone `POST /mail/domains` fallback.
- [x] Added plan search and quota context, disabled full/cancelled subscriptions, duplicate-domain validation, server field errors, Save/Discard and dirty navigation protection.
- [x] Kept the ownership proof in the successful editor state and linked directly to the existing domain workspace for MX, SPF and DKIM configuration.
- [x] Preserved the current `/app/mail` service/domain split and all plan lifecycle controls.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static email-editor contract test: 1/1 pass.
- Focused Playwright email-domain editor suite: 2/2 pass, including exact API payload, ownership proof and 390px overflow/action reachability.

## 2026-11-03 — Dedicated mailbox editor and one-time secret

### Completed

- [x] Migrated mailbox creation from its dialog to `/app/mail/domains/:id/mailboxes/new`, registered before the generic email-domain route.
- [x] Preserved `POST /mail/domains/:id/mailboxes`, local-part validation, optional customer password and server-generated password behavior.
- [x] Added live address preview, duplicate detection, real domain quota enforcement, server field errors, Save/Discard and dirty navigation protection.
- [x] Kept generated passwords in memory only, displayed them once, and required explicit acknowledgement before returning to the domain workspace.
- [x] Kept mailbox listing, webmail and deletion behavior unchanged.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static mailbox-editor contract test: 1/1 pass.
- Focused Playwright mailbox editor suite: 2/2 pass, including exact API payload, one-time secret acknowledgement and 390px overflow/action reachability.

## 2026-11-03 — Dedicated email alias editor

### Completed

- [x] Migrated alias creation from its dialog to `/app/mail/domains/:id/aliases/new`, registered before the generic email-domain route.
- [x] Preserved `POST /mail/domains/:id/aliases` and constrained destinations to active mailboxes returned for the same owned domain.
- [x] Added searchable mailbox selection, duplicate alias validation, real alias quota enforcement, routing preview, server field errors, Save/Discard and dirty guard.
- [x] Kept alias listing and destructive deletion behavior unchanged and linked an empty mailbox state directly to the dedicated mailbox editor.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static alias-editor contract test: 1/1 pass.
- Focused Playwright alias editor suite: 2/2 pass, including exact same-domain forwarding payload and 390px overflow/action reachability.

## 2026-11-03 — Email-domain deletion safety route

### Completed

- [x] Moved permanent email-domain deletion out of the inline settings panel to `/app/mail/domains/:id/settings`.
- [x] Preserved the real `DELETE /mail/domains/:id` operation and added an impact summary for mailbox, alias and stored-mail loss.
- [x] Required the exact domain name plus an explicit acknowledgement before enabling deletion, with dirty navigation protection and server error recovery.
- [x] Kept mailbox and alias deletion workflows unchanged.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static deletion-route contract test: 1/1 pass.
- Focused Playwright deletion safety suite: 2/2 pass, including the real DELETE call gate and 390px overflow/action reachability.

## 2026-11-03 — Full-page email plan change

### Completed

- [x] Migrated email plan changes from the dialog to `/app/mail/services/:serviceId/plan/change`.
- [x] Added server-catalog plan selection, current-usage compatibility checks, a separate financial review step and exact published price/period display.
- [x] Preserved real order creation and checkout APIs; the active plan remains unchanged until payment succeeds.
- [x] Prevented duplicate orders when checkout opening is retried in the same editor session and added billing recovery when checkout has no URL.
- [x] Added Save/Discard semantics, dirty guard, responsive plan cards and safe external-checkout transition.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static plan-change contract test: 1/1 pass.
- Focused Playwright plan-change suite: 2/2 pass, including order reuse, exact API payload and 390px overflow/action reachability.

## 2026-11-03 — Dedicated instance identity editor

### Completed

- [x] Migrated instance name and description editing from the settings tab to `/app/instances/:id/settings/edit`, ordered before the generic tab route.
- [x] Preserved the real `GET/PATCH /instances/:id/settings` contract and made the original settings tab a read-only provider summary with one canonical edit entry point.
- [x] Added bounded validation, server field errors, Save/Discard, dirty navigation protection and provider-state context without implying a restart or resize.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static instance-settings contract test: 1/1 pass.
- Focused Playwright instance-settings suite: 2/2 pass, including exact PATCH payload, dirty guard and 390px overflow/action reachability.

## 2026-11-03 — Dedicated database creation and credential handoff

### Completed

- [x] Migrated database creation from the databases tab to `/app/instances/:id/databases/new`, ordered before the generic instance-tab route.
- [x] Preserved the real create/list/credential API sequence, provider database limit and the existing `*`/empty-to-`%` remote normalization.
- [x] Added duplicate/name validation, server field errors, Save/Discard, dirty guard and a protected generated-credential handoff without browser persistence.
- [x] Kept credential refresh, password rotation, deletion and the database list workspace unchanged.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static database-editor contract test: 1/1 pass.
- Focused Playwright database editor suite: 2/2 pass, including exact POST payload, provider refresh, credential reveal and 390px overflow/action reachability.

## 2026-11-03 — Dedicated network allocation editor

### Completed

- [x] Migrated address allocation from the network tab to `/app/instances/:id/network/new`, ordered before the generic instance-tab route.
- [x] Preserved the real allocation list/create APIs and provider-reported address limit.
- [x] Added IPv4/IPv6, port, duplicate and label validation, server field errors, Save/Discard and dirty navigation protection without inventing free ports.
- [x] Kept primary-address changes, renaming, removal and the network list workspace unchanged.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static network-editor contract test: 1/1 pass.
- Focused Playwright network editor suite: 2/2 pass, including exact POST payload, boundary validation, dirty guard and 390px overflow/action reachability.

## 2026-11-03 — Dedicated manual backup editor

### Completed

- [x] Migrated manual backup creation from the backups tab to `/app/instances/:id/backups/new`, ordered before the generic instance-tab route.
- [x] Preserved the real asynchronous backup API, provider retention count and locked/unlocked rotation behavior.
- [x] Added name/duplicate validation, server field errors, Save/Discard, dirty guard and explicit same-node durability guidance.
- [x] Kept automatic scheduling, listing, download, restore and deletion behavior unchanged.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static backup-editor contract test: 1/1 pass.
- Focused Playwright backup editor suite: 2/2 pass, including exact async POST payload, locked state, dirty guard and 390px overflow/action reachability.

## 2026-11-03 — Dedicated automatic backup schedule editor

### Completed

- [x] Migrated automatic backup scheduling from instant tab actions to `/app/instances/:id/backup-schedule/edit`.
- [x] Limited scheduling to the provider-supported off, daily and weekly presets, with their fixed UTC execution time clearly described.
- [x] Added API-backed initial state, Save/Discard, dirty guard, pending/error states and rotation/durability context.
- [x] Kept the backups tab as a read-only schedule summary with an explicit edit action.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static backup-schedule contract test: 1/1 pass.
- Focused Playwright backup-schedule suite: 2/2 pass, including exact PUT payload, dirty guard and 390px overflow/action reachability.

## 2026-11-03 — Dedicated backup restore confirmation

### Completed

- [x] Replaced the generic in-tab restore dialog with `/app/instances/:id/backups/:backupId/restore`.
- [x] Added API-backed archive identity, timestamp, size and retention context before the destructive operation.
- [x] Required the exact backup name plus an explicit replacement acknowledgement before enabling restore.
- [x] Added Save/Discard-equivalent actions, dirty guard, missing-backup handling and real restore API integration.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static backup-restore contract test: 1/1 pass.
- Focused Playwright backup-restore suite: 2/2 pass, including gated real POST, dirty guard and 390px overflow/action reachability.

## 2026-11-03 — Dedicated schedule creation editor

### Completed

- [x] Migrated schedule creation from the instance tab to `/app/instances/:id/schedules/new`.
- [x] Added real five-field cron validation, duplicate-name validation and action-specific power, command and backup payloads.
- [x] Added enable-on-create state, API field errors, Save/Discard, dirty guard and provider execution context.
- [x] Preserved schedule listing, run-now, pause/resume and deletion behavior in the source tab.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static schedule-editor contract test: 1/1 pass.
- Focused Playwright schedule-editor suite: 2/2 pass, including cron validation, exact command POST payload, dirty guard and 390px overflow/action reachability.

## 2026-11-03 — Dedicated schedule editing

### Completed

- [x] Added `/app/instances/:id/schedules/:scheduleId/edit` and linked it from desktop and mobile schedule lists.
- [x] Hydrated existing name, cron, enabled state and action-specific payload from the real schedules API.
- [x] Added duplicate-name, cron and command validation, missing-schedule handling, Save/Discard and dirty guard.
- [x] Preserved immutable action type and sent the real PATCH payload for editable fields.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static schedule-edit contract test: 1/1 pass.
- Focused Playwright schedule-edit suite: 2/2 pass, including hydration, exact PATCH payload, dirty guard and 390px overflow/action reachability.

## 2026-11-03 — Dedicated Git deployment settings editor

### Completed

- [x] Moved repository, branch, lifecycle commands, environment variables and auto-deploy settings to `/app/instances/:id/git/edit`.
- [x] Kept the Git tab focused on read-only configuration summary, deploy history, deploy/rollback/log actions and safe disable flow.
- [x] Added HTTPS repository validation, required lifecycle fields, environment-key validation, Save/Discard and dirty guard.
- [x] Preserved one-time webhook-secret reveal after the real PUT response without navigating away prematurely.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static Git-settings contract test: 1/1 pass.
- Focused Playwright Git-settings suite: 2/2 pass, including invalid URL rejection, exact PUT payload, one-time secret reveal, dirty guard and 390px overflow/action reachability.

## 2026-11-03 — Dedicated access invitation editor

### Completed

- [x] Moved role selection and invite-code creation to `/app/instances/:id/access/new`.
- [x] Kept the access tab focused on current members, pending invitations and removal/cancellation actions.
- [x] Added explicit viewer/manager capability context, Save/Discard-equivalent actions and dirty guard.
- [x] Preserved the real POST and one-time access-code reveal with expiry and accessible copy fallback.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static access-invite contract test: 1/1 pass.
- Focused Playwright access-invite suite: 2/2 pass, including exact role POST, one-time code reveal, dirty guard and 390px overflow/action reachability.

## 2026-11-03 — Dedicated instance reinstall confirmation

### Completed

- [x] Replaced the generic settings-tab reinstall dialog with `/app/instances/:id/reinstall`.
- [x] Added live reinstall eligibility and latest-backup context before the destructive operation.
- [x] Required the exact instance name plus explicit file-erasure acknowledgement, with Save/Discard-equivalent actions and dirty guard.
- [x] Preserved the real reinstall API and its asynchronous provisioning semantics.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- `PATH=/opt/node22/bin:$PATH npm run build` in `web`: pass; 172 pages prerendered.
- Static reinstall contract test: 1/1 pass.
- Focused Playwright reinstall suite: 2/2 pass, including gated real POST, dirty guard and 390px overflow/action reachability.

## 2026-11-03 — Canonical Git and access route alignment

### Completed

- [x] Added the exact blueprint routes `/app/instances/:id/git/connect`, `/app/instances/:id/git/settings` and `/app/instances/:id/access/invite`.
- [x] Updated contextual entry points and focused tests to use the canonical URLs.
- [x] Preserved the previously shipped `/git/edit` and `/access/new` URLs as compatibility aliases.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- Production build: pass; 172 pages prerendered.
- Static canonical-route tests: 2/2 pass.
- Focused Playwright Git/access suites: 4/4 pass.

## 2026-11-03 — Dedicated network allocation editor

### Completed

- [x] Moved allocation rename, primary selection and release to `/app/instances/:id/network/:allocationId/edit`.
- [x] Kept the network tab as a responsive address inventory with contextual edit links.
- [x] Added duplicate/length validation, provider-owned IP/port disclosure, Save/Discard and dirty guard.
- [x] Protected primary-address deletion and required the exact IP:port before releasing an extra allocation.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- Production build: pass; 172 pages prerendered.
- Static network-edit contract test: 1/1 pass.
- Focused Playwright network-edit suite: 2/2 pass, including exact PATCH/PUT payloads, dirty guard and 390px overflow/action reachability.

## 2026-11-03 — Dedicated database security editor

### Completed

- [x] Moved credential reveal, password rotation and destructive deletion to `/app/instances/:id/databases/:databaseId/security`.
- [x] Kept the databases tab as a quota-aware responsive inventory with contextual security links.
- [x] Required exact database identity and client-update acknowledgement before password rotation, with dirty guard and Discard.
- [x] Preserved audited credential reads and revealed replacement credentials only after the real PATCH succeeds.

### Verification executed

- Web TypeScript and E2E TypeScript checks: pass.
- Production build: pass; 172 pages prerendered.
- Static database-security contract test: 1/1 pass.
- Focused Playwright database-security suite: 2/2 pass, including exact PATCH, post-rotation credential read, dirty guard and 390px overflow/action reachability.

## 2026-11-03 — Dedicated startup settings editor

### Completed

- [x] Moved container image and provider-supported startup variables to `/app/instances/:id/startup/edit`.
- [x] Kept the Startup tab as a read-only summary while preserving environment-file functionality.
- [x] Masked secret-like values, kept provider-managed fields read-only and sent only changed editable variables.
- [x] Added Save/Discard, dirty guard, restart-impact disclosure and responsive field-level API errors.

### Verification executed

- Web and E2E TypeScript checks: pass.
- Production build: pass; 172 pages prerendered.
- Static startup-editor contract test: 1/1 pass.
- Focused Playwright startup-editor suite: 2/2 pass, including exact PUT payload, secret masking, dirty guard and 390px overflow/action reachability.

## 2026-11-03 — Dedicated environment file editor

### Completed

- [x] Moved `.env` editing from the inline Startup tab to `/app/instances/:id/env-files/:name/edit`.
- [x] Kept the Startup tab as a summary with contextual Edit/Create links; the real `PUT /instances/:id/env-files/:name` API is unchanged.
- [x] Masked secret-like values, validated names (format and duplicates), added Save/Discard and a dirty guard.
- [x] Disclosed that saving does not restart the instance.

### Verification executed

- Web TypeScript check: pass.
- Static env-file and startup contract tests: 2/2 pass.
- Focused Playwright suite: 2/2 pass, including exact PUT payload, secret masking, dirty guard and 390px overflow.
- Full build, full unit suite and API suite not re-run for this checkpoint.

## 2026-11-03 — Dedicated subscription cancel and resume pages

### Completed

- [x] Moved subscription cancellation from a dialog on `/app/billing` to `/app/billing/subscriptions/:id/cancel`, with the paid-through date, the end-of-service consequence and an explicit acknowledgement.
- [x] Moved resume to `/app/billing/subscriptions/:id/resume` (alias `/reactivate` from the blueprint). The page refuses a resume for a subscription that already renews and a cancel for one that already ends.
- [x] The billing list keeps the same real APIs (`POST /billing/subscriptions/:id/cancel|resume`) and now links to the pages.
- [ ] Not done: `/app/billing/subscriptions/:id/renew`. The renew API answers 503 when the payment provider collects payments, so no enabled control is shown until it works on the live environment. `/app/instances/:id/cancel` is also not added: the instance cancel endpoint sets the instance to CANCELLED immediately, which does not match the "runs until the end of the period" promise, so billing cancel stays the single path.

### Verification executed

- Web TypeScript check: pass.
- Static subscription and billing contract tests: 15/15 pass.
- Production build: pass; 172 pages prerendered.
- Focused Playwright suites (subscription pages and env file editor): 5/5 pass, including exact POSTs, acknowledgement gate, refused resume and 390px overflow.

## 2026-11-03 — Dedicated Git rollback review

### Completed

- [x] Moved "Go back to this" from an immediate button to `/app/instances/:id/git/deployments/:deployId/rollback`.
- [x] The page loads the real deployment history and release list, applies the same eligibility rule as the list (finished, still stored, not the running release), blocks while a build runs and requires an acknowledgement.
- [x] Sends the real `POST /instances/:id/git/rollback` with the exact release; discloses that env variables and data are not rolled back and that auto-deploy can deploy over a rollback.
- [x] Aligned a stale admin phone-bar test with the unified support queue (`/admin/support`).
- [ ] Not done: `/app/instances/:id/access/:shareId/edit`. The API has no endpoint to change the role of an existing member, so no control is shown; members can only be removed.

### Verification executed

- Web TypeScript check: pass.
- Full web unit suite: 488 tests, 0 failures after the test alignment (1 stale failure existed before this checkpoint).
- Production build: pass; 172 pages prerendered.
- Focused Playwright suites (rollback and Git settings): 4/4 pass, including the exact release POST, refused running release and 390px overflow.

## 2026-11-03 — Dedicated domain rename and delete pages

### Completed

- [x] Moved the rename of a platform address to `/app/domains/:id/edit` (real `PUT /domains/:id/address`), with the 3–40 character rule, the 7-day lock from the API, and a page that refuses custom hostnames.
- [x] Moved domain deletion to `/app/domains/:id/delete` (real `DELETE /domains/:id`) with an exact-hostname confirmation and a dirty guard.
- [x] The list keeps DNS records and Verify now; it links to the pages.
- [ ] Not done: a separate `/app/domains/:id` detail page; DNS records and verification stay in the list.

### Verification executed

- Web TypeScript check: pass.
- Static domain tests: 3/3 pass.
- Production build: pass; 172 pages prerendered.
- Focused Playwright suites (domain change and add-domain editor): 5/5 pass, including exact PUT/DELETE and 390px overflow.

## 2026-11-03 — Dedicated password, email and billing address pages

### Completed

- [x] Moved the password change to `/app/settings/password` (real `POST /settings/password`), with repeat-password validation, API field errors and a dirty guard. Values are cleared after the request and never stored.
- [x] Moved the change of the account email to `/app/settings/email/change` (real `POST /settings/email`); the page says the address changes only when the new one answers.
- [x] Moved the billing address to `/app/settings/billing-address` (real `PUT /settings/billing-address`), with the shared field component, validation and the VIES VAT check.
- [x] The Settings tabs keep read-only summaries with links; name editing and sign-out stay inline (a single-field change).
- [ ] Not done: `/app/settings/security/*` (2FA, passkeys, sessions, API keys), `/app/settings/notifications`, `/privacy` and `/closure` routes.

### Verification executed

- Web TypeScript check: pass.
- Full web unit suite: all pass after this checkpoint.
- Production build: pass; 172 pages prerendered.
- Focused Playwright suites (password, email, billing address): 5/5 pass, including exact POST/PUT payloads, validation, dirty guards and 390px overflow.

## 2026-11-03 — Compact domain list

### Completed

- [x] Replaced the tall per-domain cards on `/app/domains` with one divided row each: hostname and instance on the left; status and a grouped action set (`ButtonGroup`) on the right, wrapping under the hostname on a phone.
- [x] The paragraph about platform addresses moved into the tooltip of the Change button; Verify and Delete have tooltips too. The separator is drawn between rows and not under the last one.
- [x] Custom domains keep their expanded DNS and verification instructions under the row.

### Verification executed

- Web TypeScript check and full web unit suite: pass.
- Production build: pass; 172 pages prerendered.
- Playwright domain suite: 4/4 pass, including row height under 90px for a platform address, the border between rows only, the tooltips, and a screenshot reviewed.
- Not applied yet: the same compact pattern on the other list pages (instances, databases, backups, mail).

## 2026-11-03 — Global editor shell, divided lists

### Completed

- [x] Routes carry an explicit `layout: 'editor'` (34 dedicated editor routes). `AppShell` then shows the way back in its top bar instead of a title, hides the phone bottom bar (no two fixed layers) and does not float the chat button over the actions.
- [x] `PageEditorShell` has the one `h1` of the page, an eyebrow, a description, a bounded width (3xl, 5xl with an aside) and no second Back link or second `<main>`/`<footer>`. The way back comes from the same props, registered once in the top bar.
- [x] Actions follow the form inside its card (short forms), or stick to the bottom of the content column (`stickyActions`: startup, env file, Git settings, billing address, new ticket). "Unsaved changes" only shows when there are some.
- [x] The content column is a vertical flex region, so the legal footer sits at the bottom of a short page.
- [x] `document.title` is now set for every route of the app, not only public ones.
- [x] Tables and card lists use a line between rows and none under the last (all 38 tables and 34 card lists).

### Verification executed

- Web TypeScript check: pass. Full web unit suite: the first run of this checkpoint had 3 failures (two table tests and the editor contract test asserted the old card rows and the fixed action bar); the code was deployed before they were fixed, and the tests were updated to the new contract in the next commit. After that: 489 pass, 0 fail.
- New Playwright spec `app-editor-shell` at 1440px and 390px over 9 editors (email, password, billing address, new domain, new ticket, backup create, startup, cancel subscription, mail domain): 18/18 pass (one visible h1 that is not the error page, one `main`, one Back in the header, one footer, no horizontal overflow, no wide fixed layer at the bottom, legal links at the bottom of a short page, phone bar hidden). Screenshots reviewed for the email and startup editors.
- All other Playwright suites except the admin audit ones that need a seed file: 116 pass; 13 fail on the public site and login (`auth`, `public`, `mobile` specs: two "Log in" buttons, price assertions on the home page). They are in code this checkpoint did not touch.
- Not covered: 320/430/768/1024/1920px, 200% zoom, software keyboard and safe-area behavior, and the admin area with the shared table style; no real device or browser session.

## 2026-11-03 — API keys, two-factor and passkey pages

### Completed

- [x] `/app/settings/api-keys/new`: name, access cards, expiry; the key is shown once on the same page and never reaches the address, the storage of the browser or a toast. The list is compact, with a confirmation before a key is revoked.
- [x] `/app/settings/security/2fa` (setup: a visit makes no key; the key is made on the button, proved with a code, backup codes kept), `/security/2fa/disable` (password and code) and `/security/2fa/backup-codes` (new codes, shown once). Leaving with unsaved backup codes asks first.
- [x] `/app/settings/security/passkeys/new`: the page claims a passkey only after the device and the server both answered; a closed prompt is said in words and adds nothing.
- [x] The security panels keep summaries with links; the passkey list is divided and grouped with tooltips. All new routes are `layout: 'editor'` and are in the shell layout spec.
- [ ] Not done: a sessions page (the list stays inline: one action per row, no form); rename of a passkey stays inline (one field).

### Verification executed

- Web TypeScript check and full web unit suite: 492 pass, 0 fail (2 skipped).
- Playwright: API key (3), two-factor (5), passkey (3), settings and password (5), editor shell at 1440px and 390px over 15 editors (30): 46/46 pass. The passkey ceremony uses a replaced `navigator.credentials.create`; it does not run a real authenticator.
- The two-factor API answers are stubbed; the real TOTP verification is covered by the API tests, which were not run here (no database).

## 2026-11-03 — Account closure and instance resources pages

### Completed

- [x] `/app/settings/closure`: password and the exact phrase before the request is recorded (real `POST /settings/account/closure`); a recorded request shows its date and can be taken back (`DELETE`). The Account tab keeps a summary with a link. Nothing is removed by the page: a person of the team reviews the request.
- [x] `/app/instances/:id/resources/edit`: memory, vCPU and storage with the limits of the product, the price quoted by the server (`GET .../resources/quote`, after a short pause), and `PUT .../resources`. A change that costs more goes to a payment step with the order number and a link; the page never redirects by itself. The Resources tab is a summary with a link.
- [ ] Notifications preferences stay inline (toggles that save one by one); data export stays a link. Not done: VPS pages (settings, SSH key, ISO, snapshots, reinstall), mail DNS page, billing orders page.

### Verification executed

- Web TypeScript check and full web unit suite: 494 pass, 0 fail.
- Playwright (editor shell, closure, resources, API keys, two-factor, passkeys, settings, password, domains, subscriptions): 59/59 pass. The payment step uses a stubbed checkout address; no real payment was made.

## 2026-11-03 — VPS dedicated pages

### Completed

- [x] `/app/vps/:id/settings/edit` (rename, `PATCH /vps/:id`), `/ssh-key` (`PUT .../ssh-key`, says the server restarts once), `/iso` (mount an image, `PUT .../iso`), `/reinstall` (exact server name, acknowledgement, system choice, optional key; `POST .../reinstall`), `/snapshots/new` (name rule and duplicate check, refused when the server is full) and `/snapshots/:name/restore` (exact snapshot name and acknowledgement).
- [x] The server page keeps summaries and links; `?tab=` makes an editor return to the tab it came from. Eject and deleting a snapshot stay one click (the delete asks first). The server list and the snapshot list are divided rows with grouped actions and tooltips.
- [x] All six routes are `layout: 'editor'`.
- [ ] Not done: the VPS checkout (`/app/vps/new`) review step in the address, the mail DNS page, the billing orders page.

### Verification executed

- Web TypeScript check and full web unit suite: pass.
- Playwright VPS suite: 7/7 pass (exact PATCH/PUT/POST payloads, refused states, the tab a page returns to, h1 and 390px overflow on all six pages). The hypervisor is not involved: every VPS answer is stubbed.

## 2026-11-03 — Editor shell checked at every width

### Verification executed

- Playwright `app-editor-shell`: 23 editor routes at 320, 390, 430, 768, 1024, 1440 and 1920px: 161/161 pass (one visible h1 that is not the error page, one `main`, one Back control in the top bar, one footer, no horizontal overflow, no wide fixed layer at the bottom, legal links at the bottom of a short page, phone bar hidden below 1024px). Screenshots at 390, 768 and 1920px reviewed for the email, startup and VPS reinstall editors.
- All other Playwright suites except the admin audit ones: 122 pass, 13 fail. The 13 are the same as before this work (public site, login and home page price assertions) and are in code this work did not touch.
- Not covered: 200% zoom, software keyboard and safe-area on a real phone, the staging screenshots with seeded data, and the admin area with the shared table style.

## 2026-11-03 — Billing split into sections, order and subscription pages

### Completed

- [x] `/app/billing` now has sections with an address each: Overview (totals, orders awaiting payment, payment method, closed services), `?tab=subscriptions`, `?tab=orders` (every order, newest first, a table on a desktop and rows on a phone) and `?tab=invoices`. A reload or a shared link opens the same section.
- [x] `/app/billing/orders/:id`: the lines of an order with the delivery state of each, the error of a failed line, and Pay now only for an order that waits for payment (real `POST /orders/:id/checkout`).
- [x] `/app/billing/subscriptions/:id`: price, period, payment mode, the link to the service and the right action (cancel or resume, on their own pages).
- [x] The rows of the billing lists are divided with a line between them.
- [ ] Not done: a separate page for the payment method (it opens the payment provider portal and stays a button), the credit and history views.

### Verification executed

- Web TypeScript check and full web unit suite: 496 pass, 0 fail.
- Playwright billing suite: 5/5 pass (the lines and the failed delivery of an order, one checkout request, the subscription page and its links, each section showing only its own content and surviving a reload, and 390px overflow on all sections and pages). The subscription cancel/resume suite still passes. Screenshot of the subscriptions section reviewed.
- Seen while testing, not changed: when the page crashes, the error page shows a placeholder "TODO(operator): the support email address" instead of an address.

## 2026-11-03 — Divided rows on Overview and notifications, one centre line per row

### Completed

- [x] The services of `/app` and the quick deploy list are divided rows, not cards; the notification list is divided too, an unread message is tinted and its actions are grouped with tooltips.
- [x] On the rows of subscriptions, domains and servers the name, the status, the price and the actions now share one centre line (the status and the price used to sit at the top of the row while the button was centred).

### Verification executed

- Web TypeScript check and full web unit suite: 496 pass, 0 fail (the unread-tint rule of the notification test was kept).
- Playwright: overview rows (2), notification rows (2), billing (6, one measures that the name, status, price and button centres are within 2px), domains (5, one measures the same for a domain row): all pass. Screenshot of the subscription row reviewed.
- Not applied yet: the same centre-line measurement on the rows of the mail pages and the instance tabs.

## 2026-11-03 — Grouped row actions on the instance tabs

### Completed

- [x] The tables of the backups, databases, network and schedules tabs show their row actions as one group with tooltips on a desktop (the phone cards keep their wrapping buttons, so four actions never overflow 390px).

### Verification executed

- Web TypeScript check and full web unit suite: 496 pass, 0 fail.
- Playwright: the backup rows are divided (no line above the first, none under the last), the actions are one group with their tooltips and share a centre line with the cells (within 2px), and the tab fits at 390px; the existing backup, network, schedule and database editor suites still pass (20/20 with the new spec).
