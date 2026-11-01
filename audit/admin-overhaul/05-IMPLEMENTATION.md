# 05 · What was implemented

Branch `feat/admin-overhaul`, one coherent commit per change on top of `5a9bf845`.

| Commit | Change |
|---|---|
| `5d1582f` | The 7 failing tests: route order test, notification wiring (84 events, publishers that take the event as an argument, two service events reached by the uptime monitor), `offsite-agent.sh` no longer pipes into `head` under `pipefail` |
| `e6afab4` | Settings registry and the new `PUT/GET/DELETE /admin/settings` |
| `e82560e` | Pinned TLS for Proxmox (REST and terminal) |
| `2e9d69a` | Slot ledger, ownership check, reconciliation report, configurable network layout (migration `20261101180000_vps_slot_ledger`) |
| `ac88198`, `8b308f8` | VPS commercial plan change with quote, free adjustment, billing check, admin UI (migration `20261101190000_vps_resource_override`) |
| `522096c` | Backup retention sweep in pages |
| `aa2b0ae` | Public wording about automatic backups, sidebar storage test |
| `1343c22` | VPS retention and grace as settings, `sweepVps` in pages |

## Second round (same day)
| Change | Detail |
|---|---|
| Product editor (Phase 2) | `api/src/services/product-editor.ts`, `api/src/routes/admin-products.ts`, `web/src/admin/ProductEditor.tsx`: every field, four states (draft, published, unavailable, retired), review of the change before it is written, confirmation of risky changes, readiness, slug rules for sold products, history, customer preview. Migration `20261101200000_product_editor` |
| Add-ons and price history (Phase 3, part) | `api/src/routes/admin-addons.ts`, `web/src/admin/Commerce.tsx`: create, change the amount, retire; the history of every price change with before and after; `pricing.updated` now keeps both |
| Price correction | `POST /admin/instances/reconcile-prices` has a dry run, walks every service (it read 500) and the page asks for the dry run first |
| VPS pages | allocations and billing check panels in `web/src/admin/VpsOperations.tsx` |
| Email (Phase 7) | `api/src/routes/admin-email.ts`, `web/src/admin/EmailTools.tsx`: preview of a draft, versions with restore, test message to the caller only, map of events to templates with deliveries, fallback to the wording of the code |
| Content (Phase 6) | `api/src/services/content.ts`, `api/src/routes/content.ts`, `web/src/admin/Content.tsx`, `web/src/site/siteContent.ts`: home heading and text, home FAQ, product marketing words, search title and description per page; draft, publish, history, rollback; plain text only; permissions `content.read` and `content.write`. Migration `20261101210000_content_blocks` |
| Operator tools | `web/src/admin/Tools.tsx`: failed jobs, price correction, email delivery report |
| Dependencies | removed the unused `@fastify/static`, upgraded `nodemailer` 6 to 10 |
| Test isolation | the suite no longer writes the receipts of the backup into `/var/backups/blipmade` (see 06) |

## Not touched, on purpose
- Stripe, Mailcow, Pterodactyl and Caddy configuration, the hypervisor scripts, credentials, the live database contents.
- `scripts/offsite-agent.sh`: only the three `head` pipes were replaced by `sed -n 1p` and a process substitution. Errors are not suppressed beyond the `|| true` that was already there.

## Not implemented (see 07)
Phase 2 (product editor), Phase 3 (discounts, annual, tax, price history, margin), Phase 5 (full admin audit), Phase 6 (CMS), Phase 7 (template versions, preview, test send), Phase 8 (live verification of backups and restores), Phase 9 (lifecycle reconciliation beyond the VPS billing check).
