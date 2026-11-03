# Blipmade homepage 2026: audit, three directions, the choice

Branch: `design/homepage-2026`. Scope: `web/src/site/Home.tsx` and what only the home page uses. App and Admin are untouched.

## 1. Audit of the page that was live (screenshots in `before/`)

What is good and stays: the data layer (the page reads the live catalogue, the card of rates and the site content blocks, so no price is typed by hand), the configurator (it is the one real tool on the page), the routes, the SEO head and the legal links.

What does not hold up against the brief:

| Finding | Why it is a problem |
|---|---|
| Hero art is an isometric green slab with floating labels | The "generic isometric illustration" the brief bans. It says nothing about the product. |
| A fake console window ("Server started on port 3000") in the control-panel section | A "fake terminal with meaningless code". |
| Section "Everything you need, on every instance" and a six-card "If it runs on a panel" grid | The generic features grid, with icon tiles and 28px cards. |
| Every block is a rounded 28 to 40px card, pill buttons, pill chips | Excessive rounding: the page has no edge to recognise. |
| A scrolling logo strip | Decoration that repeats what the catalogue says. |
| Headline "Hosting for everything you run." | Accurate but interchangeable with any host. |

Facts found in the repository and on the live API (`/api/catalog/products`, `/api/status`) that the design is built on:

* The identity that ships is **mint green on near black**, not red. The favicon is an off-white mark (a block with two signal arcs) with a mint block. Tokens: paper `#090b0a`, ink `#f1f5ef`, green `#4ee595`. The `#E64A4A` of the brief does not exist in the repository, so it is not used: the shipped identity wins over the brief ("preserve the recognizable Blipmade identity").
* Type is already licensed and self-hosted (Fontsource, all SIL OFL): Bricolage Grotesque (display), Hanken Grotesk (text), JetBrains Mono (numbers).
* The catalogue holds 75 listed products in 9 categories; a number of them are listed but **not orderable** (for example several game servers). The page must not advertise those as instant.
* The price is a pure function of RAM, vCPU and disk (one card of rates for every product). That is the real differentiator and it is already computed by `priceOfResources`.
* Instances are containers on Pterodactyl, with console, files and startup settings. VPS and hosted email exist as products.
* No region list, customer count, uptime promise or review exists in the repository, so none appears on the page.

## 2. Three directions

### A. The Ledger
* **Concept**: the whole page is an index, a typeset price list: numbered rows, hairlines, figures aligned in columns.
* **Signature**: tabular mono figures and rules. Almost no imagery.
* **Type**: Bricolage at large optical sizes for headings, mono for every number.
* **Layout**: 12-column grid, full-width rows.
* **Motion**: none beyond hover.
* **Story**: "here is exactly what it costs".
* **Fit**: honest and fast, but the hero is quiet and the product is not shown. Weak first impression.
* **Tradeoffs**: best accessibility and performance; lowest memorability.

### B. The Signal
* **Concept**: the name. A "blip" is a signal that appears: each workload pings into one line when it comes online.
* **Signature**: concentric arcs, sweeping line, pulses.
* **Type**: wide display, light mono captions.
* **Motion**: continuous pulses and a sweep.
* **Story**: "it is alive".
* **Fit**: on brand, but it is the radar already used in the old closing section, it leans on decorative animation and it risks the "glowing orbs" look. Motion is the idea, so it fails with reduced motion.
* **Tradeoffs**: heavier, harder to keep readable.

### C. The Plan Sheet (chosen)
* **Concept**: Blipmade sells **resources**, and resources can be drawn to scale. The page is an architect's plan sheet: every workload is a block on one hairline grid, the one with the most memory taking the largest area, priced by the one card of rates.
* **Signature**: square-edged blocks on a ruled sheet, mono dimensions like a drawing's annotations, one mint marker for the active or live thing. The logo's block-and-arcs becomes the only motif (the "blip" mark): index marker, live-status marker, hover marker.
* **Type**: Bricolage Grotesque 600 with tight tracking for statements; Hanken for text; JetBrains Mono for every dimension, price, index and label. Controlled breaks with `text-wrap: balance`; sizes by `clamp()`.
* **Layout**: 12-column editorial grid, 1px rules, square corners (2px on controls), generous negative space. Sections are separated by rules and a numbered mono label, not by cards.
* **Motion**: only where it explains: the hero blocks highlight and their caption updates (transform and opacity); index rows move a marker; one entrance on the hero. Nothing scrolls-jacks, nothing depends on motion, `prefers-reduced-motion` removes the entrance.
* **Story**: what is this (a sheet of workloads) → what can I run (the index) → how does it work (three steps) → what is the interface (a real screenshot) → what does it cost (the rates as a ledger) → can I trust it (live status, limits stated) → next step.
* **Fit**: it turns the one real differentiator (price by resources, one panel for different workloads) into the picture. It uses real data, so it cannot lie. It is built from CSS grid and SVG, no animation library.
* **Tradeoffs**: static-first, so it is fast and accessible; it asks for restraint to avoid looking like a spreadsheet, which the hero scale and the negative space handle.

### Choice
| | Originality | Usability | Maintainability | Performance | Commercial effect |
|---|---|---|---|---|---|
| A Ledger | 2 | 5 | 5 | 5 | 3 |
| B Signal | 3 | 3 | 2 | 2 | 3 |
| **C Plan Sheet** | **5** | **4** | **4** | **5** | **5** |

C wins on the two things the brief ranks first: a recognisable identity and a hero that is memorable without effects. A's honesty is kept inside C (the ledger of rates). B's name-play is kept as the single motif.

## 3. Rules of the system

* **Colour**: paper `#090b0a`, raised `#101512`, rule `#232d26`, ink `#f1f5ef`, quiet ink `#8c988f`, mint `#4ee595`. Mint is allowed for: the live state, the selected block, the blip mark, the one primary action of a view. Never a fill behind text, never a gradient.
* **Tone** (decision of the owner after the first review): the page speaks as if the platform is open and taking customers. Playful and direct, a little like Discord: short sentences, a joke where it costs nothing ("Pay for what it eats", "No yak shaving", "Your bot has been sleeping on your laptop long enough"). No page text points at what cannot be bought; only what can be deployed is counted and shown. No claim is invented: every number still comes from the catalogue.
* **Grid**: container 1320px, 12 columns, gutters 24px (16px under 640px). Everything aligns to the rules.
* **Spacing**: 4, 8, 12, 16, 24, 32, 48, 72, 112, 160.
* **Type scale**: display `clamp(44px, 8vw, 128px)`; section title `clamp(32px, 4.6vw, 64px)`; lead 19 to 22px; text 16 to 17px; label 12px mono uppercase with 0.08em tracking.
* **Surfaces**: sheet (rule border, no radius) over paper; raised only for the one interactive tool (the configurator).
* **Buttons**: rectangular with a 10px radius, 48px high (touch target); the sheet has an 18px outer radius, its inner rules stay square, arrow glyph; the primary is ink on paper, mint only on the closing action and hover.
* **Links**: underlined by a 1px rule that thickens to mint on hover and focus; focus ring is the 2px mint outline of the whole site.
* **Motif**: `Blip` (a square and two arcs, from the logo). Used for the section index, the live status and the hover marker. Nowhere else.
* **Motion**: 150 to 250ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`, transform and opacity only.
* **Loading**: the page renders from the catalogue snapshot, so nothing shifts when the live data arrives.

## 4. What was built (branch `design/homepage-2026`)

Sections: hero (statement, plan sheet of six real workloads, the configurator), 01 index of the catalogue by category, 02 three steps, 03 the panel (a real capture of the customer instance page with example data, `web/public/brand/panel-instance.{webp,png}`), 04 the card of rates as a ledger, 05 what you can check (live status, docs, catalogue, support), 06 questions, closing.

Removed on purpose: the isometric slab, the fake console, the "Everything you need" grid, the six icon cards, the logo strip, the radar in the closing section.

### Changed files
`web/src/site/Home.tsx` (rewritten), `web/src/index.css` (the blip pulse), `web/public/brand/panel-instance.png|webp` (new), `web/e2e/public-home-2026.spec.ts` (new), `web/e2e/public.spec.ts` (copy of the heading and the price test now reads the category index), `docs/design/homepage-2026/*`.

### Checks run
* Typecheck, build and unit tests: 499 pass.
* `public-home-2026.spec.ts`: 11 pass (one title, section headings, links, sheet interaction, no sideways scroll at 320, 390, 768, 1024, 1440, 1920 and at a 200% zoom viewport, reduced motion, keyboard focus ring).
* Local, unthrottled: LCP 1.0 s (phone viewport) and 1.4 s (desktop), CLS about 0, 267 to 306 KB transferred. These are single local runs, not field data.
* Screenshots in `before/` and `after/`, with the live catalogue (75 products) for the `final-*` files.

### Known limitations
* Five tests of `public.spec.ts` need a running API (`/api/catalog/products`) and fail on the local static server, before and after this change; run them with `E2E_BASE_URL` pointing at a full stack.
* No automated accessibility audit tool is installed; contrast, order of headings, labels and focus were checked by hand and by the spec above. The smallest mono labels are 11 px.
* The header, the footer and the configurator keep their previous look (pills and rounded card); changing them touches every public page and was left out of this branch.
* The red of the brief is not in the repository: the shipped identity is mint green, which is kept.
* Not deployed. Not measured on a real phone.
