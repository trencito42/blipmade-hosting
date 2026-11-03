# Customer App 3.0 — Visual/Responsive Source Audit

**Snapshot:** main 3770515b4a5122fb83f27728ad1f6507e61d1bb2 on 2026-11-03. **Method:** analysis of React components, CSS class patterns, route hierarchy and provided earlier screenshots of /app/mail and expanded email domain. No authenticated browser session available and no new 21-route screenshots executed. This is a **complete route-by-route static visual critique and staged test plan**, not a live visual pass.

## Overall observed style and issues

Current customer area already shares strong Blipmade tokens, fonts and unified AppShell with Admin. It has real higher-function components, not merely empty design: desktop DataTable and mobile CardList, segmented tabs, file explorer, code editor, VPS serial console, security/passkeys, complex Deploy wizard and MailDomainPage. **Preserve these.**

The main UX inconsistencies are not lack of cards but **overgrown single-page workflows and inconsistent density**: long billing/settings pages, inline forms on domains, modal-based ticket/mail creations, action-heavy VPS tabs, and no shared premium controls despite specialized CPU/resource steppers in InstanceDetail. Design the right shared layer, not a new library of unrelated widgets.

### Evidence from user's earlier screenshots
- Email overview screenshot: subscription, add-domain form, plan change and domains competed for vertical attention. Current source has since been split into `mail/MailOverview.tsx` and separate domain page, so do not assume old screenshot still reflects running production.
- Expanded mail-domain screenshot: long inline mailboxes/aliases/DNS and ambiguous Close behavior. Current route `/app/mail/domains/:id` now exists. Verify deployed revision and replace remaining complex create/plan-change dialogs with dedicated URLs.
- Other screenshots supplied were from /admin, not evidence of /app; do not attribute their defect to current customer pages.

## Per-view visual requirements

| Route | Layout pattern and current concern |
|---|---|
| `/app` | **Overview compact / attention first:** Current 4 Panels, instance-centric recent activity; top fold should contain actionable service summary and billing alert, not multi-card welcome. |
| `/app/instances` | **Service data grid:** Already desktop DataTable+mobile CardList. Enhance compact filters and entire resource family filters, no huge voucher panel. |
| `/app/instances/:id` | **Instance workspace:** Current extensive tab UI. Sticky resource identity/state and power group; keep console & files full-height; focused settings pages. |
| `/app/instances/:id/:tab` | **Deep-linked tool workspace:** Avoid giant panels when tab has no data; preserve direct tab URLs and focus; file editor safe on mobile. |
| `/app/deploy` | **Catalog & discovery:** Current category chip/input/native select. Premium filter bar, product comparisons, clear plans and search. |
| `/app/deploy/:slug` | **Full-page purchase wizard:** Current massive 1373-line form/stages. Strong stepper, server quotation, progress, no scrolling through future steps. |
| `/app/domains` | **Domain grid:** Current inline Add Domain and expanded per-domain DNS cards; move to /new + /:id, typed records and concise rows. |
| `/app/mail` | **Mail overview:** Recently split into MailOverview. Compact subscription summary and domain table; move plan-change/add-domain dialogs to pages. |
| `/app/mail/domains/:id` | **Mail domain detail:** Existing dedicated page with segmented tabs. Keep, improve DNS/mailbox/alias tables and dedicated create/edit routes. |
| `/app/servers` | **Legacy redirect:** No standalone visual layout; verify redirect to /app/vps and browser history. |
| `/app/servers/:id` | **Legacy redirect:** No standalone visual layout; verify server ID preserved to /app/vps/:id. |
| `/app/vps` | **VPS list:** Current VpsList in combined 1118-line module; compact status/OS/IP/renewal row, filter; no giant server card controls. |
| `/app/vps/new` | **VPS checkout:** Already full page and plan radio choice. Better compare cards, SSH key input, quoted term and provisioning progress. |
| `/app/vps/:id` | **Server workspace:** Current console/graphs/activity/contract/network/usage/snapshots/ISO/settings/reinstall tabs. Contextual actions, no all-at-once vertical stack. |
| `/app/email/checkout` | **Mail purchase wizard:** Already dedicated full page; plan compare, domain validation, correct quote and next DNS steps. |
| `/app/billing/invoices/:id` | **Invoice reading/print:** Already independent invoice route; print preview, legal totals, download only if real PDF endpoint exists. |
| `/app/billing` | **Billing control center:** Current stacked Closed services, Payment method, Subscriptions, Pending orders, Invoices. Replace with concise overview and URL tabs. |
| `/app/tickets` | **Ticket inbox:** Current responsive DataTable+CardList, New ticket big modal. Move new ticket to /app/tickets/new; keep list focused. |
| `/app/tickets/:id` | **Conversation:** Current Status/Conversation/Reply panels. Keep composer sticky near latest messages, virtualized/paged thread as needed. |
| `/app/settings` | **Settings directory:** Current 1088-line tabbed profile/billing/password/session/notifications/closure plus security panels. Dedicated focused pages, searchable categories. |
| `/app/notifications` | **Notification inbox:** Already cursor paging, read/unread filters, mark/delete. Preserve, improve grouping/link status and safe overflow. |

## Proposed responsive UX grid
- **Desktop 1440x900:** sidebar 224–264 CSS px, compact header, focused page header, one-row toolbar, listing first 8–12 visible rows. Exact dimensions adjusted to current design tokens and text legibility.
- **Laptop 1024:** collapsed sidebar option; critical resource/actions visible, no horizontal page scroll.
- **Tablet 768:** compact cards or responsive table if space allows; right context panel folds under or into read-only info tab.
- **Phone 320–430:** 44px touch targets, safe-area-aware navigation and sticky edit footer, no hidden destructive actions; show compact identity/status/next action; tabs horizontally scroll with clear active state.
- **200% zoom:** controls still reachable, no clipped dialogs or split buttons, form sections stack, keyboard focus visible.
- **Console/File editor:** internal scroll and clear fullscreen option; mobile keyboard does not conceal command input or Save button.
- **Motion:** quick utility transitions 150–220ms, larger navigation ~250ms; reduced-motion disables decorative motion.
- **Contrast:** verify WCAG 2.2 AA with automated contrast/axe and manual assisted review, don't infer passes from static styles.

## Content-density rules
1. Overview is not a marketing landing page: show real account health and next actions.
2. List view should not display 7 permanent Create forms.
3. Single resource detail header remains informative even after scrolling.
4. Keep full text accessible through clipboard/detail; don't cut IDs without copy affordance.
5. Each list error/loading/empty/no-permission separate; a provider error must not render as "0 servers".
6. Dangerous action in Settings/Danger Zone, not prominent red button in every row.
7. One-time credentials require explicit secure reveal/copy and acknowledgement.
8. Never display a tab or action for an unsupported provider capability as though operational.
9. Payment quote, invoice and usage meters include units, source, billing period and data freshness.
10. Customer experience should have fewer technical audit controls than admin while preserving advanced capability.

## Actual visual sign-off still required (NOT RUN)

For each **21 route**, at six viewports 320/390/768/1024/1440/1920:
- authenticated user context with seeded resources or matching plan;
- 0/1/many records, long names and noisy notification histories;
- loading/error/forbidden/provider stale, slow network;
- direct reload, browser back/forward and in-app links;
- sidebars, dropdown collision, slider/stepper key handling, focus traps, screen readers, labels;
- copy/secret/password/deploy and checkout UI using sandbox fixtures;
- filesystem/ticket attachments/terminal at narrow touch sizes;
- URL legacy redirects, correct deep links;
- role variants owner, delegated manager and viewer;
- screenshots before/after and redacted artifacts.

A Playwright scenario collector may be added as staging-only tooling. Do not mark UI as visually verified until browser artifacts and execution results exist.

**Source-level audit complete; live visual testing blocked by lack of authenticated staging/browser access in this chat.**
