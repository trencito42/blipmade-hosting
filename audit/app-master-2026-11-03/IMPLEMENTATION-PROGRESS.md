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
