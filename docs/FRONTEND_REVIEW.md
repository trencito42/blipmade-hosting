# The frontend review

Two rounds of frontend work on the Blipmade interface. The first one
(2026-10-23) took the typeface, the forms of the five auth screens, the path
that leads to the first deployment, the overview of the customer, the phone,
and the states of every route. The second one (2026-10-28) rebuilt the public
site and the zone of the customer on the design of the reference of the
redesign.

Everything below was checked on VM 103 (`10.77.0.13`) with the build that was
deployed before the round and the build that was deployed after it.

---

## 0. The redesign of the site (2026-10-28)

The public site and the zone of the customer were rebuilt on the reference of
the redesign. The reference is the measure of everything below: the tokens of
the colours, the shape of the cards, the motion, the type and the size of the
type. The mark of the platform is the one that was already there.

| Area | State |
|---|---|
| Tokens | The scale of the colours of the reference lives in `web/src/index.css` under the names the interface already used (`bg`, `s1`, `s2`, `s3`, `line`, `acc`, `acc-h`, `ink`, `ink2`, `ink3`, `bad`, `warn`), with `card` and `surface` as aliases. The whole surface moves at once, because the public site and the zone of the customer read the same scale. |
| Type | Geist Variable and Geist Mono Variable, self-hosted by the site: the files are in the build, next to the other files. The typeface of the machine is the last name of the stack. See [`TYPOGRAPHY.md`](TYPOGRAPHY.md). |
| Motion | The entrance of the blocks (`.rv`), the cards of the catalogue (`.card-in`), the rings of the buttons and the art of the screens of the account (`.auth-in`), all of them under `prefers-reduced-motion`. |
| The home page | Hero with the terminal, the plans on four tabs, the six cells, the preview of the panel, the use cases, the questions and the call at the end. The old sections (ticker, story, studio, platform, configurator, rest, the old catalog) are gone. |
| The catalog | The search, the pastilles of the categories and the cards of the products, with the price of the smallest configuration of every product, read from `GET /api/catalog/products`. |
| The documentation | The index of the sections opens the page, and a page of it keeps the sixteen sections and the real text. The search is in the bar of the page. |
| The account | The five screens share a shell with a picture of their own, and the rules of the password are counted while they are typed. The words of the server are shown as they came. |
| The zone of the customer | The panels, the fields, the buttons, the tables and the states wear the same cards as the public site. |

### What was checked

| Check | How |
|---|---|
| The tests of the interface | `npm test` in `web/` — 308 of 308 pass. |
| The browser tests | `./scripts/run-e2e.sh` — 30 of 30 pass: the account (the refusals of the server and the answer that carries a session), the plans on their tabs, the filters of the catalog, the navigation of the documentation, the menu of a phone. |
| The accessibility | axe on `/`, `/apps`, `/docs`, `/login` and `/register`, in the theme of the system as well: no violation. |
| The type | `npx tsc --noEmit` for the site and `npx tsc --noEmit -p tsconfig.e2e.json` for the browser tests: no error. |

### What the tests found

- The catalog had lost the bar of the site, the footer and the landmark of the
  main area when it was rebuilt. The axe check found the landmark; the bar and
  the footer came back with it.
- The rule of the password is now in one place (`web/src/lib/password-rules.ts`)
  and it is the rule of the API: ten characters, a lowercase letter, an
  uppercase letter, a number, and no more than two hundred characters.

---

## 1. The typeface

**proxima nova is the typeface of the interface.** It arrives through the
authorized Adobe Fonts **web** project, never through the desktop files.

The archive with the three `.otf` files was inspected and deliberately not
used: the desktop files of Adobe Fonts are not licensed for the web, and a
converted `.woff2` would carry the same restriction. No font file is
committed to this repository.

The integration is ready for the kit of the operator:

| Piece | Where | What it does |
|---|---|---|
| `@fontsource-variable/geist`, `@fontsource-variable/geist-mono` | `web/package.json` | The files of the typeface are in the build of the page, so the browser asks this site for them and never a third party. |
| `--font-sans` | `web/src/index.css` | `"Geist Variable", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`. The typeface of the site comes first and the typeface of the machine is the last name of the stack, so the page keeps reading when the files did not load. |
| `--font-weight-*` | `web/src/index.css` | 400, 500, 600, 700, 800 and 900, the whole scale of the typeface of the site, so nothing is synthesised by the browser. |

> The redesign of the site changed this row: the interface used to ask for
> `"Proxima Nova"` and to fall through to the typeface of the machine. The
> design of the reference asks for Geist, and the files of the typeface now
> come with the build. The step for the operator is in
> [`TYPOGRAPHY.md`](TYPOGRAPHY.md).

The weights are normalized in the theme tokens, not component by component: the
51 `font-extrabold`, the 31 `font-medium` and the 5 `font-normal` in the
codebase all resolve to 400, 600 or 700 without a single component being
touched, and the browser never has to synthesise a weight that the typeface
does not have. `Geist Mono` still carries the ports, the console output, the
code and the numbers.

**The operator has to set the kit.** Without it the interface keeps Geist,
which is the fallback and not a defect.

## 2. The focus of the interface

The interface showed **two** focus indicators at once: the global
`:focus-visible { outline }` of the page and the ring of the control. The
outline was declared outside any layer, so it won against the `outline-none`
of Tailwind.

The fix keeps one indicator per control:

- the global indicator moved into `@layer base`, so a control with a ring of
  its own can switch the outline off with the `focus-visible:outline-none`
  utility;
- every class string with a focus ring carries that utility next to it (87
  strings in 23 files, applied by a script so the two never drift apart);
- a field shows the ring of its container, never an outline on top of it.

The rule that is now checked in the browser: a control never shows an outline
and a ring at the same time, never shows an outline while the container around
it shows a ring, and never shows a ring in a colour that fights the ring of
its container.

## 3. The forms of the auth screens

The five screens (login, register, forgotten password, new password, email
verification) share one field now: `web/src/pages/auth-field.tsx`.

| Was | Is |
|---|---|
| The fill of the browser painted a light rectangle over the dark field. | The fill is painted with the colour of the field (`--bm-field-bg`), so the text stays readable and the rounded shape of the pill survives. A field that is filled **and** focused keeps the ring of its own. |
| The container and the input each drew an indicator. | The container carries the ring, the input carries none. |
| The password could not be shown. | The button shows and hides it again, it says which of the two it does, and it keeps the focus. |
| The error and the disabled state looked different on every screen. | They are the same on all five. |
| The fields were focused on arrival. | No field is focused on arrival, so the keyboard of a phone does not open by itself. |
| The attributes of the password manager were missing. | `email`, `current-password`, `new-password` and `name` are correct, so the manager offers the right account. |
| An empty field showed an error the moment the user tabbed past it. | An empty field is not an error before the form was sent. The error of the API is still shown where it belongs. |

**The bug that broke the registration:** the resend of the verification mail
called `POST /auth/resend-verification` without a body, while the API parses
`{ email }`. Every attempt answered 400. Both screens now send the address.

## 4. The path to the first deployment

`/app/deploy/wordpress` was hardcoded in two places, and WordPress is **not**
deployable: its image is not installed on the platform. The button led to a
dead end that promised a deployment that could not happen.

The button is now built from the catalog of the API:

- `useDeployableProducts()` reads `GET /api/catalog/products` and keeps the
  products that are `deployable` and `visible`;
- `useDeployEntry()` returns the first of them, and `deployPath(slug)` builds
  the path;
- when nothing can be ordered, the button says so instead of leading
  nowhere, and the page of the product that cannot be deployed explains itself
  and offers the catalog.

The check in the browser: every deploy link of the homepage, of the overview
and of the list of the services is compared with the catalog of the API. At
the moment of the review the only product that can be ordered is
`discord-bot`, and every button points at it.

## 5. The overview of the customer

The old overview showed three empty panels to an account that had nothing
yet. It shows one onboarding panel now, with one primary action (the product
that can really be ordered) and one secondary action (the catalog).

An account that has services gets four facts (services, the monthly total,
what needs attention, deploy) and the real list of its services with the
recent activity. The monthly total is part of the facts, not a panel of its
own for an account that has no invoice.

**No number is made up.** Every figure on the page comes from
`GET /api/instances` and from the catalog. A counter that the API does not
send is shown as `—`.

## 6. The phone

| Was | Is |
|---|---|
| The bottom bar showed four entries, and the other pages of the area could not be reached on a phone. | The bar shows four entries and a fifth that opens the rest of the navigation in a sheet. No page of the customer area or of the staff area is unreachable. |
| The bar sat on top of the field that was being typed into. | The bar hides itself while the keyboard is open, and the content reserves the height of the bar so the last row of a table is never hidden. |
| The header went under the notch. | The header keeps clear of the safe area. |
| The labels of the bar were cut. | Short labels (`Apps`, `Support`, `Promos`, `Audit`), a fixed tab indicator for the active entry, and a tap target of at least 56 px. |
| Long values overflowed the page on the narrowest phone. | They break or are cut with the full value in the title. The headers of the public pages wrap at 320 px. |

## 7. The states of every route

Every route was read for its six states: loading, empty, error, success,
disabled and retry.

- the session of the customer area can be tried again after a failure;
- the lists of the staff area say what happens next when they are empty;
- the search of the documentation says that nothing matches;
- the buttons that wait for the server are disabled while they wait;
- the errors carry the identifier of the request, so a report can be traced.

## 8. How it was checked

| Check | Result |
|---|---|
| `npx tsc --noEmit` (web) | passes |
| `npx vite build` (web) | passes |
| `npx tsc --noEmit` (api and tests) | passes |
| `bash scripts/run-tests.sh` on VM 103 | 119 of 119 tests pass, 11 files |
| `scripts/ops/browser-responsive.mjs` | 150 checks over 27 routes at 320, 375, 390, 768, 1024 and 1440 px, **0 problems** |
| `scripts/ops/browser-checks.mjs` | the fixed behaviour passes: one indicator, the autofill, the password button, the order of the keyboard, 46 links without a dead end, every deploy link against the catalog |
| `scripts/ops/browser-screenshots.mjs` | 46 images before and 46 after, at 390 px and 1440 px |

The screenshots are not committed; they are a review artefact.

**The new scripts:**

| Script | What it does |
|---|---|
| `scripts/ops/browser-responsive.mjs` | Every route at every width: sideways scroll, elements out of the viewport, clipped text, the size of the tap targets of the bottom bar, the errors of the console. |
| `scripts/ops/browser-checks.mjs` | The behaviour that was fixed: one focus indicator, the autofill, the password button, the order of the keyboard, the links, the deploy buttons. |
| `scripts/ops/verify-frontend.sh` | The three passes above in one go. It signs in as few times as possible, because the login endpoint allows ten attempts every fifteen minutes for an address. |
| `scripts/ops/seed-browser-account.mjs` | Creates the two accounts that the browser checks sign in with. The password is never stored in the repository. |

## 9. What is still blocked

| Blocker | Effect |
|---|---|
| The licensed web files of proxima nova are not in the machine. | The interface keeps Geist. Everything else works. The operator places the three woff2 files under `web/public/fonts/`, builds the site again and the typeface is there. |
| The web login of the panel answers `500 TypeError` for every account. | A `ptlc_` client key cannot be issued from the browser, so the relay of the console, the power control of a customer and the key per customer stay blocked. The interface around them is ready. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `SMTP_URL`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN`, `OFFSITE_TARGET`, `OFFSITE_ENCRYPTION_KEY` are still empty. | The pages of the billing and of the mail show the honest empty state. |
| There is no endpoint to change the password of a signed in account. | The settings page offers the reset by mail and says so. |
| The fields of `/admin/overview` are optional in the API. | A counter that is missing is shown as `—`, never estimated. |
