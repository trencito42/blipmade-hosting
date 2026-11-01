# 03 · Admin coverage matrix

Only the capabilities that were inspected or changed in this work are listed. **The full audit of every route in `web/src/admin/` (Phase 5) was not completed.** Rows marked "not audited" are unknown, not fine.

| Capability | Backend | Frontend | RBAC | Validated | Tested | Remaining work |
|---|---|---|---|---|---|---|
| General settings (27 operator keys) | `PUT/GET/DELETE /admin/settings` | `web/src/admin/Settings.tsx` | per key owner | zod per key | `settings-registry.test.ts`, `phase2-access-control.test.ts` | FIXED AND VERIFIED |
| Settings ownership map | `controlMap` in `GET /admin/settings` | "Who owns each setting" table in Settings, Advanced | read per key | n/a | `settings-registry.test.ts` (gives every key one owner) | the UI table is IMPLEMENTED BUT UNVERIFIED in a browser |
| Capacity, reserved domains, auto delete, VPS lifecycle | general endpoint | Settings, Advanced (key list) | `infrastructure.write` | zod shapes | `settings-registry.test.ts`, `vps-lifecycle.test.ts` | dedicated forms instead of raw JSON rows: NOT IMPLEMENTED |
| Staff security rules (2FA, IP allow list) | `PUT /admin/security` | Settings, Staff security | `staff.write` | existing | existing + registry refusal tests | FIXED AND VERIFIED |
| Rate card | `PUT /admin/pricing` | Pricing page | `pricing.write` | existing | registry refusal test | price history, margin view, discounts: NOT IMPLEMENTED |
| VPS commercial plan change | `GET /admin/vps/:id/plan-quote`, `POST /admin/vps/:id/plan` | `web/src/admin/Vps.tsx` PlanChange | `services.write` + `pricing.write` | quote must match | `vps-plan.test.ts` | annual VPS subscriptions are not handled (refused only by monthly assumption): NOT IMPLEMENTED |
| VPS free adjustment | `POST /admin/vps/:id/resources` | `Vps.tsx` FreeAdjustment | `services.write` + `pricing.write` | reason ≥ 10, `freeOverride:true` | `vps-plan.test.ts` | IMPLEMENTED BUT UNVERIFIED in a browser |
| VPS billing check | `GET /admin/vps-billing-check` | none | `services.read` | n/a | `vps-plan.test.ts` | a page and a repair action: NOT IMPLEMENTED |
| VPS allocations report and reconcile | `GET /admin/vps/allocations`, `POST /admin/vps/allocations/reconcile` | none | `infrastructure.read/write` | n/a | `vps-allocator.test.ts` | a page: NOT IMPLEMENTED |
| VPS plans and options (create, edit, retire) | generic product routes | generic Products page | `products.write` | n/a | not tested here | VPS-specific editor: NOT IMPLEMENTED |
| Product editor (egg, image, startup, variables, health, docs, states, preview, audit) | product routes exist for part of it | `web/src/admin/Products.tsx` | `products.write` | partial | not tested here | NOT IMPLEMENTED (Phase 2) |
| Add-ons, discounts, annual periods, tax, price history | partly | partly | `pricing.write` | partly | not tested here | NOT IMPLEMENTED (Phase 3) |
| Content (CMS) | none | none | none | none | none | NOT IMPLEMENTED (Phase 6) |
| Email templates | `routes/admin-ops.ts:448-490` | Notifications admin | `settings.write` | 4 fields | `email-templates.test.ts` | versions, preview, test send, design variables: NOT IMPLEMENTED |
| Backups: retention sweep | worker | none | n/a | n/a | `backup-sweep.test.ts` | FIXED AND VERIFIED (mocked panel) |
| Every other admin page (customers, orders, billing, tickets, mail, incidents, staff) | not audited | not audited | not audited | not audited | existing suite only | NOT IMPLEMENTED (audit not done) |
