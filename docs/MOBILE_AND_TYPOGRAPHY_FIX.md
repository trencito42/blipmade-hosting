# The clipped mobile layout and the typeface of the interface

This is the report of one round: the layout that was cut off on a phone and
the delivery of the typeface of the interface.

---

## 1. The document in the screenshot was not the document of the site

The screenshot the operator sent shows `warmup.html`, `<html lang="ro">` and
hidden Google Sans elements in the Elements panel. The site does not have
any of those.

| What was checked | How | Answer |
|---|---|---|
| The document the site serves | `curl -s https://blipmade.com/app` | `<html lang="en">` |
| The source of the page | `web/index.html` | `<html lang="en">` |
| A page called `warmup.html` | `curl https://blipmade.com/warmup.html` | **404** |
| The name anywhere in the project | `grep -ri "warmup\|Google Sans\|lang=\"ro\""` over the whole repository | **nothing** |
| A frame inside the page | `grep -rn "iframe" web/src` | **nothing** |
| The staging address of the site | `curl http://10.77.0.13:3000/app` | `<html lang="en">` |

**Conclusion.** The Elements panel of that screenshot was showing another
document — another tab, another frame or a wrapper of the tool that took the
screenshot. The page that was drawn in the viewport was the page of the site,
and it really was broken, but the DOM in the screenshot could not be used to
find the cause. The cause had to be measured on the live document.

The measurement below was made on `https://blipmade.com` with the flags the
Chrome DevTools uses when a phone is chosen there: `isMobile`, a pixel
ratio of 3 and a finger as the pointer. A context without those flags
measures a narrow window, which is not a phone.

---

## 2. The root cause

### 2.1 What the measurement showed

On `/admin/tickets`, with the account of a staff member, at 440 CSS px:

```text
innerWidth (the layout viewport)   852      <- the screen is 440
visualViewport.width                440      <- what the eye sees
documentElement.scrollWidth         852
documentElement.clientWidth         440
body { overflow-x }                 hidden   <- the page cannot be panned
window.scrollX after scrollTo(9999) 0        <- there is nothing to pan to
```

The page was laid out at **852 pixels on a 440 pixel screen**. Everything
past 440 was cut off, and the body, which hides the overflow, kept the
visitor from reaching it.

The navigation of the phone is fixed at the bottom of the layout viewport.
With the layout viewport at 852 pixels wide, the bar was **852 pixels wide**
and sat at the bottom of a document of 1852 pixels:

```text
the navigation, before:  top 1781  bottom 1852  width 852
the screen of the phone: 0        956             width 440
```

**The navigation of the phone was 825 pixels below the edge of the screen.**
It was not drawn where the visitor was looking, and it was spread over twice
the width of the screen, so the tabs "Tickets", "Audit" and "More" were at
`342..510`, `510..679` and `679..848` — outside the screen.

### 2.2 Why the column of the grid took the width of the text

The queue of the tickets sits in this grid:

```html
<div class="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
  <div class="block">
    <section class="rounded-[22px] p-4 bg-s1">
      <div class="grid gap-3">
        <div class="grid gap-3">
          <div class="grid gap-1.5 md:hidden">   <!-- the cards of the list -->
            <div class="rounded-2xl bg-s2 p-3.5">
              <button class="block w-full text-left">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">           <!-- the text that is cut -->
                    <p class="truncate">#42 My Discord bot keeps crashing …</p>
```

A grid that names no column of its own gets an implicit column of size
`auto`. The base size of such a column is the **minimum contribution** of its
items, and the minimum contribution of a grid item with `min-width: auto` is
its content-based minimum size — its min-content size.

A text that is cut with an ellipsis is `white-space: nowrap`, and the
min-content size of a text that does not wrap is **the whole phrase**. So:

| Element | Measured min-content | Measured width |
|---|---|---|
| the line that holds the text (`div.min-w-0`) | 731 px | 228 px |
| the card | 804 px | 804 px |
| the section of the panel | 836 px | 836 px |
| the column of the grid | 836 px | 836 px |

`min-width: 0` on the line does **not** help here. It sets the floor of the
size of the line, not its ceiling: the min-content contribution of a flex item
is the smaller of its min-content and its max-content size, clamped by
`min-width` — and `min-width: 0` only raises that number, never lowers it.

The grid therefore asked for 836 pixels, the page asked for 852, and the
browser widened the layout viewport to hold it.

### 2.3 Why the old check did not see it

`body { overflow-x: hidden }` was already on the page. Two consequences:

* `documentElement.scrollWidth` is the width of the **layout viewport**, so it
  agreed with `innerWidth` and the check "does the page scroll sideways?"
  answered *no* — there is nothing to scroll to, the overflow is hidden.
* the old probe (`scripts/ops/browser-fit-probe.mjs`) **skipped every element
  under an ancestor with `overflow-x: hidden`**, which is the case for a text
  that is cut. The text that leaves the card was exactly what the probe was
  told not to look at.

The check also never opened the staff area: it walked the routes of the
customer area with an account of a customer, so the route that was broken was
never measured at all.

---

## 3. The fix

### 3.1 The column of a grid may be smaller than its content

`web/src/index.css`, in the base layer:

```css
.grid { grid-template-columns: minmax(0, 1fr); }
```

A grid that names no column of its own now gets a column that may be smaller
than its content. The columns a page names itself (`grid-cols-2`,
`sm:grid-cols-3`, `lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]`, …) are
utilities, and a utility wins over the base layer, so nothing that was
written down by hand was changed.

With that, the column is the width of the screen and the text inside it is
cut **inside** the card, with an ellipsis.

### 3.2 The line that holds a cut text asks for no width

The project already had the answer in `web/src/app/Tickets.tsx`: a line that
holds a text that is cut is given `w-0 min-w-0 flex-1`. The width of zero
takes the length of the phrase out of the measurement of the page, and
`flex-1` gives the line the room that is left. The other twenty lines of the
project that hold a text that is cut were changed to the same pattern.

### 3.3 The room a finger needs

The mark of the site in the bar of the phone was 27×24 pixels. It is now a
target of 44×44 pixels, with the size of the mark unchanged.

---

## 4. The typeface

### 4.1 What was wrong

proxima nova was bound to an address of a third party: the kit of the Adobe
Fonts web project, read from `ADOBE_FONTS_KIT_URL` at the start of the
server and written into the page. That could only ever work with an account
of Adobe, and the variable was empty in the deployment, so the interface was
drawing with Geist from the first day.

The desktop files of Adobe are not licensed for the web — their `OS/2` table
has `fsType = 0x0004`, the *preview and print* permission — so they were
never converted and are not published.

### 4.2 What it is now

The typeface is served from this machine, under `/fonts/`.

| | |
|---|---|
| The faces | `web/src/index.css` declares Proxima Nova 400, 600 and 700 with `url("/fonts/proxima-nova-{weight}.woff2")` |
| The files | `web/public/fonts/` — the build puts them next to the page |
| The server | `web/server.mjs` serves them as `font/woff2` with an `ETag` and `public, max-age=0, must-revalidate` |
| The report | `GET /healthz` answers with the state of the typeface and names the files that are missing |
| The fallback | Geist Variable, in the stack from the first day; Geist Mono keeps the ports, the console and the numbers |
| The third party | none. The Adobe kit, its variable and the injection of its stylesheet are gone |

### 4.3 The files that are needed

Three **woff2** files, licensed for self-hosting on a website, with these
names, under `web/public/fonts/`:

| File | Weight | Subsets |
|---|---|---|
| `proxima-nova-400.woff2` | 400 regular | latin + latin-ext |
| `proxima-nova-600.woff2` | 600 semibold | latin + latin-ext |
| `proxima-nova-700.woff2` | 700 bold | latin + latin-ext |

The names have to be exactly these. The step of the operator is in
`docs/TYPOGRAPHY.md`, section 5.

**The files are not there yet.** The site says so, in three places:

```text
$ curl -s https://blipmade.com/healthz
{ "status": "ok",
  "fonts": { "family": "Proxima Nova", "installed": false,
             "missing": ["/fonts/proxima-nova-400.woff2",
                         "/fonts/proxima-nova-600.woff2",
                         "/fonts/proxima-nova-700.woff2"],
             "fallback": "Geist Variable" } }
```

```text
$ docker logs blipmade-web-1
Typeface: the files of Proxima Nova are not all there, so the interface uses
Geist Variable. Missing: /fonts/proxima-nova-400.woff2, ...
```

```text
$ curl -s -o /dev/null -w "%{http_code}" https://blipmade.com/fonts/proxima-nova-400.woff2
404
```

**Nothing was quietly replaced.** The typeface of the interface is still
Geist, and the site says that.

### 4.4 The proof that the way works

The way was proved on the live site with a **stand-in file**: a copy of the
Geist Mono woff2 was placed under `/fonts/proxima-nova-400.woff2` in the
running container, and the browser was watched. The file was removed
afterwards and the container was started again, so the site is back to the
state above.

```text
font requests:
   200 font/woff2  https://blipmade.com/fonts/proxima-nova-400.woff2
   404 text/plain  https://blipmade.com/fonts/proxima-nova-600.woff2
   404 text/plain  https://blipmade.com/fonts/proxima-nova-700.woff2

proxima nova faces : [{"family":"Proxima Nova","weight":"400","status":"loaded"},
                      {"family":"Proxima Nova","weight":"600","status":"error"},
                      {"family":"Proxima Nova","weight":"700","status":"error"}]

widths: drawnWithStack 499   withProximaNova 499   withGeist 421
```

The file was asked for and answered `200` with `font/woff2`. The face of the
family was **loaded**. The text of the interface was drawn 499 pixels wide,
the width of the face of the family and not the 421 pixels of Geist: the face
is really used for the text and not only written in the stylesheet.

The stand-in was a different typeface on purpose, so the width of the text
tells the two apart.

---

## 5. The check that sees this failure

`scripts/ops/browser-mobile-real.mjs` walks the routes of the panel on the
widths of the phones and reads the width of the **layout viewport**.

The width of the document is not enough: it is the width of the layout
viewport, and the layout viewport grows to hold the content that does not
fit. The check therefore fails when:

* the layout viewport is wider than the screen,
* the document is wider than the screen,
* an element reaches past the edge of the screen,
* the navigation of the phone is wider than the screen, or a tab of it is
  outside the screen,
* the content of a box leaves the box,
* a control is smaller than a finger.

A text that is cut with an ellipsis and a strip that scrolls on purpose are
left out of the measurement: both are on purpose. A strip that runs from edge
to edge of the screen is left out as well, because it bleeds out of its box
by design.

Two more scripts came with it:

| Script | What it does |
|---|---|
| `scripts/ops/browser-overflow-source.mjs` | names the element that makes a page wider than the screen, with the width it asks for and the width it gets |
| `scripts/ops/browser-fonts.mjs` | writes down which files the browser asked for, which faces are loaded and how wide the text is drawn |

---

## 6. What was measured on the public site

| | Before | After |
|---|---|---|
| `/admin/tickets` at 440 px, the width of the layout viewport | **852** | **440** |
| the width of the navigation of the phone | **852** | **440** |
| the tabs of the navigation | "Tickets" at 342..510, "Audit" at 510..679, "More" at 679..848 — **outside the screen** | all five between 4 and 436 |
| the navigation of the phone | at 1781..1852 — **825 pixels below the screen** | at 885..956 — at the bottom of the screen |
| the subject of a long ticket | ran out of the card and off the screen | cut inside the card with an ellipsis |
| the document | 852 wide | 440 wide |

The customer area was measured on the same build: **54 combinations of route
and width, 540 checks, no problem.** The staff area: **66 combinations, no
problem.**

The widths that were measured: 320, 360, 375, 390, 430 and 440 CSS px, with
the emulation of a phone.

---

## 7. The files that were changed

| File | What was changed |
|---|---|
| `web/src/index.css` | the column of a grid may be smaller than its content; the faces of proxima nova under `/fonts/` |
| `web/src/ui-app.tsx` | the list of the cards gets a column that may shrink; the line of a row that holds a cut text; the room of the mark of the site |
| `web/src/app/*.tsx` | the line that holds a cut text: Billing, Deploy, DeployCatalog, Domains, InstanceDetail, Instances, Overview |
| `web/src/admin/*.tsx` | the same, in Customers, Orders, Pricing, Products, Promotions, Services, Staff, Tickets |
| `web/src/home/Catalog.tsx`, `web/src/pages/Status.tsx` | the same |
| `web/server.mjs` | the typeface is served from `/fonts/`; the health of the site names the state of the typeface; the Adobe kit is gone |
| `web/fonts.mjs` (new) | the files of the typeface and the report of their state |
| `web/fontkit.mjs` (removed) | the kit of Adobe and the reading of its stylesheet |
| `web/public/fonts/README.md` (new) | what the operator has to place there |
| `web/tests/fonts.test.mjs` (new) | the faces, the weights and the report of the typeface |
| `web/tests/fonts-server.test.mjs` (new) | the server serves the files, the health names the missing ones |
| `web/tests/fontkit.test.mjs` (removed) | the rules of the kit of Adobe |
| `web/Dockerfile` | the new module of the typeface |
| `compose.web.yml` | `ADOBE_FONTS_KIT_URL` and `ADOBE_FONTS_FAMILY` are gone |
| `.gitignore` | the files of the typeface stay out of the history |
| `docs/TYPOGRAPHY.md` | the way of the self-hosting and the exact step of the operator |
| `scripts/ops/browser-mobile-real.mjs` (new) | the check of the phone |
| `scripts/ops/browser-overflow-source.mjs` (new) | the element that makes a page too wide |
| `scripts/ops/browser-fonts.mjs` (new) | the typeface the browser really used |
| `scripts/ops/browser-mobile-diagnose.mjs` (new) | the first measurement of the layout |
| `scripts/ops/apply-truncate-fix.mjs` (new) | the round of the change of the cut texts, checked |

---

## 8. What is not settled here

* **The typeface itself.** The three licensed web files are not in the
  machine. The interface draws with Geist until they are there. Nothing was
  substituted and nothing was claimed.
* **Safari on a real phone.** There is no Safari and no WebKit in this
  environment — no `WebKitWebDriver`, no `epiphany`, no cached Playwright
  browser — so the measurements were made in Chromium 156 only. The rules
  that were changed are plain CSS (`minmax(0, 1fr)`, `w-0`, `min-width: 0`),
  which Safari reads the same way, but that was not measured.
* **The gateway holds the fonts for four hours.** The server answers with
  `public, max-age=0, must-revalidate` and an `ETag`; the gateway in front of
  the site rewrites the time to four hours. A file that is replaced may be
  held for that long, so it is purged at the gateway when it changes.
* **The payments and the mail.** `STRIPE_SECRET_KEY` and `SMTP_URL` are
  empty, so the checkout answers `503 payments_unavailable` and the mail is
  written to a file. Nothing of that was touched in this round.
