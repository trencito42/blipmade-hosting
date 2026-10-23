/**
 * The typefaces of the interface, checked without a browser.
 *
 *     node --test web/tests/fonts.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  FALLBACK_SANS,
  PROXIMA_NOVA_FAMILY,
  PROXIMA_NOVA_FILES,
  fontFaceRules,
  fontStatus,
  missingFiles,
  sansStack,
  sansStackValue,
} from '../fonts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'src', 'index.css'), 'utf8');

test('the interface asks for proxima nova and keeps Geist as the fallback', () => {
  const stack = sansStack();
  assert.equal(stack[0], PROXIMA_NOVA_FAMILY);
  assert.ok(stack.includes('Geist Variable'));
  assert.equal(stack[stack.length - 1], 'sans-serif');

  // The names of the families are written the way the browser reads them.
  assert.equal(sansStackValue().startsWith('"Proxima Nova"'), true);
  assert.ok(sansStackValue().includes('"Geist Variable"'));
  assert.ok(FALLBACK_SANS.includes('Geist Variable'));
});

test('the three weights of proxima nova are asked for', () => {
  assert.deepEqual(
    PROXIMA_NOVA_FILES.map((entry) => entry.weight),
    [400, 600, 700],
  );
  for (const { file, weight } of PROXIMA_NOVA_FILES) {
    assert.match(file, /^proxima-nova-600\.woff2$|^proxima-nova-[467]00\.woff2$/);
    assert.ok(file.endsWith('.woff2'), 'the browser asks for the web format of the font');
    assert.ok(Number.isInteger(weight));
  }
});

test('the faces of the stylesheet point at the files of the site', () => {
  const rules = fontFaceRules();
  assert.equal(rules.length, PROXIMA_NOVA_FILES.length);
  for (const [index, { file, weight }] of PROXIMA_NOVA_FILES.entries()) {
    const rule = rules[index];
    assert.ok(rule.includes(`font-family:"${PROXIMA_NOVA_FAMILY}"`));
    assert.ok(rule.includes(`url("/fonts/${file}")`));
    assert.ok(rule.includes(`font-weight:${weight}`));
    assert.ok(rule.includes('font-display:swap'));
  }
});

test('the stylesheet of the bundle carries the same faces', () => {
  // The list of the files is written down twice: once for the browser and
  // once for the report of the site. The two may not drift apart.
  for (const { file, weight } of PROXIMA_NOVA_FILES) {
    assert.ok(
      css.includes(`url("/fonts/${file}")`),
      `the stylesheet does not ask for ${file}`,
    );
    assert.ok(
      new RegExp(`url\\("/fonts/${file.replace(/\./g, '\\.')}"\\)[\\s\\S]{0,160}?font-weight:\\s*${weight}`).test(css),
      `the stylesheet does not give ${file} the weight ${weight}`,
    );
  }
  assert.ok(css.includes(`font-family: "${PROXIMA_NOVA_FAMILY}"`));
});

test('the site does not ask a third party for a typeface', () => {
  // The typeface is served from the site itself. A stylesheet of another
  // house would send every visitor there.
  for (const marker of ['typekit', 'use.typekit.net', 'p.typekit.net', 'fonts.googleapis', 'fonts.gstatic']) {
    assert.equal(css.includes(marker), false, `the stylesheet still refers to ${marker}`);
  }
});

test('the files that are missing are named one by one', () => {
  assert.deepEqual(
    missingFiles([]),
    PROXIMA_NOVA_FILES.map((entry) => entry.file),
  );
  assert.deepEqual(
    missingFiles(PROXIMA_NOVA_FILES.map((entry) => entry.file)),
    [],
  );

  const partial = missingFiles(['proxima-nova-400.woff2']);
  assert.deepEqual(partial, ['proxima-nova-600.woff2', 'proxima-nova-700.woff2']);
});

test('the report of the site says whether the typeface is there', () => {
  const empty = fontStatus([]);
  assert.equal(empty.installed, false);
  assert.equal(empty.family, PROXIMA_NOVA_FAMILY);
  assert.equal(empty.fallback, 'Geist Variable');
  assert.equal(empty.missing.length, PROXIMA_NOVA_FILES.length);
  assert.equal(empty.files.every((entry) => entry.present === false), true);

  const full = fontStatus(PROXIMA_NOVA_FILES.map((entry) => entry.file));
  assert.equal(full.installed, true);
  assert.deepEqual(full.missing, []);
  assert.equal(full.files.every((entry) => entry.present === true), true);
  assert.deepEqual(
    full.files.map((entry) => entry.weight),
    [400, 600, 700],
  );
});
