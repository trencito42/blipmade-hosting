# Admin visual and responsive audit: 35-route source inspection + screenshot evidence

**Source snapshot:** 48df705f110b46f7d2a7d90ef33e0cd0a289f74c. **Screenshots:** 8 screenshots provided in this conversation, corresponding to old Support Queue, Abuse Reports, Customer Email Overview/Domain expanded, Customers list, Customer Detail, Orders list and Order Detail. Screenshot dates correspond to 2026-11-02; current main was modified afterward. **No screenshots of the other routes were available.** No authenticated production browser context was accessible from this session. Browser tool returned context unavailable, and the working container has no external DNS/network to open blipmade.com. Therefore **this is NOT a 35-page live visual certification**.

## Measurable design findings in supplied screenshots

1. **Customer detail, ~1161×2048 capture:** the first fold reveals identity/access/tools/risk, while subscriptions, game panel, instances, invoices, tickets and orders continue much further down. Empty records consume one large panel each. Current main has introduced five tabs, so the specific old stack is not the current code's default state, but sub-tabs and missing VPS/mail still need scrutiny. Severity P1, evidence screenshot + current component.
2. **Order detail, ~1113×2048 capture:** payment/invoice and notification sections are compact, but the audit feed takes much of the lower screen with repetitive sign-in/settings entries. Current source has now separated collapsed order/account activity; still need separate backend paged queries to avoid a 100-event mixed cap. Severity P1.
3. **Customers list, 1920px screenshot:** role, tag and search each use a full-width row, wasting valuable vertical space before the table. Name/email, counts and monthly value are readable, but lack of advanced grid/filter surface and incorrect MRR metric degrade decision-making. Existing UI code has added cursor pagination. Severity P1.
4. **Orders list, 1920px screenshot:** useful compact rows, but full-refund actions are repeated as prominent red buttons and minor actions are scattered. Prefer contextual actions, purpose-specific chips and true refund eligibility. Severity P1.
5. **Support queue, 1920px screenshot:** old narrow ~360px list and empty right side waste most of viewport. **Stale compared with current TicketInbox implementation**. Verify production version and test new source layout before changing it. Severity P1 if still deployed.
6. **Abuse, 1920px screenshot:** dismissed report still visibly offers suspend; **stale compared with current API state machine** that rejects closed-case suspension. Runtime E2E of the actual production build needed to establish whether defect remains. Security concern if stale deploy; not a proven current backend bug.
7. **Customer mail overview, 1920px screenshot:** repeats domain state and presents permanent Add Domain and Change Plan forms, causing unnecessary content density. Route belongs under /app and is **out of scope for modifying /admin now**; retain evidence for follow-up /app audit.
8. **Customer mail expanded domain, ~1754×2048 screenshot:** giant inline management area with mailboxes/aliases/DNS and no easy context switch. This is a /app concern, not evidence of /admin/mail component. Do not conflate the two.

**Screenshots stay private.** They contain customer and company information; don't upload them to the repository as audit assets without redaction and owner approval.

## All admin pages: current visual evidence vs required correction
| Route | Evidence | Issue / required target |
|---|---|---|
| `/admin` | Static only | KPI spacing/metric definitions, clickable incident queues; validate 1440-wide empty + overloaded data. |
| `/admin/customers` | Screenshot + current source | 3 stacked filters in screenshot; compact 1-row desktop advanced filtering, row hover, pagination; recent UI now has cursor controls; validate responsive. |
| `/admin/customers/:id` | Screenshot + current source changed | Long screenshot of >11 vertical cards and repeated giant empty states; current main **now has 5 tabs**, not pictured; verify tab overflow, empty tabs, missing VPS/Mail and URL-synced tab. |
| `/admin/orders` | Screenshot + source | Rows are readable, but per-row Refund prominences and low-density button area distract; current main has search + pager; confirm zero-value status state and refund eligibility. |
| `/admin/orders/:id` | Screenshot + source | Long audit timeline dominates screen; current main has separate collapsed recent order/customer activity; verify 100-row truncation and only relevant event context. |
| `/admin/services` | Static only | Full service grid vs repeated import/edit panel; compact status, owner and node; empty states with actionable link. |
| `/admin/services/:id` | Static only | Commercial chain vs operational controls in tabs; sticky clear summary, avoid raw provider identifiers dominating. |
| `/admin/vps` | Source only | Action-heavy per-VM cards, large forms and destructive actions; table + dedicated VPS detail is essential. |
| `/admin/products` | Source only | Large inline forms/product editor; separate searchable catalog list from item editor. |
| `/admin/pricing` | Source only | Rates, add-ons, discounts, price history all on same broad surface; tabs, preview and safe review. |
| `/admin/support/analytics` | Source only | Metrics + SLA editing; split view into Analytics and Policy tabs; explain p50/p95 and time zone. |
| `/admin/support/automations` | Source only | Rule list + business hours + execution history mixed; bounded runs and separate editor. |
| `/admin/support/bots` | Source only | Bot list, canvas, flow editor, versions/import/simulation stacked; dedicated editing workspace with 3-pane layout. |
| `/admin/support` | Source only | Conversation inbox plus guest/dept/staff profile settings below; move settings to dedicated section; full-height inbox, not an endless page. |
| `/admin/tickets` | Screenshot obsolete + source | Screenshot shows 360px queue with unused desktop space. Current main delegates to new TicketInbox; validate updated design in browser before rebuilding. |
| `/admin/knowledge` | Source only | One view with editing workflow; article list and editor separate. |
| `/admin/tickets/:id` | Source only | Conversation thread with sidebar and attachments can grow; scroll message viewport, keep composer accessible and internal notes separate. |
| `/admin/promotions` | Source only | Creation form and campaigns grid compete for space; dedicated New modal/wizard. |
| `/admin/promotions/:id` | Source only | Settings + redemptions + audit; use tabs and paging. |
| `/admin/infrastructure` | Source only | Nodes and eggs side by side/stacked; operational provider status overview and details. |
| `/admin/incidents` | Source only | Incidents and announcements both in one view; separate publishing workflows. |
| `/admin/reports` | Source only | Graphs and metrics unscoped by currency/period; filter and drilldown. |
| `/admin/queues` | Source only | Queue actions need focused filter, error detail and confirmation for retry/purge. |
| `/admin/abuse` | Screenshot obsolete + source | Screenshot shows dismissed case with Suspend button; current main has new AbuseInbox + server actionAllowed state machine. Retest live deployed revision; don't claim still broken. |
| `/admin/abuse/:id` | Source only | Evidence, investigation, enforcement, notes and related cases; tabs or contextual panel with summary and timeline. |
| `/admin/ops` | Source only | 977-line ops view mixing alerts/health/backups/webhooks; health summary + tabs and critical first. |
| `/admin/mail` | Source only | 1589-line mail admin view with Mail health/domains/jobs/services/usage. Use tabs + domain/plan service detail; avoid nested giant cards. |
| `/admin/mail/plans` | Source only | 1123-line plan editor and catalog; plan list then detail editor. |
| `/admin/audit` | Source only | Audit table already cursor paginated and masking; add resource/correlation filters and inline detail without expanding all metadata. |
| `/admin/staff` | Source only | Permissions grid and staff listing same page; staff detail, scope diff and confirmation. |
| `/admin/settings` | Source only | Already tabbed; search/deep-link ownership, avoid raw advanced config in general operator UI. |
| `/admin/email-templates` | Source only | Template editor duplicate navigation alongside Notifications; rationalize template library, version preview. |
| `/admin/content` | Source only | Raw JSON editing advanced workflow; structured form for common blocks, preview. |
| `/admin/tools` | Source only | Dead-letter, reconciliation and mail repair in same page; tool catalog by risk with dry-run. |
| `/admin/notifications` | Source only | 2110-line notification module, many tabs but 6+ domains in same component; logical sections, route state, lazy data and partial failure states. |

## System-level visual risks inferred from current code
- `web/src/ui-app.tsx` already has a responsive desktop `DataTable` and mobile `CardList`. Reuse rather than bring a new table library without demonstrating need.
- Desktop DataTable wrapper has internally scrollable min-width; this prevents whole-page overflow but must expose accessible horizontal scrollbar and preserve important columns at 200% zoom.
- Existing app shell supports collapsible sidebar, command palette, persisted group expansion and mobile navigation. Verify active group and sticky elements at 320px/landscape.
- Tables with tiny typography and low-contrast tertiary text in screenshots may be unreadable at large text/low brightness. Measure contrast, don't assume screenshot alone proves WCAG failure.
- Font Awesome and tokenized colors are present. Keep one icon source, consistent sizing/baseline, purposeful icons.
- Long source files (Notifications, Mail, MailPlans, CustomerDetail, Ops) signal maintainability and overloaded workflows, not by themselves a visual bug.
- Main app's CSS uses dark charcoal/green and fixed spacing conventions; use same semantic tokens and avoid a full new palette.
- Highly destructive actions should move to context menu/detail, not disappear from users who hold permission.

## Exact visual acceptance plan for each of 35 routes (NOT EXECUTED)
At minimum, render each route for roles Owner, Tech, Billing, Support, restricted Viewer and Customer, where applicable:

**Widths:** 320, 375, 390, 430, 768, 1024, 1440, 1920 and 2560px. **Zoom:** 100%, 200%. **Modes:** keyboard, screen reader/axe, reduced motion, browser Back/Forward. **Data:** zero records, one, 50, 500+, 1000+ where relevant, long names/emails, many permissions, missing providers, errors and slow network.

Assertions:
- Visible purpose, one primary CTA, page breadcrumb, all status and count meanings.
- Content starts above fold, no redundant empty cards; scroll is bounded to intended tab/table/message list, not entire mega-detail.
- No full-page horizontal overflow or clipped actions at 320px; internal table scroll is discoverable.
- Dialogs within viewport and safe areas; focus trap and restore; accessible button labels and tab state.
- Every table has loading/empty/error states, sort/filter/pagination and sticky or visible headers appropriate to data.
- Mobile rows preserve critical fields and destructive actions remain gated but discoverable.
- At 200% zoom the screen works without inaccessible controls.
- Different staff roles see only allowed fields; private/reporter/security info does not leak in screenshots.
- Skeleton and no-permission/failed provider states do not impersonate zero data or healthy status.
- Compare before/after screenshots and manually sign off each route. Detect regressions using screenshot diff and axe; non-deterministic values masked.

## How to execute without production risk
- Existing project: `web/playwright.config.ts` (E2E uses `E2E_BASE_URL`) and `audit/_tools/route-inventory.mjs` (role coverage).
- Use staging with sandbox checkout and seeded test accounts. Store staff session fixtures only in a secure temporary directory; never commit.
- Suggested commands after checkout and setup: `cd web && npm ci && npm run build && npx playwright test`, plus API unit/integration suite separately; actual commands/config may require database/Redis/edge.
- For evidence collector, create a Playwright screenshot harness that iterates 35 direct URLs and state fixtures, emits JSON and screenshots to CI artifact with PII redaction.
- Do NOT run privileged/dangerous actions (delete VPS, refund live customer, webhook replay, backup restore) just to generate a screenshot.

## Audit status
**Complete:** source-level 35-route visual architecture review; inspection of 8 user-provided screenshots and verification of old-versus-new source differences.  
**Incomplete due to inaccessible environment:** live rendering of 35 views, browser interaction, 9-width screenshots, axe results, contrast measurements, keyboard navigation, deployed revision matching, performance profiling, role-based screenshots. These require staging/browser access before honestly marking visual audit "fully verified".