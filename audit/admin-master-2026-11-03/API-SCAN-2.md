# API functional/security route inventory 2/4
Snapshot 48df705f110b46f7d2a7d90ef33e0cd0a289f74c. Static literal app.method scans; inline permission hints are NOT proof of RBAC enforcement or vulnerability.

## api/src/routes/admin-support-ai.ts (3 matched)
- GET `/admin/support/ai` L20; inlinePermission=tickets.read,settings.write; preHandler=true; rateHint=true; handlerAuthText=false
- PUT `/admin/support/ai` L26; inlinePermission=settings.write,settings.write; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/admin/support/conversations/:id/ai` L37; inlinePermission=tickets.write,tickets.write; preHandler=true; rateHint=true; handlerAuthText=false

## api/src/routes/admin-support-analytics.ts (4 matched)
- GET `/admin/support/sla` L39; inlinePermission=tickets.read,settings.write,settings.write; preHandler=true; rateHint=true; handlerAuthText=false
- PUT `/admin/support/sla` L41; inlinePermission=settings.write,settings.write; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/admin/support/ratings` L53; inlinePermission=tickets.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/support/analytics` L70; inlinePermission=tickets.read; preHandler=true; rateHint=false; handlerAuthText=false

## api/src/routes/admin-support-automations.ts (9 matched)
- GET `/admin/support/automations` L54; inlinePermission=tickets.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/support/automations` L61; inlinePermission=settings.write; preHandler=false; rateHint=false; handlerAuthText=false
- PUT `/admin/support/automations/:id` L74; inlinePermission=settings.write; preHandler=false; rateHint=false; handlerAuthText=false
- DELETE `/admin/support/automations/:id` L99; inlinePermission=settings.write; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/admin/support/automations/:id/runs` L108; inlinePermission=tickets.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/support/automations/dry-run` L115; inlinePermission=tickets.write,tickets.write; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/admin/support/automation-runs/:id/retry` L127; inlinePermission=settings.write; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/admin/support/hours` L141; inlinePermission=tickets.read,settings.write; preHandler=true; rateHint=false; handlerAuthText=false
- PUT `/admin/support/hours` L147; inlinePermission=settings.write; preHandler=false; rateHint=false; handlerAuthText=false

## api/src/routes/admin-support-context.ts (4 matched)
- GET `/admin/support/conversations/:id/context` L22; inlinePermission=tickets.read,tickets.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/support/conversations/:id/render` L83; inlinePermission=tickets.write,tickets.write; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/support/articles` L97; inlinePermission=tickets.read,tickets.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/support/suggest` L111; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true

## api/src/routes/admin-support.ts (11 matched)
- GET `/admin/support/me` L93; inlinePermission=tickets.read,tickets.read,tickets.write; preHandler=true; rateHint=true; handlerAuthText=false
- PUT `/admin/support/me/avatar` L100; inlinePermission=tickets.write,tickets.write; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/support/departments` L112; inlinePermission=tickets.read; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/support/departments` L118; inlinePermission=tickets.read,settings.write; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/admin/support/departments` L126; inlinePermission=settings.write,settings.write; preHandler=true; rateHint=true; handlerAuthText=false
- PUT `/admin/support/departments/:id` L140; inlinePermission=settings.write,settings.write; preHandler=true; rateHint=true; handlerAuthText=false
- DELETE `/admin/support/departments/:id` L155; inlinePermission=settings.write,settings.write; preHandler=true; rateHint=true; handlerAuthText=false
- PUT `/admin/support/departments/:id/members` L166; inlinePermission=settings.write,settings.write; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/admin/support/conversations` L184; inlinePermission=tickets.read,tickets.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/support/counts` L243; inlinePermission=tickets.read,tickets.read,tickets.write; preHandler=true; rateHint=false; handlerAuthText=false
- PUT `/admin/support/conversations/:id/department` L250; inlinePermission=tickets.write,tickets.write; preHandler=true; rateHint=true; handlerAuthText=false

## api/src/routes/admin.ts (40 matched)
- GET `/admin/overview` L155; inlinePermission=customers.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/customers` L202; inlinePermission=customers.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/customers/:id` L259; inlinePermission=customers.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/customers/:id/panel` L345; inlinePermission=customers.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/customers/:id/panel/credential` L381; inlinePermission=services.write; preHandler=true; rateHint=true; handlerAuthText=true
- DELETE `/admin/customers/:id/panel/credential` L420; inlinePermission=services.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/customers/:id/suspend` L443; inlinePermission=customers.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/orders` L499; inlinePermission=orders.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/instances/reconcile-prices` L561; inlinePermission=pricing.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/invoices/:id/confirm-collection` L582; inlinePermission=orders.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/orders/:id/refund` L623; inlinePermission=orders.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/services` L738; inlinePermission=services.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/products` L775; inlinePermission=products.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/products` L823; inlinePermission=products.write; preHandler=true; rateHint=true; handlerAuthText=true
- DELETE `/admin/products/:id` L932; inlinePermission=products.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/pricing` L947; inlinePermission=pricing.read; preHandler=true; rateHint=false; handlerAuthText=false
- PUT `/admin/pricing/rates` L996; inlinePermission=pricing.write; preHandler=true; rateHint=true; handlerAuthText=true
- PUT `/admin/pricing/:id` L1030; inlinePermission=pricing.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/capacity` L1095; inlinePermission=pricing.read; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/tickets` L1203; inlinePermission=tickets.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/tickets/:id/assign` L1300; inlinePermission=tickets.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/promotions` L1345; inlinePermission=promotions.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/promotions` L1384; inlinePermission=promotions.write; preHandler=true; rateHint=true; handlerAuthText=true
- PATCH `/admin/promotions/:id` L1436; inlinePermission=promotions.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/infrastructure` L1494; inlinePermission=infrastructure.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/infrastructure/sync` L1526; inlinePermission=infrastructure.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/audit` L1583; inlinePermission=audit.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/dead-letters` L1627; inlinePermission=infrastructure.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/dead-letters/:id` L1668; inlinePermission=infrastructure.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/dead-letters/:id/requeue` L1683; inlinePermission=infrastructure.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/dead-letters/:id/close` L1716; inlinePermission=infrastructure.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/staff` L1735; inlinePermission=staff.read; preHandler=true; rateHint=false; handlerAuthText=false
- PUT `/admin/staff/:userId` L1765; inlinePermission=staff.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/settings` L1891; inlinePermission=settings.read; preHandler=true; rateHint=false; handlerAuthText=true
- GET `/admin/email/delivery` L1911; inlinePermission=settings.read,settings.write; preHandler=true; rateHint=true; handlerAuthText=true
- PUT `/admin/settings` L1916; inlinePermission=settings.write; preHandler=true; rateHint=true; handlerAuthText=true
- DELETE `/admin/settings/:key` L1966; inlinePermission=settings.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/instances/:id/retry` L1986; inlinePermission=services.write; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/admin/instances/import` L2018; inlinePermission=services.write; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/money` L2107; inlinePermission=pricing.read; preHandler=true; rateHint=false; handlerAuthText=false

## api/src/routes/api-keys.ts (3 matched)
- GET `/settings/api-keys` L23; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/settings/api-keys` L41; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- DELETE `/settings/api-keys/:id` L67; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true

## api/src/routes/auth.ts (13 matched)
- POST `/auth/register` L312; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/auth/login` L359; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/auth/logout` L407; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/auth/session` L418; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/auth/verify-email` L440; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/auth/resend-verification` L465; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/auth/forgot-password` L483; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/auth/reset-password` L508; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=false
- POST `/auth/enroll-admin` L544; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/internal/prune-sessions` L593; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/internal/whoami` L603; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/auth/require` L608; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/internal/not-a-real-route` L613; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false

## api/src/routes/billing.ts (11 matched)
- GET `/billing/payment-state` L42; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/billing/credit` L51; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/billing/summary` L61; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/billing/quote` L176; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/billing/subscriptions/:id/renew` L242; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/billing/instances/:id/export` L281; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/billing/invoices` L305; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/billing/subscriptions` L353; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/billing/subscriptions/:id/cancel` L378; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/billing/subscriptions/:id/resume` L410; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/billing/payment-method` L438; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true

## api/src/routes/catalog.ts (4 matched)
- GET `/platform/settings` L189; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/catalog/products` L193; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/catalog/products/:slug` L243; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/catalog/quote` L267; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=false

## api/src/routes/content.ts (8 matched)
- GET `/content` L19; inlinePermission=content.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/content` L24; inlinePermission=content.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/admin/content/:key` L36; inlinePermission=content.read; preHandler=true; rateHint=false; handlerAuthText=false
- PUT `/admin/content/:key/draft` L48; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- DELETE `/admin/content/:key/draft` L57; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/admin/content/:key/publish` L65; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/admin/content/:key/unpublish` L73; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/admin/content/:key/rollback` L81; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true

## api/src/routes/domains.ts (7 matched)
- GET `/caddy/allow-certificate` L302; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=false
- GET `/domains/platform-subdomain` L317; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=true
- GET `/domains` L325; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- PUT `/domains/:id/address` L343; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/instances/:id/domains` L432; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/domains/:id/verify` L553; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- DELETE `/domains/:id` L674; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true