/**
 * The typefaces of the interface.
 *
 * The interface asks for the typeface of the machine and for nothing else.
 * There is no web font for the text: no file of a typeface is downloaded, no
 * request goes to a house of typefaces, and the page is painted with the
 * letters the visitor already has. The interface is therefore the same on
 * every system, it never shifts while a font arrives, and it never sends the
 * visitor to a third party to read a page.
 *
 * The only font the site fetches is the icon font of Font Awesome, and it
 * carries no letter of the text.
 */

/** The family the interface asks for first. */
export const SYSTEM_UI_FAMILY = "system-ui";

/**
 * The stack of the text of the interface.
 *
 * The stack starts with the system font of the visitor and ends with the
 * generic family, so every browser of every system has something to draw
 * with, even when none of the named families is there.
 */
export const SANS_STACK = [
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
 * The stack starts with the monospace font of the machine and ends with the
 * generic family, the same way the stack of the text does.
 */
export const MONO_STACK = [
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

/** The stack of the text of the console and of the codes. */
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
 * There is nothing to install and nothing to be missing: the typeface is the
 * one of the machine of the visitor. The answer is written down in the
 * health of the site, so the operator can see that the site does not depend
 * on a file of a typeface.
 */
export function fontStatus() {
  return {
    family: "System UI",
    installed: true,
    webfont: false,
    files: [],
    missing: [],
    fallback: "sans-serif",
    mono: "ui-monospace",
  };
}
