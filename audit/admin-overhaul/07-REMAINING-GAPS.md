# 07 · Remaining gaps

| Gap | State |
|---|---|
| Phase 2: complete product editor (egg, image, startup, variables, health check, states, preview, audit, slug change safety, provisionable check) | NOT IMPLEMENTED |
| Phase 3: discounts, annual periods, tax configuration, price history, margin view, a single price engine audit | NOT IMPLEMENTED. The VPS plan change uses the catalogue price in integer cents; the rest of the pricing engine was not re-audited |
| Phase 5: audit of every admin route (inert buttons, missing states, bulk actions) and the control map as a page | NOT IMPLEMENTED. Only the settings ownership table exists |
| Phase 6: CMS with drafts, preview, versions, rollback, sanitization | NOT IMPLEMENTED. Public texts are still in code |
| Phase 7: template versions, preview, test email, design variables, fallback | NOT IMPLEMENTED. The wiring tests pass for 84 events; 3 templates are known to be unreachable on purpose (`account-email-change-requested`, `ticket-resolved`, `mailbox-password-reset`) and each has its reason written in `api/tests/notification-template-wiring.test.ts` |
| Phase 8: verify the live backup chain (schedule, offsite integrity, restore drill, VPS backups) | BLOCKED: needs the live infrastructure and a restore on disposable machines. Source support is not proof that it works |
| Phase 9: lifecycle reconciliation across Stripe, PostgreSQL, Pterodactyl, Proxmox, Mailcow | NOT IMPLEMENTED except `GET /admin/vps-billing-check` |
| VPS: dedicated page for allocations, billing check and repair, VPS plan editor, protected workflow for nodes, storage, templates, IP pools | NOT IMPLEMENTED |
| VPS: yearly subscriptions in the plan change; a durable retry for a Stripe/Proxmox split; reuse of released slots | NOT IMPLEMENTED |
| Settings: confirmation and step-up for the dangerous keys; dedicated forms instead of JSON rows | NOT IMPLEMENTED |
| Legal documents: the backup wording in Terms, SLA and AUP changed and needs your legal review. There is no review-before-publish workflow | IMPLEMENTED BUT UNVERIFIED |
| Dependencies: 10 vulnerabilities in API production dependencies (prisma, zod, @fastify/static, nodemailer, @sentry/node and their chains) | STILL BROKEN: each fix is a breaking upgrade that needs its own change and test run |
| Playwright and a visual check of the admin changes | NOT RUN |
| Tax rules, the jurisdiction decisions, Factorio listing, SSH key rotation to the storage box, legal data | operator decisions, not touched |

## Operator actions that only you can do
1. Give the Proxmox token `bmapi@pve!provision` the privilege `Pool.Audit` on `/pool/vps`, on the user and on the token (privilege separation is on). Until then `GET /admin/vps/allocations` says `poolUnavailable` and cannot find orphans or strangers. Not done here because it changes the access of a production principal.
2. When Proxmox renews its certificate (about once a year), write the new fingerprint in `VPS_PROXMOX_FINGERPRINT` in `/opt/blipmade/.env` and restart `api` and `worker`, or the VPS service stops. Read it with `openssl x509 -in /etc/pve/local/pve-ssl.pem -noout -fingerprint -sha256`.
3. Review the backup wording in the Terms, the SLA and the AUP before you rely on it.
4. Decide on the API dependency upgrades (prisma, zod 4, @fastify/static 10, nodemailer 10, @sentry/node) and on the tax, legal and Factorio questions that were already open.
5. Test a real card payment of a VPS and a plan change on a Stripe test-mode subscription before opening the VPS plans.
