# Blipmade — Design Prompt & Guidelines

Use this file as the source of truth for every Blipmade surface and release: `/` (site), `/login`, `/app`, `/admin`, `/docs`, `/status`, and anything added later. Paste **Part A** into the coding agent at the start of every task. **Parts B–E** are the reference it works from.

---

## Part A — Master prompt (paste this first)

> You are building a Blipmade surface. Blipmade sells **freedom to run any app without configuring a VPS**. We do not sell servers or RAM tables. The product is: pick an app, set resources, deploy, then manage it from one calm dashboard.
>
> Read `docs/BLIPMADE_DESIGN_PROMPT.md` fully and obey it. Reference implementation: `src/home/*`, `src/ui.tsx`, `src/index.css`.
>
> **Hard rules**
> 1. Tailwind v4 utilities only, with the tokens in `src/index.css`. No UI component libraries, no inline hex colors, no new colors. Inline `style` is allowed only for values computed at runtime (progress width, scroll transforms, animation delay).
> 2. Flat design. **No borders, no outlines for decoration, no shadows, no gradients, no backdrop blur.** Hierarchy comes from surface layers (`bg → s1 → s2 → s3`) and from one green accent. Focus rings are the only outline allowed.
> 3. Phone is a first-class design, not a shrunken desktop. Design the phone layout first.
> 4. Zero fake success. Anything simulated, planned or sample is labeled as such on the page. Never show live-looking numbers, stock counters or "success" that no backend produced.
> 5. Every data region has Loading, Empty and Error states. Every destructive action has a confirm step.
> 6. Presentation only unless told otherwise: do not change API calls, validation, auth, money handling (minor units) or `data-` hooks that tests rely on.
> 7. Copy is English, short, concrete. No "enterprise-grade", "unlimited", "blazing fast", no claims without proof.
>
> **Process**: plan the screens → build phone layout → build desktop → states → keyboard and screen reader pass → `npm run build` must pass → screenshot at 390 px and 1440 px and attach them → list deviations from this document and why.

---

## Part B — Identity

### B1. Positioning and voice
- Promise lines (rotate, never invent new ones): **Skip the server setup.** · **Start small. Scale freely.** · **Your apps, under your control.**
- Voice: calm, direct, developer-friendly. Short sentences. Say what happens, not how great it is.
- Never write: "enterprise-grade infrastructure", "unlimited performance", "deploy in 10 seconds" (unless measured and published), "Only 3 left!" (unless tied to real inventory).
- Product nouns: **App**, **Database**, **Instance** (a running app or database), **Resources** (memory, CPU, storage), **Dashboard**. Do not mix in "server", "VPS", "plan" except to say we replace them.

### B2. Logo
- Mark: the bracket-and-block symbol (`src/logo.svg`), wordmark `blipmade` in lowercase, weight 800, tracking −0.055em, 21 px in nav.
- The mark is off-white `#F3F6F2` with a green block `#6BE598`. Never recolor, stretch, outline or place on a green surface without switching to the dark variant.

### B3. Color tokens (single source: `src/index.css`)
| Token | Value | Use |
|---|---|---|
| `bg` | `#090A09` | page background |
| `s1` | `#121412` | panels, cards on `bg` |
| `s2` | `#1A1D1A` | items inside `s1`, inputs |
| `s3` | `#232823` | items inside `s2`, tracks, hover, pressed |
| `line` | `#303630` | **fill only** (slider tracks, skeletons). Never a border |
| `acc` | `#6BE598` | primary action, selection, focus, online |
| `acc-h` | `#85EDAB` | accent hover |
| `on-acc` | `#06130B` | text and icons on green |
| `acc-bg` | `#12291B` | tinted container that holds a flagship demo or grouped panels |
| `ink` | `#F3F6F2` | headings, primary text, inverted pills |
| `ink2` | `#A0A7A0` | descriptions |
| `ink3` | `#7B827B` | hints, placeholders, meta (min 4.5:1 on `s1`) |
| `bad` | `#FF6B6B` | errors, destructive |
| `warn` | `#F0B232` | caution, degraded |
| `con` / `con-ink` | `#050705` / `#C9D2C9` | terminals, logs |

Rules for green: it must **mean something** — the main action, the selected item, focus, an online/healthy state. If everything is green, nothing stands out. Max one green solid block per viewport besides the primary button. Errors are red, neutral information is `ink2`. Never use green for decoration.

Layering: put `s2` items inside an `s1` panel, `s3` items inside `s2`. Never put `s1` on `s1`. Large grouped areas (a flagship demo, a configurator) may sit on `acc-bg` with `s1` panels inside.

Selection language (consistent everywhere): **app/entity selected** = `bg-acc text-on-acc`; **option in a segmented set** (size, category, tab) = `bg-ink text-bg`; unselected = `bg-s2 text-ink2 hover:bg-s3`.

### B4. Typography
- Interface: **Geist Variable**. Numbers, prices, versions, ports, IDs, timestamps: **Geist Mono Variable**, `tabular-nums`.
- Display headings: weight 800, tracking −0.055 to −0.07em, leading 0.88–0.92, `text-wrap: balance`. Sizes `clamp(40px, 7vw, 100px)` for section titles, up to `clamp(60px, 13.4vw, 176px)` for the home hero.
- App UI (`/app`, `/admin`): calmer scale, headings 24–32 px weight 800, body 15–16 px weight 500, meta 12–13 px.
- Eyebrow: Geist Mono 12 px, uppercase, tracking 0.12em, green.
- Body min 16 px on phone. Inputs are **16 px minimum** on phone so iOS does not zoom.

### B5. Shape, spacing, motion
- Radii: tiles 12–14 px, inner items 16–22 px, panels 22–28 px, big containers 28–32 px, buttons/chips/inputs **full pill**.
- Page width 1280 px, side gutter 16 px (phone) / 24 px (≥ 640).
- Section rhythm: 64 px (phone) / 112 px (desktop). Inside panels 12–16 px between items on phone, 16–24 px desktop.
- Motion: micro-interactions **150–220 ms** (`ease-out cubic-bezier(0.2,0.8,0.2,1)`); entrances 220–320 ms; scroll-scrubbed scenes are allowed on marketing pages only. No bounce on app screens. Respect `prefers-reduced-motion` (everything static, content visible).
- Hover: never lift cards by more than 2 px. Change surface (`s1 → s2`) or reveal an action.
- Icons: one outline family, 1.6 px stroke, 16/18/20/24 px, `currentColor`. (Prototype uses `src/icons.tsx`; swap to Hugeicons with the same names when available.)

### B6. Core components (extend, don't fork)
Build these once in `src/ui.tsx` and reuse: `Button` (pri / ink / soft / ghost, md 44 px, lg 56 px, pill), `AppMark` (icon on flat tile; `lit` on green), `StatusDot` (pulsing when live), `Eyebrow`, `Headline` (line-by-line reveal), `Reveal`, `Wrap`, plus the app-area set in Part C. Touch targets ≥ 44 × 44 px.

---

## Part C — Rules shared by `/app`, `/admin`, `/docs`, `/status`

### C1. Shell
- **Desktop (≥ 1024 px)**: left sidebar 272 px on `s1` (rail 76 px when collapsed), top bar with breadcrumb + search/command (`⌘K`) + account menu. Content max 1280 px on `bg`. No dividers; separate with gaps and layers.
- **Phone**: top strip (logo, page title, account) + **bottom tab bar** (4–5 destinations, 56 px, `s1`, safe-area padded). Sidebar disappears. Detail pages open as **bottom sheets**. Tables become labeled cards.
- Active nav item: `bg-s2 text-ink` with green icon. Never a green bar or underline.

### C2. Data regions — always four states
1. **Loading**: skeleton shapes in `s2/s3`, no spinners over content, keep layout stable.
2. **Empty**: one-sentence reason + one primary action ("No instances yet. Pick an app.").
3. **Error**: what failed, what to do, `Retry` button, request ID in mono if available. Red tint only on the message, not the whole panel.
4. **Populated**: with partial data allowed (a metric may be unavailable → "—" plus tooltip "Metrics not available yet").

### C3. Forms
- Pill inputs, 56 px high (48 px dense), label above, helper below, error text replaces helper. `autocomplete`, `inputmode` and `type` always set.
- Inline validation on blur, summary on submit. Never clear the form on error.
- Destructive or irreversible: confirm dialog (sheet on phone) naming the target, button label states the action ("Delete wordpress"), requires typing the name for data loss.
- Money: store minor units, format with `Intl.NumberFormat`, always show currency and period ("€3.12 / month").

### C4. Honest status model
Every resource state is one of: `provisioning`, `online`, `restarting`, `stopped`, `degraded`, `failed`, `suspended`. Each has: dot color (green online, amber degraded/restarting, grey stopped, red failed), a text label (never color alone), and a next action. Purchased limits are shown as **limits**, never as live usage. If metrics are not wired, say "Not available yet".

### C5. Accessibility (non-negotiable)
WCAG 2.2 AA. Visible focus ring (`ring-2 ring-acc ring-offset-2 ring-offset-bg`). Full keyboard path, logical focus order, focus returns to the trigger when a dialog closes. Live regions for toasts, logs and progress. Contrast ≥ 4.5:1 for text. No info by color alone. Landmarks (`header`, `nav`, `main`, `footer`), one `h1` per page.

### C6. Phone rules
- Design 390 px first, test 320 and 430. No horizontal page scroll, ever.
- Primary action sits in a **sticky bottom bar** (price + button) on any step that ends in a purchase or save.
- Tables → cards with label/value pairs; filters → bottom sheet; row actions → sheet menu; long logs → full-height sheet.
- Lists scroll vertically; only chips and carousels scroll horizontally (and hide the scrollbar).
- Inputs ≥ 16 px; tap targets ≥ 44 px; no hover-only affordances (`@media (hover: none)` shows them).

### C7. Security and privacy in the UI
Never render secrets after creation (show once, copy button, then masked). Step-up auth before sensitive actions (API keys, payment methods, deleting data). Session and device list in account settings. No analytics on credentials or console content.

---

## Part D — Surface specs

### D1. `/login` (+ register, forgot, reset, verify, MFA)
Exists: `src/pages/Login.tsx`. Pattern to keep for every auth screen: left column with logo, centered form (max 420 px), right panel on desktop = green block with the promise line. Phone: single column, form first.
- Fields: email, password with show/hide. Links: Forgot password, Create account. Errors inline plus an `role="alert"` banner.
- Honor `?next=` only if it is a same-site relative path (starts with `/`, not `//`).
- MFA: 6-digit input, auto-advance, paste support, "Use a recovery code".
- Never reveal whether an email exists. Rate-limit messages are calm ("Too many attempts. Try again in 5 minutes.").

### D2. `/app` — customer area
**Purpose**: manage what I run, my resources, billing, support. The customer should always know: what is running, what it costs, what needs attention.

**Navigation** (sidebar / bottom tabs): Overview · Apps & databases · Domains · Billing · Support · Settings. Phone tabs: Overview, Instances, Billing, Support, More.

**Screens**
1. **Overview** — greeting-free. Top: "Needs attention" list (failed, degraded, payment issue, expiring) — hidden when empty. Then instance cards (name, app mark, status dot, URL, RAM/CPU/disk *limits*, monthly price). Then "Deploy something" shortcut into the catalog. Monthly total card.
2. **Deploy flow** (`/app/deploy/:slug`) — the same Studio logic as the homepage but real: app → configure (memory, CPU, storage, name, region if any) → review (price per month, renewal date, what happens next) → pay → provisioning timeline (pulling, allocating, starting, health check) → lands on the instance. Phone: stepper with sticky bottom bar. Providers/capacity off ⇒ block ordering and say why.
3. **Instance detail** (`/app/i/:id`) — header: name, status pill, URL, power buttons (Start / Restart / Stop). Tabs (segmented, `bg-ink` selected; on phone a horizontal chip row): **Overview** (limits, uptime, last events), **Console** (live logs + command input, 16 px input on phone), **Files** (browser + editor, upload queue), **Resources** (sliders, price delta, "Upgrade in place", effective date), **Domains** (add, DNS records to copy, verification states, SSL), **Backups** (only if the product offers them), **Settings** (name, env vars as key/value editor with masked values, delete with typed confirm).
4. **Domains** — list with state chips (`pending DNS`, `verifying`, `active`, `error`) and a copy-ready DNS table.
5. **Billing** — current month estimate per instance, payment method, invoices table (cards on phone), upgrade/downgrade history, cancel at end of period. Show tax and currency honestly.
6. **Support** — new ticket (subject, instance picker, description, attachments), ticket list with status, thread view. Show real expected response times only when published.
7. **Settings** — profile, security (password, 2FA, sessions, API keys shown once), notifications, team access if offered, danger zone.

**Always**: first-run empty state ("No instances yet. Pick an app.") with the catalog inline; confirm destructive actions; toasts for completed actions with Undo where possible; skeletons while fetching.

### D3. `/admin` — staff control plane
**Purpose**: operate the business safely. Higher density, same visual language. Dense mode: controls 38 px, body 14 px, tables as real tables on desktop.

**Rules**
- Visually distinct from `/app` so staff never confuse them: a permanent thin **role + environment strip** on top (`Staff · Production`), amber when production, grey for staging. Text, not just color.
- Role-based visibility: if a role cannot do something, hide the control and, where discoverable, show a disabled version with the reason on tooltip/sheet.
- Every mutating action: confirm with consequences ("This suspends 3 instances for customer #2041"), reason field when required, **audit log entry** shown afterward.
- Impersonation/"view as customer": loud banner, read-only by default, time-boxed, logged.
- Money and personal data: mask by default (`j***@example.com`), reveal on demand with audit.

**Screens**: Dashboard (orders today, provisioning failures, capacity, open tickets, payment failures) · Customers (search, detail with instances, invoices, tickets, risk flags, notes) · Instances (global list, filters by status/node/app, force actions) · Catalog (apps, versions, min resources, pricing, visibility, images) · Capacity & nodes (utilization, headroom, drain/maintenance) · Orders & billing (payments, refunds, disputes, tax) · Promotions (campaigns, caps tied to real counters — never fake scarcity) · Incidents & status publishing (writes to `/status`) · Support queue · Audit log (filter by actor/action/target, export) · Staff & roles · System settings (feature flags, providers on/off).

**Tables (desktop)**: sticky header, column visibility, saved filters, keyboard row navigation, bulk action bar (floating, appears on selection), URL-synced filters. **Phone**: cards with 3 key fields + status; filters in a sheet; admin on phone is for triage (read, acknowledge, suspend, reply), heavy editing may say "Open on desktop".

### D4. `/docs`
**Purpose**: let a developer succeed without contacting support. Calm, fast, searchable.
- Layout desktop: left nav tree (sections, collapsible), centered article (max 72 ch), right "On this page" rail. Phone: top bar with search and a "Contents" button that opens a sheet; no side rails.
- Search: `⌘K` / `/` focuses; results grouped by section, keyboard navigable, highlights matches; works offline from a prebuilt index.
- Article anatomy: title, one-sentence summary, **prerequisites**, steps (numbered, each with the expected result), code blocks, **troubleshooting**, "Next" links, last-updated date, "Edit/Report an issue" link.
- Code blocks: `con` background, Geist Mono 13–14 px, copy button always visible on phone, language label, line wrap off with horizontal scroll *inside the block only*. Never color-only diffs.
- Callouts: `Note` (s2), `Tip` (acc-bg), `Warning` (warn tint), `Danger` (bad tint). Icon + label, not color alone.
- Content map: Getting started (what Blipmade is, first deploy in 3 steps) · Apps (one page per app: what you get, minimum resources, first-run steps, env vars, backups, upgrading, FAQ — **no copy-pasted pages that only swap the name**) · Databases (connect string, ports, access rules, backups) · Resources & billing (what is billed, upgrades, cancel, invoices) · Domains & SSL · Files & console · Security (2FA, API keys, shared responsibility) · Troubleshooting · Changelog · Limits & fair use.
- Each app/database page doubles as an SEO landing: H1 "<App> hosting", what you get, requirements, price from, live **configurator** link, relevant FAQ.
- Never document a feature that is not shipped; mark planned items "Planned" in a neutral pill.

### D5. `/status`
**Purpose**: truthful, glanceable service health. Must stay up when the main app is down: static-first, minimal JS, separate deployment path.
- Top: one overall banner with plain words and a dot: `All systems operational` (green), `Degraded performance` (amber), `Partial outage` / `Major outage` (red). Timestamp "Updated 2 min ago".
- Components list (Website, Dashboard, Deployments, Apps hosting, Databases, Billing/checkout, Support): each a row with state dot + label + 90-day uptime bar (90 thin segments; hover/tap shows day, state, minutes affected; each segment has a text alternative via a table `<details>`).
- Active incidents first: title, state (Investigating → Identified → Monitoring → Resolved), time-stamped updates (newest first), affected components, what customers should do.
- Past incidents (last 90 days), scheduled maintenance with window in the viewer's timezone (show UTC too).
- Subscribe: email (and RSS/JSON feed). No account needed.
- **Honesty**: numbers come from real checks. If a data source is not wired, show "Sample data" banner. Never show 100% by default.
- Phone: single column, uptime bars scroll-free (fewer segments, 30 days) with a "90 days" toggle.

---

## Part E — Quality gates for every release

### E1. Definition of done
- [ ] Phone (390) designed and checked first; also 320 and 430; desktop 1440 and 1024.
- [ ] No borders, shadows, gradients or blur introduced. Only tokens from `src/index.css`; no raw hex in components.
- [ ] Loading / empty / error / populated states exist for every data region.
- [ ] Keyboard: every interactive element reachable, visible focus, Esc closes overlays, focus restored.
- [ ] Screen reader: landmarks, labels, live regions for async updates, no duplicate `h1`.
- [ ] Contrast ≥ 4.5:1 text, ≥ 3:1 UI; no color-only meaning.
- [ ] Reduced motion honored; durations within 150–320 ms; no infinite animation except status pings, carets and the hero float (all disabled under reduced motion).
- [ ] Simulated, sample and planned content is labeled on the page. No fake numbers, counters or success.
- [ ] Copy reviewed: English, concrete, no banned phrases (B1).
- [ ] `npm run build` passes (type-check + bundle). Page weight budget: JS ≤ 300 KB gzip home, ≤ 450 KB app.
- [ ] Screenshots at 390 and 1440, light motion off, attached to the PR.
- [ ] Deviations from this document listed with reasons.

### E2. Review checklist (what a reviewer rejects)
- A card with a border, shadow or gradient.
- Two green solids competing in one viewport, or green used as decoration.
- A table that is just squeezed on phone.
- A primary action hidden above the fold on phone.
- An empty list with no explanation, or a spinner that replaces content.
- "Success" shown before the backend confirms.
- Copy that sounds like marketing inside the app.
- A new component that duplicates one in `src/ui.tsx`.

### E3. Release rhythm
Ship by surface in this order: **Home + Login → App (deploy flow first) → Docs → Status → Admin**. Each release: update this file if a rule changed, keep a `docs/CHANGELOG.md` entry (what shipped, what is still simulated), and re-run the checklist above. Anything simulated in a release must have an owner and a date in the changelog for when it becomes real.

---

## Part F — Prompt templates

**New screen**
> Build `<route>` for Blipmade following `docs/BLIPMADE_DESIGN_PROMPT.md` (Parts B, C and D`<n>`). Goal: `<one sentence>`. Data: `<types / endpoints>`. Design phone first. Include loading, empty, error, populated states and the keyboard path. Reuse components from `src/ui.tsx`; add a new one only if none fits, and put it there. Output: code, screenshots at 390 and 1440 px, and a list of deviations.

**Review / polish pass**
> Audit `<route>` against Part E of `docs/BLIPMADE_DESIGN_PROMPT.md`. List every violation with file and line, fix them, rebuild, and re-screenshot at 390 and 1440 px. Do not change behavior, API calls or copy meaning.

**New app/database docs page**
> Write the `/docs` page for `<app>` using the D4 article anatomy. Include minimum resources, price from, first-run steps, env vars, backups, upgrade path, and three real troubleshooting entries. Do not copy another app's page. Link to the configurator and mark anything not shipped as "Planned".

**Status/incident update**
> Draft an incident update for `/status`: component(s), state (Investigating/Identified/Monitoring/Resolved), what customers see, what they should do, next update time. Plain words, no blame, no speculation.
