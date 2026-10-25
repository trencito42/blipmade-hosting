import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ICONS, iconClasses, iconNames } from "../src/icon-map.ts";

/**
 * The icons of the interface.
 *
 * Every icon of the platform is a Font Awesome 7 Pro Duotone icon. The table
 * of the icons is the only place that names an icon of the font, and every
 * name of the table has to be an icon the installed font really has: an icon
 * that does not exist is an empty box in the interface.
 *
 * The font itself is not part of the project, because it is licensed. The
 * test is skipped on a machine where the font is not installed, and it is
 * strict on a machine where it is.
 */

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const cssPath = join(web, "public", "fontawesome", "css", "pro.min.css");
const installed = existsSync(cssPath);

/** The classes of the font that are not the name of an icon. */
const FAMILIES = new Set(["fa-icon", "fa-sharp-duotone", "fa-duotone", "fa-regular", "fa-solid"]);

test("every icon of the table is written in the same way", () => {
  const names = iconNames();
  assert.ok(names.length >= 20, "the table of the icons is too small");

  const seen = new Set<string>();
  for (const name of names) {
    const spec = ICONS[name];
    assert.match(spec.name, /^[a-z0-9-]+$/, `the icon ${name} is not written in kebab-case`);
    assert.equal(seen.has(spec.name), false, `the icon ${spec.name} is used twice`);
    seen.add(spec.name);
    if (spec.family) assert.ok(["sharp", "classic"].includes(spec.family));
    if (spec.weight) assert.ok(["regular", "solid"].includes(spec.weight));
  }
});

test("an icon is a duotone icon of the shape and the weight that were asked for", () => {
  assert.equal(iconClasses("check"), "fa-sharp-duotone fa-regular fa-check");
  assert.equal(iconClasses("check", "classic"), "fa-duotone fa-regular fa-check");
  assert.equal(iconClasses("check", undefined, "solid"), "fa-sharp-duotone fa-solid fa-check");
  assert.equal(
    iconClasses("check", "classic", "solid"),
    "fa-duotone fa-solid fa-check",
  );
});

test("every icon of the table is an icon the installed font has", (t) => {
  if (!installed) {
    t.skip("the icon font is not installed on this machine");
    return;
  }
  const css = readFileSync(cssPath, "utf8");
  for (const name of iconNames()) {
    const spec = ICONS[name];
    assert.ok(
      css.includes(`.fa-${spec.name}`),
      `the font has no icon named ${spec.name}`,
    );
  }
  // The duotone families and the weights the interface uses have to be there.
  for (const family of ["fa-sharp-duotone", "fa-duotone", "fa-regular", "fa-solid"]) {
    assert.ok(css.includes(family), `the font has no ${family}`);
  }
  // The second layer of a duotone icon takes its opacity from a variable.
  assert.ok(css.includes("--fa-secondary-opacity"));
  assert.ok(css.includes("--fa-secondary-color"));
  assert.ok(css.includes("--fa-primary-color"));
});

test("the table of the icons is the only place that names an icon of the font", () => {
  const offenders: string[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (path.endsWith(join("src", "icon-map.ts"))) continue;
      const source = readFileSync(path, "utf8");
      // The names of the CSS variables of the font, like --fa-primary-color,
      // are not the name of an icon.
      for (const match of source.matchAll(/(?<![-\w])fa-[a-z0-9-]+/g)) {
        if (!FAMILIES.has(match[0])) {
          offenders.push(`${path}: ${match[0]}`);
        }
      }
    }
  };

  walk(join(web, "src"));
  assert.deepEqual(offenders, []);
});
