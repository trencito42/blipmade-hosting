# 02 · Inventory of hardcoded configuration

`Admin editable` means: changed from the administration panel without a deploy.

| Configuration | File and line | Current source | Admin editable | Recommended ownership | Priority | Implementation status |
|---|---|---|---|---|---|---|
| Company, tax, legal and privacy text (27 keys) | `api/src/services/operator-settings.ts` | `Setting` table through the registry | Yes (`settings.write`; the tax rate needs `pricing.write`) | settings | done | FIXED AND VERIFIED |
| Rate card (RAM, CPU, disk) | `api/src/services/pricing.ts:184` | `Setting` `pricing_resources`, default in code | Yes, through `PUT /admin/pricing` only | pricing | done | FIXED AND VERIFIED (general endpoint refuses it) |
| Node cores, CPU oversubscription, node costs | `api/src/services/capacity.ts:20-146` | `Setting`, validated by shape | Yes (`infrastructure.write`) | infrastructure | done | FIXED AND VERIFIED |
| Reserved domains | `api/src/routes/domains.ts:151` | `Setting`, validated as host names | Yes (`infrastructure.write`) | infrastructure | done | FIXED AND VERIFIED |
| Auto delete of cancelled services | `api/src/services/billing.ts:447` | `Setting`, validated | Yes (`infrastructure.write`) | infrastructure | done | FIXED AND VERIFIED |
| VPS retention days | `api/src/services/vps.ts` (`vpsLifecyclePolicy`) | `Setting` `vps.retention_days`, default 14 | Yes | infrastructure | done | FIXED AND VERIFIED |
| VPS payment grace days | same | `Setting` `vps.payment_grace_days`, default 3 | Yes | infrastructure | done | FIXED AND VERIFIED |
| VPS VMID base, network, gateway, SSH base, slot cap | `api/src/env.ts` (`VPS_*`) | environment | No, on purpose | privileged infrastructure | done | INTENTIONALLY NON-CONFIGURABLE from the panel |
| Proxmox certificate pin | `api/src/env.ts` `VPS_PROXMOX_FINGERPRINT` | environment | No, on purpose | privileged infrastructure | done | INTENTIONALLY NON-CONFIGURABLE |
| VPS plans (size and price of the 4 plans) | `api/src/lib/vps-plans.ts:23` | seed, then the `Product` rows | Prices and sizes only through the generic product and pricing pages; no VPS-specific editor | products | high | NOT IMPLEMENTED |
| Dedicated IPv4 price (399) | `api/src/lib/vps-plans.ts:31` | seed, then the `ProductOption` row | Not from a VPS page | pricing | high | NOT IMPLEMENTED |
| VPS image list and templates | `api/src/lib/vps-images.ts` + `VPS_IMAGES` | code and environment | No | privileged infrastructure | medium | INTENTIONALLY NON-CONFIGURABLE until a protected workflow exists |
| Included backups by RAM (3/4/5) | `api/src/lib/plan-limits.ts:16` | code | No | products | medium | NOT IMPLEMENTED |
| Backup schedule presets (03:30 UTC daily or weekly) | `api/src/services/backup-policy.ts:15` | code | No | infrastructure | low | NOT IMPLEMENTED |
| Past-due grace of the game services | `api/src/services/billing.ts:49` | code (7 days) | No | billing | medium | NOT IMPLEMENTED |
| Retention of cancelled services | `api/src/services/billing.ts:77` | code (30 days) plus the `auto_delete` setting | Partly | billing | medium | NOT IMPLEMENTED |
| Homepage, hero, FAQ, product marketing, SEO | `web/src/site/**`, `web/src/content/**` | code and JSON in the repository | No | content | high | NOT IMPLEMENTED (no CMS) |
| Legal documents | `web/src/legal/documents/*.tsx` | code | Only the 27 facts above | legal | high | NOT IMPLEMENTED (review before publication is not built) |
| Documentation pages | `web/src/content/docs/**` | JSON in the repository | No | content | medium | NOT IMPLEMENTED |
| Email template wording (subject, heading, preheader, note) | `api/src/lib/email-overrides.ts`, `routes/admin-ops.ts:448` | `Setting` `email.template.*` | Yes, 4 fields only | mail | medium | PARTIALLY (versioning, design variables, test send, preview not added) |
| SMTP credentials | environment | environment | No | privileged | n/a | INTENTIONALLY NON-CONFIGURABLE |
| Stripe keys | environment | environment | No | privileged | n/a | INTENTIONALLY NON-CONFIGURABLE |
