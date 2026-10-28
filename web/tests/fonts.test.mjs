/**
 * The typefaces of the interface, checked without a browser.
 *
 *     node --test web/tests/fonts.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  DISPLAY_FAMILY,
  DISPLAY_STACK,
  MONO_FAMILY,
  MONO_STACK,
  SANS_FAMILY,
  SANS_STACK,
  displayStack,
  displayStackValue,
  familyName,
  fontStatus,
  monoStack,
  monoStackValue,
  sansStack,
  sansStackValue,
} from "../fonts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "..", "src", "index.css"), "utf8");
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));

test("the interface asks for the typeface of the site", () => {
  const stack = sansStack();
  assert.equal(stack[0], SANS_FAMILY);
  assert.equal(stack[stack.length - 1], "sans-serif");

  // The stack is written the way the browser reads it: the generic family
  // and the system families are written as they are, the other names are
  // written between quotes.
  assert.equal(sansStackValue().startsWith(`"Hanken Grotesk Variable"`), true);
  assert.ok(sansStackValue().includes(`"Segoe UI"`));
  assert.equal(sansStackValue().includes(`"system-ui"`), false);
  assert.equal(familyName("Segoe UI"), `"Segoe UI"`);
  assert.equal(familyName("system-ui"), "system-ui");
});

test("the headings ask for the typeface of the display", () => {
  const stack = displayStack();
  assert.equal(stack[0], DISPLAY_FAMILY);
  assert.equal(stack[stack.length - 1], "sans-serif");
  assert.equal(displayStackValue().startsWith(`"Funnel Display Variable"`), true);
  // The headings fall back on the typeface of the text, so a page that has
  // only one of the two files still reads.
  assert.ok(DISPLAY_STACK.includes(SANS_FAMILY));
});

test("the console and the codes have the monospace of the site", () => {
  const stack = monoStack();
  assert.equal(stack[0], MONO_FAMILY);
  assert.equal(stack[stack.length - 1], "monospace");
  assert.equal(monoStackValue().startsWith(`"JetBrains Mono Variable"`), true);
  assert.ok(MONO_STACK.includes("Menlo"));
});

test("the stylesheet carries no face of a typeface of its own", () => {
  // The faces of the typeface come with the package of the typeface and are
  // written by the build, not by the stylesheet of the site. The stylesheet
  // only asks for the family by its name.
  assert.equal(css.includes("@font-face"), false);
  assert.equal(/\.woff2?\)/.test(css), false);
});

test("the stylesheet asks for the typeface of the site", () => {
  assert.ok(css.includes(`--font-sans: "Hanken Grotesk Variable"`));
  assert.ok(css.includes(`--font-display: "Funnel Display Variable"`));
  assert.ok(css.includes(`--font-mono: "JetBrains Mono Variable"`));
  // The typeface of the machine is still the last name of the stack, so the
  // page keeps reading when the files did not load.
  assert.ok(css.includes("system-ui"));
  assert.equal(css.includes("Proxima Nova"), false);
  assert.equal(css.includes("Geist"), false);
  // The files come from the package of the typeface, so the site asks no
  // house of typefaces for them.
  assert.ok(css.includes(`@import "@fontsource-variable/funnel-display"`));
  assert.ok(css.includes(`@import "@fontsource-variable/hanken-grotesk"`));
  assert.ok(css.includes(`@import "@fontsource-variable/jetbrains-mono"`));
});

test("the typeface comes from a package of the site, and not from a third party", () => {
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  const fontPackages = Object.keys(dependencies).filter((name) => name.startsWith("@fontsource"));
  // The three packages of the typeface of the site are the only ones, and the
  // files they carry are written into the build of the page.
  assert.deepEqual(fontPackages.sort(), [
    "@fontsource-variable/funnel-display",
    "@fontsource-variable/hanken-grotesk",
    "@fontsource-variable/jetbrains-mono",
  ]);
  for (const name of fontPackages) {
    assert.ok(dependencies[name], `${name} is missing`);
  }
});

test("the site does not ask a third party for a typeface", () => {
  for (const marker of [
    "typekit",
    "use.typekit.net",
    "p.typekit.net",
    "fonts.googleapis",
    "fonts.gstatic",
    "kit-pro.fontawesome.com",
  ]) {
    assert.equal(css.includes(marker), false, `the stylesheet still refers to ${marker}`);
  }
});

test("the report of the site says that the typeface is served by the site", () => {
  const status = fontStatus();
  assert.equal(status.family, "Hanken Grotesk Variable");
  assert.equal(status.display, "Funnel Display Variable");
  assert.equal(status.mono, "JetBrains Mono Variable");
  assert.equal(status.installed, true);
  assert.equal(status.webfont, true);
  assert.equal(status.source, "self");
  assert.deepEqual(status.files, []);
  assert.deepEqual(status.missing, []);
  assert.equal(status.fallback, "sans-serif");
});

test("the stack of the interface is the stack of the module", () => {
  assert.deepEqual(sansStack(), SANS_STACK);
  assert.deepEqual(displayStack(), DISPLAY_STACK);
  assert.deepEqual(monoStack(), MONO_STACK);
});
