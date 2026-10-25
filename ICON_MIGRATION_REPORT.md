# The migration to Font Awesome 7 Pro Duotone

**Date:** 25 October 2026
**Commit:** `fix/fontawesome-pro-duotone` (branch), based on `e184cb2`
**Font:** Font Awesome **7.3.1** Pro, self-hosted, served by the site itself

## 1. What was there before

The platform had **no icon library**. Every icon of the interface was drawn
by hand:

| What | Where | How many |
|---|---|---|
| `Icon` component with hand-written SVG paths | `web/src/icons.tsx` | 26 paths |
| Usages of that component | 24 files | **59** |
| Hand-drawn bell | `web/src/ui-app.tsx` | 1 |
| Chevron of the dropdown, as a data-URI background | `web/src/ui-app.tsx` | 1 |
| SVG elements that are not icons | `web/src/logo.svg`, `web/src/home/Studio.tsx` | 2 |

There was no Lucide, no React Icons and no Heroicons: `web/package.json` had
no icon dependency at all. The text was drawn with **Geist** (two packages
of Fontsource) and with **proxima nova**, a typeface whose web files were
never installed.

## 2. The Font Awesome integration

### The version and the way it is served

**Font Awesome 7.3.1 Pro**, self-hosted by the site under `/fontawesome/`:

```html
<link rel="stylesheet" href="/fontawesome/css/pro.min.css" />
```

The stylesheet is loaded **once**, before the styles of the application, so
the application can override anything it needs. The browser asks this site
for the icon font and never a third party: the verification of the routes
found **0 requests outside the site**.

The files are **not in the repository**, because Font Awesome Pro is licensed
and the repository is public. They are placed on the machine by the operator:

```bash
python3 scripts/download-fontawesome-pro.py --version 7.3.1 --output web/public/fontawesome
```

The script downloads the stylesheet and every web font the stylesheet names,
checks that each file is a real WOFF2 (the `wOF2` signature) and stops when
one is not. It is idempotent: a file that is already there and is whole is
kept. The result on the machine of the platform: **501 web fonts, 0 invalid**.

`.gitignore` keeps `web/public/fontawesome/` out of the history.

### The styles

| Style | Where it is used |
|---|---|
| **Sharp Duotone Regular** | The default of every icon of the interface |
| **Sharp Duotone Solid** | Available through the `weight` prop; not used by default |
| **Classic Duotone** (`fa-duotone`) | Available through the `family` prop |
| **Brands** | Available through the same props, for an official brand icon |

The duotone colours come from the tokens of the design system, never from a
hardcoded colour:

```css
:root {
  --fa-secondary-color: var(--color-ink3);
  --fa-secondary-opacity: 0.4;
}
```

## 3. The centralised component

The names of the icons live in **one table**, in `web/src/icon-map.ts`:

```ts
export const ICONS = {
  arrow: { name: "arrow-right" },
  arrowUR: { name: "arrow-up-right-from-square" },
  check: { name: "check" },
  // ...
} as const satisfies Record<string, IconSpec>;
```

`web/src/icons.tsx` is the component that draws it. It supports:

| What | How |
|---|---|
| A semantic name | `<Icon name="check" />` |
| The shape | `family="sharp" \| "classic"` |
| The weight | `weight="regular" \| "solid"` |
| The size | `size={18}` (pixels) or `size="1rem"` |
| The colour | inherited from the text, or `color="..."` |
| The second layer of the duotone | `secondaryColor="..."` and `secondaryOpacity={0.4}` |
| An accessible name | `label="..."`, which turns the icon into `role="img"` with an `aria-label` |
| Decoration | the default: `aria-hidden="true"` |
| The classes of the design system | `className="..."` |

The API of the old component (`name`, `size`, `className`) did not change, so
**none of the 59 usages had to be touched**.

## 4. What was migrated

| | |
|---|---|
| Icon usages migrated | **59** (`<Icon>`) + 1 bell + 1 chevron = **61** |
| Hand-written SVG paths replaced | **26** |
| Files that draw an icon | 2 (`icons.tsx`, `icon-map.ts`) |
| Components changed | `icons.tsx` (new), `icon-map.ts` (new), `ui-app.tsx` (the bell and the chevron), `index.css` (the tokens of the duotone), `index.html` (the stylesheet) |
| Routes touched | none: the icons are drawn by the same component everywhere |

The chevron of the dropdown was a data-URI background image of an SVG. It is
now an icon of the font, placed next to the `<select>`:

```tsx
<div className="relative">
  <select ... />
  <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink3" />
</div>
```

## 5. The deliberate exceptions

| What | Why it was kept |
|---|---|
| `web/src/logo.svg` | The brand of the platform. It is a mark, not an interface icon. |
| The graph of the CPU usage in `web/src/home/Studio.tsx` | It is a chart drawn from data, with a `polyline` and an `aria-label` that tells the value. An icon font cannot draw it. |
| `web/public/favicon.svg` | The mark of the browser tab. |

There is **no** SVG left in the interface that functions as an ordinary icon.

## 6. The typeface of the text

The interface asks for **the typeface of the machine of the visitor** and for
nothing else:

```css
--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
```

* proxima nova is gone: its web files were never licensed for the web, and
  the site asked the browser for files that were never there.
* The two packages of Fontsource (Geist and Geist Mono) are gone, so the
  project depends on no typeface at all.
* The site asks no third party for anything: the browser finds **0** requests
  for a typeface of text.
* The page never shifts: the size of the letters is known before the page is
  painted.

`web/fonts.mjs` is now the single place that names the stacks, `web/server.mjs`
reports the state of the typeface in `/healthz`, and `docs/TYPOGRAPHY.md`
explains the decision.

## 7. The performance, measured in the browser

Measured on the home page at 1440px, with the browser of the platform:

| | Before | After |
|---|---|---|
| Files of a typeface for the text | 2 (Geist, Geist Mono) | **0** |
| Files of the icon font | 0 | 11 (the subsets the browser needs) |
| Bytes of fonts | ~2 files of a typeface | 139 480 B, all of them the icon font |
| Bytes of stylesheets | the bundle of the application | 55 297 B (44 634 B of them the icon font, in brotli) |
| Requests to a third party | 0 | **0** |
| Shift of the layout | none | none |

The stylesheet of the font is 454 091 B on the disk and 44 634 B in brotli.
The 501 web fonts are 9.1 MB on the disk, but the browser asks only for the
subsets it needs: **11 files, 139 480 B**, on the home page. No font file is
preloaded; the browser decides what it needs, by the `unicode-range` of the
font.

## 8. The verification

| Check | Result |
|---|---|
| `npm run build` (`tsc --noEmit` and `vite build`) | **passes** |
| The tests of the web application | **258 pass, 0 fail** (before: 255) |
| `web/tests/icons.test.ts` (new) | 5 tests: the shape of the table, the classes of an icon, **every icon of the table is an icon the installed font has**, the table is the only place that names an icon of the font, and an icon can leave the flow of the page |
| `web/tests/fonts.test.mjs` (rewritten) | 8 tests: the stacks, no `@font-face`, no package of a typeface, no third party |
| `web/tests/fonts-server.test.mjs` (rewritten) | 3 tests: the health of the site, no file of a typeface is served, the server does not walk out of its directory |
| The browser, home page | **100 icons, 0 empty, 0 invisible** |
| The browser, `/login` and `/app` | icons render, 0 empty |
| The browser, authenticated pages (`/app/notifications`, `/app/tickets`, `/app/domains`) | 16–17 icons per page, 0 empty; the chevron of the dropdown is drawn by the icon font, 20×16 px, with a glyph |
| The requests of the browser | **0 failed**, **0 to a third party**, 0 fonts of text |
| The colours of the duotone | the first layer is the ink of the text, the second is `--color-ink3` at 0.4 |

The test that checks the font is skipped on a machine where the font is not
installed, because the font is not part of the project. It is strict on a
machine where it is installed.

## 9. One thing the font did that the page did not expect

The stylesheet of Font Awesome is **not layered**, and the utilities of
Tailwind are. In the cascade, a rule that is not in a layer wins over a rule
that is in one, whatever the order of the two files is. The stylesheet of the
font says that an icon is in the flow of the page, because the second layer
of a duotone icon is drawn with an absolute pseudo element:

```css
.fa-sharp-duotone { --fa-family: var(--fa-family-sharp-duotone); position: relative; }
```

So `absolute` of Tailwind, which is in the layer of the utilities, was
beaten by the font: the chevron of the dropdown was drawn **before** the
text of the field instead of at its end, and it added a line to the field.
The stylesheet of the application puts it back:

```css
.fa-icon.absolute { position: absolute; }
.fa-icon.fixed { position: fixed; }
```

The rule is not in a layer either, and it has more weight than the one of the
font, so the icon goes where the page asks for it. The test reads the two
rules, so the same surprise cannot come back.

This was found in the browser, by measuring the place of the icon and not
only by looking at the page.

## 9. What is left

1. **The icon font has to be placed on the machine** before the site is
   built. It is licensed and it is not in the repository. The instruction is
   in `docs/TYPOGRAPHY.md`.
2. **The shape of the icons changed.** The old icons were lines of 1.6
   pixels; the new ones are duotone shapes. The place of an icon is the same
   and its size is the same, but the drawing is denser. The screens that
   matter were checked in the browser at 320, 768, 1024 and 1440 pixels.
3. **The icons of the operator are still missing.** The eleven `ops-*`
   templates of the notification engine have no emitter, so an alarm of the
   platform is not drawn by an icon that does not exist yet.
4. **Nothing was preloaded and nothing was prefetched.** The icon font is
   asked for when the first icon appears. On a page without an icon, the
   font is never fetched.

## 10. The commands

```bash
# the icon font, on the machine of the platform
python3 scripts/download-fontawesome-pro.py --version 7.3.1 --output web/public/fontawesome

# the build and the tests of the interface
cd web && npm ci --include=dev && npm run build && npm test

# the site
cd /opt/blipmade
docker compose -f compose.yml -f compose.api.yml -f compose.web.yml build web
docker compose -f compose.yml -f compose.api.yml -f compose.web.yml up -d --force-recreate web
```
