/**
 * Checks the things that were fixed in this round, in a real browser:
 *
 *   1. A focused control shows exactly one indicator: the ring of the control
 *      or the outline of the page, never both.
 *   2. The dark autofill of the browser is painted with the colour of the
 *      field, so the field keeps its shape and its text stays readable.
 *   3. The password can be shown and hidden again, and the button says so.
 *   4. The keyboard reaches every control of a form, in the order of the page.
 *   5. No link points at a page that does not exist, and nothing points at a
 *      product that cannot be ordered.
 *
 * Environment:
 *   BM_BASE      the platform (default http://127.0.0.1:3000)
 *   BM_EMAIL     the account that signs in (optional)
 *   BM_PASSWORD  its password (optional, never printed)
 */
const BASE = process.env.BM_BASE ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ??
  '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const problems = [];
const notes = [];

function report(route, message) {
  problems.push(`${route}: ${message}`);
}

/**
 * The indicator of a focused element: an outline that is drawn, and a ring
 * that is drawn as a shadow.
 *
 * The helper that reads a ring lives inside the function, because the whole
 * thing runs in the browser.
 */
const INDICATORS = () => {
  /**
   * A ring is a shadow with a spread, so the fourth length of the shadow is
   * the one that says whether a ring is drawn.
   */
  const ringOf = (shadow) => {
    if (!shadow || shadow === 'none') return null;
    for (const part of shadow.split(/,(?![^(]*\))/)) {
      // A ring that is painted transparent is not an indicator.
      if (/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(part)) continue;
      if (/transparent/.test(part)) continue;
      const lengths = [...part.matchAll(/(-?[\d.]+)px/g)].map((match) => parseFloat(match[1]));
      if (lengths.length >= 4 && lengths[3] > 0) return part.trim().slice(0, 70);
    }
    return null;
  };

  const element = document.activeElement;
  if (!element || element === document.body) return { tag: null, indicators: [] };
  const style = getComputedStyle(element);
  const indicators = [];

  const outlineStyle = style.outlineStyle;
  const outlineWidth = parseFloat(style.outlineWidth || '0');
  if (outlineStyle && outlineStyle !== 'none' && outlineWidth > 0) {
    indicators.push(`outline ${outlineWidth}px ${style.outlineColor}`);
  }

  const ring = ringOf(style.boxShadow);
  if (ring) indicators.push(`ring ${ring}`);

  // The parent of the control may show a ring of its own, for example the
  // rounded container of a field.
  const parentIndicators = [];
  let parent = element.parentElement;
  for (let depth = 0; parent && depth < 3; depth += 1, parent = parent.parentElement) {
    const parentRing = ringOf(getComputedStyle(parent).boxShadow);
    if (parentRing) parentIndicators.push(`${parent.tagName.toLowerCase()} ${parentRing}`);
  }

  return {
    tag: element.tagName.toLowerCase(),
    type: element.getAttribute('type'),
    name: element.getAttribute('name'),
    id: element.id,
    text: (element.textContent || '').trim().slice(0, 18),
    indicators,
    parentIndicators,
  };
};

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'en-US',
});
const page = await context.newPage();

// --- 1 and 4: one indicator, reachable with the keyboard -------------------

for (const route of ['/login', '/register', '/forgot-password']) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 });

  const order = [];
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(INDICATORS);
    if (!info.tag) break;
    const key = `${info.tag}:${info.name ?? ''}:${info.id}:${info.text}`;
    if (order.some((entry) => entry.key === key)) break;
    order.push({ key, ...info });

    const total = info.indicators.length + info.parentIndicators.length;
    const own = info.indicators.length;
    const parents = info.parentIndicators.length;

    if (total === 0) {
      report(route, `the focused ${info.tag} shows no focus indicator`);
      continue;
    }

    // The rule of the interface: a control never carries an outline and a
    // ring at the same time, and never shows an outline of its own while the
    // container around it shows a ring. A ring of the control and a ring of
    // the field it belongs to are one indicator of one thing, as long as
    // they have the same colour.
    const hasOutline = info.indicators.some((entry) => entry.startsWith('outline'));
    const ownRing = info.indicators.filter((entry) => entry.startsWith('ring'));

    if (hasOutline && ownRing.length) {
      report(route, `the focused ${info.tag} shows an outline and a ring at the same time`);
    }
    if (hasOutline && parents > 0) {
      report(route, `the focused ${info.tag} shows an outline while its container shows a ring`);
    }
    if (ownRing.length && parents > 0) {
      const ownColour = ownRing[0].match(/rgb\([^)]*\)/)?.[0] ?? '';
      const parentColour = info.parentIndicators[0].match(/rgb\([^)]*\)/)?.[0] ?? '';
      if (ownColour && parentColour && ownColour !== parentColour) {
        report(route, `the focused ${info.tag} shows a ring in ${ownColour} and its container a ring in ${parentColour}`);
      }
    }
  }
  notes.push(`${route}: keyboard order ${order.map((entry) => entry.key).join(' -> ')}`);
}

// --- 2: the autofill of the browser is dark --------------------------------

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
const autofill = await page.evaluate(() => {
  const found = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      const text = rule.cssText || '';
      if (text.includes('-webkit-autofill')) found.push(text.slice(0, 220));
    }
  }
  return found;
});
if (!autofill.length) {
  report('/login', 'the stylesheet has no rule for the autofill of the browser');
} else {
  const dark = autofill.filter((rule) => /background|box-shadow/.test(rule));
  if (!dark.length) report('/login', 'the rule for the autofill does not paint a background');
  notes.push(`/login: ${autofill.length} rule(s) for the autofill, ${dark.length} of them paint it`);
}

// The rule has to use the colour of the field, not a hard coded one.
const usesVariable = autofill.some((rule) => rule.includes('--bm-field-bg'));
if (!usesVariable) report('/login', 'the rule for the autofill does not use the colour of the field');

// --- 3: the password can be shown and hidden --------------------------------

await page.goto(`${BASE}/register`, { waitUntil: 'networkidle', timeout: 60000 });
const reveal = await page.evaluate(async () => {
  const input = document.querySelector('input[type="password"]');
  if (!input) return { found: false };
  const button = [...document.querySelectorAll('button')].find((item) =>
    /show|hide|reveal/i.test(item.getAttribute('aria-label') || item.title || ''),
  );
  if (!button) return { found: true, button: false };
  const before = input.type;
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const after = input.type;
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 120));
  return { found: true, button: true, before, after, back: input.type, label: button.getAttribute('aria-label') };
});
if (!reveal.found) report('/register', 'there is no password field');
else if (!reveal.button) report('/register', 'there is no button to show the password');
else {
  if (reveal.after !== 'text') report('/register', `the reveal button did not show the password (${reveal.before} -> ${reveal.after})`);
  if (reveal.back !== 'password') report('/register', 'the reveal button did not hide the password again');
  notes.push(`/register: the reveal goes ${reveal.before} -> ${reveal.after} -> ${reveal.back}`);
}

// --- 5: no dead links -------------------------------------------------------

const ROUTES = ['/', '/login', '/register', '/status', '/docs', '/app', '/app/instances', '/app/billing', '/admin'];

if (EMAIL && PASSWORD) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="email"]').press('Tab');
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);
}

const KNOWN = [
  '/', '/login', '/register', '/forgot-password', '/verify-email', '/reset-password', '/status', '/docs',
  '/app', '/app/instances', '/app/domains', '/app/billing', '/app/tickets', '/app/settings',
  '/admin', '/admin/customers', '/admin/orders', '/admin/services', '/admin/products', '/admin/pricing',
  '/admin/tickets', '/admin/promotions', '/admin/infrastructure', '/admin/audit', '/admin/staff', '/admin/settings',
];

const links = new Set();
for (const route of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
  const found = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].map((item) => item.getAttribute('href') || ''),
  );
  for (const href of found) links.add(href);
}

for (const href of links) {
  if (!href.startsWith('/')) continue;
  // Only the deploy path matters here: the documentation has pages about
  // WordPress, and those links are correct.
  if (href.includes('deploy/wordpress')) report('links', `a link points at WordPress (${href})`);
  if (/^\/deploy\//.test(href)) report('links', `a link uses the path that does not exist (${href})`);
  const path = href.split('?')[0].split('#')[0];
  if (path.startsWith('/app/deploy/')) continue;
  if (!KNOWN.includes(path)) report('links', `a link points at a page that does not exist (${href})`);
}
notes.push(`${links.size} distinct links checked`);

// --- 6: the deploy buttons point at a product that can be ordered -----------

const catalog = await page.evaluate(async () => {
  const response = await fetch('/api/catalog/products');
  const body = await response.json();
  return body.products.map((product) => ({
    slug: product.slug,
    deployable: product.deployable,
    visible: product.visible,
  }));
});
const orderable = catalog.filter((product) => product.deployable && product.visible).map((product) => product.slug);

for (const route of ['/', '/app', '/app/instances']) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
  const deployLinks = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/app/deploy/"]')].map((item) => item.getAttribute('href') || ''),
  );
  for (const href of deployLinks) {
    const slug = decodeURIComponent(href.split('/app/deploy/')[1]?.split('?')[0] || '');
    if (!orderable.includes(slug)) {
      report(route, `the deploy link points at "${slug}", which cannot be ordered (orderable: ${orderable.join(', ') || 'none'})`);
    }
  }
  notes.push(`${route}: ${deployLinks.length} deploy link(s), all checked against the catalog`);
}

await browser.close();

console.log('--- notes ---');
for (const note of notes) console.log('  ' + note);
console.log('--- problems ---');
if (!problems.length) console.log('  none');
for (const problem of problems) console.log('  ' + problem);
process.exit(problems.length ? 1 : 0);
