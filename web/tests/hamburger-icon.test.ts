/**
 * The hamburger icon of the mobile menus, checked without a browser.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * Vite reads the JSX for the test, the same way the build does. What is checked is what can be checked without a screen:
 * the paths of the supplied animation are the ones in the component, the open state is the state of the menu that holds
 * the icon, the timing and the reduced motion rule are in the style, and both mobile menus use it.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const read = (file: string) => readFileSync(join(webRoot, file), 'utf8');

let server: ViteDevServer;
let HamburgerIcon: (props: { open: boolean; size?: number; className?: string }) => unknown;

before(async () => {
  server = await createServer({ root: webRoot, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  HamburgerIcon = ((await server.ssrLoadModule('/src/HamburgerIcon.tsx')) as { HamburgerIcon: typeof HamburgerIcon }).HamburgerIcon;
});
after(async () => {
  await server.close();
});

const render = (open: boolean, size?: number) => renderToStaticMarkup(createElement(HamburgerIcon as never, { open, size }) as never);

const PATHS = [
  'M 20,29.000046 H 80.000231 C 80.000231,29.000046 94.498839,28.817352 94.532987,66.711331 94.543142,77.980673 90.966081,81.670246 85.259173,81.668997 79.552261,81.667751 75.000211,74.999942 75.000211,74.999942 L 25.000021,25.000058',
  'M 20,50 H 80',
  'M 20,70.999954 H 80.000231 C 80.000231,70.999954 94.498839,71.182648 94.532987,33.288669 94.543142,22.019327 90.966081,18.329754 85.259173,18.331003 79.552261,18.332249 75.000211,25.000058 75.000211,25.000058 L 25.000021,74.999942',
];

describe('the hamburger icon', () => {
  it('draws the three paths of the animation, 35 by 35, in the colour of the button', () => {
    const html = render(false);
    for (const d of PATHS) assert.ok(html.includes(`d="${d}"`), `missing path ${d.slice(0, 20)}`);
    assert.equal((html.match(/<path/g) ?? []).length, 3);
    assert.match(html, /width="35px"/);
    assert.match(html, /height="35px"/);
    assert.match(html, /viewBox="0 0 100 100"/);
    assert.equal((html.match(/stroke-current/g) ?? []).length, 3);
    assert.match(html, /fill-current/);
  });

  it('is hidden from the screen reader: the button names itself', () => {
    assert.match(render(false), /aria-hidden="true"/);
  });

  it('takes its open state from the menu, and from nothing else', () => {
    assert.doesNotMatch(render(false), /opened/);
    assert.match(render(true), /opened/);
  });

  it('can be smaller where the button is a tab', () => {
    assert.match(render(true, 24), /width="24px"/);
  });

  it('keeps the timing of the animation and stops it for reduced motion', () => {
    const css = read('src/HamburgerIcon.module.css');
    assert.equal((css.match(/600ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/g) ?? []).length, 2);
    assert.match(css, /\.opened \.line1[^}]*stroke-dasharray: 90 207;[^}]*stroke-dashoffset: -134;/);
    assert.match(css, /\.opened \.line2[^}]*stroke-dasharray: 1 60;[^}]*stroke-dashoffset: -30;/);
    assert.match(css, /prefers-reduced-motion: reduce\)\s*{\s*\.line\s*{\s*transition: none;/);
  });
});

describe('the mobile menus', () => {
  it('the menu of the site gives its own state to the icon', () => {
    const source = read('src/site/ui.tsx');
    assert.match(source, /<HamburgerIcon open=\{open\} \/>/);
    assert.match(source, /aria-expanded=\{open\}/);
    assert.match(source, /aria-label=\{open \? 'Close menu' : 'Open menu'\}/);
  });

  it('the More tab of the dashboard gives its own state to the icon', () => {
    const source = read('src/ui-app.tsx');
    assert.match(source, /<HamburgerIcon open=\{moreOpen\}/);
    assert.match(source, /aria-expanded=\{moreOpen\}/);
  });
});
