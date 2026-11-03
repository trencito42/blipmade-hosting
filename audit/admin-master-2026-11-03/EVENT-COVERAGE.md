# Blipmade Activity & Audit Explorer — evidence coverage, gaps and test matrix

Snapshot: main a5adf356e194ef01b46836915f0aad976e6184e1. Read-only source inspection, not a live audit event replay.

## 1. Distinguish the data already present

**Security/administrative AuditLog** (\`api/prisma/schema.prisma\`): actorId/email, action, targetType/id, JSON meta, IP, createdAt. Indexed by time/actor/target. The admin Audit view uses \`useInfiniteList\` with actor/action/targetType filters.

**Session**: userId, session token hash, expiry, IP, user agent, lastSeenAt, optional impersonatedById/email. Last seen is rate-limited to approximately five minutes and is NOT continuous activity or a guaranteed 'online now' signal.

**DeviceSignal**: privacy-oriented hashed device linkage for anti-abuse. Do not expose raw fingerprinting or use as universal tracking.

**InstanceEvent**: per-instance type/message/time, separate from AuditLog and Pterodactyl activity. Useful for resource timelines.

**TicketEvent**: per-conversation status/assignment/activity and actor. Messages and attachments are separate objects and require visibility enforcement.

**NotificationEvent**: business key, typed event, user, state, channels, attempts and occurrence time. **MailDelivery**: separate delivery status, transport, retries. Written-to-file is not equivalent to sent/delivered.

**Orders/Payments/Invoices/Subscriptions**, webhooks and the provider control panels reflect commercial and operational outcomes, but those records alone do not constitute a complete, immutable user activity history.

## 2. Evidence from source: direct calls are not full coverage

The following counts come from textual occurrences of \`await audit(\` in these files, not a runtime coverage measurement and not proof that all endpoints are/aren't audited. A route may call a service that writes an event elsewhere.

| Source | Registered HTTP route definitions (approx) | Direct \`await audit(\` occurrences (approx) | Notable direct events and questions |
|---|---:|---:|---|
| api/src/routes/auth.ts | 13 | 7 | register, failed login, logout, email verify, reset; successful login goes through \`recordSignIn\` in account-security |
| api/src/routes/orders.ts | 6 | 7 | order create/checkout/cancel and promotion; verify provider post-payment events separately |
| api/src/routes/tickets.ts | 9 | 5 | create/reply/attachment/status/close; bot/handoff also in support services |
| api/src/routes/vps.ts | 20 | 9 | power, rename, SSH key update, reinstall, snapshots, ISO; provider result should be distinguished from request accepted |
| api/src/routes/instance-server.ts | 48 | 17 | file deletion, database, backups, allocations, startup, credentials access, reinstall; examine file write/move/rename/chmod visibility |
| api/src/routes/mail.ts | 12 | 0 | NO direct audit() call in this route file. Check delegated mail services/hooks before declaring events missing |
| api/src/routes/admin.ts | 40 | 23 | customer suspend, orders refund, products, pricing, promotions, infra sync, staff, settings |
| api/src/routes/admin-act.ts | 29 | 19 | impersonation, VPS actions, subscription changes, account tools, app power/reinstall |
| api/src/routes/admin-control.ts | 5 | 1 | order retry fulfilment; other endpoints read/context |

Use automated AST/call-graph analysis + functional event tests to determine *actual* coverage; do not divide the counts and call the result a security percentage.

## 3. Confirmed gaps / required strengthening

1. \`api/src/lib/audit.ts\` catches DB write errors and continues. This makes gaps possible. Detect and alert, and use reliable atomic recording for critical classes.
2. AuditLog schema has no universal customerId (subject), result/outcome, correlationId/requestId, sourceSystem, actorType/impersonator, event version or retention/sensitivity class. These are proposed additions, not current columns.
3. The global audit filter API in \`api/src/routes/admin.ts\` accepts actor, action, targetType, but no direct customerId/targetId/time/outcome filter in its current query schema.
4. Order Detail API combines targetType=order and targetType=user into a single 100-event recent list. Separate these by query scope; don't delete history.
5. Global search maps a VPS result to general \`/admin/vps\`, while it maps invoices/payment to an order or customer rather than individual financial detail.
6. Customer Detail shows up to 50 related orders/invoices/tickets/payments and does not include all VPS/mail in the main customer payload. A 360 view requires bounded per-tab endpoints and exact resource relationships.
7. Critical admin read access and mass exports need audit, not only writes (PII exports, private customer data, credentials reveal, sensitive security logs).
8. Staff impersonation is tracked in existing code; preserve the actor-on-behalf-of distinction in every event produced during impersonation.
9. Event logs must differentiate requested, accepted, completed and failed for asynchronous provider actions; never log "VM started" just because a queue accepted the request.
10. User product analytics and security event logs have different legal purposes. Avoid an indiscriminate "record everything the user clicks" implementation.

## 4. Event taxonomy proposal and exact integrity requirement

| Event family | Critical event examples | Linkage | Integrity class |
|---|---|---|---|
| auth | registration, login, failed login, MFA, recovery, new session, revoke | customer/session | security; durable |
| account | name/email change, delete request, suspend, impersonation | actor + customer | high; atomic/outbox |
| billing | order, paid, partial refund, full refund, invoice, renewal, failure | customer/order/payment/subscription | high; transactional consistency |
| app | deploy, startup update, backup, file change, DB action, power | customer/instance/job | operational; diff scrubbing |
| vps | plan/resources, power, key rotation, ISO, snapshots, reinstall, destroy | customer/vps/node/job | high for destructive |
| mail | domain ownership, mailbox/alias, DNS check, mail plan changes | customer/mail service/domain | business + sensitive |
| support | ticket reply, note, handoff, bot run, assignment, close | ticket/customer/agent | privacy tier |
| admin | RBAC, settings, exports, attempts at denied actions, tool runs | actor/subject/resource | high; protected |
| ops | node sync, webhook replay, backup restore, incident | worker/node/affected resource | reliability |

**Invariant:** high-integrity classes must have a committed event or recoverable idempotent outbox record tied to the business transaction. For cross-system asynchronous actions, record intent first and completion/failure later, correlate them, reconcile provider state. Alert if trace chain lacks expected completion beyond bounded time.

## 5. Activity UI requirements

\`/admin/activity\` (new): customer or staff operator view, server-filtered/paginated; date range, actor, action, status, resource, customer, provider, requestId, correlationId.

Customer 360 > Activity: same engine with exact customerId scope; all app/VPS/mail/ticket/money categories.

Resource detail > Events: resource-scoped view, including provider actions, results and correlated jobs.

Billing detail > Event chain: provider receipt/webhook, order state, invoice, subscription and delivered service.

Sensitive values: redact passwords, MFA recovery codes, access tokens, session cookies, private keys, full payment details, connection strings, email bodies and private file contents. IP/session details only to separately authorized staff where proportional; access to sensitive logs may itself be logged.

## 6. Verification requirements before asserting full coverage

- Create a machine-readable matrix from **all mutation endpoints** with \`owner\`, \`actor\`, \`user/customer subject\`, \`resource\`, \`result\`, \`audit writer\`, \`correlation\` and \`test\`.
- Build staged integration tests that perform representative permitted and forbidden actions and assert exact event payloads.
- Simulate audit database unavailable, worker failure, provider timeout, webhook replay and duplicate request.
- Confirm event fields are bounded/allowlisted and never include secrets or unredacted PII.
- Validate retention and lawful deletion/export treatment with legal counsel where necessary; no indefinite collection by default.
- Make failures in audit pipeline visible in Ops, not silent.
- Test timeline queries on >100k events with indexes and cursor.
- Separate security audit from generic analytics and opt-in/consent policy.
- Show data completeness indicator/source coverage limitations rather than promise "all user actions captured."

## 7. Related code links
- \`api/src/lib/audit.ts\`
- \`api/prisma/schema.prisma\`
- \`api/src/routes/admin.ts\`
- \`api/src/routes/admin-control.ts\`
- \`api/src/routes/auth.ts\`
- \`api/src/services/account-security.ts\`
- \`api/src/routes/admin-act.ts\`
- \`api/src/routes/instance-server.ts\`
- \`api/src/routes/vps.ts\`
- \`api/src/routes/mail.ts\`
- \`api/src/routes/tickets.ts\`
- \`web/src/admin/Audit.tsx\`
- \`web/src/app/SecurityPanels.tsx\`
- \`web/src/app/instance/ActivityTab.tsx\`
