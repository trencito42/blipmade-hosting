# Typography

## 1. The typeface of the interface

**The typeface of the interface is the typeface of the machine of the
visitor.** There is no web font for the text: no file of a typeface is
downloaded, no house of typefaces is asked for anything, and the page is
painted with the letters the visitor already has.

The stack is written once, in the theme block of `web/src/index.css`:

```css
--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
```

The stack starts with the system font of the visitor and ends with the
generic family, so every browser of every system has something to draw with,
even when none of the named families is there. The console, the codes and the
numbers use the monospace stack, because a column of characters has to line
up and a port has to be read as a port.

Nothing else in the codebase sets a font family, so the interface uses the
sans stack and the data uses the mono stack everywhere.

### Why the typeface of the machine

| What the web font costs | What the system font gives |
|---|---|
| A request to a house of typefaces for every visitor | No request at all: the letters are already on the machine |
| A page that is painted twice: once in the fallback, once in the typeface | A page that is painted once, the first time |
| A shift of the text when the typeface arrives | No shift: the size of the letters is known before the page is painted |
| A license that has to be checked before the site is published | No license: the typeface is the one of the operating system |
| The same look only on the systems the file was tested on | The look the visitor expects from their own machine |

The weight tokens are the same as before and they are still normalized, so
every `font-medium`, `font-extrabold` and `font-black` of the codebase asks
for a weight the browser can draw and nothing is synthesised:

| Token | Value |
|---|---|
| `--font-weight-normal` | 400 |
| `--font-weight-medium` | 400 |
| `--font-weight-semibold` | 600 |
| `--font-weight-bold` | 700 |
| `--font-weight-extrabold` | 700 |
| `--font-weight-black` | 700 |

## 2. The only font the site fetches

The **icon font** of Font Awesome 7 Pro is the only font the browser
downloads, and it carries no letter of the text. It is served by the site
itself, under `/fontawesome/`:

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
Typeface: System UI of the machine of the visitor, no web font for the text.
```

The **health of the site** answers with the same thing:

```bash
curl -s https://blipmade.com/healthz
```

```json
{
  "status": "ok",
  "fonts": {
    "family": "System UI",
    "installed": true,
    "webfont": false,
    "files": [],
    "missing": [],
    "fallback": "sans-serif",
    "mono": "ui-monospace"
  }
}
```

There is nothing to be missing any more: the typeface of the interface is
the one of the machine of the visitor.

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
