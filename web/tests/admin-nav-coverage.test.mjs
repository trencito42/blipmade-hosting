import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const nav = readFileSync(join(root, 'nav.ts'), 'utf8');
const routes = readFileSync(join(root, 'routes.tsx'), 'utf8');

function section(text, start) {
  const marker = text.split(start)[1];
  assert.ok(marker, `Missing section: ${start}`);
  return marker.split('];')[0];
}

function matches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

test('all primary admin routes remain in the sidebar once and only once', () => {
  const all = matches(section(nav, 'export const ADMIN_NAV: NavEntry[] = ['), /\bto:\s*'([^']+)'/g);
  const grouped = matches(section(nav, 'export const ADMIN_GROUPS: NavGroup[] = ['), /A\('([^']+)'\)/g);
  assert.equal(all.length, 33);
  assert.ok(all.includes('/admin/catalog/families'));
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual([...grouped].sort(), [...all].sort());
});

test('all primary admin entries still have a registered page route', () => {
  const all = matches(section(nav, 'export const ADMIN_NAV: NavEntry[] = ['), /\bto:\s*'([^']+)'/g);
  const registered = new Set(matches(routes, /pattern:\s*'(\/admin[^']*)'/g));
  for (const path of all) assert.ok(registered.has(path), `Missing registered route for ${path}`);
});

test('admin phone shortcuts favor the unified support console without removing tickets', () => {
  const phone = section(nav, 'export const ADMIN_PHONE_TABS: NavEntry[] = [');
  assert.match(phone, /adminTab\('\/admin\/support'\)/);
  assert.match(nav, /to:\s*'\/admin\/tickets'/);
  assert.match(routes, /pattern:\s*'\/admin\/tickets\/\:id'/);
});
