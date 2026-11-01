# 03 · Admin coverage matrix

## Method
A script (`/tmp/audit.py` of the session, summarised here) read every call to `/admin/...` in `web/src/admin/*.tsx` and every `/admin` route registered in `api/src/routes/*.ts` and compared them. It cannot resolve paths built from a variable (`${base}/publish`), so those show up as false positives; the list below was checked by hand. It finds missing wiring. It cannot find an inert button, a missing loading state or a wrong status label: those were **not** audited screen by screen.

Result: 166 `/admin` routes. Web calls without a backend route: none (the three the script lists are built from a variable and resolve to real routes). Backend routes with no screen that calls them, after this work:

| Operation | Route | State |
|---|---|---|
| Panel credential of a customer (read, store, forget) | `GET/POST/DELETE /admin/customers/:id/panel...` | NOT IMPLEMENTED (no screen) |
| Import of an existing server | `POST /admin/instances/import` | NOT IMPLEMENTED (no screen) |
| Database limit of an instance | `POST /admin/instances/:id/database-limit` | NOT IMPLEMENTED (no screen) |
| Confirm a collection outside Stripe | `POST /admin/invoices/:id/confirm-collection` | NOT IMPLEMENTED (no screen) |
| Mail health, domains, jobs and retry | `GET /admin/mail/health`, `/domains`, `/jobs`, `POST /jobs/:id/retry` | NOT IMPLEMENTED (no screen found; the mail page may use other routes) |
| Example of money formatting | `GET /admin/money` | a stub that returns a made-up example; nothing uses it. Remove it |
| Detail of one VPS | `GET /admin/vps/:id` | unused by a screen; the list carries the same data |

Gained a screen in this work: dead letters (list, queue again, close), price correction with a dry run, email delivery report, VPS allocations, VPS billing check, add-ons, price history, product editor with readiness, preview and history, email preview, versions, test message and event map, site content.

## Matrix (what was inspected or changed)
| Capability | Backend | Frontend | RBAC | Validated | Tested | State |
|---|---|---|---|---|---|---|
| General settings (27 keys + infrastructure keys) | `PUT/GET/DELETE /admin/settings` | `Settings.tsx` | per key owner | zod per key | `settings-registry.test.ts` | FIXED AND VERIFIED |
| Product editor | `routes/admin-products.ts` | `ProductEditor.tsx` | `products.read/write` | zod strict, ranges, slug, readiness | `product-editor.test.ts` (15) | FIXED AND VERIFIED (API); IMPLEMENTED BUT UNVERIFIED (screen not opened in a browser) |
| Add-ons | `routes/admin-addons.ts` | `Commerce.tsx` | `pricing.read/write` | amount, code immutable | `pricing-admin.test.ts` | FIXED AND VERIFIED (API); screen unverified |
| Price history | `GET /admin/pricing/history` | `Commerce.tsx` | `pricing.read` | n/a | `pricing-admin.test.ts` | FIXED AND VERIFIED (API) |
| Rate card, price rows | `PUT /admin/pricing/rates`, `/:id` | `Pricing.tsx` | `pricing.write` | existing | before and after kept | FIXED AND VERIFIED |
| Price correction of services | `POST /admin/instances/reconcile-prices` | `Tools.tsx` | `pricing.write` | `dryRun` boolean | `pricing-admin.test.ts` | FIXED AND VERIFIED (API) |
| VPS plan change, free adjustment, billing check | `routes/admin-act.ts`, `services/vps-plan.ts` | `Vps.tsx`, `VpsOperations.tsx` | `services.write` + `pricing.write` | quote, reason | `vps-plan.test.ts` (14) | VERIFIED with fakes for Stripe and Proxmox |
| VPS allocations, reconcile | `services/vps.ts` | `VpsOperations.tsx` | `infrastructure.read/write` | n/a | `vps-allocator.test.ts` (10) | VERIFIED with a fake Proxmox; live report works, the pool listing needs `Pool.Audit` |
| Email templates | `routes/admin-ops.ts`, `routes/admin-email.ts` | `EmailTemplates.tsx`, `EmailTools.tsx` | `settings.read/write` | placeholders, plain text, strict body | `email-admin.test.ts` (9) | FIXED AND VERIFIED (API) |
| Site content | `routes/content.ts`, `services/content.ts` | `Content.tsx`, `site/siteContent.ts` | `content.read/write` | per block shape, no markup | `content.test.ts` (9) | FIXED AND VERIFIED (API); site wiring typechecked and built, not looked at in a browser |
| Failed jobs | `/admin/dead-letters` | `Tools.tsx` | `infrastructure.read/write` | existing | existing | IMPLEMENTED BUT UNVERIFIED (screen) |
| Every other page (customers, orders, billing, tickets, mail, incidents, staff, abuse, promotions) | not re-audited | not re-audited | existing suite | existing | existing suite | NOT IMPLEMENTED (screen-by-screen audit not done) |
