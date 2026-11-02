# 07 · Remaining gaps

| Gap | State |
|---|---|
| Phase 3: annual discount, margin per product | IMPLEMENTED in round three (see 09). The discount and the yearly term on Deploy are not verified against Stripe. Discount rules beyond the existing promotions and the tax configuration: NOT IMPLEMENTED (no tax rule was invented) |
| Phase 5: a screen-by-screen audit | PARTLY DONE: every admin route was opened in a browser on a desktop and on a phone and the result is in 09. Not every button was clicked, and bulk actions were not built |
| Backend operations without a screen | DONE for panel credential, import and confirm collection (see 09). The database limit is superseded by "Save limits", `GET /admin/money` is a stub, and the mail operations already had screens |
| Phase 6: a review step before publication (a second person), page-level content beyond five blocks, documentation pages, legal documents | NOT IMPLEMENTED. The CMS covers the home heading and text, the home FAQ, product words, search title and description, and a notice above the menu. Search titles apply after the page loads; the prerendered file keeps the title of the code |
| Phase 7: design variables and controlled HTML of the templates | INTENTIONALLY NON-CONFIGURABLE for now: the design stays in code so that a customer message cannot be broken or abused |
| Phase 8: the schedule, the retention rules and the VPS backups were not re-verified; only the platform archive and its offsite copy were | The real restore drill passed (see 06). Customer backups and VPS backups are NOT VERIFIED live |
| Phase 9: lifecycle reconciliation across Stripe, PostgreSQL, Pterodactyl, Proxmox, Mailcow | NOT IMPLEMENTED beyond `GET /admin/vps-billing-check` and the VPS allocation report |
| VPS plans editor, protected workflow for nodes, storage, templates, IP pools | NOT IMPLEMENTED |
| VPS: yearly subscriptions in the plan change; a durable retry for a Stripe and Proxmox split; reuse of released slots | NOT IMPLEMENTED |
| Settings: confirmation and step-up authentication for the dangerous keys; forms instead of JSON rows | NOT IMPLEMENTED |
| Product guide: stored and shown in the editor preview, not shown to customers | NOT IMPLEMENTED |
| Legal wording about backups in the Terms, the SLA and the AUP | IMPLEMENTED BUT UNVERIFIED: needs your review |
| Dependencies: `zod` (3, advisory fixed in 4.6.6), `prisma` and its config chain (build-time), `@sentry/node` build plugin chain | STILL BROKEN, on purpose: each is a major upgrade with a wide blast radius and the exposure is a denial of service on bounded inputs or a build-time tool. `nodemailer` was upgraded and the unused `@fastify/static` was removed |
| Playwright and a look at the new screens in a browser | DONE on a disposable stack (see 09). Not run against the live site |
| The real SMTP delivery with nodemailer 10, the real Stripe plan-change update, a real card payment of a VPS | NOT VERIFIED (the live test message after the deploy is reported in 06) |

## Operator actions that only you can do
1. Run these two commands on the hypervisor (the permission change was refused to the assistant by the permission system, so it is yours): `pveum role add BlipmadePoolAudit --privs Pool.Audit`, then `pveum acl modify /pool/vps --roles BlipmadePoolAudit --users bmapi@pve` and `pveum acl modify /pool/vps --roles BlipmadePoolAudit --tokens 'bmapi@pve!provision'`. This gives the Proxmox token `bmapi@pve!provision` the privilege `Pool.Audit` on `/pool/vps`, on the user and on the token (privilege separation is on) `bmapi@pve!provision` the privilege `Pool.Audit` on `/pool/vps`, on the user and on the token (privilege separation is on). Until then `GET /admin/vps/allocations` says `poolUnavailable` and cannot find orphans or strangers. Not done here because it changes the access of a production principal.
2. When Proxmox renews its certificate (about once a year), write the new fingerprint in `VPS_PROXMOX_FINGERPRINT` in `/opt/blipmade/.env` and restart `api` and `worker`, or the VPS service stops. Read it with `openssl x509 -in /etc/pve/local/pve-ssl.pem -noout -fingerprint -sha256`.
3. Review the backup wording in the Terms, the SLA and the AUP before you rely on it.
4. Decide on the API dependency upgrades that are left (prisma, zod 4, the Sentry build plugins) and on the tax, legal and Factorio questions that were already open.
5. Test a real card payment of a VPS and a plan change on a Stripe test-mode subscription before opening the VPS plans.
