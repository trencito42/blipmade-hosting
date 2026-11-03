# API functional/security route inventory 4/4
Snapshot 48df705f110b46f7d2a7d90ef33e0cd0a289f74c. Static literal app.method scans; inline permission hints are NOT proof of RBAC enforcement or vulnerability.

## api/src/routes/notifications.ts (8 matched)
- GET `/notifications` L110; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/notifications/unread-count` L170; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/notifications/stream` L187; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/notifications/:id/read` L233; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/notifications/read-all` L250; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- DELETE `/notifications/:id` L263; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/notifications/preferences` L275; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- PUT `/notifications/preferences` L302; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true

## api/src/routes/ops.ts (6 matched)
- GET `/ops/health` L64; inlinePermission=infrastructure.read,infrastructure.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/ops/alerts` L72; inlinePermission=infrastructure.read,infrastructure.read; preHandler=true; rateHint=false; handlerAuthText=false
- GET `/ops/channels` L82; inlinePermission=infrastructure.read,infrastructure.write; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/ops/checks/:id/ack` L93; inlinePermission=infrastructure.write; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/ops/incident` L129; inlinePermission=infrastructure.write; preHandler=true; rateHint=true; handlerAuthText=false
- DELETE `/ops/incident` L172; inlinePermission=infrastructure.write; preHandler=true; rateHint=true; handlerAuthText=false

## api/src/routes/orders.ts (6 matched)
- POST `/orders` L109; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=true
- GET `/orders` L262; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/orders/:id` L275; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=true
- POST `/orders/:id/checkout` L286; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/orders/:id/confirm` L403; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/orders/:id/cancel` L438; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true

## api/src/routes/settings.ts (14 matched)
- GET `/settings` L228; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- PUT `/settings/billing-address` L290; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- PATCH `/settings/profile` L302; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/settings/email` L331; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=true
- POST `/settings/email/confirm` L392; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=true
- POST `/settings/password` L449; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=true
- GET `/settings/sessions` L511; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- DELETE `/settings/sessions` L532; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- DELETE `/settings/sessions/:id` L554; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/settings/notifications` L579; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- PUT `/settings/notifications` L589; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/settings/account/closure` L620; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=true
- DELETE `/settings/account/closure` L681; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/settings/vat-check` L706; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=true

## api/src/routes/support-bots.ts (16 matched)
- GET `/admin/support/bots` L68; inlinePermission=tickets.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/support/bots` L85; inlinePermission=settings.write; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/admin/support/bots/:id` L93; inlinePermission=tickets.read; preHandler=true; rateHint=false; handlerAuthText=false
- PUT `/admin/support/bots/:id` L106; inlinePermission=settings.write; preHandler=false; rateHint=false; handlerAuthText=false
- DELETE `/admin/support/bots/:id` L118; inlinePermission=settings.write; preHandler=false; rateHint=false; handlerAuthText=false
- PUT `/admin/support/bots/:id/draft` L133; inlinePermission=settings.write; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/admin/support/bots/:id/publish` L146; inlinePermission=settings.write; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/admin/support/bots/:id/rollback` L166; inlinePermission=settings.write; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/admin/support/bots/:id/export` L177; inlinePermission=tickets.read; preHandler=true; rateHint=false; handlerAuthText=false
- POST `/admin/support/bots/import` L185; inlinePermission=settings.write; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/admin/support/bots/simulate` L199; inlinePermission=tickets.write,tickets.write; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/support/bot/start` L316; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/support/bot/current` L336; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/support/bot/:id/rating` L348; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/support/bot/:id/skip` L361; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/support/bot/:id/input` L370; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true

## api/src/routes/support-chat.ts (7 matched)
- GET `/support/availability` L37; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/support/chat/current` L44; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/support/chat` L50; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/support/chat/:id/convert` L103; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/support/chat/:id/rating` L117; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/support/chat/:id/typing` L129; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/admin/support/conversations/:id/typing` L138; inlinePermission=tickets.write; preHandler=false; rateHint=false; handlerAuthText=false

## api/src/routes/support-guest.ts (9 matched)
- GET `/support/guest/config` L63; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/support/guest/start` L68; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/support/guest/thread` L130; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/support/guest/messages` L152; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/support/guest/end` L172; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/support/guest/stream` L186; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/support/guest/claim` L196; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/admin/support/guest` L214; inlinePermission=tickets.read,settings.write,settings.write; preHandler=true; rateHint=false; handlerAuthText=false
- PUT `/admin/support/guest` L216; inlinePermission=settings.write,settings.write; preHandler=true; rateHint=false; handlerAuthText=false

## api/src/routes/support-stream.ts (4 matched)
- GET `/support/stream` L142; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/admin/support/stream` L150; inlinePermission=tickets.read; preHandler=false; rateHint=true; handlerAuthText=false
- PUT `/admin/support/presence` L157; inlinePermission=tickets.read; preHandler=false; rateHint=true; handlerAuthText=false
- GET `/admin/support/presence` L174; inlinePermission=tickets.read; preHandler=false; rateHint=false; handlerAuthText=false

## api/src/routes/tickets.ts (9 matched)
- GET `/tickets/categories` L165; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/tickets` L167; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/tickets` L182; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/tickets/:id` L258; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/tickets/:id/replies` L333; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/tickets/:id/attachments` L466; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/tickets/:id/attachments/:attachmentId` L553; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/tickets/:id/close` L575; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/tickets/:id/status` L592; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true

## api/src/routes/two-factor.ts (15 matched)
- POST `/auth/login/2fa` L100; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/auth/login/2fa/passkey/options` L112; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/auth/login/2fa/passkey/verify` L127; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/auth/passkey/options` L138; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/auth/passkey/verify` L146; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/settings/security` L180; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/settings/security/activity` L205; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/settings/2fa/setup` L244; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/settings/2fa/enable` L255; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/settings/2fa/disable` L273; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/settings/2fa/backup-codes` L285; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/settings/passkeys/options` L298; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/settings/passkeys` L317; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- PATCH `/settings/passkeys/:id` L354; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- DELETE `/settings/passkeys/:id` L363; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true

## api/src/routes/vps.ts (20 matched)
- GET `/vps/plans` L21; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/vps` L59; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/vps/:id` L69; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/vps/:id/power` L75; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/vps/:id/usage` L84; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- PATCH `/vps/:id` L90; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- PUT `/vps/:id/ssh-key` L99; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/vps/:id/reinstall` L108; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/vps/:id/snapshots` L120; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/vps/:id/snapshots` L125; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/vps/:id/snapshots/:name/restore` L133; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- DELETE `/vps/:id/snapshots/:name` L141; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/vps/:id/iso` L149; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- PUT `/vps/:id/iso` L154; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- DELETE `/vps/:id/iso` L162; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/vps/:id/console/stream` L170; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/vps/images` L175; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/vps/:id/graphs` L180; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/vps/:id/activity` L186; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/vps/:id/diagnose` L192; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true

## api/src/routes/webhooks.ts (4 matched)
- POST `/webhooks/stripe` L1282; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/webhooks/stripe/test` L1322; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/webhooks/stripe/failed` L1374; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/webhooks/stripe/replay` L1392; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false