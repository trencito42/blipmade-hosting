# Blipmade Admin 3.0: Exact Page and Dedicated-Editor Route Blueprint

**Document type:** authoritative URL and interaction planning. **Nothing here is implemented merely because a URL is named.** Preserve all existing 35 routes. All additional destinations are proposals and may require backend extension, role permission or provider support.

**Hard rule:** full-page editor for every meaningful creation, editing/configuration, finance, permission or destructive workflow. **No form-heavy modals, no giant inline editor beneath a list.** Modal only for final confirmation, tiny informational feedback, read-only details or small transient UI decisions. The `TicketDetail` reply composer remains inline because sending a message is its core ongoing task, not editing configuration.

**Important:** route naming may be adjusted to existing router conventions but every proposed destination MUST have stable deep-link equivalent. Migration must map old button -> new route -> same or improved backend action -> test.

## All 35 existing /admin views and proposed edit destinations

| Existing route | Current role / final layout | Recommended components | Proposed dedicated edit / creation routes (all NEW unless already registered) | Preservation and API requirements |
|---|---|---|---|---|
| `/admin` | **Dashboard:** KPI strip, critical incidents, payments/provision failures, SLA, last operator actions | DateRangePicker, saved incident views, MetricTile, EventTimeline | `/admin/ops/alerts`<escape>; </escape>`/admin/ops/webhooks (new)` | All metrics drill into matching filtered list; no edits on overview |
| `/admin/customers` | **Customers grid:** Customer/ID/email masked/verified/state/services by family/MRR by currency/tickets/last active; compact table | AdvancedFilters, saved views, AsyncCombobox, ColumnPicker, BulkActionBar | `/admin/customers/new (if manual create supported)`<escape>; </escape>`/admin/customers/bulk-edit`<escape>; </escape>`/admin/customers/:id` | Account lifecycle, bulk edits and tags with scoped preview; no persistent editing under table |
| `/admin/customers/:id` | **Customer 360:** Sticky profile summary; Overview, Services, Billing, Support, Security, Activity tabs with separate paged datasets | ResourceHeader, DetailTabs, RelationshipGraph, ActivityTimeline, MoneySummary | `/admin/customers/:id/profile/edit`<escape>; </escape>`/admin/customers/:id/notes/new`<escape>; </escape>`/admin/customers/:id/security`<escape>; </escape>`/admin/customers/:id/credit/adjust`<escape>; </escape>`/admin/customers/:id/account-action` | Keep impersonation/reset 2FA/suspension with strict RBAC, reason and audit; no inline giant forms |
| `/admin/orders` | **Orders grid:** Order, customer, items, gross/net/refunded, payment/fulfilment, date, provider status | SavedViews, DataGrid, DateRangePicker, MoneyRange, StatusBadge | `/admin/orders/:id`<escape>; </escape>`/admin/orders/:id/refund`<escape>; </escape>`/admin/orders/:id/retry` | Keep action menu small; server controls refund eligibility |
| `/admin/orders/:id` | **Order workspace:** Lifecycle stepper, items, invoice/payments/refunds, fulfilled app/VPS/mail, webhooks, order events | StatusTimeline, MoneySummary, LinkedEntity, ActivityTimeline | `/admin/orders/:id/refund`<escape>; </escape>`/admin/orders/:id/retry`<escape>; </escape>`/admin/orders/:id/fulfilment/review` | All related resource links; separate order audit and account audit |
| `/admin/services` | **Apps/databases inventory:** Service, owner, product, node, status, resource usage, health, job | DataGrid, FilterBuilder, StatusBadge, ResourceUsage | `/admin/services/:id`<escape>; </escape>`/admin/services/import`<escape>; </escape>`/admin/services/:id/provision/retry` | Keep import/provision/retry as scoped pages |
| `/admin/services/:id` | **Instance workspace:** Summary, runtime/console, files/db, resources, backups, networking, billing, audit | DetailTabs, ResourceUsage, CodeEditor, FileTree, EventTimeline | `/admin/services/:id/resources/edit`<escape>; </escape>`/admin/services/:id/startup/edit`<escape>; </escape>`/admin/services/:id/network/edit`<escape>; </escape>`/admin/services/:id/restore`<escape>; </escape>`/admin/services/:id/reinstall` | Do not duplicate customer panel data or expose credentials without permissions |
| `/admin/vps` | **VPS inventory:** VPS ID/name, customer, VMID, node, IP, power, plan, allocated usage, bill | DataGrid, ProviderHealth, FilterBuilder, ActionMenu | `/admin/vps/:id (new)`<escape>; </escape>`/admin/vps/:id/resources/edit`<escape>; </escape>`/admin/vps/:id/plan/change` | Move all VPS management out of list cards |
| `/admin/products` | **Product catalog:** Product family, visibility, availability, resources, price, deployability, sold count | DataGrid, ProductIcon, SavedViews, StatusBadge | `/admin/products/new`<escape>; </escape>`/admin/products/:id`<escape>; </escape>`/admin/products/:id/edit`<escape>; </escape>`/admin/products/:id/deployment` | Product editor with field schemas and affected-customer preview |
| `/admin/pricing` | **Pricing hub:** Product prices, rate card, add-ons, volume/period discount, change history | MoneyInput, UnitStepper, PercentInput, PriceDiffViewer | `/admin/pricing/rates/edit`<escape>; </escape>`/admin/pricing/products/:id/edit`<escape>; </escape>`/admin/pricing/addons/new`<escape>; </escape>`/admin/pricing/addons/:id/edit`<escape>; </escape>`/admin/pricing/discounts/edit` | Prices in minor units; history, preview, no direct sidebar giant form |
| `/admin/support/analytics` | **Support analytics:** SLA/CSAT/volume/team response and policies overview | DateRangePicker, AgentCombobox, Charts, SavedViews | `/admin/support/analytics/policies`<escape>; </escape>`/admin/support/analytics/policies/:id/edit` | Only policy changes open editor; metric panels drill into conversations |
| `/admin/support/automations` | **Automation index:** Trigger, conditions, enabled/version, outcome, last run, rate | DataGrid, FilterBuilder, RuleStatus, EventTimeline | `/admin/support/automations/new`<escape>; </escape>`/admin/support/automations/:id/edit`<escape>; </escape>`/admin/support/automations/:id/runs` | Full builder page and dry-run, no nested 2,000px editor |
| `/admin/support/bots` | **Bot index:** Bot, version, status, dept, flow, handoff, success, errors | DataGrid, FlowPreview, StatusTimeline | `/admin/support/bots/new`<escape>; </escape>`/admin/support/bots/:id/edit`<escape>; </escape>`/admin/support/bots/:id/versions` | Flow canvas dedicated large workspace |
| `/admin/support` | **Support agent inbox:** 3-pane inbox list / thread / contextual customer (responsive) | InboxFilters, SearchField, ConversationComposer, ContextPanel | `/admin/support/conversations/:id`<escape>; </escape>`/admin/support/settings`<escape>; </escape>`/admin/support/macros/new`<escape>; </escape>`/admin/support/macros/:id/edit` | Settings/agent photo/departments out of inbox; chat composer stays inline by design |
| `/admin/tickets` | **Ticket queue:** Tickets as channel/filter of unified support, status/SLA/owner/last reply | DataGrid, SavedViews, StatusBadge | `/admin/tickets/:id`<escape>; </escape>`/admin/support/settings` | Old ?ticket= routes alias to correct new detail |
| `/admin/knowledge` | **Knowledge index:** Articles by visibility/locale/category/updated/relevance | DataGrid, FilterBuilder, DocumentPreview | `/admin/knowledge/new`<escape>; </escape>`/admin/knowledge/:id/edit`<escape>; </escape>`/admin/knowledge/:id/versions` | Full article editor/publish preview page |
| `/admin/tickets/:id` | **Ticket conversation:** Messages, notes, attachments, assignee, case state, linked service, SLA | ChatTimeline, RichTextComposer, ContextPanel, StatusTimeline | `/admin/tickets/:id/settings`<escape>; </escape>`/admin/tickets/:id/transfer (if complex)`<escape>; </escape>`/admin/tickets/:id/close` | Replies inline conversation as natural workflow; configuration/edit structured separately |
| `/admin/promotions` | **Campaigns index:** Status, code, discount, usage, dates, conversion, revenue | DataGrid, DateRangePicker, PercentBadge | `/admin/promotions/new`<escape>; </escape>`/admin/promotions/:id` | Creation/edit dedicated, no full form above grid |
| `/admin/promotions/:id` | **Campaign workspace:** Summary, redemption events, eligibility rules, schedule, audit | StatusTimeline, DateTimePicker, MoneyInput, PercentInput | `/admin/promotions/:id/edit`<escape>; </escape>`/admin/promotions/:id/eligibility/edit`<escape>; </escape>`/admin/promotions/:id/schedule/edit` | Preview existing subscriptions/eligibility impact |
| `/admin/infrastructure` | **Infrastructure hub:** Providers/nodes/eggs/allocations/capacity/health, cross-provider | ProviderSelector, DataGrid, ResourceUsage, HealthIndicator | `/admin/infrastructure/nodes/:id`<escape>; </escape>`/admin/infrastructure/nodes/:id/edit`<escape>; </escape>`/admin/capacity`<escape>; </escape>`/admin/infrastructure/templates/:id/edit` | Provider-specific capabilities and authorizations, no fake universal actions |
| `/admin/incidents` | **Status/incidents index:** Open/resolved incidents, severity, affected services, updates, public communication | DataGrid, StatusTimeline, DateTimePicker | `/admin/incidents/new`<escape>; </escape>`/admin/incidents/:id`<escape>; </escape>`/admin/incidents/:id/edit`<escape>; </escape>`/admin/incidents/:id/updates/new`<escape>; </escape>`/admin/announcements/new` | Announcements independent from incident workflow |
| `/admin/reports` | **Reports workspace:** Financial/product/customer/cohort report tabs and drilldowns | Charts, MultiSelect, DateRangePicker, CurrencyPicker, ExportReview | `/admin/reports/custom`<escape>; </escape>`/admin/reports/saved/:id/edit`<escape>; </escape>`/admin/reports/exports` | Reports generated from validated semantics; no 0 replacing null/error |
| `/admin/queues` | **Job Center:** Queue state, job, retries, worker, target, errors, timestamps | DataGrid, TraceTimeline, RetryReview, FilterBuilder | `/admin/queues/:id`<escape>; </escape>`/admin/queues/:id/retry`<escape>; </escape>`/admin/queues/:id/requeue` | Review job payload redaction and idempotency |
| `/admin/abuse` | **Abuse case index:** Status, severity, target, linked service, investigator, category, date | DataGrid, CaseStatus, SavedViews | `/admin/abuse/:id` | New inbox already implemented; extend safely |
| `/admin/abuse/:id` | **Abuse case workspace:** Evidence, investigation, case actions, audit, related cases | CaseWorkflow, EvidenceViewer, ActivityTimeline | `/admin/abuse/:id/investigation/edit`<escape>; </escape>`/admin/abuse/:id/enforcement`<escape>; </escape>`/admin/abuse/:id/reopen` | Closed cases read-only until explicit reopen; operator reason |
| `/admin/ops` | **Operations dashboard:** Health, alerts, backups, webhooks, provider failures, incidents | HealthIndicator, ErrorExplorer, EventTimeline | `/admin/ops/alerts`<escape>; </escape>`/admin/ops/backups`<escape>; </escape>`/admin/ops/webhooks`<escape>; </escape>`/admin/ops/repairs/:id` | No giant catch-all; ops actions reviewed and recorded |
| `/admin/mail` | **Mail hosting index:** System health, service/domain/mailbox counts, jobs and mail plans | DataGrid, DomainInput, MailHealth, StatusBadge | `/admin/mail/services/:id`<escape>; </escape>`/admin/mail/domains/:id`<escape>; </escape>`/admin/mail/jobs/:id`<escape>; </escape>`/admin/mail/plans` | Separate operational mail overview from customer-managed domain forms |
| `/admin/mail/plans` | **Mail product plans:** Plan list, tiers, quotas, currencies, price/status | DataGrid, RadioCards, UnitStepper, MoneyInput | `/admin/mail/plans/new`<escape>; </escape>`/admin/mail/plans/:id/edit`<escape>; </escape>`/admin/mail/plans/:id/prices/edit` | Version/cost preview, no huge form on list |
| `/admin/audit` | **Audit Explorer:** Immutable actor/action/resource/outcome/IP masked/correlation/date | DataGrid, FilterBuilder, AuditEventInspector, DiffViewer | `/admin/audit/:id`<escape>; </escape>`/admin/activity`<escape>; </escape>`/admin/activity/saved/:id/edit` | Audit row read-only; events correlated across models |
| `/admin/staff` | **Staff index:** Staff role, status, MFA, last active, scope and activity | DataGrid, PermissionBadge, StatusBadge | `/admin/staff/new`<escape>; </escape>`/admin/staff/:id`<escape>; </escape>`/admin/staff/:id/permissions/edit`<escape>; </escape>`/admin/staff/:id/security` | Permission matrix full-page with diff/step-up |
| `/admin/settings` | **Settings index:** Global settings categorized by owner/scope, version and effective value | SettingsSearch, Toggle, SecretField, KeyValueEditor, DiffViewer | `/admin/settings/company`<escape>; </escape>`/admin/settings/tax`<escape>; </escape>`/admin/settings/security`<escape>; </escape>`/admin/settings/integrations`<escape>; </escape>`/admin/settings/advanced`<escape>; </escape>`/admin/settings/:section/edit` | Settings editing on focused pages, clear which product module owns each value |
| `/admin/email-templates` | **Template library:** Event type, locale, active version, last modified/test status | DataGrid, RichTextEditor, TemplatePreview | `/admin/email-templates/:id/edit`<escape>; </escape>`/admin/email-templates/:id/preview`<escape>; </escape>`/admin/email-templates/:id/versions` | Compatibility with /admin/notifications templates, no duplicate source of truth |
| `/admin/content` | **Content library:** Site pages, blocks, draft/published, locale, version | DataGrid, ContentPreview, FormBuilder, JSONEditor | `/admin/content/:id/edit`<escape>; </escape>`/admin/content/:id/preview`<escape>; </escape>`/admin/content/:id/history` | Preview before publish; advanced JSON opt-in |
| `/admin/tools` | **Operator repair catalog:** Tools, risk, runbook, last use, success/failed | DataGrid, DangerActionReview, StatusTimeline | `/admin/tools/:id`<escape>; </escape>`/admin/tools/:id/run` | Dry-run and diff where possible, no blind actions |
| `/admin/notifications` | **Notifications system:** Deliveries, event bus, transport, template library, preferences | DataGrid, StatusTimeline, MultiSelect, ErrorExplorer | `/admin/notifications/transports/:id/edit`<escape>; </escape>`/admin/notifications/events/:id`<escape>; </escape>`/admin/notifications/preferences/edit`<escape>; </escape>`/admin/email-templates/:id/edit` | Retain delivery history, no false delivered status |

## Route grouping by workflow, not sidebar clutter

- Sidebar shows only work domains: Dashboard, Customers & sales, Hosting, Catalog, Support & trust, Operations, Communications, Staff & settings.
- List route is discoverable from sidebar; details and editor routes belong to breadcrumb and local tabs.
- Group membership and active highlighting derive from route metadata, not ad hoc string contains.
- Dedicated resource URLs for invoices, payments, VPS, email domains, staff, automation rules and bots are additive; never remove existing `/admin/customers/:id` etc.
- Store selected tab, query filters, sort and cursor in URL when feasible. Server-generated data does not belong in client query string.
- Editor routes have explicit permissions and guard unsaved changes. Changes are audited with old/new/actor/reason where relevant.

## Editor page templates by entity

### Standard create page
Breadcrumbs, title, resource type, optional steps, sectioned inputs, validation summary, preview, consistent save/cancel and clear result. On submit, backend validates, shows created resource, navigates to its detail URL. If the operation is async (VPS or Pterodactyl), show a provisioning timeline, not instant Active.

### Standard edit page
Breadcrumb to entity; entity status and current version. Tabs e.g. General, Pricing, Resources, Access, Delivery, Advanced. Main column fields and right context panel (effective values, plan limits, risk/price impact, help). Sticky action footer with Save/Discard. Dirty state and conflict (409) resolution. Save writes only changed fields using server version.

### High-impact action page
Exact resource/case/customer/order, allowed transition from backend, reason, current and resulting state preview, related billing/provider side effects, optional dry-run, step-up, final typed confirmation. State of operation Pending/Accepted/Completed/Failed clearly differentiated. All actions correlated and audited.

### Full-page bot/automation editor
Workflow builder with palette, searchable nodes, canvas, inspector, test simulation and version lifecycle, independent from list pages. Draft preservation and keyboard accessibility, no giant popup.

### Full-page infrastructure/resource editor
Use constrained UnitStepper and optionally connected slider, live/price preview, provider headroom and product rules, authorization and explicit review. Never allow disk shrink simply because UI stepper can decrement; source of truth from provider capabilities.

## Relationship contract: no stranded objects

Every entity detail must link, if data and permission allow:
- Customer -> orders, subscriptions, apps, VPS, mail domains, tickets, invoices, payments, notes, events.
- Order -> customer, payment, invoice, subscription, delivered resources, webhook/notification attempts.
- Service/VPS/Mail -> owner, plan, order, node/provider, backup, recent incident/ticket, audit.
- Invoice/Payment/Refund -> customer, order, provider identifiers, ledger state, credit adjustments.
- Ticket/Abuse -> customer, affected service, related incidents, agent, state changes.
- Infrastructure/Job -> provider node, resource, job attempt, actor and result.
- Audit event -> actor, subject, resource, linked request/job/correlation.

No inferred cross-customer matching by email/hostname; strict tenant/ownership ID keys and restricted sensitive fields.

## Components by edit workflow

| Workflow | Required specialized controls | Non-negotiable validation |
|---|---|---|
| VPS vCPU/RAM/disk | UnitStepper, ResourceSlider, capacity/price preview, checkbox acknowledgement | Provider min/max/step, node headroom, billing impact, disk shrink rules |
| Product pricing | MoneyInput, Currency/Period selector, PercentInput, DiffViewer | Minor-unit exactness, VAT, active contracts, currency boundaries |
| Refund | MoneyInput, full/partial selector, provider-ledger summary, final review | Remaining refundable, provider intent, state idempotency, reason, RBAC |
| Mail domain / DNS | DomainInput, typed DNS row editor, verification inspector | IDN/Punycode, ownership, MX/SPF/DKIM/DMARC as applicable |
| Support automation | Trigger/conditions/actions builder, date/time and business-hours | Loop prevention, simulation, dry-run, draft/publish versions |
| Staff role/security | TreeCheckbox, PermissionMatrix, role/inherited diff | No self-escalation, step-up, actor and subject audit |
| Content/email template | RichText/Markdown/JSON editor, token combobox, preview | Escape unsafe HTML, permitted variables, revision history |
| Billing & company settings | Structured forms, nullable overrides, version preview | Tax/currency correctness, ownership, secret handling |

## Route implementation order and anti-regression

1. Create typed route metadata + editor layout foundation; verify existing 35/35 match.
2. Implement new destination stubs ONLY together with functioning read/data/auth; no placeholder pages in release.
3. Migrate one workflow to new route, preserve old navigation, add deep link tests, remove duplicate inline editor only after functional parity.
4. Create API endpoints/response schemas/permissions as needed; migrate data additively, no blind overwrite.
5. Confirm Save/Discard/reload/tab state, provider/finance correctness and full old control parity.
6. Continue across all work domains; keep all unsolved routes in backlog with exact file owner and blocker.
7. No production merge/deploy without review and staging validation.

**Final source of truth:** [PREMIUM-COMPONENTS.md](./PREMIUM-COMPONENTS.md) defines exact design and editor behavior. Older suggestions in other audit docs to use a drawer/modal for editing are superseded.
