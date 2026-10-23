/**
 * The typefaces of the interface.
 *
 * proxima nova is served from the machine itself. The files live under
 * `/fonts/` on the site and are named here, so the interface asks the browser
 * for them and the browser finds them on the same origin as the page.
 *
 * The files themselves are not part of this project. A typeface that is
 * licensed for the desktop is not licensed for the web, so the desktop files
 * are never converted and never published. The operator places the licensed
 * web files under `web/public/fonts/` and the build puts them next to the
 * page under `/fonts/`.
 *
 * The family of the interface is proxima nova, with Geist as the fallback.
 * The fallback stays in the stack, so the interface is readable before the
 * files arrive and when they are not there at all.
 */

/** The family the interface asks for first. */
export const PROXIMA_NOVA_FAMILY = 'Proxima Nova';

/** The families that are always the fallback of the interface. */
export const FALLBACK_SANS = ['Geist Variable', 'Inter', 'system-ui', 'sans-serif'];

/**
 * The web files of proxima nova that the interface needs.
 *
 * The three weights are the ones the interface asks for. A weight that is
 * not there is not invented by the browser: the browser takes the nearest
 * weight it has, so the three of them are named here.
 */
export const PROXIMA_NOVA_FILES = [
  { file: 'proxima-nova-400.woff2', weight: 400 },
  { file: 'proxima-nova-600.woff2', weight: 600 },
  { file: 'proxima-nova-700.woff2', weight: 700 },
];

/**
 * The stack of the interface.
 *
 * proxima nova comes first and Geist stays the fallback, so the page is
 * never left without a typeface.
 */
export function sansStack() {
  return [PROXIMA_NOVA_FAMILY, 'proxima-nova', ...FALLBACK_SANS];
}

/** The stack of the interface, written the way the browser reads it. */
export function sansStackValue() {
  return sansStack()
    .map((name) => `"${name}"`)
    .join(', ');
}

/**
 * The faces of proxima nova, as the text of a stylesheet.
 *
 * The paths are absolute and start with a slash, so they point at the files
 * under `/fonts/` on the site and not at a file of the build.
 */
export function fontFaceRules() {
  return PROXIMA_NOVA_FILES.map(
    ({ file, weight }) =>
      `@font-face{font-family:"${PROXIMA_NOVA_FAMILY}";` +
      `src:url("/fonts/${file}") format("woff2");` +
      `font-weight:${weight};font-style:normal;font-display:swap;}`,
  );
}

/**
 * The files that are not there.
 *
 * The list is what the operator has to place under `web/public/fonts/`.
 */
export function missingFiles(present) {
  const have = new Set(present || []);
  return PROXIMA_NOVA_FILES.map(({ file }) => file).filter((file) => !have.has(file));
}

/**
 * What the site knows about the typeface of the interface.
 *
 * The answer is written down in the health of the site, so the operator can
 * see whether the files are there without looking into the container.
 */
export function fontStatus(present) {
  const missing = missingFiles(present);
  return {
    family: PROXIMA_NOVA_FAMILY,
    installed: missing.length === 0,
    files: PROXIMA_NOVA_FILES.map(({ file, weight }) => ({
      file: `/fonts/${file}`,
      weight,
      present: (present || []).includes(file),
    })),
    missing: missing.map((file) => `/fonts/${file}`),
    fallback: FALLBACK_SANS[0],
  };
}
