# The typefaces of the interface

The web files of **proxima nova** belong here. The build copies this folder
next to the page, so the browser asks the site for the files under `/fonts/`.

The files are not part of the project. A typeface that is licensed for the
desktop is not licensed for the web, so the desktop `.otf` files are never
converted and never published. The operator places the licensed **woff2**
files here:

| File | Weight |
| --- | --- |
| `proxima-nova-400.woff2` | 400 (regular) |
| `proxima-nova-600.woff2` | 600 (semibold) |
| `proxima-nova-700.woff2` | 700 (bold) |

The names have to be exactly these: the interface asks for them by name and
`web/fonts.mjs` names the files that are missing when they are not there.

The site works without them. The interface then uses the Geist fallback and
`/healthz` names the files that are still missing.

See `docs/TYPOGRAPHY.md`.
