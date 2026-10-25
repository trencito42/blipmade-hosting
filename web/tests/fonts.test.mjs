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
  MONO_STACK,
  SANS_STACK,
  SYSTEM_UI_FAMILY,
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

test("the interface asks for the typeface of the machine", () => {
  const stack = sansStack();
  assert.equal(stack[0], SYSTEM_UI_FAMILY);
  assert.equal(stack[stack.length - 1], "sans-serif");

  // The stack is written the way the browser reads it: the generic family
  // and the system families are written as they are, the other names are
  // written between quotes.
  assert.equal(sansStackValue().startsWith("system-ui"), true);
  assert.ok(sansStackValue().includes(`"Segoe UI"`));
  assert.equal(sansStackValue().includes(`"system-ui"`), false);
  assert.equal(familyName("Segoe UI"), `"Segoe UI"`);
  assert.equal(familyName("system-ui"), "system-ui");
});

test("the console and the codes have the monospace of the machine", () => {
  const stack = monoStack();
  assert.equal(stack[0], "ui-monospace");
  assert.equal(stack[stack.length - 1], "monospace");
  assert.equal(monoStackValue().startsWith("ui-monospace"), true);
  assert.ok(MONO_STACK.includes("Menlo"));
});

test("the stylesheet carries no face of a typeface", () => {
  // There is no web font for the text: a face would make the browser ask
  // for a file of a typeface and the page would wait for it.
  assert.equal(css.includes("@font-face"), false);
  assert.equal(/\.woff2?\)/.test(css), false);
});

test("the stylesheet asks for the system font and for nothing else", () => {
  assert.ok(css.includes("--font-sans: system-ui"));
  assert.ok(css.includes("--font-mono: ui-monospace"));
  assert.equal(css.includes("Proxima Nova"), false);
  assert.equal(css.includes("Geist"), false);
  assert.equal(css.includes("@fontsource"), false);
});

test("the project does not depend on a package of a typeface", () => {
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of Object.keys(dependencies)) {
    assert.equal(
      name.startsWith("@fontsource"),
      false,
      `the project still depends on ${name}`,
    );
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

test("the report of the site says that the typeface is the one of the machine", () => {
  const status = fontStatus();
  assert.equal(status.family, "System UI");
  assert.equal(status.installed, true);
  assert.equal(status.webfont, false);
  assert.deepEqual(status.files, []);
  assert.deepEqual(status.missing, []);
  assert.equal(status.fallback, "sans-serif");
});

test("the stack of the interface is the stack of the module", () => {
  assert.deepEqual(sansStack(), SANS_STACK);
  assert.deepEqual(monoStack(), MONO_STACK);
});
