# BLIPMADE CUSTOMER APP 3.0 — CANONICAL IMPLEMENTATION BRIEF

**For ChatGPT Work / Codex** with repository read/write and executable staging environment.
**Repository:** trencito42/blipmade-hosting
**SINGLE WORKING BRANCH:** audit/admin-master-spec-20261103, PR #17. Do not create separate branches per subpage or overwrite newer main changes. Reconcile before working.
**Scope:** ALL of /app, 21 currently registered customer routes, all associated API/workflows, plus additive dedicated create/edit/detail routes. This brief is intended after the product owner has approved the planned Admin 3.0 foundations. Do not weaken /admin work while moving reusable UI primitives.
**Important:** the existing documents are the complete design plan, not implementation. Do not claim the frontend or APIs are already transformed.

## Mandatory read order

1. audit/app-master-2026-11-03/README.md
2. **PRODUCT-DESIGN.md**: premium 2026-style customer design and specialized interactive component contracts.
3. **VIEW-MATRIX.md**: all 21 routes, actual source modules, already working features, defects and final screen architecture.
4. **EDITOR-ROUTES.md**: 31 workflow families mapped to full-page persistent create/edit/config and safety review destinations.
5. **FUNCTIONAL-SECURITY.md**: customer permissions, payment/provider integrity, one-time credentials, event privacy and source findings.
6. **API-ROUTES.md**: static 18-module, 219-registration API inventory. Missing inline guard signal is NOT proof of open access.
7. **IMPLEMENTATION-QA.md**: phases, all route parity and hard QA gates.
8. audit/admin-master-2026-11-03/PREMIUM-COMPONENTS.md: shared admin premium primitives where safe; do not import admin privileges.
9. Current \`web/src/nav.ts\`, \`web/src/routes.tsx\`, all \`web/src/app/*\` and \`api/src/routes/*\`; recheck latest commit, not a frozen snapshot.

## End state

A clean, elegant, responsive, feature-rich hosting account dashboard with:
- Compact, actionable Overview, no endless panels.
- Product/plan comparison, visual resource steppers, exact billing quote, multi-stage checkout and truthful provider provisioning.
- Apps & Databases workspace with console, files, code editor, databases, backups, startup/env/Git, network, schedules, access sharing and activity, all preserved.
- VPS inventory and dedicated server workspace with accurate observed state, well-grouped power actions, snapshots, OS/ISO, network, graphs, contract and dangerous action review.
- Clear separation between website domains and email domains; ownership/DNS/SSL verification and record inspector.
- Email service selection, quota usage, domain/mailbox/alias management and mail plan changes on dedicated pages.
- Billing subscriptions, orders, invoices, payment methods, cancellations and renewals, all trustworthy.
- Support queue, full-page new ticket, clear conversation workspace, live chat and bots.
- Account/security pages for profile, MFA/passkeys, sessions, API keys, notification settings, privacy and account closure.
- Customer-visible Activity from a secure projection of **their own** business events, never a raw admin audit or invasive clickstream.
- Safe shared component system: ButtonGroups, SplitButtons, Number/UnitStepper, resource sliders, async search/combobox, contextual menus, grids, saved views, date/time pickers, money summary, secure secret viewer, DNS inspector, file explorer, code editor, upload manager and version diff.

## Critical non-negotiable editor and modal policy

- Every **meaningful persistent** creation, edit, provider configuration, purchase/plan change or destructive operation uses a standalone URL and **dedicated page** with breadcrumbs, form sections, validation, review and Save/Discard.
- No giant editor modal; no long inline add/edit forms under tables.
- Tiny confirmation, one-time password reveal, popover and ephemeral selection can use dialogs.
- Console, file editor and ticket reply are natural inline workspaces and should remain so. A one-line rename may use a small contextual control if entirely reversible and approved; otherwise dedicated page.
- Editors support browser Back/Forward and refresh, unsaved-draft guard, collision/409 recovery, permitted ranges from backend, no hardcoded price/steps, keyboard/mobile/accessibility.
- Do not litter the sidebar with editor routes; page context links and breadcrumbs handle them.


## IMPORTANT NEW PRODUCT-OWNER VISUAL QA REQUIREMENT (2026-11-03)

**Read and implement `audit/app-master-2026-11-03/GLOBAL-SHELL-EDITOR-UX.md` before migrating more edit pages.** The owner supplied actual browser screenshots showing a cross-cutting flaw: AppShell's sticky top bar repeats the PageEditorShell h1; the Back link is awkwardly placed between titles; the legal footer sits immediately under short pages; and PageEditorShell unconditionally renders a detached viewport-`fixed` Save/Discard strip that can conflict with the floating phone navigation. The remedy belongs in **`web/src/ui-app.tsx`, `web/src/app/components/premium.tsx` and explicit route/editor layout metadata**, not scattered per-page overrides.

**Acceptance:** one visible h1; parent Back in sticky header for editor routes; logical/accessible breadcrumbs; short forms have in-content actions; long forms may use a bounded sticky action region; short-page legal footer pushed toward viewport bottom without fixed positioning; no mobile keyboard/bottom-nav/chat overlap; preserve dirty guards and API behavior; screenshots and browser assertions for multiple old/new editors at mobile and desktop. Apply globally, including existing New Ticket, Domain, Mail, Instance, Billing and Settings editors. Resume the original roadmap after this foundation correction. **Do not implement only the email screenshot example.**

## Implementation work plan

### Phase 0: current baseline, data & feature parity
- Check latest main, PR #17 and already-merged PR #16; preserve current /app Mail split and ticket/abuse/support updates.
- Build exhaustive route/control/API/action parity matrix, with original -> new location -> exact backend endpoint -> permissions -> audit -> test.
- Capture authorized staging before screenshots for all 21 routes at 320/390/768/1024/1440/1920; use safe fixtures and never upload real user screenshots.
- Run typecheck, unit/integration tests and Playwright baseline, note failures (do not invent passes).

### Phase 1: premium UI kit
- Reuse existing Hanken/Bricolage/JetBrains typography, colors and Font Awesome icon abstraction, and proven ui-app.tsx primitives.
- Implement typed components from PRODUCT-DESIGN, especially combined resource slider+UnitStepper, ButtonGroup corners, PlanCards, QuoteSummary, DataGrid, AsyncCombobox, FilterBuilder, DNS inspector, security inputs and PageEditorShell.
- Add a safe component gallery (fixtures only) and test dark mode, 200% zoom, mobile keyboard/touch and reduced motion.
- Do not substitute native basic input/select where a purpose-built component is specified and improves UX.

### Phase 2: Overview, product discovery, deploy wizard
- Product-specific, step-aware full-page checkout/provisioning UI with server-calculated total, legal terms, payment and real provider state.
- Preserve all product variables, EULA, promo, billing address, region/node constraints and notifications.
- Never fake completed order when Stripe has not confirmed payment or worker has not completed provisioning.

### Phase 3: Apps and VPS
- Instances list with real scalable filters and direct details; preserve existing tabs and lazy-loading.
- Full-page resource/startup/env/network/DB/backup/schedule/Git/access config routes.
- Dedicated VPS controls, SSH key, snapshot, image/ISO and reinstall review pages, exact provider constraints.
- Safe file/code/console workspaces and secret/role boundaries.

### Phase 4: Domains, Mail, Billing
- Dedicated app-domain pages with DNS/TLS verification; distinguish mail-domain ownership.
- Preserve new /app/mail/domains/:id, replace plan/mailbox/alias create dialogs with separate forms.
- Subscription lifecycle, invoice, payment method and order detail flows, correct currency/refund.
- Deep links customer resource -> order -> subscription -> invoice/payment.

### Phase 5: Support, Notifications, Settings
- New-ticket dedicated page, conversation thread with sticky composer, attachments and service linking (app/VPS/mail).
- Ensure live chat/bot handoff works on mobile and does not block app navigation.
- Settings landing -> focused profile/security/passkey/MFA/API keys/session/privacy pages.
- Notification inbox status and deep links; no staff-only data to end-user.

### Phase 6: customer activity and QA
- Own-records-only Activity timeline with event types, timestamp/freshness, resource link and outcomes.
- No raw AuditLog or hidden internal staff notes.
- Execute end-to-end journeys, role/object authorization, billing sandbox, provider jobs, mobile visuals, keyboard/a11y and regression at all specified routes. Produce evidence.
- Ensure no existing route/control or data is deleted; 21/21 base route parity plus every new editor route.
- Do not merge to main, deploy or run destructive production tests without explicit approval.

## Specific gotchas in current repository

- /app/servers and /app/servers/:id are legacy redirects to /app/vps. Preserve the ID and query state.
- /app/instances/:id/:tab is a generic route; new specific edit routes must not conflict with it. Ensure router matches specificity or explicit route ranking.
- Mail was already refactored into /app/mail and /app/mail/domains/:id; don't undo this.
- /app/notifications already cursor-paginates. Do not rewrite working behavior as missing.
- /app/deploy, /app/vps/new and /app/email/checkout already use dedicated full-page purchasing flows. Improve them instead of nesting new checkout modals.
- Settings includes 2FA, passkeys and API keys; do not silently remove auth/security features while simplifying layout.
- InstanceDetail has sophisticated file manager, Git, credentials, backups and specialized tabs. Reuse their actual APIs and capabilities, do not build fake ones.
- Web UI should not claim an admin feature is visible to the client merely because its underlying Prisma model exists.
- User requested **premium 2026 UI and grouped controls**, but keep financial accuracy and security above decoration.

## Progress reporting

Record completed route, old/new control parity, new editor links, API changes, test commands+results, screenshot fixtures, assumptions, and missing backend capabilities after each phase. Use a persisted checklist. If execution runs out of context, leave exact resumable branch commits and honest status; do not claim finished.

### Done means
- Every one of the 21 original routes works, all proposed applicable edit routes implemented, all 9 nav destinations usable on desktop/mobile.
- No giant detail-page scroll to discover routine actions, no giant form modals, no basic/unstyled controls for complex operations.
- Every customer workflow remains functional and safe, including purchases, cancellation, provider operations, mail secrets, ticket uploads, account security and legacy links.
- Provider/financial state verified on test systems, permission tests pass and responsive/keyboard E2E pass.
- Full before/after gallery and rollback plan provided; owner review and approval before merge/deploy.

**After finishing /admin foundation, execute THIS /app implementation contract. Do not reinterpret a completed design document as completed frontend work.**
