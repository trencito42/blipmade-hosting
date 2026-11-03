# Blipmade App 3.0 — Full Implementation Roadmap and QA Acceptance Gates

**Snapshot:** main 3770515b4a5122fb83f27728ad1f6507e61d1bb2 (2026-11-03). Scope /app: 21 registered routes, including 2 legacy VPS redirects, plus associated customer purchase/auth and realtime flows. Draft plan only; no app code migrated or tested.

## Gate 0. Baseline, preservation and real screenshot audit

- [ ] Read all App Master docs and Admin 3.0 premium component spec.
- [ ] Reconcile the single working branch \`audit/admin-master-spec-20261103\` with latest main, preserving any recent /app Mail refactor and Deploy checkout updates.
- [ ] Create machine-readable checklist for all 21 original routes, active tabs/subroutes, API endpoints, every form/button, permissions, subscriptions/retention and deep links. Match original action -> final route -> backend -> audit -> test.
- [ ] Capture all 21 routes on staging at 320, 390, 768, 1024, 1440, 1920px with real seeded state. For detail URLs provide fixtures owned by a test customer and by delegated viewer/manager. Two legacy redirects tested, not screenshotted as active pages.
- [ ] Baseline build, type check, existing unit/E2E tests, provider and billing test configuration; note any preexisting failure rather than saying all pass.
- [ ] Capture empty/one/many/error/loading states, duplicate/long names, mobile keyboard overlay, fake slow network and provider outage. Redact screenshot private info; never commit real customer data or session cookies.
- [ ] Prepare safe preview/staging backend, Stripe test mode, fake provider or disposable VMs/instances, Mailcow mock service and backup/restore fixture.

## Gate 1. Shared component foundations

- [ ] Extend existing Blipmade buttons, forms, icons and responsive shells with typed premium components in PRODUCT-DESIGN. Share generic primitives with Admin 3.0 after permission-safe separation.
- [ ] NumberStepper/UnitStepper, ResourceSliderStepper, ButtonGroup/SplitButton, AsyncCombobox, PlanCompareCards, QuoteSummary, StatusTimeline, DNS inspector, DateTime/Cron builder, OneTimeSecret, Search, FilterBar, DataGrid, ContextMenu, FormPage, save-dirty guard.
- [ ] Component gallery and screenshots for empty/loading/disabled/invalid/focus/mobile/zoom/reduced-motion; keyboard and ARIA checks.
- [ ] Data contracts for provider capability/limits, plans, current operation status, accurate billing totals, relation keys. UI never invents constraints.
- [ ] Typed \`create/edit/review\` page shells with Save/Discard and version conflict handling.

## Gate 2. Customer entry, Overview and Deploy

- [ ] Unify customer Overview: app/VPS/mail/domain health, critical attention, billing due, next action, recent account events; avoid clutter.
- [ ] Deploy catalog premium browsing/filter/search/card comparison with actual readiness and linked product pages.
- [ ] Full-page product wizard with configure/review/checkout/provisioning, optional steps based on product capabilities, EULA validation, promo, invoice data and real server quote.
- [ ] VPS storefront/checkout and Email storefront/checkout reuse plan selectors, billing period, quote summary and async provisioning states without erasing differences.
- [ ] Stripe test payments: free/discounted, pending, paid, failure, cancellation, provider delay and retry. Browser Back/Forward and reload must preserve correct order state.
- [ ] Connect post-checkout to exact fulfilled resource and invoice.

## Gate 3. Apps, databases, file and runtime workspaces

- [ ] Instances list with complete server search/filter/pagination once needed; preserve current responsive cards.
- [ ] Keep all existing instance tabs and resource deep links, Console/SFTP, Files/CodeEditor, Databases, Backups, Network, Startup, Schedules, Git, Activity, Access, Uptime, Minecraft.
- [ ] Move serious edit flows to full-page routes from EDITOR-ROUTES. Console, Files explorer/editor and reply composer are workspaces and remain appropriate inline.
- [ ] Preserve file upload/move/copy/chmod/download operations and context menus, safe path, concurrent edit/backup restore and unsaved buffers.
- [ ] Server power/reinstall, resource upgrade, quota, backup/restore with provider validated constraints and correct lifecycle status.
- [ ] Delegated instance access viewer/manager boundaries, invite expiration, revoke, no privilege escalation.

## Gate 4. VPS, Domains and Email

- [ ] VPS inventory and detail segmented by Overview, Console, Metrics, Network, Snapshots, Backups if supported, Contract, Activity, Settings; preserve existing provider controls.
- [ ] Dedicated full-page SSH key change, reinstall, snapshot creation/restore, ISO, plan/resource changes when backend supports.
- [ ] Domains inventory and detail, add domain wizard, DNS inspector, verification and TLS status, correct distinction app host vs email domain.
- [ ] Preserve /app/mail and /app/mail/domains/:id latest split; do not reintroduce old giant inline Mail page.
- [ ] Dedicated mail plan change, add domain, mailbox create, alias create, DNS and settings pages with accurate plan quota, one-time password and Mailcow provider status.
- [ ] Preserve paid/queued/active/suspended/cancelled service lifecycle. No false DNS verified state.

## Gate 5. Billing, support, account & notifications

- [ ] Billing overview small and useful; subscriptions/orders/invoices/payment methods/credit/history split into URL-addressable tabs or pages.
- [ ] Full-page subscription renew/change/cancel/re-activate with exact financial impact/retention, not one-click modals.
- [ ] Customer ticket queue modern server paginated list, service categories Apps/VPS/Mail, dedicated /app/tickets/new composer.
- [ ] Ticket Detail as actual conversation workspace, attachments, status, agent response and SLA only where real. Private notes stay staff-only.
- [ ] Chat widget stays accessible on mobile without blocking service form/keyboard; bot handoff, guest claim, realtime reconnection and unread state.
- [ ] Settings category index, dedicated pages profile/billing address/security/2FA/passkeys/sessions/API keys/privacy/closure/notification preferences, secure step-up.
- [ ] Notifications inbox filters, unread count, cursor, deep links and respectful batching.

## Gate 6. Business activity and cross-entity navigation

- [ ] Customer-safe Activity timeline for their own login/security, order, provision, VPS, domain/mail, support and notification events.
- [ ] Customer views link resource -> plan/subscription -> order/invoice/payment and support, without sharing admin-only audit events.
- [ ] Every status/action difference has source-of-truth and last refresh timestamp; provider pending vs completed accurately described.
- [ ] Sensitive staff-only notes, reporter personal data, credential reveals, provider errors and internal audit metadata never appear in customer API responses.

## Gate 7. Full acceptance, no data/function loss

### Required route parity
| # | Original route | Test category |
|---:|---|---|
| 1 | /app | overview empty/mixed/alert states |
| 2 | /app/instances | listing, filter, paging, route |
| 3 | /app/instances/:id | instance detail, access |
| 4 | /app/instances/:id/:tab | all previously supported tabs, refresh |
| 5 | /app/deploy | catalog search, filter, product |
| 6 | /app/deploy/:slug | configuration, quote, EULA, checkout, provision |
| 7 | /app/domains | list, create, verify, delete |
| 8 | /app/mail | service/domain overview |
| 9 | /app/mail/domains/:id | DNS/mailbox/alias/status |
| 10 | /app/servers | old list redirect /app/vps |
| 11 | /app/servers/:id | old detail redirect /app/vps/:id |
| 12 | /app/vps | list, search, power link |
| 13 | /app/vps/new | checkout, SSH public key, price |
| 14 | /app/vps/:id | console, snapshot, ISO, activity, controls |
| 15 | /app/email/checkout | email plans/checkout |
| 16 | /app/billing/invoices/:id | print, VAT, PDF/export if available |
| 17 | /app/billing | subscriptions, unpaid orders, invoices, payment method |
| 18 | /app/tickets | customer ticket list and new ticket |
| 19 | /app/tickets/:id | messages, files, status and safe replies |
| 20 | /app/settings | profile, sessions, security, preferences, closure |
| 21 | /app/notifications | category/unread/cursor/read/delete |

### User journeys requiring actual E2E
1. New user registration and verification (auth outside /app router) -> first-time /app onboarding -> choose product -> checkout -> provision -> first console/DB action -> support. Validate session and status transitions.
2. Existing app customer updates resources, attaches a domain, sets startup variables, creates backup, restores on disposable instance, checks activity.
3. VPS customer buys a plan, adds a supported SSH key, powers VM, monitors real job result, creates and restores snapshot on sandbox, views contract and cancellation terms.
4. Mail customer buys plan, creates/links domain, checks ownership, creates mailbox/alias, opens webmail, changes plan and checks billing.
5. Customer manages payment method, views exact invoice/amount/term, cancels and reactivates subscription with correct effective time and data retention.
6. Customer raises ticket linked to Apps/VPS/Mail, uploads attachment, receives safe reply and bot support, with no staff-only notes.
7. Customer secures account with 2FA/passkey, views sessions, creates/revokes API key, downloads own data and requests closure with correct warnings.
8. Cross-user authorization: unrelated customer cannot access resource/order/invoice/ticket even by direct ID, delegated viewer/manager capabilities are correct.
9. Mobile 320/390/430, tablet 768, 1024 and desktop 1440/1920, 200% zoom, keyboard, reduced motion, browser Back/Forward, direct load and browser history. Test file manager and console specifically on touch.
10. Test under network 403/404/409/422/429/5xx, stale requests, slow API and provider partial failure. Verify no secrets in frontend logs, analytics or unprotected screenshots.

### Quantitative usability/performance
- A list opens with its search, controls and first rows visible above fold at 1440×900; no giant empty cards.
- Fewer than 3 navigational decisions for common tasks, not a rigid "max 3 clicks" if safety review requires more.
- Functional keyboard input and safe touch targets, no unreachable action at 320px, no page-wide horizontal scroll.
- Large lists use pagination/virtualization, not thousands of nodes or client-side sort of first page.
- Each edit route has independent direct URL, refresh and Save/Discard behavior. Deep-linkable tab state.
- Preexisting domain settings, server files, webhook secrets, customer invoices, tickets and data preserved.
- Tests must actually execute. Record exact command/results, browser screenshots with safe fixtures, warnings and unresolved blockers.

## Exit conditions
Not complete until 21/21 original routes are reachable, full action parity is verified, new dedicated routes are tested, financial/provider outcomes reconcile, all customer-private data remains scoped, and responsive/keyboard checks pass. Do NOT merge main or deploy without owner approval.

This document is an implementation and verification contract, NOT proof all tests have passed.
