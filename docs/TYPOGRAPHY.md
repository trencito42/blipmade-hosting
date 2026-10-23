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

**The typeface is served from this machine, under `/fonts/`.** There is no
third party involved: the browser asks `blipmade.com` for the files, exactly
like it asks for the stylesheet and the code of the page.

The interface declares the three faces itself, in `web/src/index.css`:

```css
@font-face {
  font-family: "Proxima Nova";
  src: url("/fonts/proxima-nova-400.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

The weights 600 and 700 are declared the same way. The paths are absolute, so
they point at the files on the site and not at a file of the build.

The build copies `web/public/` next to the page, so the files end up in the
image under `/app/dist/fonts/` and are served from `/fonts/`.

The web server serves them with the right type and with an `ETag`:

```text
Content-Type: font/woff2
Cache-Control: public, max-age=0, must-revalidate
ETag: "1a2b-6551f2a1"
```

The name of a file does not change when the file does, so the browser is asked
whether the file changed instead of being told to keep it for a year.

## 4. The files that are needed

**The web files of proxima nova are not in the repository and must not be
added.** A desktop Adobe license covers the desktop applications, not a
website. Serving a desktop font file from a website — self-hosted, converted
to `woff2`, subsetted, or inlined as base64 in a stylesheet — needs a web
license, and nobody has confirmed one. Converting the file does not change
the license.

Three desktop Adobe font files were supplied for reference: `Proxima Nova.otf`
(Regular 400), `Proxima Nova Semibold - 173.otf` (600) and
`Proxima Nova Bold.otf` (700).

The font files themselves say the same thing: the `OS/2` table of all three
files has `fsType = 0x0004`, the *preview and print* embedding permission.
They may be printed, not embedded in a web page.

### What the operator has to place

Three **woff2** files, named exactly like this, under `web/public/fonts/`:

| File | Weight | Style | Subsets |
|---|---|---|---|
| `proxima-nova-400.woff2` | 400 | normal | latin + latin-ext |
| `proxima-nova-600.woff2` | 600 | normal | latin + latin-ext |
| `proxima-nova-700.woff2` | 700 | normal | latin + latin-ext |

The names have to be exactly these. The interface asks for them by name and
`web/fonts.mjs` names the ones that are missing when they are not there.

The files have to be **licensed for the web** — a webfont license that allows
self-hosting. The three weights of one family are enough; the interface asks
for nothing else.

`latin` is the required subset. `latin-ext` is wanted, because the names of
customers, the subjects of tickets and the addresses of domains are written
with the letters of the eastern and the southern half of Europe. A file
without `latin-ext` still works: the browser takes the missing letters from
the fallback of the stack.

The files are **not** in the repository. `.gitignore` keeps `*.woff2` under
`web/public/fonts/` out of the history.

### What happens when they are not there

The site works without them and says so, in three places:

* **The console of the web container** names the files that are missing:

  ```text
  Typeface: the files of Proxima Nova are not all there, so the interface uses Geist Variable. Missing: /fonts/proxima-nova-400.woff2, /fonts/proxima-nova-600.woff2, /fonts/proxima-nova-700.woff2. See docs/TYPOGRAPHY.md.
  ```

* **The health of the site** answers with the state of the typeface:

  ```bash
  curl -s https://blipmade.com/healthz
  ```

  ```json
  {
    "status": "ok",
    "fonts": {
      "family": "Proxima Nova",
      "installed": false,
      "files": [
        { "file": "/fonts/proxima-nova-400.woff2", "weight": 400, "present": false },
        { "file": "/fonts/proxima-nova-600.woff2", "weight": 600, "present": false },
        { "file": "/fonts/proxima-nova-700.woff2", "weight": 700, "present": false }
      ],
      "missing": [
        "/fonts/proxima-nova-400.woff2",
        "/fonts/proxima-nova-600.woff2",
        "/fonts/proxima-nova-700.woff2"
      ],
      "fallback": "Geist Variable"
    }
  }
  ```

* **The browser** asks for the files, gets a 404 and falls through to the
  fallback of the stack. The interface is readable and looks the same. The
  face is simply not used.

**The typeface is never quietly replaced.** The fallback is written in the
stack on purpose and is named in the health of the site.

## 5. The checklist for the operator

1. **Get the licensed web files.** The webfont files of proxima nova for the
   weights 400, 600 and 700, in the `woff2` format, licensed for self-hosting
   on a website. The desktop `.otf` files are not those files.
2. **Put them in place**, under `web/public/fonts/`, with the names of the
   table in section 4.
3. **Build and start the site again:**

   ```bash
   cd /opt/blipmade
   docker compose -f compose.yml -f compose.api.yml -f compose.web.yml build web
   docker compose -f compose.yml -f compose.api.yml -f compose.web.yml up -d --force-recreate web
   ```

   The files are part of the image, so the container has to be built again.
   There is no variable to set and nothing to configure.
4. **Check the console** of the container:

   ```text
   Typeface: Proxima Nova is served from /fonts (3 files)
   ```

5. **Check the health of the site:**

   ```bash
   curl -s https://blipmade.com/healthz | grep -o '"installed":[a-z]*'
   ```

   The answer has to be `"installed":true`.
6. **Check the browser.** Open `https://blipmade.com` in a clean session
   (private window, no cache) and look at the network tab:
   * there are requests for `/fonts/proxima-nova-400.woff2`,
     `/fonts/proxima-nova-600.woff2` and `/fonts/proxima-nova-700.woff2`,
   * they answer `200` with `content-type: font/woff2`,
   * `document.fonts` lists the faces of proxima nova with the weights
     400, 600 and 700, and their state is `loaded`.

   The check can also be made from the console of the page:

   ```js
   getComputedStyle(document.body).fontFamily
   [...document.fonts].filter((f) => f.family.includes('roxima')).map((f) => `${f.family} ${f.weight} ${f.status}`)
   ```

   The second line has to name the family and show `loaded` for the three
   weights.

7. **When a file is replaced.** The server answers with
   `public, max-age=0, must-revalidate` and an `ETag`, so the browser asks
   whether the file changed. The gateway in front of the site rewrites the
   time to four hours, so a file that is replaced may be held for that long.
   Purge `/fonts/*` at the gateway, or wait, before the change is seen.

## 6. The fallback

Until the files are there, `"Proxima Nova"` resolves to nothing and the
browser falls through to **Geist Variable**. The site looks and works exactly
as it does with the typeface.

Geist Mono is never affected: `--font-mono` stays `"Geist Mono Variable"`,
so ports, console output, code and numbers keep their typeface whatever
happens with proxima nova.

## 7. What not to do

* Do not add the desktop `.otf` files to the repository, to `web/public` or
  to the image — see section 4.
* Do not convert them to `woff2` to get around that. The license does not
  change with the format.
* Do not add a stylesheet of Adobe Fonts, a kit URL or any other address of a
  third party. The typeface is served from this machine.
* Do not remove the fallback of the stack. The site has to stay readable
  while the files are not there yet.
* Do not rename the files without changing `web/fonts.mjs` and
  `web/src/index.css` together. The browser asks for them by name.
