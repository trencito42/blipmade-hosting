# Typography

## 1. The typeface of the interface

**The interface wears three typefaces, and the site serves all of them.** The
files of the typefaces are part of the build of the page: the browser asks this
site for them and never a third party, and the page never shifts while the
letters arrive.

| What it is written in | The typeface |
|---|---|
| The text of the interface | **Hanken Grotesk Variable** |
| The headings of the interface | **Funnel Display Variable** |
| The console, the codes and the numbers | **JetBrains Mono Variable** |

The typefaces come from three packages that carry the files themselves:

```json
"@fontsource-variable/funnel-display": "^5.3.0",
"@fontsource-variable/hanken-grotesk": "^5.3.0",
"@fontsource-variable/jetbrains-mono": "^5.3.0"
```

The stylesheet of the site asks for the families by their name, and the
packages write the faces into the build:

```css
@import "@fontsource-variable/funnel-display";
@import "@fontsource-variable/hanken-grotesk";
@import "@fontsource-variable/jetbrains-mono";

--font-display: "Funnel Display Variable", "Hanken Grotesk Variable", system-ui, sans-serif;
--font-sans: "Hanken Grotesk Variable", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono: "JetBrains Mono Variable", ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace;
```

The stack starts with the typeface of the site and ends with the generic
family, so every browser of every system has something to draw with, even when
the files did not load. The console, the codes and the numbers use the
monospace stack, because a column of characters has to line up and a port has
to be read as a port.

The headings fall back on the typeface of the text, so a page that has only
one of the two files still reads.

Nothing else in the codebase sets a font family, so the interface uses the
sans stack, the headings the display stack and the data the mono stack
everywhere.

### Why the typeface of the site

The typeface of the machine was the rule until the first redesign of the site,
and the first redesign wore Geist. The second redesign wears the design of the
reference, and the reference asks for Funnel Display, Hanken Grotesk and
JetBrains Mono. The rule that did not change is the one that matters most:
**no house of typefaces is asked for anything.** The files are in the build,
the site hands them out, and the visitor is never sent anywhere else.

| What a web font from a third party costs | What the typeface of the site costs |
|---|---|
| A request to a house of typefaces for every visitor | A request to this site, and the files are in the build already |
| A page that is painted twice: once in the fallback, once in the typeface | The same, and the size of the letters is known before the page is painted |
| A license of a third party to be checked before the site is published | The files are in the repository, under the license of the package |
| The same look only on the systems the file was tested on | The same look on every system, and the typeface of the machine is the fallback |

The weight tokens are normalized, so every `font-medium`, `font-semibold` and
`font-extrabold` of the codebase asks for a weight the browser can draw and
nothing is synthesised:

| Token | Value |
|---|---|
| `--font-weight-normal` | 400 |
| `--font-weight-medium` | 500 |
| `--font-weight-semibold` | 600 |
| `--font-weight-bold` | 700 |
| `--font-weight-extrabold` | 800 |
| `--font-weight-black` | 900 |

## 2. The other font the site fetches

The **icon font** of Font Awesome 7 Pro carries no letter of the text. It is
served by the site itself, under `/fontawesome/`:

```html
<link rel="stylesheet" href="/fontawesome/css/pro.min.css" />
```

The stylesheet is loaded once, before the styles of the application, so the
application can override anything it needs. The stylesheet and the web fonts
are **not in the repository**, because Font Awesome Pro is licensed and the
repository is public. They are placed on the machine by the operator:

```bash
cd /opt/blipmade
python3 scripts/download-fontawesome-pro.py --version 7.3.1 --output web/public/fontawesome
```

The script downloads the stylesheet and every web font the stylesheet names,
checks that each file is a real WOFF2 and stops when one is not. It can be
run again at any time: a file that is already there and is whole is kept.

The build copies `web/public/` next to the page, so the files end up in the
image under `/app/dist/fontawesome/` and are served from `/fontawesome/`.

## 3. What the site says about itself

The **console of the web container** names the typeface of the interface:

```text
Typeface: Hanken Grotesk Variable, Funnel Display Variable and JetBrains Mono Variable, served by this site.
```

The **health of the site** answers with the same thing:

```bash
curl -s https://blipmade.com/healthz
```

```json
{
  "status": "ok",
  "fonts": {
    "family": "Hanken Grotesk Variable",
    "display": "Funnel Display Variable",
    "installed": true,
    "webfont": true,
    "source": "self",
    "files": [],
    "missing": [],
    "fallback": "sans-serif",
    "mono": "JetBrains Mono Variable"
  }
}
```

There is nothing to be missing: the files of the typeface are written by the
build, and the build either wrote them or the site was never built.

## 4. The checklist for the operator

1. **Put the icon font in place**, before the site is built:

   ```bash
   cd /opt/blipmade
   python3 scripts/download-fontawesome-pro.py --version 7.3.1 --output web/public/fontawesome
   ```

   The files are part of the image, so the container has to be built again.
   There is no variable to set and nothing to configure.

2. **Build and start the site again:**

   ```bash
   docker compose -f compose.yml -f compose.api.yml -f compose.web.yml build web
   docker compose -f compose.yml -f compose.api.yml -f compose.web.yml up -d --force-recreate web
   ```

3. **Check that the icon font is served:**

   ```bash
   curl -sI https://blipmade.com/fontawesome/css/pro.min.css | head -1
   ```

   The answer has to be `HTTP/1.1 200 OK`.

4. **Check that the typeface of the text is served by the site** and not by a
   third party:

   ```bash
   curl -s https://blipmade.com/healthz
   ```

   `fonts.source` has to be `self` and `fonts.family` has to be
   `Hanken Grotesk Variable`.

## 5. What changed in the redesign of the site

The interface used to ask for the typeface of the machine of the visitor, and
the rule was written down in `web/fonts.mjs`, in `web/tests/fonts.test.mjs`
and in `docs/CUSTOMER_PANEL_AUDIT.md`. The redesigns of the site wear the
design of the reference, and the reference asks for its own typefaces, so the
typefaces changed twice:

- the stack of the text starts with `Hanken Grotesk Variable`, the stack of the
  headings with `Funnel Display Variable` and the stack of the console with
  `JetBrains Mono Variable`;
- the three packages of the typefaces carry the files, and the build writes
  them into the site;
- the rule that did not change: no request leaves the site for a letter.
