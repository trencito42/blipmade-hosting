/**
 * The rules of the Adobe Fonts web project, checked without a browser.
 *
 *     node --test web/tests/fontkit.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adobeFontsKitUrl,
  buildSansStack,
  familyNames,
  fontSansRule,
  orderFamilies,
} from '../fontkit.mjs';

const KIT_CSS = `
/* proxima nova latin 400 */
@font-face{font-family:"proxima-nova";src:url(https://use.typekit.net/af/abcd/proxima-nova-latin-400-normal.woff2) format("woff2");font-style:normal;font-weight:400;font-stretch:normal;font-display:swap;}
@font-face{font-family:'Proxima Nova';src:url(https://use.typekit.net/af/abcd/proxima-nova-latin-600-normal.woff2) format("woff2");font-style:normal;font-weight:600;font-stretch:normal;font-display:swap;}
@font-face{font-family:"proxima-nova";src:url(https://use.typekit.net/af/abcd/proxima-nova-latin-700-normal.woff2) format("woff2");font-style:normal;font-weight:700;font-stretch:normal;font-display:swap;}
`;

test('only a stylesheet of Adobe is accepted', () => {
  assert.equal(adobeFontsKitUrl('https://use.typekit.net/abcd1234.css').href, 'https://use.typekit.net/abcd1234.css');
  assert.equal(adobeFontsKitUrl('https://p.typekit.net/abcd1234.css').host, 'p.typekit.net');

  // Plain HTTP, another host, a page that is not a stylesheet, nothing.
  assert.equal(adobeFontsKitUrl('http://use.typekit.net/abcd1234.css'), null);
  assert.equal(adobeFontsKitUrl('https://evil.example/abcd1234.css'), null);
  assert.equal(adobeFontsKitUrl('https://use.typekit.net.evil.example/abcd1234.css'), null);
  assert.equal(adobeFontsKitUrl('not a url'), null);
  assert.equal(adobeFontsKitUrl(''), null);
  assert.equal(adobeFontsKitUrl(undefined), null);
});

test('the names the stylesheet declares are read', () => {
  assert.deepEqual(familyNames(KIT_CSS), ['proxima-nova', 'Proxima Nova']);
  assert.deepEqual(familyNames(''), []);
  assert.deepEqual(familyNames('body{font-family:system-ui}'), []);
});

test('the family of proxima nova comes first and Geist stays the fallback', () => {
  const stack = buildSansStack(['Proxima Nova', 'proxima-nova']);
  // The order of the stylesheet is kept, so the first family it declares is
  // the first the browser asks for.
  assert.equal(stack[0], 'Proxima Nova');
  assert.ok(stack.includes('proxima-nova'));
  assert.ok(stack.includes('Geist Variable'));
  assert.equal(stack[stack.length - 1], 'sans-serif');

  // A family of the kit that is not proxima nova comes after it.
  const mixed = buildSansStack(['proxima-nova', 'My Brand Face']);
  assert.equal(mixed[0], 'proxima-nova');
  assert.equal(mixed[1], 'My Brand Face');

  // Without a kit the interface still asks for proxima nova and then for Geist.
  const empty = buildSansStack([]);
  assert.ok(empty.includes('Geist Variable'));
});

test('the rule of the typeface names the family of the kit', () => {
  const rule = fontSansRule(['proxima-nova']);
  assert.ok(rule.startsWith(':root{--font-sans:'));
  assert.ok(rule.includes('"proxima-nova"'));
  assert.ok(rule.includes('"Geist Variable"'));
  assert.ok(rule.endsWith(';}'));
});

test('the name the operator writes down wins', () => {
  assert.deepEqual(orderFamilies(['proxima-nova'], 'Proxima Nova'), ['Proxima Nova']);
  assert.deepEqual(orderFamilies(['proxima-nova'], ''), ['proxima-nova']);
  // A kit without a name that says proxima keeps its families.
  assert.deepEqual(orderFamilies(['My Brand Face'], ''), ['My Brand Face']);
});
