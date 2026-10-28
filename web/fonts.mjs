/**
 * The typefaces of the interface.
 *
 * The interface asks for **Geist Variable** and for **Geist Mono Variable**,
 * and it asks this site for them: the files of the typeface are written into
 * the build of the page, next to the other files of the site, and the server
 * hands them out with `font/woff2`. The visitor never asks a house of
 * typefaces for a letter, and the browser never shifts the page while the
 * letters arrive.
 *
 * The typeface of the machine is still the last name of the stack, so the
 * page keeps reading on a machine where the files did not load.
 *
 * The only other font the site fetches is the icon font of Font Awesome, and
 * it carries no letter of the text.
 */

/** The family the interface asks for first. */
export const SANS_FAMILY = "Geist Variable";

/** The family the console, the codes and the numbers ask for first. */
export const MONO_FAMILY = "Geist Mono Variable";

/**
 * The stack of the text of the interface.
 *
 * The stack starts with the typeface of the site and ends with the generic
 * family, so every browser of every system has something to draw with, even
 * when none of the named families is there.
 */
export const SANS_STACK = [
  "Geist Variable",
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  "Segoe UI",
  "Roboto",
  "Helvetica Neue",
  "Noto Sans",
  "Arial",
  "sans-serif",
];

/**
 * The stack of the text of the console, of the codes and of the numbers.
 *
 * The stack starts with the typeface of the site and ends with the generic
 * family, the same way the stack of the text does.
 */
export const MONO_STACK = [
  "Geist Mono Variable",
  "ui-monospace",
  "SFMono-Regular",
  "SF Mono",
  "Menlo",
  "Consolas",
  "Liberation Mono",
  "monospace",
];

/**
 * The names the browser reads without quotes.
 *
 * A generic family and the name of a system family are written as they are.
 * Every other name is written between quotes, because it has a space in it.
 */
const PLAIN = new Set([
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  "Roboto",
  "Arial",
  "sans-serif",
  "ui-monospace",
  "monospace",
]);

/** The name of a family, the way the browser reads it. */
export function familyName(name) {
  return PLAIN.has(name) ? name : `"${name}"`;
}

/** The stack of the text of the interface. */
export function sansStack() {
  return [...SANS_STACK];
}

/** The stack of the console and of the codes. */
export function monoStack() {
  return [...MONO_STACK];
}

/** The stack of the interface, written the way the browser reads it. */
export function sansStackValue() {
  return SANS_STACK.map(familyName).join(", ");
}

/** The stack of the console, written the way the browser reads it. */
export function monoStackValue() {
  return MONO_STACK.map(familyName).join(", ");
}

/**
 * What the site knows about the typeface of the interface.
 *
 * The files of the typeface are part of the build of the site, so there is
 * nothing to install on the host and nothing that can be missing from it:
 * the build either wrote the files or the site was never built. The answer is
 * written down in the health of the site, so the operator can see that the
 * typeface of the interface is served by the site itself and not by a third
 * party.
 */
export function fontStatus() {
  return {
    family: SANS_FAMILY,
    installed: true,
    webfont: true,
    // The files are written by the build and are served by this server.
    source: "self",
    files: [],
    missing: [],
    fallback: "sans-serif",
    mono: MONO_FAMILY,
  };
}
