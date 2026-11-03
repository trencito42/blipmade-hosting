# API functional/security route inventory 1/4
Snapshot 48df705f110b46f7d2a7d90ef33e0cd0a289f74c. Static literal app.method scans; inline permission hints are NOT proof of RBAC enforcement or vulnerability.

## api/src/routes/abuse.ts (1 matched)
- POST `/abuse/report` L13; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=false

## api/src/routes/account-export.ts (1 matched)
- GET `/settings/export` L17; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true

## api/src/routes/admin-act.ts (29 matched)
- POST `/admin/customers/:id/impersonate` L48; inlinePermission=customers.write; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/impersonation/stop` L79; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/admin/vps` L103; inlinePermission=services.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/vps/allocations` L117; inlinePermission=infrastructure.read,infrastructure.write; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/vps/allocations/reconcile` L123; inlinePermission=infrastructure.write,services.read; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/vps/:id` L130; inlinePermission=services.read,services.read; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/vps/:id/usage` L136; inlinePermission=services.read,services.write; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/vps/:id/power` L142; inlinePermission=services.write; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/vps/:id/reinstall` L152; inlinePermission=services.write; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/vps/:id/retry` L164; inlinePermission=services.write; preHandler=true; rateHint=false; handlerAuthText=true
- DELETE `/admin/vps/:id` L176; inlinePermission=services.write; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/vps/:id/console/stream` L186; inlinePermission=services.write; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/admin/customers/:id/subscriptions` L208; inlinePermission=customers.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/subscriptions/:id/cancel` L234; inlinePermission=customers.write; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/subscriptions/:id/resume` L244; inlinePermission=customers.write; preHandler=true; rateHint=false; handlerAuthText=true
- PATCH `/admin/customers/:id/name` L254; inlinePermission=customers.write; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/customers/:id/verify-email` L262; inlinePermission=customers.write; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/customers/:id/send-password-reset` L269; inlinePermission=customers.write,customers.write; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/customers/:id/revoke-sessions` L276; inlinePermission=customers.write; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/customers/:id/reset-2fa` L284; inlinePermission=customers.write; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/instances/:id/power` L306; inlinePermission=services.write; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/instances/:id/suspend` L335; inlinePermission=services.write; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/instances/:id/reinstall` L345; inlinePermission=services.write; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/instances/:id/database-limit` L354; inlinePermission=services.write; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/instances/:id/feature-limits` L364; inlinePermission=services.write; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/vps/:id/plan-quote` L389; inlinePermission=services.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/vps/:id/plan` L400; inlinePermission=services.write,pricing.write; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/vps/:id/resources` L412; inlinePermission=services.write,pricing.write; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/vps-billing-check` L429; inlinePermission=services.read; preHandler=true; rateHint=false; handlerAuthText=false

## api/src/routes/admin-addons.ts (4 matched)
- GET `/admin/options` L37; inlinePermission=pricing.read,pricing.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/options` L45; inlinePermission=pricing.write; preHandler=true; rateHint=true; handlerAuthText=true
- PATCH `/admin/options/:id` L69; inlinePermission=pricing.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/pricing/history` L98; inlinePermission=pricing.read; preHandler=true; rateHint=false; handlerAuthText=false

## api/src/routes/admin-control.ts (5 matched)
- GET `/admin/search` L28; inlinePermission=customers.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/services/:id` L87; inlinePermission=services.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/orders/:id` L151; inlinePermission=orders.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/orders/:id/retry-fulfilment` L208; inlinePermission=orders.write; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/promotions/:id` L244; inlinePermission=promotions.read; preHandler=true; rateHint=false; handlerAuthText=false

## api/src/routes/admin-email.ts (5 matched)
- POST `/admin/email-templates/:id/preview` L58; inlinePermission=settings.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/email-templates/:id/versions` L68; inlinePermission=settings.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/email-templates/:id/restore` L80; inlinePermission=settings.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/email-templates/:id/test` L95; inlinePermission=settings.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/email-templates/coverage` L108; inlinePermission=settings.read; preHandler=true; rateHint=false; handlerAuthText=false

## api/src/routes/admin-mail-plans.ts (12 matched)
- GET `/admin/mail/plans` L531; inlinePermission=mail.read; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/admin/mail/plans` L559; inlinePermission=mail.write; preHandler=true; rateHint=true; handlerAuthText=true
- PATCH `/admin/mail/plans/:id` L636; inlinePermission=mail.write; preHandler=true; rateHint=true; handlerAuthText=true
- DELETE `/admin/mail/plans/:id` L743; inlinePermission=mail.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/mail/services` L788; inlinePermission=mail.read; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/admin/mail/services/:id` L826; inlinePermission=mail.read; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/admin/mail/services/:id/suspend` L846; inlinePermission=mail.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/mail/services/:id/resume` L860; inlinePermission=mail.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/mail/services/:id/cancel` L876; inlinePermission=mail.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/mail/services/:id/reactivate` L889; inlinePermission=mail.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/mail/services/:id/reprovision` L905; inlinePermission=mail.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/mail/usage` L937; inlinePermission=mail.read; preHandler=true; rateHint=true; handlerAuthText=false

## api/src/routes/admin-mail.ts (4 matched)
- GET `/admin/mail/health` L62; inlinePermission=infrastructure.read; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/admin/mail/domains` L107; inlinePermission=infrastructure.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/mail/jobs` L158; inlinePermission=infrastructure.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/mail/jobs/:id/retry` L200; inlinePermission=infrastructure.write; preHandler=true; rateHint=true; handlerAuthText=true

## api/src/routes/admin-notifications.ts (13 matched)
- GET `/admin/notifications/overview` L173; inlinePermission=audit.read; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/admin/notifications/deliveries` L231; inlinePermission=audit.read; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/admin/notifications/events` L310; inlinePermission=audit.read; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/admin/notifications/events/:id` L380; inlinePermission=audit.read; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/admin/notifications/events/:id/retry` L433; inlinePermission=infrastructure.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/notifications/deliveries/:key/retry` L504; inlinePermission=infrastructure.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/notifications/templates` L597; inlinePermission=audit.read; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/admin/notifications/templates/:id/preview` L627; inlinePermission=infrastructure.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/notifications/templates/:id/validate` L684; inlinePermission=infrastructure.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/notifications/test-send` L727; inlinePermission=infrastructure.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/notifications/categories` L834; inlinePermission=audit.read; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/admin/notifications/trends` L887; inlinePermission=audit.read; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/admin/notifications/preferences` L964; inlinePermission=audit.read; preHandler=true; rateHint=true; handlerAuthText=false

## api/src/routes/admin-ops.ts (33 matched)
- GET `/admin/promotion-holds` L164; inlinePermission=customers.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/customers/:id/promo-clearance` L196; inlinePermission=customers.write; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/backups/health` L209; inlinePermission=infrastructure.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/support/replies` L277; inlinePermission=tickets.write,tickets.write; preHandler=true; rateHint=false; handlerAuthText=true
- PUT `/admin/support/replies` L283; inlinePermission=tickets.write; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/support/knowledge` L295; inlinePermission=tickets.read,tickets.write; preHandler=true; rateHint=false; handlerAuthText=true
- PUT `/admin/support/knowledge` L301; inlinePermission=tickets.write; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/accounting/invoices.csv` L313; inlinePermission=settings.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/customers/:id/notes` L362; inlinePermission=customers.read,customers.write; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/customers/:id/notes` L368; inlinePermission=customers.write; preHandler=true; rateHint=false; handlerAuthText=false
- DELETE `/admin/customers/:id/notes/:noteId` L376; inlinePermission=customers.write; preHandler=true; rateHint=false; handlerAuthText=false
- PUT `/admin/customers/:id/tags` L385; inlinePermission=customers.write; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/tags` L395; inlinePermission=customers.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/reports` L407; inlinePermission=orders.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/queues` L486; inlinePermission=infrastructure.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/webhooks/failed` L502; inlinePermission=infrastructure.read; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/webhooks/replay` L512; inlinePermission=infrastructure.write; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/queues/:name/jobs/:id/retry` L520; inlinePermission=infrastructure.write; preHandler=true; rateHint=false; handlerAuthText=true
- DELETE `/admin/queues/:name/failed` L532; inlinePermission=infrastructure.write; preHandler=true; rateHint=false; handlerAuthText=true
- DELETE `/admin/queues/:name/jobs/:id` L542; inlinePermission=infrastructure.write; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/abuse` L564; inlinePermission=services.read; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/abuse/:id` L636; inlinePermission=services.read; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/abuse/:id/notes` L687; inlinePermission=services.write; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/abuse/:id/action` L709; inlinePermission=services.write; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/email-templates` L863; inlinePermission=settings.read; preHandler=true; rateHint=false; handlerAuthText=false
- PUT `/admin/email-templates/:id` L880; inlinePermission=settings.write; preHandler=true; rateHint=false; handlerAuthText=true
- DELETE `/admin/email-templates/:id` L901; inlinePermission=settings.write; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/customers/:id/risk` L914; inlinePermission=customers.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/customers/:id/risk-decision` L923; inlinePermission=customers.write; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/customers/bulk-tags` L940; inlinePermission=customers.write; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/customers/:id/credit` L971; inlinePermission=orders.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/customers/:id/credit` L981; inlinePermission=orders.write; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/orders/:id/partial-refund` L1003; inlinePermission=orders.write; preHandler=true; rateHint=false; handlerAuthText=true

## api/src/routes/admin-products.ts (6 matched)
- GET `/admin/products/:id` L54; inlinePermission=products.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/products/:id/readiness` L66; inlinePermission=products.read,products.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/products/:id/change-preview` L73; inlinePermission=products.read,products.write; preHandler=true; rateHint=true; handlerAuthText=true
- PATCH `/admin/products/:id` L80; inlinePermission=products.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/products/:id/history` L118; inlinePermission=products.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/products/:id/preview` L131; inlinePermission=products.read; preHandler=true; rateHint=false; handlerAuthText=false

## api/src/routes/admin-status.ts (10 matched)
- GET `/admin/incidents` L21; inlinePermission=infrastructure.read,infrastructure.write; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/incidents` L26; inlinePermission=infrastructure.write; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/incidents/:id/updates` L54; inlinePermission=infrastructure.write; preHandler=true; rateHint=false; handlerAuthText=true
- DELETE `/admin/incidents/:id` L73; inlinePermission=infrastructure.write; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/announcements` L84; inlinePermission=infrastructure.read; preHandler=true; rateHint=false; handlerAuthText=true
- POST `/admin/announcements` L97; inlinePermission=infrastructure.write; preHandler=true; rateHint=false; handlerAuthText=true
- PATCH `/admin/announcements/:id` L106; inlinePermission=infrastructure.write; preHandler=true; rateHint=false; handlerAuthText=true
- DELETE `/admin/announcements/:id` L119; inlinePermission=infrastructure.write; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/security` L131; inlinePermission=settings.read; preHandler=true; rateHint=false; handlerAuthText=false
- PUT `/admin/security` L146; inlinePermission=settings.write; preHandler=true; rateHint=false; handlerAuthText=true