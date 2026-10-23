# Typography

## 1. The typefaces

**proxima nova** is the typeface of the interface. It is used in three
weights, the ones the typeface really has:

| Weight | proxima nova |
|---|---|
| 400 | Regular |
| 600 | Semibold |
| 700 | Bold |

**Geist Mono** stays the monospaced family of the product. It is used for
ports, console output, code and numerical data — the places where a column
of characters has to line up or where the text is read as code.

The two families are declared once, in the theme block of
`web/src/index.css`:

```css
--font-sans: "Proxima Nova", "proxima-nova", "Geist Variable", "Inter", system-ui, sans-serif;
--font-mono: "Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace;
```

Both spellings of the family are asked for, because the Adobe Fonts web
project may declare it as `Proxima Nova` or as `proxima-nova`.

Nothing else in the codebase sets a font family, so the interface uses the
sans stack and the data uses the mono stack everywhere.

## 2. The weights

proxima nova has no weight between 400 and 600, and none above 700. The
tokens in `web/src/index.css` therefore map every weight request onto one of
the three weights that exist:

| Token | Value | proxima nova |
|---|---|---|
| `--font-weight-normal` | 400 | Regular |
| `--font-weight-medium` | 400 | Regular |
| `--font-weight-semibold` | 600 | Semibold |
| `--font-weight-bold` | 700 | Bold |
| `--font-weight-extrabold` | 700 | Bold |
| `--font-weight-black` | 700 | Bold |

Because the mapping sits in the tokens, every `font-medium`,
`font-extrabold` and `font-black` in the codebase already asks for a weight
that exists. **No component had to be edited for this, and none should be.**
The browser never has to synthesise a weight it cannot draw.

## 3. How the typeface reaches the browser

The only licensed way to serve proxima nova on a website is the **web
project of Adobe Fonts** — the kit of the account, which Adobe serves from
`https://use.typekit.net/<kit-id>.css`.

The web server loads that kit when the host tells it where the kit is:

| Variable | Purpose | Required | Secret |
|---|---|---|---|
| `ADOBE_FONTS_KIT_URL` | The full stylesheet URL of the Adobe Fonts web project, for example `https://use.typekit.net/abc1234.css`. | no | no |

The value is checked before it is used:

* it has to be a valid `https:` URL,
* its host has to be exactly `use.typekit.net` or `p.typekit.net`.

Anything else — a URL of another host, an `http:` URL, a value that is not a
URL — is refused with a warning in the server console, and nothing is
written into the page. A stylesheet that is written into the page is loaded
by every visitor, so only a URL of Adobe itself may end up there.

When the variable is set and valid, the served HTML gets three lines in its
head:

```html
<!-- Webfonts loaded by Adobe Fonts -->
<link rel="preconnect" href="https://use.typekit.net" crossorigin>
<link rel="stylesheet" href="https://use.typekit.net/abc1234.css">
```

That is the whole integration. The kit declares its own `@font-face` rules
and its own `font-display: swap`, so there is **no** preload, **no**
tracking script and **no** local `@font-face` rule for proxima nova.

When the variable is not set, the HTML is served exactly as it is on disk:
no link, no empty tag, no comment. The page is not slower and not different
in any way.

## 4. The desktop font files stay out of the repository

Three desktop Adobe font files were supplied for reference: `Proxima Nova.otf`
(Regular 400), `Proxima Nova Semibold - 173.otf` (600) and
`Proxima Nova Bold.otf` (700).

**They are not in the repository, and they must not be added.** A desktop
Adobe license covers the desktop applications, not a website. Serving a
desktop font file from a website — self-hosted, converted to `woff2`,
subsetted, or inlined as base64 in a stylesheet — needs a web license, and
nobody has confirmed one. Converting the file does not change the license.

The font files themselves say the same thing: the `OS/2` table of all three
files has `fsType = 0x0004`, the *preview and print* embedding permission.
They may be printed, not embedded in a web page.

The consequence, written down so that nobody has to rediscover it:

* no `.otf`, `.woff` or `.woff2` of proxima nova in the repository,
* none in `web/public`, so none in the build output and none in the image,
* no `@font-face` rule for proxima nova in `web/src/index.css`,
* no conversion of the supplied files anywhere.

The licensed path is the one in section 3.

## 5. The fallback, and why the site looks the same today

Until a web project is configured, `"Proxima Nova"` resolves to nothing and
the browser falls through to **Geist Variable**. The site looks and works
exactly as it does now.

That is the current state, and it is deliberate. The typeface is asked for
by the tokens from the start, so the moment the kit is configured the
interface switches over — without a rebuild, without a commit and without
editing a single component.

## 6. Checklist for the operator

1. **Find the kit.** Sign in at [fonts.adobe.com](https://fonts.adobe.com)
   and open the web project (kit) that contains proxima nova. If there is
   none, create one and add proxima nova to it. Use the **web project**, not
   the desktop app activation.
2. **Copy the kit URL.** The web project panel shows the embed code; the URL
   is the `https://use.typekit.net/<kit-id>.css` inside it.
3. **Set it on the host.** In `compose.web.yml`, in the `web` service:

   ```yaml
   environment:
     ADOBE_FONTS_KIT_URL: https://use.typekit.net/abc1234.css
   ```

   Then start the web container again:

   ```bash
   docker compose -f compose.yml -f compose.api.yml -f compose.web.yml up -d web
   ```

   No rebuild and no commit: the server reads the variable when it starts.
   (When the server runs directly, set it in the environment of the process
   that runs `node server.mjs`.)
4. **Check the console.** A working kit prints
   `Adobe Fonts web project: https://use.typekit.net/abc1234.css`. A refused
   URL prints a warning and the site keeps the Geist fallback.
5. **Check the browser.** The network tab shows a request for
   `use.typekit.net/....css` (and for the font files that stylesheet points
   at), and the computed `font-family` of `body` lists proxima nova first.
6. **Check the family name** — see the next section.

## 7. The family name of the kit

The token asks for the family `Proxima Nova`. The kit stylesheet declares
the family name Adobe uses for the project, which can differ in spelling
(`proxima-nova`, for instance).

Open the kit CSS once and compare its `font-family:` value with
`--font-sans` in `web/src/index.css`. CSS matches family names
case-insensitively, but a space and a hyphen are not the same name, so a kit
that declares `proxima-nova` does not answer to `Proxima Nova`.

There are two ways to settle it, and both are one line:

* name the family `Proxima Nova` in the web project, so the kit declares
  that name, or
* add the name of the kit to the token:
  `--font-sans: "Proxima Nova", "proxima-nova", "Geist Variable", ...`.

Nothing else changes.

## 8. What not to do

* Do not add the desktop `.otf` files to the repository, to `web/public` or
  to the image — see section 4.
* Do not convert them to `woff2` to get around that. The license does not
  change with the format.
* Do not add a local `@font-face` rule for proxima nova. The kit declares its
  own faces; a local rule would shadow the licensed ones.
* Do not add a tracking script for the font. The stylesheet link is the
  whole integration.
