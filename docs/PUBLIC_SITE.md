# The public site

The public site is everything a visitor sees before they make an account: the
home page, the catalog of the apps, the page of a product, the documentation,
the five screens of the account, the legal pages and the page of an address
that does not exist.

The dashboard (`/app`), the admin area (`/admin`) and the status page
(`/status`) are not part of it. They are not touched by the redesign of the
site.

## 1. Where the code is

Everything lives in `web/src/site/`.

| File | What it holds |
|---|---|
| `ui.tsx` | The atoms of the design: `Wrap`, `Mark`, `Logo`, `Btn`, `Panel`, `H2`, `Lead`, `Eyebrow`, `Crumbs`, `Nav`, `Footer`, `Page`, `cx`. |
| `index.css` (in `web/src/`) | The tokens of the design: the colours, the typefaces, the slider, the gauge, the caret. |
| `pricing.ts` | The arithmetic of the price, the same as the one of the API. |
| `catalog.ts` | The catalog of the platform: the snapshot, the refresh from the API, the products. |
| `content.ts` | The words that are not the catalog: the questions, the copy of every product, the lists of what exists and what does not. |
| `Configurator.tsx` | The configurator of the price: the radio group, the three sliders, the bar of the cost and the total. |
| `Home.tsx` | The home page. |
| `Apps.tsx` | The catalog of the apps and the page of a product. |
| `Blocks.tsx` | The blocks of the documentation and the resolution of the markers of the content. |
| `Docs.tsx` | The index of the documentation and a page of it. |
| `Auth.tsx` | The five screens of the account. |
| `Legal.tsx` | The legal pages. |
| `NotFound.tsx` | The page of an address that does not exist. |
| `public-routes.ts` | The matcher of the addresses of the public site. |
| `seo.ts` | The meta of every kind of page. |
| `head.ts` | The head of a page, written to the disk and kept right in the browser. |
| `Head.tsx` | The component that keeps the head right when the visitor moves to another page. |
| `entry-server.tsx` | The page, drawn on the server for the file that is written to the disk. |

The matcher of the addresses lives in its own module on purpose: the browser
and the program that writes the site to the disk both use it, so the two
cannot disagree about the address of a page.

## 2. The addresses

| Address | The page |
|---|---|
| `/` | The home page, with the configurator in the middle. |
| `/apps` | The products the platform can deploy today. |
| `/apps/:slug` | The page of a product, with the configurator locked on that product. |
| `/docs` | The index of the documentation. |
| `/docs/:slug` | A page of the documentation. |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | The five screens of the account. |
| `/terms`, `/privacy`, `/cookies`, `/aup`, `/refund-policy`, `/sla` | The legal pages. |

An address of the documentation that was written with a question in it
(`/docs?p=upgrade`) is sent to the page it names, with the answer 301.

## 3. The site is written to the disk

The site is written before it is served:

```bash
cd web
npm run build
```

The build does three things:

1. it builds the site for the browser, in `dist/`;
2. it builds the same pages for the server, in `dist-ssr/`;
3. it writes one file per address of the public site, with the page and the
   head already in it, plus `404.html`, `sitemap.xml` and `robots.txt`.

A reader without JavaScript and a crawler read the same thing a browser
reads. The browser takes over the page when it is loaded, and it keeps the
head right when the visitor moves to another page without a load.

The server of the site serves the file of an address when there is one, and
the page of an address that does not exist with the answer 404. The dashboard
and the admin area are drawn by the browser alone, because they need a
session.

## 4. The price

The price comes from the API and from nowhere else.

- The card of rates is in the catalog of the API: `ramPerGb`, `cpuPerUnit`,
  `diskPerGb`, `baseFee`.
- The arithmetic is in `api/src/lib/resource-pricing.ts`, and the site reads
  the same module: `web/src/site/pricing.ts` is the same arithmetic, written
  for the browser.
- The test `web/tests/site-pricing.test.ts` checks that the two agree on a
  grid of configurations, and that the price of the smallest configuration
  and of the recommended configuration of every product is the number the
  server sent.

The snapshot of the catalog is written by:

```bash
cd web
npm run sync
```

The script reads `/api/catalog/products` and writes
`web/src/site/data/products.json`. The summary of the documentation is
written at the same time, into `web/src/site/data/meta.json`, and the head of
the pages of the documentation reads it: the whole text of the documentation
is a large file, and a visitor of the home page does not need it.

## 5. The content of the documentation

The content is ours and it stays in `web/src/content/docs/`:

- `pages.json` — the pages, with their blocks;
- `groups.json` — the groups the pages belong to;
- `drafts/` — the pages that are written but not published yet.

The blocks of a page are a paragraph, a list, a callout, a piece of code, the
steps of a task, the answers of a question and a table of specifications. The
words of a block may hold three markers:

| Marker | What it becomes |
|---|---|
| `{{planned}}` | The mark of a thing that is designed and not built yet. |
| `{{catalog.price}}` | The price of the smallest configuration of the product of the page. |
| `{{catalog.minResources}}` | The smallest configuration of the product of the page. |

A page that is about a product is published when the catalog of the platform
carries that product. A page about a product the platform cannot deploy yet
stays in the content and out of the site.

## 6. The legal pages

The six legal pages are written in `web/src/legal/documents/` and are drawn
by `web/src/site/Legal.tsx`. They carry the values the operator still has to
supply as a visible mark, and they stay out of the index of the search
engines until every one of those values is there. The count of the values is
in `web/src/site/legal.ts`, and the test of the legal pages checks it against
the pages themselves.

## 7. The typeface

The interface wears three typefaces, and the site serves all of them: the
text in **Hanken Grotesk Variable**, the headings in **Funnel Display
Variable**, the console and the numbers in **JetBrains Mono Variable**. The
files are in the build, and no request leaves the site for a letter. The
details are in `docs/TYPOGRAPHY.md`.

## 8. The picture of a shared link

`web/public/og.png` is the picture a link of the site shows when it is
shared. It is drawn by a browser, out of the typefaces of the site and the
logo of the platform:

```bash
cd web
npm run og
```
