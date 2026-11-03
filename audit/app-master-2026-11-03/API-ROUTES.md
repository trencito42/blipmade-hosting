# Customer-facing API map: literal route registrations and inspection signals

**Snapshot:** main 3770515b4a5122fb83f27728ad1f6507e61d1bb2, 2026-11-03.
**Coverage:** 18 API route modules most relevant to /app. Other registration modules and downstream services may also contribute. Extraction is regex/static only, not AST and not dynamic runtime. Guards recorded in nearby route declarations; absence of "preHandler" is not proof of open access. Each handler must be checked for ownership/share roles, login CSRF and request-level auth.


## api/src/routes/instances.ts (12 matched)
- **GET** `/instances` (L145): guards hinted `requireAuth`
- **GET** `/instances/:id` (L176): guards hinted `requireAuth`
- **POST** `/instances/:id/power` (L200): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/instances/:id/metrics` (L251): guards hinted `requireAuth`
- **GET** `/instances/:id/console` (L283): guards hinted `requireAuth`
- **GET** `/instances/:id/console/stream` (L310): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/instances/:id/command` (L315): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/instances/:id/resources/quote` (L345): guards hinted `requireAuth`
- **PUT** `/instances/:id/resources` (L367): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/instances/:id/events` (L422): guards hinted `requireAuth`
- **POST** `/instances/:id/rename` (L449): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/instances/:id/cancel` (L467): guards hinted `rateLimit, preHandler, requireAuth`

## api/src/routes/instance-server.ts (49 matched)
- **GET** `/instances/:id/server` (L116): guards hinted `withInstance`
- **GET** `/instances/:id/resources` (L144): guards hinted `withInstance`
- **GET** `/instances/:id/activity` (L166): guards hinted `withInstance`
- **GET** `/instances/:id/files` (L191): guards hinted `withInstance`
- **GET** `/instances/:id/file` (L216): guards hinted `withInstance, rateLimit`
- **PUT** `/instances/:id/file` (L228): guards hinted `rateLimit, preHandler, requireAuth`
- **DELETE** `/instances/:id/file` (L248): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/instances/:id/files/folder` (L275): guards hinted `rateLimit, preHandler, withInstance`
- **POST** `/instances/:id/files/rename` (L292): guards hinted `rateLimit, preHandler, withInstance`
- **POST** `/instances/:id/files/move` (L309): guards hinted `rateLimit, preHandler, withInstance`
- **POST** `/instances/:id/files/copy` (L326): guards hinted `rateLimit, preHandler, withInstance`
- **POST** `/instances/:id/files/upload` (L349): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/instances/:id/files/download` (L400): guards hinted `withInstance`
- **POST** `/instances/:id/files/compress` (L438): guards hinted `rateLimit, preHandler`
- **POST** `/instances/:id/files/archive` (L442): guards hinted `rateLimit, preHandler, withInstance`
- **POST** `/instances/:id/files/decompress` (L466): guards hinted `rateLimit, preHandler`
- **POST** `/instances/:id/files/unarchive` (L470): guards hinted `rateLimit, preHandler`
- **POST** `/instances/:id/files/chmod` (L476): guards hinted `rateLimit, preHandler, withInstance`
- **GET** `/instances/:id/databases` (L494): guards hinted `withInstance`
- **POST** `/instances/:id/databases` (L518): guards hinted `rateLimit, preHandler`
- **PATCH** `/instances/:id/databases/:databaseId` (L559): guards hinted `rateLimit, preHandler`
- **DELETE** `/instances/:id/databases/:databaseId` (L578): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/instances/:id/databases/:databaseId/credentials` (L608): guards hinted `requireAuth`
- **GET** `/instances/:id/credentials` (L650): guards hinted `requireAuth`
- **GET** `/instances/:id/backups` (L682): guards hinted `withInstance`
- **PUT** `/instances/:id/backup-schedule` (L713): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/instances/:id/backups` (L732): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/instances/:id/backups/:backupId/download` (L763): guards hinted `withInstance`
- **POST** `/instances/:id/backups/:backupId/restore` (L779): guards hinted `rateLimit, preHandler, requireAuth`
- **DELETE** `/instances/:id/backups/:backupId` (L805): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/instances/:id/allocations` (L833): guards hinted `withInstance`
- **POST** `/instances/:id/allocations` (L861): guards hinted `rateLimit, preHandler, requireAuth`
- **PUT** `/instances/:id/allocations` (L892): guards hinted `rateLimit, preHandler, withInstance`
- **PATCH** `/instances/:id/allocations/:allocationId` (L908): guards hinted `rateLimit, preHandler`
- **DELETE** `/instances/:id/allocations/:allocationId` (L933): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/instances/:id/startup` (L969): guards hinted `requireAuth`
- **PUT** `/instances/:id/startup` (L1042): guards hinted `rateLimit, preHandler`
- **PATCH** `/instances/:id/startup` (L1046): guards hinted `rateLimit, preHandler`
- **GET** `/instances/:id/env-files` (L1061): guards hinted `withInstance`
- **PUT** `/instances/:id/env-files/:name` (L1083): guards hinted `rateLimit, preHandler`
- **GET** `/instances/:id/schedules` (L1115): guards hinted `withInstance`
- **POST** `/instances/:id/schedules` (L1137): guards hinted `rateLimit, preHandler`
- **PATCH** `/instances/:id/schedules/:scheduleId` (L1168): guards hinted `rateLimit, preHandler`
- **DELETE** `/instances/:id/schedules/:scheduleId` (L1197): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/instances/:id/schedules/:scheduleId/run` (L1224): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/instances/:id/settings` (L1252): guards hinted `requireAuth`
- **PATCH** `/instances/:id/settings` (L1276): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/instances/:id/suspend` (L1321): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/instances/:id/settings/reinstall` (L1368): guards hinted `rateLimit, preHandler, requireAuth`

## api/src/routes/instance-extras.ts (5 matched)
- **GET** `/instances/:id/sftp` (L34): guards hinted `inspect wrapper/handler`
- **POST** `/instances/:id/sftp/password` (L47): guards hinted `inspect wrapper/handler`
- **GET** `/instances/:id/resource-alerts` (L61): guards hinted `inspect wrapper/handler`
- **PUT** `/instances/:id/resource-alerts` (L67): guards hinted `inspect wrapper/handler`
- **GET** `/billing/closed-services` (L78): guards hinted `requireAuth`

## api/src/routes/vps.ts (20 matched)
- **GET** `/vps/plans` (L21): guards hinted `inspect wrapper/handler`
- **GET** `/vps` (L59): guards hinted `requireAuth`
- **GET** `/vps/:id` (L69): guards hinted `requireAuth`
- **POST** `/vps/:id/power` (L75): guards hinted `requireAuth`
- **GET** `/vps/:id/usage` (L84): guards hinted `requireAuth`
- **PATCH** `/vps/:id` (L90): guards hinted `requireAuth`
- **PUT** `/vps/:id/ssh-key` (L99): guards hinted `requireAuth`
- **POST** `/vps/:id/reinstall` (L108): guards hinted `requireAuth`
- **GET** `/vps/:id/snapshots` (L120): guards hinted `requireAuth`
- **POST** `/vps/:id/snapshots` (L125): guards hinted `requireAuth`
- **POST** `/vps/:id/snapshots/:name/restore` (L133): guards hinted `requireAuth`
- **DELETE** `/vps/:id/snapshots/:name` (L141): guards hinted `requireAuth`
- **GET** `/vps/:id/iso` (L149): guards hinted `requireAuth`
- **PUT** `/vps/:id/iso` (L154): guards hinted `requireAuth`
- **DELETE** `/vps/:id/iso` (L162): guards hinted `requireAuth`
- **GET** `/vps/:id/console/stream` (L170): guards hinted `requireAuth`
- **GET** `/vps/images` (L175): guards hinted `requireAuth`
- **GET** `/vps/:id/graphs` (L180): guards hinted `requireAuth`
- **GET** `/vps/:id/activity` (L186): guards hinted `requireAuth`
- **GET** `/vps/:id/diagnose` (L192): guards hinted `requireAuth`

## api/src/routes/domains.ts (7 matched)
- **GET** `/caddy/allow-certificate` (L302): guards hinted `rateLimit`
- **GET** `/domains/platform-subdomain` (L317): guards hinted `rateLimit, requireAuth`
- **GET** `/domains` (L325): guards hinted `requireAuth`
- **PUT** `/domains/:id/address` (L343): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/instances/:id/domains` (L432): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/domains/:id/verify` (L553): guards hinted `rateLimit, preHandler, requireAuth`
- **DELETE** `/domains/:id` (L674): guards hinted `rateLimit, preHandler, requireAuth`

## api/src/routes/mail.ts (12 matched)
- **GET** `/mail/webmail` (L27): guards hinted `requireAuth`
- **GET** `/mail/domains` (L32): guards hinted `requireAuth`
- **GET** `/mail/domains/:id` (L37): guards hinted `requireAuth`
- **POST** `/mail/domains` (L50): guards hinted `rateLimit, preHandler, requireAuth`
- **DELETE** `/mail/domains/:id` (L60): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/mail/domains/:id/mailboxes` (L70): guards hinted `requireAuth`
- **POST** `/mail/domains/:id/mailboxes` (L83): guards hinted `rateLimit, preHandler, requireAuth`
- **DELETE** `/mail/domains/:id/mailboxes/:mailboxId` (L96): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/mail/domains/:id/aliases` (L108): guards hinted `requireAuth, rateLimit, preHandler`
- **POST** `/mail/domains/:id/aliases` (L114): guards hinted `rateLimit, preHandler, requireAuth`
- **DELETE** `/mail/domains/:id/aliases/:aliasId` (L127): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/mail/domains/:id/dns` (L146): guards hinted `requireAuth`

## api/src/routes/mail-commerce.ts (11 matched)
- **GET** `/mail/plans` (L159): guards hinted `rateLimit, preHandler`
- **GET** `/mail/services` (L172): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/mail/services/:id` (L181): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/mail/services/:id/domains` (L197): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/mail/domains/:id/verify` (L215): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/mail/services/:id/suspend` (L230): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/mail/services/:id/resume` (L247): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/mail/services/:id/cancel` (L269): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/mail/services/:id/reactivate` (L281): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/mail/services/:id/plan` (L299): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/mail/services/:id/dns` (L426): guards hinted `rateLimit, preHandler, requireAuth`

## api/src/routes/billing.ts (11 matched)
- **GET** `/billing/payment-state` (L42): guards hinted `requireAuth`
- **GET** `/billing/credit` (L51): guards hinted `requireAuth`
- **GET** `/billing/summary` (L61): guards hinted `requireAuth`
- **POST** `/billing/quote` (L176): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/billing/subscriptions/:id/renew` (L242): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/billing/instances/:id/export` (L281): guards hinted `requireAuth`
- **GET** `/billing/invoices` (L305): guards hinted `requireAuth`
- **GET** `/billing/subscriptions` (L353): guards hinted `requireAuth`
- **POST** `/billing/subscriptions/:id/cancel` (L378): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/billing/subscriptions/:id/resume` (L410): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/billing/payment-method` (L438): guards hinted `rateLimit, preHandler, requireAuth`

## api/src/routes/orders.ts (6 matched)
- **POST** `/orders` (L109): guards hinted `rateLimit, requireAuth`
- **GET** `/orders` (L262): guards hinted `requireAuth`
- **GET** `/orders/:id` (L275): guards hinted `requireAuth, rateLimit`
- **POST** `/orders/:id/checkout` (L286): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/orders/:id/confirm` (L403): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/orders/:id/cancel` (L438): guards hinted `rateLimit, preHandler, requireAuth`

## api/src/routes/tickets.ts (9 matched)
- **GET** `/tickets/categories` (L165): guards hinted `requireAuth`
- **GET** `/tickets` (L167): guards hinted `requireAuth`
- **POST** `/tickets` (L182): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/tickets/:id` (L258): guards hinted `requireAuth`
- **POST** `/tickets/:id/replies` (L333): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/tickets/:id/attachments` (L466): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/tickets/:id/attachments/:attachmentId` (L553): guards hinted `requireAuth`
- **POST** `/tickets/:id/close` (L575): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/tickets/:id/status` (L592): guards hinted `rateLimit, preHandler, requireStaff`

## api/src/routes/settings.ts (14 matched)
- **GET** `/settings` (L228): guards hinted `requireAuth`
- **PUT** `/settings/billing-address` (L290): guards hinted `rateLimit, preHandler, requireAuth`
- **PATCH** `/settings/profile` (L302): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/settings/email` (L331): guards hinted `rateLimit, requireAuth`
- **POST** `/settings/email/confirm` (L392): guards hinted `rateLimit, requireAuth`
- **POST** `/settings/password` (L449): guards hinted `rateLimit, requireAuth`
- **GET** `/settings/sessions` (L511): guards hinted `requireAuth`
- **DELETE** `/settings/sessions` (L532): guards hinted `rateLimit, preHandler, requireAuth`
- **DELETE** `/settings/sessions/:id` (L554): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/settings/notifications` (L579): guards hinted `requireAuth, rateLimit`
- **PUT** `/settings/notifications` (L589): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/settings/account/closure` (L620): guards hinted `rateLimit, requireAuth`
- **DELETE** `/settings/account/closure` (L681): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/settings/vat-check` (L706): guards hinted `rateLimit, requireAuth`

## api/src/routes/notifications.ts (8 matched)
- **GET** `/notifications` (L110): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/notifications/unread-count` (L170): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/notifications/stream` (L187): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/notifications/:id/read` (L233): guards hinted `rateLimit, preHandler, requireAuth`
- **POST** `/notifications/read-all` (L250): guards hinted `rateLimit, preHandler, requireAuth`
- **DELETE** `/notifications/:id` (L263): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/notifications/preferences` (L275): guards hinted `rateLimit, preHandler, requireAuth`
- **PUT** `/notifications/preferences` (L302): guards hinted `rateLimit, preHandler, requireAuth`

## api/src/routes/support-chat.ts (7 matched)
- **GET** `/support/availability` (L37): guards hinted `requireAuth`
- **GET** `/support/chat/current` (L44): guards hinted `requireAuth`
- **POST** `/support/chat` (L50): guards hinted `requireAuth`
- **POST** `/support/chat/:id/convert` (L103): guards hinted `requireAuth`
- **POST** `/support/chat/:id/rating` (L117): guards hinted `requireAuth`
- **POST** `/support/chat/:id/typing` (L129): guards hinted `requireAuth`
- **POST** `/admin/support/conversations/:id/typing` (L138): guards hinted `requirePermission`

## api/src/routes/support-bots.ts (16 matched)
- **GET** `/admin/support/bots` (L68): guards hinted `preHandler, requirePermission`
- **POST** `/admin/support/bots` (L85): guards hinted `requirePermission`
- **GET** `/admin/support/bots/:id` (L93): guards hinted `preHandler, requirePermission`
- **PUT** `/admin/support/bots/:id` (L106): guards hinted `requirePermission`
- **DELETE** `/admin/support/bots/:id` (L118): guards hinted `requirePermission`
- **PUT** `/admin/support/bots/:id/draft` (L133): guards hinted `requirePermission`
- **POST** `/admin/support/bots/:id/publish` (L146): guards hinted `requirePermission`
- **POST** `/admin/support/bots/:id/rollback` (L166): guards hinted `requirePermission`
- **GET** `/admin/support/bots/:id/export` (L177): guards hinted `preHandler, requirePermission`
- **POST** `/admin/support/bots/import` (L185): guards hinted `requirePermission`
- **POST** `/admin/support/bots/simulate` (L199): guards hinted `rateLimit, preHandler, requirePermission`
- **POST** `/support/bot/start` (L316): guards hinted `requireAuth`
- **GET** `/support/bot/current` (L336): guards hinted `requireAuth`
- **POST** `/support/bot/:id/rating` (L348): guards hinted `requireAuth`
- **POST** `/support/bot/:id/skip` (L361): guards hinted `requireAuth`
- **POST** `/support/bot/:id/input` (L370): guards hinted `requireAuth`

## api/src/routes/auth.ts (13 matched)
- **POST** `/auth/register` (L312): guards hinted `rateLimit, preHandler`
- **POST** `/auth/login` (L359): guards hinted `rateLimit, preHandler`
- **POST** `/auth/logout` (L407): guards hinted `rateLimit, preHandler`
- **GET** `/auth/session` (L418): guards hinted `inspect wrapper/handler`
- **POST** `/auth/verify-email` (L440): guards hinted `rateLimit, preHandler`
- **POST** `/auth/resend-verification` (L465): guards hinted `rateLimit, preHandler`
- **POST** `/auth/forgot-password` (L483): guards hinted `rateLimit, preHandler`
- **POST** `/auth/reset-password` (L508): guards hinted `rateLimit`
- **POST** `/auth/enroll-admin` (L544): guards hinted `rateLimit, preHandler`
- **POST** `/internal/prune-sessions` (L593): guards hinted `rateLimit, preHandler`
- **GET** `/internal/whoami` (L603): guards hinted `requireAuth`
- **GET** `/auth/require` (L608): guards hinted `requireAuth`
- **GET** `/internal/not-a-real-route` (L613): guards hinted `inspect wrapper/handler`

## api/src/routes/api-keys.ts (3 matched)
- **GET** `/settings/api-keys` (L23): guards hinted `requireAuth`
- **POST** `/settings/api-keys` (L41): guards hinted `requireAuth`
- **DELETE** `/settings/api-keys/:id` (L67): guards hinted `requireAuth`

## api/src/routes/instance-access.ts (7 matched)
- **GET** `/instances/:id/access` (L46): guards hinted `requireAuth`
- **POST** `/instances/:id/access` (L66): guards hinted `requireAuth`
- **DELETE** `/instances/:id/access/:shareId` (L82): guards hinted `requireAuth`
- **POST** `/instances/:id/access/leave` (L93): guards hinted `requireAuth`
- **POST** `/access/redeem` (L102): guards hinted `rateLimit, preHandler, requireAuth`
- **GET** `/instances/:id/uptime` (L126): guards hinted `requireAuth`
- **PATCH** `/instances/:id/uptime` (L137): guards hinted `requireAuth`

## api/src/routes/git-deploy.ts (9 matched)
- **GET** `/instances/:id/git` (L46): guards hinted `inspect wrapper/handler`
- **PUT** `/instances/:id/git` (L76): guards hinted `inspect wrapper/handler`
- **POST** `/instances/:id/git/webhook-secret` (L128): guards hinted `inspect wrapper/handler`
- **POST** `/instances/:id/git/deploy` (L138): guards hinted `inspect wrapper/handler`
- **POST** `/instances/:id/git/rollback` (L149): guards hinted `inspect wrapper/handler`
- **GET** `/instances/:id/git/deployments` (L163): guards hinted `inspect wrapper/handler`
- **GET** `/instances/:id/git/log` (L192): guards hinted `inspect wrapper/handler`
- **DELETE** `/instances/:id/git` (L202): guards hinted `inspect wrapper/handler`
- **POST** `/webhooks/github/:id` (L213): guards hinted `rateLimit`

## Required runtime audit checks
For every customer mutation route:
- Authenticate; verify exact resource ownership / share role and the resource's tenant, including object ID substitution.
- CSRF/cookie/origin for session calls; signature/nonce for webhook and token routes.
- Rate/size/throttle for file upload, console commands, auth, checkout, promotions, backup/restore, Git deploy.
- State transition and provider capability, limits and idempotency for replay or double click; correct 409/422/429 responses.
- Confirm clean failure/rollback semantics for cross-provider effects and Stripe; no "active" until reconciled.
- Safely record business audit with actor, subject, resource, outcome without secrets or file contents.
- Test staff impersonation: customer actions performed in impersonated session retain original actor identity if applicable.
- Validate upload path traversal, file extension checks, archive extraction safety, DB credential and share invite expiration.
- Verify 2FA/passkey recovery/session revocation and account closure use proper step-up and privacy.
- Test as owner, delegated manager, delegated viewer, unrelated logged-in customer, anonymous and suspended account.
**No API endpoints in this document were exercised.**
