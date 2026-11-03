# Blipmade Customer App 3.0 — Complete Current-State & Target View Matrix
**Source:** `trencito42/blipmade-hosting`, main `3770515b4a5122fb83f27728ad1f6507e61d1bb2`, inspected 2026-11-03.
**Method:** read-only GitHub inspection of `web/src/routes.tsx`, customer navigation, 18 customer-facing React pages and nested `instance/*` and `mail/*` components; relevant API routes. Not authenticated browser QA or claim of production state.

**Inventory:** 21 registered /app routes, including 2 legacy redirects. 9 primary nav entries: Overview, Deploy, Apps & databases, Domains, Email, Servers, Billing, Support, Settings. Notifications has its own route but is not a primary nav link.

**Interpretation:** "Current" states what the inspected source already does; "Issue" is source-supported design/feature gap requiring browser verification; "Target" is proposed implementation, not working code.

**Product rule:** separate URL-based creation and editing for persistent, nontrivial workflows. Only use dialogs for short confirmation, transient picker, one-time secret disclosure, or truly minor contextual interactions. Inline console, file explorer and ticket reply are their main workspace and naturally stay inline.


## `/app` — Overview
**Current source:** `web/src/app/Overview.tsx`

**Already present:** 4 Panels: Welcome, Needs attention, Your services, Recent activity. Fetches instances, billing summary, VPS and mail services; recent activity primarily instance-centric.

**Problem or improvement:** Repeated product summaries and an activity feed focused on apps rather than VPS/mail. Must distinguish data load failures from zero services.

**Target UX:** Customer dashboard: prioritized alerts and services across all product families, compact spend/next invoice, quick action; alerts link to actual fix.

**Data / components:** Service cards compact (not repeated huge tiles), recent activity summary, status freshness and source.

**Related destinations / new routes:** New /app/activity if provider-backed; /app/billing; /app/instances/:id, /app/vps/:id, /app/mail/domains/:id.

## `/app/instances` — Apps & databases
**Current source:** `web/src/app/Instances.tsx`

**Already present:** 400-line searchable/filtered/sorted inventory, DataTable and mobile CardList, vouchers and app statuses.

**Problem or improvement:** Already uses responsive list; filters rely on fetched dataset; need server-side pagination once fleet grows; voucher form in list.

**Target UX:** Data grid with search, type/status/node, health, renewal, saved filters and real server pagination. Promo/redemption moved to billing or dedicated redeem page.

**Data / components:** Service name, icon, type, status, node, RAM/CPU/disk, plan, renewal, health. Compact mobile list.

**Related destinations / new routes:** /app/instances/:id; /app/instances/:id/:tab; /app/instances/redeem.

## `/app/instances/:id` — App instance workspace
**Current source:** `web/src/app/InstanceDetail.tsx`

**Already present:** 850-line shell, resource change, rename/settings, power, ~14 lazy tab modules. Resource stepper already exists locally; supports nested tab route.

**Problem or improvement:** Good foundation; resource change and rename/reinstall forms sometimes embedded in long tabs, repeated per-tab panels; stepper not shared design system.

**Target UX:** Sticky resource header, live health/usage and clear power group. Tabs Console, Overview, Files, Databases, Backups, Network, Startup, Schedules, Git, Access, Activity, Settings, Uptime, Minecraft where applicable. Full-page changes.

**Data / components:** Built-in console/files are workspaces, not forms; editor route only for persistent config and dangerous changes. Preserve session and state.

**Related destinations / new routes:** /app/instances/:id/resources/edit; /app/instances/:id/settings/edit; /app/instances/:id/reinstall; /app/instances/:id/startup/edit.

## `/app/instances/:id/:tab` — Deep-link instance section
**Current source:** `web/src/app/InstanceDetail.tsx + instance/*`

**Already present:** Existing route accepts active section; nested tabs lazy-loaded.

**Problem or improvement:** Some tab controls use in-page create/rename forms; need permissions, history, focused edit routes without losing keyboard workflow.

**Target UX:** Keep nested tab path for read/monitor/workspace; use subroutes for multi-field editors. Browser history/refresh must work and avoid redirecting to wrong tab.

**Data / components:** Scoped table/control by section, service name sticky, panel health, last sync, tab count.

**Related destinations / new routes:** Preserve all pre-existing :tab names, avoid route conflicts with '/settings/edit' nested paths.

## `/app/deploy` — Deploy catalog
**Current source:** `web/src/app/DeployCatalog.tsx`

**Already present:** Catalog with category buttons, text search, availability and sort; load more and recommended items.

**Problem or improvement:** Relies partly on client search/filtering, generic selects; product comparison, compatibility/availability explanations need improvement.

**Target UX:** Searchable, filterable service catalog; category chips, sort, saved selection, product specs and popularity only if real. Fast product detail navigation.

**Data / components:** Product title/icon, badges, base price/currency/period, requirements, readiness and limits.

**Related destinations / new routes:** /app/deploy/:slug; /app/vps/new; /app/email/checkout.

## `/app/deploy/:slug` — Product deploy wizard
**Current source:** `web/src/app/Deploy.tsx`

**Already present:** 1373-line multi-stage Config/Payment/Provisioning flow, quote, variables, EULA, promo, billing address, startup options, existing panel event polling.

**Problem or improvement:** Very rich but monolithic; step controls and configuration variable fields need stronger component standard, draft and safe price calculation; partial API failures can confuse.

**Target UX:** Full-page multi-step journey Configure -> Review -> Checkout -> Provisioning -> Ready. Typed product-specific inputs, stepper resources, region/plan cards, normalized billing quotes; no giant modal.

**Data / components:** Progress stepper is semantic order/provision timeline; show exact price and capabilities, persist draft safely without leaking secrets.

**Related destinations / new routes:** /app/deploy/:slug?step=..., /app/orders/:id (new read view), /app/instances/:id.

## `/app/domains` — App / website domains
**Current source:** `web/src/app/Domains.tsx`

**Already present:** 509-line list with Add a domain form, per-domain DNS instructions, verification, remove and address change; email domain links.

**Problem or improvement:** Add form and per-domain DNS/verification controls stacked inline; a long page for several domains; hostname ownership/routing vs mail domains can be confusing.

**Target UX:** Compact domains inventory, clearly distinguish app routing from email DNS. Dedicated Add and Domain detail/Manage records and typed DNS table.

**Data / components:** Hostname, linked app/service, status, ownership, TLS status, DNS required/present, checked at.

**Related destinations / new routes:** /app/domains/new; /app/domains/:id; /app/domains/:id/edit; /app/mail/domains/:id.

## `/app/mail` — Email overview
**Current source:** `web/src/app/Mail.tsx -> mail/MailOverview.tsx`

**Already present:** Mail route wrapper and 213-line overview, service summary and domain list; add-domain dialog and plan-change dialog.

**Problem or improvement:** Already split from earlier huge page; still modal editors for adding domains and changing plan; subscription/domain duplication can occupy space.

**Target UX:** Email summary compact, service selector if multi-account, table of domains, mailbox/storage quotas, webmail link, plan details; no permanent forms.

**Data / components:** Plan/status/usage, domains with DNS health and mailbox/alias counts.

**Related destinations / new routes:** /app/mail/domains/new; /app/mail/plans/change?service=..., /app/mail/domains/:id.

## `/app/mail/domains/:id` — Email domain workspace
**Current source:** `web/src/app/mail/MailDomainPage.tsx`

**Already present:** 519-line dedicated domain detail route with segmented tabs, mailboxes, aliases, DNS and delete; mailbox/alias creation as dialogs.

**Problem or improvement:** Dedicated page already exists, good. Creation/editing still dialogs; tab content may repeat domain overview and long DNS records.

**Target UX:** Tabs Overview, Mailboxes, Aliases, DNS & Verification, Settings. Table and typed form per resource; full-page creation, secure one-time password display.

**Data / components:** Mailboxes/aliases counts & quota, DNS status, last checked, verification, webmail.

**Related destinations / new routes:** /app/mail/domains/:id/mailboxes/new; /app/mail/domains/:id/aliases/new; /app/mail/domains/:id/settings; /app/mail/domains/:id/dns.

## `/app/servers` — Legacy VPS redirect
**Current source:** `web/src/app/routes.tsx / ServersRedirect`

**Already present:** Registered exact redirect to modern /app/vps.

**Problem or improvement:** Must preserve links from old emails/bookmarks and query params.

**Target UX:** Redirect/alias compatible with browser history, canonical link, 404 handling.

**Data / components:** No new UI; redirect acceptance tests.

**Related destinations / new routes:** /app/vps.

## `/app/servers/:id` — Legacy VPS detail redirect
**Current source:** `web/src/app/routes.tsx / ServersRedirect`

**Already present:** Registered compatibility redirect for old individual server URL.

**Problem or improvement:** Any lost server ID or search query can break external bookmarks.

**Target UX:** Preserve ID and allowed query state; redirect to exact VPS detail and maintain permissions.

**Data / components:** No new UI; redirect acceptance tests.

**Related destinations / new routes:** /app/vps/:id.

## `/app/vps` — VPS inventory
**Current source:** `web/src/app/Vps.tsx (VpsList)`

**Already present:** VPS list, plan list, network/power/VM status and order CTA in 1118-line combined module.

**Problem or improvement:** Large source module; service list can be more compact. Do not offer provider options not supported.

**Target UX:** Responsive VPS data grid and compact cards on phone; status, actual power, IP, plan, renewal, node/region; clear action to order.

**Data / components:** Server name, OS, power, status freshness, region, plan, IP(s), created/renewal.

**Related destinations / new routes:** /app/vps/:id; /app/vps/new.

## `/app/vps/new` — VPS checkout
**Current source:** `web/src/app/Vps.tsx (VpsCheckout)`

**Already present:** Separate full-page order flow, plan radio cards, billing period, SSH public key and dedicated IP, promo, quote.

**Problem or improvement:** Separate route already good; UI controls and steps could improve. Key validation, pricing source, preview and error details deserve stronger interaction design.

**Target UX:** Choose plan / region (when available) / SSH key / add-ons / review / checkout / provisioning. RadioCards, segmented period, SSHKeyField, QuoteSummary, progress stepper.

**Data / components:** Correct billing interval, public vs private IP, plan capability, provisioning/contract timing.

**Related destinations / new routes:** /app/vps/new?plan=..., /app/billing, /app/vps/:id.

## `/app/vps/:id` — VPS workspace
**Current source:** `web/src/app/Vps.tsx (VpsDetail) + VpsConsole.tsx`

**Already present:** Tabs Console, Graphs, Activity, Contract, Network, Usage, Snapshots, Boot from image, Settings, Reinstall/cancel. Power controls and troubleshoot panel.

**Problem or improvement:** Feature-rich already; action-heavy tabs and highly privileged flows need dedicated route, anti-accidental actions and async provider truth.

**Target UX:** Clear top status+power grouped buttons, overview and focused tabs. For SSH key, OS reinstall, ISO, snapshots and contract use full-page workflow with before/after and reason.

**Data / components:** Power state observed, plan, IP, network, resource usage, snapshot count, status last sync and provider progress.

**Related destinations / new routes:** /app/vps/:id/settings/edit; /app/vps/:id/ssh-keys; /app/vps/:id/reinstall; /app/vps/:id/snapshots/new; /app/vps/:id/iso; /app/vps/:id/contract.

## `/app/email/checkout` — Email hosting checkout
**Current source:** `web/src/app/EmailHosting.tsx (EmailCheckout)`

**Already present:** Dedicated email plan selection and domain entry with monthly/yearly and checkout.

**Problem or improvement:** Already full-page. Improve plan comparison, domain validation and DNS readiness, case of existing mail service or unsupported plan.

**Target UX:** Modern plan comparison, domain availability, correct quota and price, review/payment/provisioning steps and server-reported requirements.

**Data / components:** Price/term/tax, mailbox/domains/storage, add-on/supported provider, ownership verification next step.

**Related destinations / new routes:** /app/email/checkout; /app/mail/domains/new.

## `/app/billing/invoices/:id` — Invoice detail
**Current source:** `web/src/app/InvoiceView.tsx`

**Already present:** Invoice view with print and server invoice data; separate URL already.

**Problem or improvement:** Good separation; check print style, VAT/currency semantics and downloadable document if supported.

**Target UX:** Invoice reading/printing, trustworthy totals, transaction/linked order, payment status, legal company info, download where actually supported.

**Data / components:** Invoice reference, issue/due/paid, tax, amounts and currency; secure PDF/print.

**Related destinations / new routes:** /app/billing, /app/billing/orders/:id (new).

## `/app/billing` — Billing control center
**Current source:** `web/src/app/Billing.tsx`

**Already present:** 855-line billing page, payment method, subscriptions, outstanding orders, closed services, invoices, renew/cancel/resume and account credit.

**Problem or improvement:** Large vertical mix of independent billing tasks and invoices; existing DataTable but many sections and subscription actions in one page.

**Target UX:** Compact billing overview; tabs Subscriptions, Orders, Invoices, Payment Methods, Credit, History. Dedicated change/cancel/renew/payment method routes. Clear outstanding payment warnings.

**Data / components:** Next payment, current plan and per-currency totals, unpaid orders, invoices with cursor and exact statuses.

**Related destinations / new routes:** /app/billing/subscriptions/:id; /app/billing/subscriptions/:id/cancel; /app/billing/payment-method; /app/billing/orders/:id; /app/billing/invoices/:id.

## `/app/tickets` — Customer support queue
**Current source:** `web/src/app/Tickets.tsx`

**Already present:** 510-line table+mobile list, category filter/create ticket (embedded modal), close confirm; links to specific detail.

**Problem or improvement:** Create ticket uses a large modal/form in listing, conflicting with desired standalone edit rule. Service linking mostly instance/mail; add VPS.

**Target UX:** Support inbox with status/category/service, search, pagination, SLA where supported. Dedicated New Ticket route and explicit service selector across apps, VPS and mail.

**Data / components:** Ticket #, subject, linked service, state, last reply, created, unread/agent response.

**Related destinations / new routes:** /app/tickets/new; /app/tickets/:id; /app/support (optional alias).

## `/app/tickets/:id` — Customer conversation
**Current source:** `web/src/app/TicketDetail.tsx`

**Already present:** Standalone detail with status, conversation, reply, attachment; reply composer separate panel.

**Problem or improvement:** Standalone good; long page if thread grows, composer can be far from latest messages; status-related tasks need clear availability.

**Target UX:** Dedicated conversation workspace, compact status header, scrollable/loaded message area and sticky reply composer with safe attachment upload; no internal notes leak.

**Data / components:** Status/response, relevant service and support response, privacy-safe attachments, read/unread.

**Related destinations / new routes:** /app/tickets/:id; /app/tickets/new.

## `/app/settings` — Account & security settings
**Current source:** `web/src/app/Settings.tsx + SecurityPanels.tsx`

**Already present:** 1088-line Settings module tabs: profile, billing address, password, sessions, notification preferences, account closure; 2FA, passkeys, API keys, activity. Lots of inline forms.

**Problem or improvement:** Already tabbed but many independent security and identity workflows in one module; requires focus and separate pages to prevent endless scroll; notification preference duplication with /app/notifications.

**Target UX:** Settings landing as category cards/lists: Profile, Security, Sessions, API Keys, Billing Address, Notifications, Privacy & Data. Each edit gets a standalone route, step-up and confirmation as required.

**Data / components:** Verified email/status, 2FA enabled, passkeys, sessions, API keys, billing profile completeness, account closure.

**Related destinations / new routes:** /app/settings/profile; /app/settings/security/2fa; /app/settings/security/passkeys; /app/settings/security/sessions; /app/settings/api-keys; /app/settings/billing-address; /app/settings/privacy; /app/settings/notifications.

## `/app/notifications` — Notification center
**Current source:** `web/src/app/Notifications.tsx`

**Already present:** 471-line separate page, category filters, unread-only, cursor Load more, mark read/all, delete and notification action URL.

**Problem or improvement:** Already has pagination and row actions. Improve grouping, search only if backend supports, preferences deep link, and source context.

**Target UX:** Notification inbox with grouped sections, Filters All/Unread, categories, contextual action to resource and preferences. Never mark read by inaccessible destination.

**Data / components:** Category, time, severity, unread, relation target, safe action destination.

**Related destinations / new routes:** /app/notifications; /app/settings/notifications.

## Cross-cutting acceptance (must be tested, not presumed)
- Every current /app URL, tab, deep link and server redirect remains accessible. No removed feature, user data, saved provider config, invoices or uploads.
- All customer-owned resource reads and mutations are authorized server-side against userId/tenant + scoped server shares; private resources of other users never leak.
- All lists support valid empty/loading/error/stale and server pagination if necessary; no misleading client-filter-only view of partial data.
- All financial numbers show currency, period, VAT/fees, refund status and server source; quote must match confirmed checkout before payment.
- Provider actions show requested/queued/completed/failed, not fake immediate success.
- Sensitive settings/passwords/API keys/DB credentials/SSH private keys never logged or shown except controlled one-time reveal where supported.
- Dedicated create/edit URLs with dirty draft, browser back/forward, validation, Save/Discard, permission and version conflict handling.
- Mobile responsive 320/390/430/768/1024/1440/1920, 200% zoom, keyboard, reduced motion, touch/scroll containment.
- Admin Activity Explorer should correlate relevant customer business/security events without exposing staff internal notes/private abuse data to customer UI.
- /app shell and design system should share safe primitives with /admin, but customer UI deliberately has simpler terminology and fewer controls.
