# App 3.0 — Global AppShell + Editor Page Layout Repair

**Type:** product-owner visual QA finding, 2026-11-03. **Priority: P1 cross-cutting UX**, not a one-off email page tweak.
**Status:** implementation specification, not implemented or browser-verified by this document.
**Scope:** all existing and future full-page customer create/edit/review/configuration workflows, and the shared customer shell/short-page legal footer. Reuse generic patterns later for Admin 3.0, without altering admin navigation/permissions during the customer work.
**Evidence:** user-provided desktop screenshots of deployed \`/app/settings/email/change\` (same problem reportedly appears across editor pages). Screenshots show a duplicated page title, separately located Back link and eyebrow, oversized empty region, legal footer placed immediately after a very short form, and a viewport-fixed Save/Discard strip detached from the page composition. Do not copy personal emails/other screenshot PII into fixtures or commits.

## Exact current source causes to review

1. \`web/src/routes.tsx\`: each registered customer route passes \`route.title\` to \`AppShell\` regardless of whether it is a dedicated editor.
2. \`web/src/ui-app.tsx\` \`AppShell\`: sticky global top bar renders an \`<h1>\` with \`{title}\`. The customer content lives in \`<main>\`, followed by legal \`<footer>\` in normal document flow. The shell is \`min-h-[100svh]\`, but the main column is not a flex vertical region that pushes the legal footer to the bottom on short pages.
3. \`web/src/app/components/premium.tsx\` \`PageEditorShell\`: creates a **second** \`<h1>\` and its own Back link, then \`<footer className="fixed inset-x-0 bottom-0 ... md:left-[var(--bm-sidebar-width,0px)]">\` for every page, including a one-field email form. It is positioned against the viewport, not the content grid. Hard-coded \`--bm-sidebar-width\` may disagree with the \`AppShell\` sidebar width or be unset.
4. \`AppShell\` mobile bottom navigation is also viewport-fixed. The editor action footer is another fixed layer at \`bottom-0\`, creating overlapping controls or ambiguous keyboard/safe-area behavior at narrow widths.
5. \`web/src/app/SettingsEditors.tsx\` is one example; **do not fix only this component**.

## Desired page hierarchy: one title, one way back, one action system

### A. Default/list/detail pages
- Keep the existing top bar (page title, global search, theme, notifications), parent navigation, phone navigation and legal footer.
- Current page lists, consoles, ticket conversations and dashboards continue to work.
- Do not indiscriminately remove the global header or footer to make editor screenshots look cleaner.

### B. Dedicated editor/create/config/safety pages
- **One visible primary \`h1\` only**. Keep the specific action title inside the editor content, e.g. **Change email address**.
- The **sticky global top bar** switches to editor mode. Its left side shows an accessible **Back to Settings** (or parent resource/list) control and optionally a compact hierarchical breadcrumb such as \`Settings / Account\`; the right side retains appropriate global search/theme/notifications. It must not duplicate the page title.
- The editor body contains a small context eyebrow (e.g. \`ACCOUNT\`), its single large \`h1\`, contextual description, then primary form and optional aside. No second Back control immediately above this \`h1\`.
- Back must work on direct deep-links, not depend exclusively on browser history. It must be an actual authorized parent URL with a dirty-form guard. For resource editors it can be \`Apps & databases > [resource] > Settings\` context, not a generic hardcoded \`/app\`.
- Browser document title remains \`Change email address · Blipmade\`, even when the sticky header renders parent context rather than another visible \`h1\`.
- Sidebar active state should highlight the parent category (Settings, Domains, Email, Apps, Billing), including deep links, without creating many new sidebar entries.

## C. Proposed reusable implementation architecture

Do NOT patch dozens of pages by hiding text. Implement a consistent contract between \`routes.tsx\`, \`AppShell\`, and \`PageEditorShell\`:

- Add explicit route metadata (e.g. \`layout: "editor"\` and \`parent: {to,label}\` or equivalent typed mechanism), or a robust shared editor route config, instead of brittle substring/regex route guesses.
- \`AppShell\` accepts the view variant and context. In editor mode the top-bar left area becomes a Back control/breadcrumb, **not** \`<h1>{title}</h1>\`; the main editor \`PageEditorShell\` retains the one \`h1\`. Keep accessible top-bar icon actions.
- \`PageEditorShell\` should use the same parent link supplied by the route metadata (or derive it from a canonical typed editor context). Avoid two independently configurable Back targets that drift apart.
- Preserve existing \`PageEditorShell\` public API where possible, or migrate every call site as one coherent change with tests.
- Avoid nested landmark confusion (global \`main\` containing another \`main\`, global \`footer\` plus independent page-wide \`footer\`). Prefer semantic sections/forms and an action region in the editor; only one page-level \`main\` and one global legal \`footer\`.
- Preserve \`beforeunload\` and SPA unsaved-change behavior. Back, Escape, sidebar clicks, mobile sheet links, history, and Save/Discard must all respect dirty state.

## D. Short-page height and legal footer (global)

- The shell's content column must fill at least the available viewport height with a vertical flex layout: top bar, **flex-growing content**, legal footer.
- On very short pages, the legal links appear near the **bottom of the available content area**, not immediately under the first input. Leave natural breathing room, but do **not** add arbitrary huge pixel spacers or rely on \`position: fixed\` for the legal links.
- The footer must remain after the article/content on long pages, reachable by natural scrolling. Account for the mobile navigation and editor action region when assigning bottom padding/safe area.
- The legal footer is separate from Save/Discard. Their appearance and placement must be deliberately coordinated; no legal links behind sticky actions or outside the scroll area.
- Avoid duplicate legal footers on nested routes. Do not remove Terms/Privacy accessibility simply to hide the problem.

## E. Save/Discard behavior: one shared policy, two variants

**Short forms** (e.g. one-field change email, small billing settings, simple alias):
- Primary and secondary actions appear **in or immediately after the form/editor content**, aligned to the content grid and field edge; do not pin a page-wide bar to the bottom of a tall desktop viewport.
- If the owner wants a fixed action placement on short pages, use a bounded editor card footer in normal flow; never a globally detached full-viewport bar.
- Show unsaved state only when it actually matters. \`No unsaved changes\` permanently at bottom of all pages adds clutter. Disable Save appropriately, show success/error near form.

**Long/multi-section forms and safety reviews**:
- Provide a single **sticky action region** using layout-aware positioning, aligned to the **editor content column**, with clear Discard / primary action and optional dirty/pending/error status.
- Sticky, not blanket \`fixed inset-x-0\`: avoid crossing the sidebar boundary, footer, cookie dialog, chat widget or phone navigation.
- Reserve enough scroll space that last input and legal links are never hidden. Keep stable button order and responsive widths; minimum 44px touch targets.
- Don't force Save wording on actions such as \`Send confirmation link\`, \`Create ticket\`, \`Restore backup\`, \`Reinstall\` or \`Cancel subscription\`.
- Disable / loading / error / queued state reflects the real API outcome. Preserve current dirty guard, idempotent retry and validation.

**Mobile overlap resolution must be designed once**:
- Recommended option: hide the standard floating bottom *app navigation* **only while in an editor flow** and provide the explicit parent Back control in the sticky header; show a bottom action bar safe-area-aware, or inline actions for short editors. The user must always retain a way to return to root through Back/breadcrumb.
- If bottom nav remains on editors, sticky actions must be placed above it and both must be keyboard-safe; no two competing fixed bars.
- Test opening software keyboard, iOS safe areas, viewport resize, sticky action focus and chat widget overlap.
- Normal /app pages keep their mobile bottom navigation.

## F. Spacing / width / density

- Use existing Blipmade dark theme, design tokens, Hanken/Bricolage typography, Font Awesome icons and radii. No generic redesign/new CSS kit.
- Form width should be proportional to task. A one-field email editor should not stretch nearly 1100px as a huge card. Center/align form with max width, with optional narrower context aside (also constrained).
- Complex resource forms may use a wider split grid or sticky review rail, but content should share an optical left alignment with title/toolbar. Avoid empty canvas on ultra-wide displays.
- Global top bar, content grid, sidebar and action region should use shared width/spacing variables. Don't calculate \`md:left\` with a CSS custom property that is not guaranteed to be defined.
- Use consistent focus-visible states, hover, reduced motion, keyboard tab sequence and screen reader names; no color-only status.
- Keep responsive baselines at 320, 390, 430, 768, 1024, 1440 and 1920 CSS px, plus 200% browser zoom.

## G. Examples / acceptance

**Email editor desktop at 1440×900**:
- The top bar says \`← Settings\` (or \`← Back to settings\`), with global icons right aligned.
- Main content: a small \`ACCOUNT\` context, **one** \`Change email address\` h1, description, bounded input form, a compact Current address panel, action aligned with form.
- No second heading at top, no standalone Back link between repeated headings.
- Short-page Terms/Privacy sits near the bottom of the content column, outside the action region.
- No full-screen-width Save/Discard strip pinned to the browser bottom in desktop short-form mode.

**App instance backup/restore & Git editors**:
- Header back target is that instance's Backups/Git tab, not generic Settings.
- Large forms use bounded sticky bar where justified; confirmation buttons and current status never obscured by sidebar / global footer.
- Destructive prompts remain full-page with exact target confirmation and security validation.

**Ticket and domain create**:
- Same one-title/one-Back behavior, legal footer push and correct action placement. Don't lose attachment upload progress/dirty guard.
- Preview for short forms should be lightweight; avoid stretching forms.

**Mobile 390px**:
- No horizontal overflow, bottom action conflict with navigation/chat/cookie popup, keyboard obscuring Save, overlapping tap targets or scrolling trapped behind a fixed footer.

## H. Regression tests, no false claims

- Unit/component tests for new typed route metadata and AppShell/PageEditorShell variant contract.
- Playwright with seeded customer sessions: at least email, billing address, password, new ticket, new domain, mail domain, mailbox, instance settings, DB create, backup restore and cancellation page (use read-only screenshot or mocks for destructive).
- Assert exactly **one visible \`h1\`** on dedicated editor pages. A single page-level \`main\`/content landmark, unique Back control, correct parent route, accessible name and document.title.
- Snapshot/layout assertions for **short and long pages** at 320/390/430/768/1024/1440/1920, 200% zoom and narrow laptop; include viewport-wide overflow, footer reachability/position and action toolbar bounding rect; include keyboard open / safe-area mobile.
- Verify dirty back guard, Save/Discard once, no duplicate requests, no lost queued service state; small forms inline actions, long forms sticky actions, never overlay footer or global bottom nav.
- Existing sidebar and responsive navigation still work for all 21 original routes and all new editors. Confirm no regression in Admin area from shared shell changes.
- Run build, TS, unit and E2E. Record exact results and screenshot evidence. **A passing static test does not prove browser layout.**

## I. Implementation sequencing

1. Fix the global shell/editor relationship **before creating further dedicated edit routes**, to avoid spreading the broken pattern. This is a cross-cutting foundation fix, not a re-audit or abandonment of the App 3.0 phases.
2. Update all existing editor call sites consistently, not just \`SettingsEditors.tsx\`.
3. Validate with layout screenshots and focused tests.
4. Continue remaining App 3.0 routes in the canonical IMPLEMENTATION-QA order. Avoid touching unrelated admin logic or deployment configuration.
5. Report the concrete changes, screenshots/tests and any blockers; do not claim deployed until live build version is confirmed.

**Definition of done:** every existing and future full-page editor uses one coherent hierarchy, parent navigation, well-positioned actions, responsive footer and safe dirty-guard flow. A change limited to the email page is explicitly insufficient.
