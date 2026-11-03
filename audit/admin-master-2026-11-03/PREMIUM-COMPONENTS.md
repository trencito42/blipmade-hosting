# Blipmade Admin 3.0: Premium Components & Interaction Specification
**Status:** FINAL IMPLEMENTATION BLUEPRINT, not implemented UI.
**Scope:** /admin only. **Order of authority:** this document supersedes any older suggestion to use a modal/drawer for creating or editing a persistent record.
**Current foundations:** React + TypeScript + Tailwind, Hanken Grotesk/Bricolage Grotesque/JetBrains Mono, charcoal/near-black surfaces, green accent, red/warning semantics, Font Awesome 7 Pro via the existing icon-map and Icon component, ui-app.tsx components, existing command palette. Preserve all of them.

## 1. Visual direction, not a clone
Cohesive dark premium hosting control plane; precise shapes, clear typography, strong content hierarchy, compact tables, generous *intentional* space, high interaction quality. Benchmark the craft of Linear, Stripe Dashboard, Cloudflare, Vercel, without copying them or importing an unrelated design kit.

Avoid: generic outline cards around every element; all buttons equal; giant blank empty panels; full-width primitive select for a three-option choice; visually broken button groups; every edit in a popup; 8 separate colored badges; excessive glassmorphism, shadows or gradients; unfocused animations; poorly designed menu affordances.

Use semantic tokens, not arbitrary local classes. Tokens for text/secondary text/borders/surfaces/primary/danger/warn/success/focus. Use existing Font Awesome icon abstraction. Icon weights, stroke/duotone, size, baseline and spacing must be consistent. Never expose bundled commercial font files.

## 2. Non-negotiable navigation and editing rule

**All persistent create, edit, configuration, high-impact, multi-field or multi-step workflows open a dedicated page with a unique, refreshable URL.**
- List view -> detail view -> edit route; never embed giant forms under lists.
- Route state represents resource ID and current edit mode. Tabs deep-link via child routes or URL query; browser Back/Forward works.
- New record uses /new or /create; existing record uses /:id/edit or dedicated action subroute.
- Draft state, dirty indicator, save/cancel behavior, navigation guard, validation summary, real server response and return navigation are mandatory.
- Preview or side-by-side diff may live in an editor page's secondary column.
- A *modal* is allowed for small confirmations, destructive action final checks, short pickers, explanatory popovers or brief OTP/step-up. **No large create/edit forms, no refund editing in modals, no complex settings dialogs.**
- Tiny reversible quick actions (e.g. copy, pin, favorite, simple table status filter) can stay inline. Persistent state-changing status toggle needs either explicit safe server transition with feedback or navigation to a dedicated change page, based on risk.
- Context drawer is for **read-only preview** or supportive information, not the full editor.
- Bulk edits with business meaning open /bulk-edit with review scope, before/after, conflicts, dry-run, permissions, final confirmation.
- Do not introduce new sidebar items for each edit route.

## 3. Design anatomy

### 3.1 App shell
- Navigation sidebar of grouped operator tasks; selected group visible, other groups compact. Resize/collapse optional; meaningful bottom staff state and environment indicator; never swallow current page.
- Global top bar: breadcrumb, command search, current environment, notification count, account menu. Search is Cmd/Ctrl+K, accessible and quick.
- Page header: title, one-line descriptor, resource status, primary page action, quiet secondary actions. Avoid duplicate card titled exactly the same as page.
- Collections: compact header + quick query toolbar + advanced filter chips + table. Pagination in table footer.
- Resource pages: sticky condensed summary and horizontal tabs; a slim contextual side column on wide screens; optional sticky action footer in editor.
- On phone: main content first, sidebar in accessible menu; tabs horizontally scroll with clear active state; no clipped controls; data becomes semantically structured rows/cards.
- A 1440×900 screen should show heading, major controls and several rows without scrolling; do not force page-level scroll for a simple list.

### 3.2 Visual measurements (starting design tokens, tune in review)
- Control heights: 32px compact desktop, 38-40px default desktop, 44px touch; no sub-44 touch hit region even if glyph appears smaller.
- Grid/table row heights: 40-52px dense, 56-64px comfortable. Max one to two text lines with details on row open; long emails and IDs truncation with accessible full reveal.
- Rounded geometry: 8-10px inner control, 12px main button, 14-18px section container; nested corners harmonized. Shared group first/last corners work at any size.
- Motion: 120-220ms for interaction, 240-350ms for larger panel transition, only transform/opacity where appropriate. Respect prefers-reduced-motion. Never animate monetary numbers in a way that masks the exact value.
- Use color for state and not for decoration; status has text+icon. Provide adequate contrast on secondary text and outlines.
- Icons generally 14-18px within controls; safe target at least 40/44px as appropriate.
- Render money/numbers monospaced/tabular, names/content sans, top headings display face sparingly.
- Sticky header and editor footer must never cover content or keyboard on mobile.
- Dark native controls and custom popovers: layer/z-index, keyboard, focus and safe area behavior verified.

## 4. Foundational components: must be built and verified before page migrations

### 4.1 Buttons and action clusters
1. **Button**: primary, secondary, soft/quiet, subtle, destructive; xs/sm/md/lg; busy, idle, pressed, disabled, disabled-reason tooltip; actual async result; icon positioning; no size jump when loading.
2. **IconButton**: tooltips and accessible name; copy, close, open-in-new, refresh, favorite, settings, context, expand; tactile pressed state and keyboard.
3. **ButtonGroup**: seamless shared border, equal control height, only first/last outer corners; contiguous focus indicators that do not clip. Example: power On / Restart / Stop (subject to allowed actions); each action's severity remains clear.
4. **SplitButton**: strong default action and adjacent chevron for related alternatives, e.g. Retry provisioning / Retry with advanced options. A destructive action must never be a hidden accidental default.
5. **SegmentedControl**: use for mutually exclusive small choices (All/Active/Suspended, monthly/yearly, rows/cards); keyboard navigation, correct aria semantics, responsive scrolling, active tab; not six separate independent rounded pills.
6. **ActionMenu**: grouped safe/advanced/destructive actions with labels, shortcuts, separators, disabled reasons, keyboard roving, outside click, focus restore, escape, collision handling.
7. **BulkActionToolbar**: sticky when rows selected, selected count, clear; current page vs all matching scope, permissions, review page, progress and errors.
8. **ActionReview**: dedicated screen for anything that modifies multiple records, money, subscription, resources, production data or customer account access.
9. **CopyableValue**: safe monospace ID/IP/hostname copy with toasts, never copy/reveal secrets silently.
10. **ConfirmationDialog**: only last confirmation step, never full editing experience; target name, risk, reason, human-readable consequences, typed confirmation for destructive actions, optional MFA step-up.

### 4.2 Specialized input controls
11. **SearchField**: inline search icon, focus hint and clear affordance, debounced server query, cancellation, shortcut, no layout jump.
12. **AsyncCombobox**: search/select customer, product, node, plan, service, staff; remote pagination, selected label, no raw ID, no-results/loading/error, proper accessible listbox and keyboard.
13. **MultiSelect**: searchable selected tokens, remove individually, Select all only within explicit scope, tag counts, server filtering if large.
14. **FilterBuilder**: typed filters per table with operators (is/is not/in/contains/between/exists), groups AND and supported OR, active filter chips, reset, save/rename/share personal/team saved view.
15. **DatePicker**: day/month/year navigation with keyboard; timezone and date validity; locale.
16. **DateRangePicker**: Today/Yesterday/7d/30d/90d/Custom, clear inclusive/exclusive boundaries, relative ranges restored via URL.
17. **DateTime & Timezone Picker**: for maintenance, campaigns, SLA; local display and exact UTC storage, daylight-saving transition handling.
18. **NumberStepper**: +/- buttons with shared border and numerical input, bounded integer/decimal values, explicit min/max/step, hold-to-repeat only if accessible and safe, keyboard arrow keys and typed values, localized display while preserving exact submitted value. Never submit invalid/transient blank state.
19. **UnitStepper**: specialized NumberStepper for vCPU, RAM MiB/GiB, disk GB/GiB, mailbox limits, priority/order, retries; unit visible, step and constraints come from server/plan rather than hardcoded UI. Disk decrease disallowed unless the provider actually supports it.
20. **ResourceSlider+Stepper**: synchronize slider and typed stepper for continuous feasible resource selection, labeled marks for recommended/common tiers, remaining host capacity, price preview. Do not offer slider when only discrete plans are allowed.
21. **MoneyInput**: amount+currency+period, formatter/parser with minor units and precise decimals, domain validation; do NOT reuse stepper for refunds without safeguards. Refund amount shows maximum/remaining, field-level errors, no float accounting.
22. **PercentInput**: 0-100% with stepper and optional slider when appropriate (coupon/discount thresholds); differentiate percent from basis points in API.
23. **Password/SecretField**: never show raw secret by default; secure generate/reveal/copy with permission and one-time disclosure; sensitive access audit; do not log raw values.
24. **ComboboxCreatable**: tags, categories, list items; validation against existing server values; no accidental duplicates.
25. **Switch**: reversible binary setting with explicit label/description and immediate server feedback; no switch for destructive/account-suspension actions.
26. **RadioCards / PlanSelector**: curated exclusive choice cards with correct price, unit, features and limitation, selected check/contrast. Use for hosting plan/provider/region, not raw native select where comparison matters.
27. **CheckboxGroup / TreeCheckbox**: permission matrix and categories; inherited vs overridden vs denied; indeterminate, bulk selection, explanatory detail; no ambiguous checkbox row.
28. **KeyValueEditor**: structured key/value settings with key validation, duplicate checks, removable row, secret classifications and diff before save.
29. **CodeEditor / JSONEditor**: syntax, validation, prettify/diff, change guard, safe copy; context-aware help. Advanced JSON behind explicit toggle, not default for general staff.
30. **FileDropzone**: click/drag, keyboard access, multiple files where allowed, type/size quotas, upload progress, error and malware validation from backend.
31. **DNSRecordEditor**: record type-specific input schema, TTL, hostname, target, proxy mode when supported, conflict detection, zone preview and validation.
32. **IP/CIDRField**: IPv4/v6/CIDR validation for firewall/allowlist and networks, prevent accidental invalid rules.
33. **DomainInput**: normalized hostname/punycode preview, verify link, DNS status, avoids confusing ownership and routing validation.
34. **Color/Theme Input**: only when a real configurable brand field exists; never invent cosmetic settings for admin.
35. **RichText/MarkdownEditor**: knowledge, announcements, ticket macros/templates, autosave draft and preview, safe rendering and keyboard.
36. **TagInput**: chips, autocomplete, validation and assign/change audit; avoid huge tag form.
37. **Nullable / Inherit Select**: explicitly model Unset / Use platform default / Override, with effective vs stored value and owner.
38. **ConditionalFieldset**: show only relevant fields based on product type, provider capabilities, account state and permissions; preserve preexisting values when hidden or warn before dropping them.

### 4.3 Data collection and contextual display
39. **AdminDataGrid**: server pagination/cursor, real server sorting and filtering, accessible semantic table, optional row pinning/column preferences, status cell, skeleton/empty/errors, compact desktop and mobile row/list adaptation. No client sort of partial server results.
40. **ColumnPicker**: hide/reorder/pin supported fields, required columns cannot be hidden, preferences per user/workspace.
41. **SavedViews**: Mine, Failed, Awaiting Payment, Suspended, Unassigned, Recent, with custom named views. Personal/team RBAC, query state in URL.
42. **AdvancedFiltersPopover**: keyboard-friendly, grouped typed filters; remove chip, clear all; no full-width accordion of filters on every list.
43. **SearchResultsCommandPalette**: cross-entity typeahead and group headings, owner/status and actual destination, keyboard shortcuts.
44. **MetricTile**: truthful values, period, comparison, status, source freshness, click-through to filtered list; no show of 0 as API error.
45. **StatusBadge**: semantic text + subtle icon and colored background; status taxonomy reused.
46. **StatusTimeline/Stepper**: commercial/provisioning/case workflow stages with completed/current/failed/skipped; clickable stage details with actual timestamp/provider events.
47. **ActivityTimeline**: paginated business events with actor, action, affected entity, result, correlation and lazy detail; group repetitive low-risk events with expand.
48. **DiffViewer**: line/field before-after, who/why, redaction and version; compare draft to active.
49. **RelationshipBreadcrumb / LinkedEntity**: direct customer/order/payment/invoice/subscription/service/ticket/provider links, masked when forbidden.
50. **ResourceUsageMeter**: current vs limit with units, last sampled, and warning threshold; not green "healthy" without provider data.
51. **HealthIndicator**: observed status, unknown/partial/failed/recovering, provider last seen, troubleshooting link.
52. **NotificationCenter**: unread, categories/severity, deep links, dismiss and historical; avoid toast-only significant failures.
53. **InlineError & ValidationSummary**: field-level hints and error summary linking to inputs with proper focus, form dirty/saving/saved state.
54. **EmptyState**: context-specific concise copy, optional link, never huge empty card for every related list.
55. **AuditEventInspector**: drawer permitted for read-only details, with copyable IDs and redacted payload; full export/history lives on page.
56. **Skeleton/AsyncState**: loading/empty/permission/error/partial-provider/unavailable/stale; preserve layout and prevent flashing zero values.

## 5. Mandatory editor page design

### Create/Edit layout
- Breadcrumb + back to list/detail, clear title ("Edit product", "Configure VPS resources", "Create support automation"), entity name, environment/status.
- Main form grouped into **local tabs** or section-side-nav, not a 3000px single column.
- Optional context aside: current value, effective value, live cost/impact/validation, links to docs and affected customers.
- Sticky footer: Save changes, Save draft (if supported), Discard/Cancel, dirty indicator, request state. No auto save for irreversible financial/suspension edits.
- On conflict/stale entity: compare server/current and operator draft, offer safe refresh/merge, never overwrite silently.
- Every server setting with units, valid ranges, source (plan/provider/admin registry) and whether live/restart required.
- If edits affect pricing/active subscriptions, show affected count and preview before confirm.
- History tab after save, full audit of actor/reason and before/after fields.
- Forms should have reversible steps where possible; use progressive disclosure for dangerous/advanced fields; no secret leakage in URL or logs.

### Practical page-specific controls
- **VPS resource edit:** UnitStepper vCPU, UnitStepper RAM, UnitStepper disk with provider constraints, synchronized allocation/plan-capacity preview, node headroom, billing delta, reason, restart impact, explicit final review.
- **Hosting plan editor:** RadioCards for plan type/region, number steppers for quantitative limits, MoneyInput with currency/period, addons MultiSelect, lifecycle switch where allowed, version diff and affected-customer preview.
- **Order refund page:** MoneyInput with exact refundable balance, full/partial SegmentedControl, reason, provider state, previous refunds, irreversible final confirmation. Not a quick modal.
- **Staff permissions editor:** hierarchical PermissionMatrix with role defaults, explicit exceptions, search, change diff, step-up for elevation; never a giant undifferentiated checkbox page.
- **DNS records editor:** per-record typed form, copyable recommended records, verification status, propagation guidance, pre-save validation and preview.
- **Bot editor:** 3-pane flow builder with node palette, canvas, inspector, simulator, versions and publication review; no cramped popup.
- **Automation editor:** trigger builder, condition groups, action pipeline, business hours, dry-run simulator and execution history; prevent loops.
- **Email template editor:** subject, HTML/Markdown/plain text, variables autocomplete, preview modes, test-send separate action, version and publish review.
- **Pricing editor:** precise MoneyInput, percentage and duration controls, comparison with previous values and active subscriptions, VAT/currency rules.
- **Knowledge editor:** Markdown/rich text + inline preview, SEO metadata, category selector, language, visibility and publish state.
- **Abuse enforcement page:** target case and service, allowed state transitions, evidence, action, reason, confirmation and audit; case status enforced by backend.
- **Settings edit:** use per-setting typed widgets, inherited values, owner and effective value, safe diff and restart/rollout consequences.

## 6. Microinteraction contract

- Hover surfaces: subtle background/border/elevation change, not glowing novelty. Table rows reveal meaningful controls but preserve keyboard access.
- Button press: small tactile transform only if reduced motion off; loading swaps label to stable-width content; failure returns to actionable state.
- Dropdown menus: 120-180ms fade/slide, proper collision positioning, keyboard focus; no clipping under sticky headers.
- Tabs: instant content switch with subtle short opacity transition; accessibility state correct and preserve scroll when needed.
- Filter chips: small enter/exit animation respecting reduced motion; updates not considered committed until server fetch result.
- Toaster: one meaningful message; no fake success, not sole indication for important operation.
- Confirm screens: reason, review summary, final outcome; never mark provider job complete at enqueue.
- Do not let decorative animations delay admin-critical actions. Avoid haptic claims in web UI.

## 7. Component architecture and reuse

Create a coherent \`web/src/admin/components/\` and \`web/src/admin/forms/\` module set, **wrapping existing \`ui-app.tsx\`** where possible. Shared /admin-only components should not leak admin fields/permissions into /app. Public/customer shared primitives can be extracted later after /app audit.

Each component must have:
- typed props and controlled form contract;
- loading/disabled/read-only/required/invalid states;
- clear keyboard/ARIA semantics;
- responsive width handling;
- safe server validation and error UX;
- at least one unit/component test and component gallery example;
- no fabricated data or fake click handlers;
- visual snapshots at dark theme and narrow mobile viewport;
- a clear owner and documented usage examples.

## 8. Dedicated component gallery

Before migrating all admin pages, create a **dev-only / internal-only** sandbox for these components, linked behind an existing staff/dev guard or Storybook if justified. Never expose live private data. Build scenarios:
- default, focus, hover, pressed, disabled, loading, error, empty, long text;
- keyboard-only; 320, 390, 768, 1440;
- reduced motion and 200% zoom;
- server max/min for number controls; empty/NaN intermediate input; invalid step; money fractional amounts; duplicate options;
- group borders at first/middle/last and responsive overflow;
- high-density table with 0/1/50/1000 rows through server fixtures;
- async combobox race, slow network, forbidden result;
- permission-sensitive control hidden/disabled appropriately, matching API;
- creation page Save/Discard, unsaved changes navigation guard and conflict merge.

**Do NOT claim complete until component gallery tests and actual browser screenshots pass.**

## 9. Migration priorities

Phase 1: ButtonGroup, ActionMenu, NumberStepper/UnitStepper, SearchInput, Combobox, FilterToolbar, unified DataGrid, ResourceHeader, DetailTabs, form page layout.
Phase 2: Customers + Orders + VPS: these expose the largest existing UX gains and prove the system works under customer/service/payment constraints.
Phase 3: Product/Pricing/Mail/Staff editors on dedicated routes.
Phase 4: Support Bots/Automations/Knowledge, Abuse/Incidents, Operations/Notifications/Settings.
Phase 5: Entire 35-route visual/functional/security/permission regression; no lost controls or hidden data.

Maintain a table mapping each old edit button to its new destination route. Never delete any control simply because its editor moved.

## 10. Done definition

- Every existing primary admin view uses the shared vocabulary of action buttons, toolbar, filters, metrics, tables, states and page layouts.
- Every create/edit flow for persistent resources has a dedicated URL and supports direct reload, correct field validation, save/discard, dirty state, permission and history.
- Correct server-backed resource constraints and financial formulas, not invented frontend defaults.
- No operation disappears. No new page requires hundreds of vertical-scroll lines to reach the ordinary action.
- All 35 existing /admin paths remain routable plus additive editor detail paths, and tested with fixtures.
- Source-level plan alone is not the same as tested implementation. /app starts only after admin design and code are accepted.
