# API functional/security route inventory 3/4
Snapshot 48df705f110b46f7d2a7d90ef33e0cd0a289f74c. Static literal app.method scans; inline permission hints are NOT proof of RBAC enforcement or vulnerability.

## api/src/routes/git-deploy.ts (9 matched)
- GET `/instances/:id/git` L46; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- PUT `/instances/:id/git` L76; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/instances/:id/git/webhook-secret` L128; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/instances/:id/git/deploy` L138; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/instances/:id/git/rollback` L149; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/instances/:id/git/deployments` L163; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/instances/:id/git/log` L192; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- DELETE `/instances/:id/git` L202; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/webhooks/github/:id` L213; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=false

## api/src/routes/health.ts (7 matched)
- GET `/config/public` L156; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/health` L159; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/health/live` L160; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/health/ready` L161; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/status` L337; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/status/incidents` L358; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/announcements` L361; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false

## api/src/routes/instance-access.ts (7 matched)
- GET `/instances/:id/access` L46; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/instances/:id/access` L66; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- DELETE `/instances/:id/access/:shareId` L82; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/instances/:id/access/leave` L93; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/access/redeem` L102; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/instances/:id/uptime` L126; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- PATCH `/instances/:id/uptime` L137; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true

## api/src/routes/instance-extras.ts (5 matched)
- GET `/instances/:id/sftp` L34; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/instances/:id/sftp/password` L47; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/instances/:id/resource-alerts` L61; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- PUT `/instances/:id/resource-alerts` L67; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/billing/closed-services` L78; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true

## api/src/routes/instance-help.ts (2 matched)
- GET `/instances/:id/diagnose` L37; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/instances/:id/support-bundle` L46; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false

## api/src/routes/instance-server.ts (49 matched)
- GET `/instances/:id/server` L116; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/instances/:id/resources` L144; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/instances/:id/activity` L166; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/instances/:id/files` L191; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/instances/:id/file` L216; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=false
- PUT `/instances/:id/file` L228; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- DELETE `/instances/:id/file` L248; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/instances/:id/files/folder` L275; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/instances/:id/files/rename` L292; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/instances/:id/files/move` L309; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/instances/:id/files/copy` L326; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/instances/:id/files/upload` L349; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/instances/:id/files/download` L400; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/instances/:id/files/compress` L438; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/instances/:id/files/archive` L442; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/instances/:id/files/decompress` L466; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/instances/:id/files/unarchive` L470; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- POST `/instances/:id/files/chmod` L476; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/instances/:id/databases` L494; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/instances/:id/databases` L518; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- PATCH `/instances/:id/databases/:databaseId` L559; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- DELETE `/instances/:id/databases/:databaseId` L578; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/instances/:id/databases/:databaseId/credentials` L608; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/instances/:id/credentials` L650; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/instances/:id/backups` L682; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- PUT `/instances/:id/backup-schedule` L713; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/instances/:id/backups` L732; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/instances/:id/backups/:backupId/download` L763; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/instances/:id/backups/:backupId/restore` L779; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- DELETE `/instances/:id/backups/:backupId` L805; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/instances/:id/allocations` L833; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/instances/:id/allocations` L861; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- PUT `/instances/:id/allocations` L892; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- PATCH `/instances/:id/allocations/:allocationId` L908; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- DELETE `/instances/:id/allocations/:allocationId` L933; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/instances/:id/startup` L969; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- PUT `/instances/:id/startup` L1042; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- PATCH `/instances/:id/startup` L1046; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/instances/:id/env-files` L1061; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- PUT `/instances/:id/env-files/:name` L1083; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/instances/:id/schedules` L1115; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/instances/:id/schedules` L1137; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- PATCH `/instances/:id/schedules/:scheduleId` L1168; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- DELETE `/instances/:id/schedules/:scheduleId` L1197; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/instances/:id/schedules/:scheduleId/run` L1224; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/instances/:id/settings` L1252; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- PATCH `/instances/:id/settings` L1276; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/instances/:id/suspend` L1321; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/instances/:id/settings/reinstall` L1368; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true

## api/src/routes/instances.ts (12 matched)
- GET `/instances` L145; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/instances/:id` L176; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/instances/:id/power` L200; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/instances/:id/metrics` L251; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/instances/:id/console` L283; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/instances/:id/console/stream` L310; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/instances/:id/command` L315; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/instances/:id/resources/quote` L345; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- PUT `/instances/:id/resources` L367; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/instances/:id/events` L422; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/instances/:id/rename` L449; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/instances/:id/cancel` L467; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true

## api/src/routes/internal-backups.ts (4 matched)
- POST `/internal/backups/report` L39; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/internal/backups/restore-verified` L61; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/internal/backups/destination` L71; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/internal/backups/protected` L81; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false

## api/src/routes/internal-support-email.ts (1 matched)
- POST `/internal/support/inbound` L101; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false

## api/src/routes/mail-commerce.ts (11 matched)
- GET `/mail/plans` L159; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=false
- GET `/mail/services` L172; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/mail/services/:id` L181; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/mail/services/:id/domains` L197; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/mail/domains/:id/verify` L215; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/mail/services/:id/suspend` L230; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/mail/services/:id/resume` L247; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/mail/services/:id/cancel` L269; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/mail/services/:id/reactivate` L281; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/mail/services/:id/plan` L299; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/mail/services/:id/dns` L426; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true

## api/src/routes/mail.ts (12 matched)
- GET `/mail/webmail` L27; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/mail/domains` L32; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- GET `/mail/domains/:id` L37; inlinePermission=none; preHandler=false; rateHint=true; handlerAuthText=true
- POST `/mail/domains` L50; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- DELETE `/mail/domains/:id` L60; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/mail/domains/:id/mailboxes` L70; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true
- POST `/mail/domains/:id/mailboxes` L83; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- DELETE `/mail/domains/:id/mailboxes/:mailboxId` L96; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/mail/domains/:id/aliases` L108; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- POST `/mail/domains/:id/aliases` L114; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- DELETE `/mail/domains/:id/aliases/:aliasId` L127; inlinePermission=none; preHandler=true; rateHint=true; handlerAuthText=true
- GET `/mail/domains/:id/dns` L146; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=true

## api/src/routes/minecraft.ts (9 matched)
- GET `/instances/:id/minecraft` L47; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/instances/:id/minecraft/player` L72; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/instances/:id/minecraft/command` L85; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- PUT `/instances/:id/minecraft/properties` L98; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/instances/:id/minecraft/versions` L109; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- PUT `/instances/:id/minecraft/version` L116; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/instances/:id/minecraft/plugins` L139; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- GET `/instances/:id/minecraft/plugins/search` L149; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false
- POST `/instances/:id/minecraft/plugins` L156; inlinePermission=none; preHandler=false; rateHint=false; handlerAuthText=false