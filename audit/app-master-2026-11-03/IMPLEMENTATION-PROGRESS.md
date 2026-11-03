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
