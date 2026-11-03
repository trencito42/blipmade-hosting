# Blipmade App 3.0 — Functional, Data and Security Audit

**Date & source:** 2026-11-03, main 3770515b4a5122fb83f27728ad1f6507e61d1bb2.
**Evidence level:** static code inspection of 21 customer routes, 9 nav destinations, main React pages and nested instance/mail components, plus API registration scan of 18 customer-facing route modules (219 literal registrations / 133 non-GET, not a runtime endpoint count or proof all are reachable). No authenticated production or staging tests, provider sandbox, WebAuthn browser, packet tests, DNS tests or build executed. Do not certify no vulnerabilities.

## Main current design/functional findings

| ID | Priority | Current source evidence | What remains to fix or verify |
|---|---|---|---|
| APP-01 | P1 UX | Deploy.tsx ~1373 LOC; product configuration, billing quote, checkout and provision event state in same component | Dedicated stepper / clear staged routes or URL step, draft, validation and async provider truth, preserve existing checkout |
| APP-02 | P1 UX | Billing.tsx ~855 LOC; invoices, closed services, payment method, subscriptions and outstanding orders shown on one page | Route/tab segmentation and deep-link subscriptions/payment method, accurate currency and tax amounts; don't hide cancellation |
| APP-03 | P1 UX | Settings.tsx ~1088 LOC and SecurityPanels.tsx ~419 LOC; profile, password, notifications, sessions, 2FA, passkeys, keys, export/closure | Dedicated settings and security screens with clear back/forward, step-up, full-page editors; preserve strong existing security |
| APP-04 | P1 UX | Domains.tsx ~509 LOC, inline Add Domain and large DNS record panels | Separate /app/domains/new and /app/domains/:id detail+edit; typed DNS inspector and no repeated domain panels |
| APP-05 | P1 UX | Tickets.tsx ~510 LOC includes create-ticket modal with subject/service/body/priority | Dedicated /app/tickets/new (full-page) with ticket draft and attachment validation, all customer service types |
| APP-06 | P1 UX | MailOverview.tsx / MailDomainPage.tsx already separated; create mailboxes/aliases and plan change in dialog components | Preserve modern dedicated domain URL; move complex create/plan flows into focused full pages, no reversion to old huge Mail.tsx |
| APP-07 | P1 UX | Vps.tsx ~1118 LOC contains VpsList, VpsCheckout and VpsDetail; many inline tabs/actions | Maintain existing full-page checkout and detail, refactor to focused server workspace + pages for reinstall, SSH key, ISO, snapshots |
| APP-08 | P1 scalability | Instances.tsx has fetch+client search/status/sort and mobile card rendering; Notifications.tsx already has cursor paging | Keep responsive assets but require server filtering/cursor for large inventories, avoid pretending client subset is full fleet |
| APP-09 | P1 UX/performance | InstanceDetail.tsx ~851 LOC lazy-loads many dedicated tabs; FilesTab ~867 LOC | Preserve capable file/console workspaces and tab deep links; extract safe resource edit forms, cursor/virtualized long files, keyboard shortcuts |
| APP-10 | P1 navigation | /app/servers and /app/servers/:id redirect to /app/vps routes | Preserve exact ID and query context; test links from email/invoices and browser history |
| APP-11 | P1 data truth | Overview.tsx recent activity is largely recent app instance events, while it also displays VPS/mail counts | Don't present this as complete account activity; normalized customer-visible feed from audited sources with clear limits |
| APP-12 | P0 finance | Deploy/VPS/Mail plans and Billing depend on price quote, Stripe/order and subscriptions APIs | Verify real amount, currency, taxes, promotions, payment retry, unpaid vs paid, partial refund and plan effect; no hardcoded frontend pricing |
| APP-13 | P0 access | Shared instance access roles viewer/manager in InstanceAccess; separate customer principal, suspended/cancelled | Every power/files/database/console/backup/network action must enforce access per method, not only authenticated userId |
| APP-14 | P0 secrets | SFTP credentials, DB credentials, env files, Git webhook secret, API keys, passkeys and one-time mail passwords | Require reveal bounds, redaction, audit access, never store returned secrets in URL/analytics or persistent browser storage |
| APP-15 | P1 async truth | VPS power/snapshot/reinstall, Git deploy, backups, order provisioning, domain DNS verification may be async | UI shows requested/queued/running/succeeded/failed, source freshness and reconcile; no false success toast on queued acceptance |
| APP-16 | P1 trust | Customer support conversations, ticket attachments and bot outputs have separate APIs; GuestChatWidget and SSE | Cross-user IDOR, private internal note/attachment restrictions, guest claim proof, stream session and event leakage require runtime tests |
| APP-17 | P1 security/privacy | Account closure and data export flows in Settings; notification preferences and retention logic | Step-up, retention & lawful handling, correct pending/complete state, data export redaction and rate limits |
| APP-18 | P1 UI coherence | Many repeated hand-rolled controls in Deploy, Vps and InstanceDetail, despite existing ui-app.tsx design primitives | Implement a unified customer-safe Stepper, ButtonGroup, MoneySummary, SliderStepper, ComboBox, DateRange, StatusTimeline, editors |

## API and data relationships

API ownership has to follow **authenticated user ID and explicit delegated share IDs**, not emails, untrusted plan slugs or user-supplied resource owner IDs. Each backend service should verify ownership or legitimate shared role independently.

### Existing logical path
User -> Orders -> OrderItems -> Subscription -> Instance / VPS / MailService -> MailDomain / Mailbox / Alias. User additionally owns custom website domain records, tickets, payment/invoices, notification preferences and security sessions. These relations need authorized links in /app and a richer admin Customer 360, but neither surface should retrieve unrestricted admin data.

### /app pages and their primary API families
- Overview: /instances, /billing/summary, /vps, /mail/services, instance events.
- Deploy: /catalog/products, /catalog/quote, /domains/platform-subdomain, /orders and /orders/:id/checkout, product-specific plan/config.
- Instances: /instances and /instances/:id, /instances/:id/* (console, files, databases, backups, allocations, schedules, startup, Git, SFTP, Minecraft and access).
- Domains: /domains, /instances/:id/domains, /domains/:id/verify, /domains/:id/address, /domains/:id (DELETE).
- VPS: /vps/plans, /vps/:id, power, graphs, usage, console/stream, snapshots, ISO, reinstall, SSH key and related subscription APIs.
- Mail: /mail/services, /mail/plans, /mail/domains/:id, mailbox, alias, DNS, plan and lifecycle.
- Billing: /billing/summary, /billing/invoices, /billing/subscriptions, /billing/payment-method, /orders and their checkout.
- Tickets/Chat: /tickets, replies/attachments/status/close and /support/chat, bot and stream APIs.
- Settings: /settings, profile/email/password/sessions, 2FA, passkeys, API keys, preferences, export/closure.
- Notifications: /notifications with cursor/unread/count/mark-read/delete and /notifications/preferences.

See [API-ROUTES.md](./API-ROUTES.md) for the 219 literal route registrations extracted from 18 modules.

## Security boundaries and mandatory negative tests

### 1. Authorization / IDOR
Six persona fixtures: anonymous, suspended customer, standard customer, instance-shared viewer, instance-shared manager, unrelated customer. Every endpoint accessible through /app:
- 401/403 for missing session or unauthorized resource.
- Changing ID (instance, VPS, mailbox, domain, order, invoice, payment, ticket, attachment, API key) must not grant unauthorized access.
- Viewer cannot perform manager write; manager cannot read outside granted instance.
- Signed URLs/downloads have short expiry, scoped IDs, no path traversal.
- Side channels: error messages/counts/timing should not disclose private customer existence where feasible.

### 2. Cookies, CSRF, realtime
Review actual deployed cookie Secure, HttpOnly, SameSite, Origin/CORS, CSRF token, public web socket/SSE session binding and reconnect behavior. Source shows global CSRF mechanism and route-level auth, but frontend must be exercised under real edge config. Check cross-origin WebSocket, guest-chat claim and notification stream.

### 3. Checkout/commerce
Use Stripe sandbox and fixtures for free/discounted orders, pending unpaid, double checkout, zero-value order, multiple concurrent requests, partially refunded, cancelled, renewal, plan changes, failed webhook and delayed provider.
- UI never marks order as paid without authenticated source from backend.
- Price/total/currency/tax is server authoritative, validated again at checkout.
- Never expose secret/provider webhook token to browser.
- Idempotency and retry preserve one payable order state and correct fulfilment.
- Invoice legal details reflect captured billing address and tax rules.
- Existing payment method update flow must be linked and resumable.

### 4. Storage/console and destructive service actions
- Path traversal and archive extraction across instance boundaries; file upload MIME/name/quotas.
- Concurrent file editing and stale write checks, rollback and backup before destructive restore.
- Console commands, SFTP and DB credentials must be role-controlled, input bounded and secrets never included in audit.
- Server power/reinstall and snapshot restore backed by provider result, safe precondition, warning and reason where appropriate.
- Domain delete warns of routing/DNS/HTTPS and mail separation, without destroying unrelated mail domain by matching name.

### 5. Auth and account
2FA recovery, passkey registration/removal, password change (session rotation), email change verification, new API key scope, session revoke, account closure, data export. Include failed attempts and rate-limit tests, not only success paths.

### 6. Support and notifications
Ticket message ownership, attachment access, internal notes privacy, guest chat claim authorization, SSE event filtering, bot handoff and notification link destination validation; no external arbitrary redirect in action links.

### 7. Privacy and event activity
Customer-facing Activity must expose **only their own** business/security events. Admin AuditLog contains staff-private notes, reporter details, secret access, IP/session metadata; no wholesale reuse. Normalize safe event projection with white-listed public message and retention. No keylogger/clickstream.

## Source audit vs runtime certification

**Source review completed:** the 21 registered customer routes, primary frontend modules and 18 relevant API modules were inspected. Risks are prioritized engineering requirements and test hypotheses; no exploitability was proven here.

**Not performed:** production/staging login, API request playback, provider sandbox checkout, security negative testing, screenshot responsive execution, keyboard/a11y tests, load/performance profiling, database restore. Work mode with authorized staging fixtures is required to honestly claim fully verified behavior.

Do not claim "all buttons work", "no IDOR", "PCI/GDPR compliant" or "secure for launch" from this static review alone.
