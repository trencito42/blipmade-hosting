import fs from 'node:fs';

/**
 * The accessibility measurement of the audit.
 *
 * For every route it measures, in the browser and from the computed styles:
 *   - the contrast ratio of every text against the surface it is drawn on,
 *     with the alpha of the surface composited over its parent;
 *   - the size of every target that can be pressed;
 *   - the label of every field;
 *   - the landmarks and the headings of the page;
 *   - the focus indicator of every control that can be reached with the tab.
 *
 * The ratio is the WCAG 2.x relative luminance ratio. The threshold is 4.5:1
 * for the normal text and 3:1 for the large text (24px, or 18.66px and bold).
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const OUT = process.env.OUT_DIR ?? '/tmp/bm-audit';
const SHOT = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/audit';

const ROUTES = [
  { path: '/', role: 'anonymous' },
  { path: '/apps', role: 'anonymous' },
  { path: '/apps/discord-bot', role: 'anonymous' },
  { path: '/docs', role: 'anonymous' },
  { path: '/status', role: 'anonymous' },
  { path: '/login', role: 'anonymous' },
  { path: '/register', role: 'anonymous' },
  { path: '/forgot-password', role: 'anonymous' },
  { path: '/app', role: 'customer' },
  { path: '/app/instances', role: 'customer' },
  { path: '/app/instances/cmvkbgm9h0001r18096ep5jzl', role: 'customer' },
  { path: '/app/deploy', role: 'customer' },
  { path: '/app/deploy/discord-bot', role: 'customer' },
  { path: '/app/domains', role: 'customer' },
  { path: '/app/billing', role: 'customer' },
  { path: '/app/tickets', role: 'customer' },
  { path: '/app/tickets/cmvkn40w50037ps01eiupqv3y', role: 'customer' },
  { path: '/app/settings', role: 'customer' },
  { path: '/admin', role: 'staff' },
  { path: '/admin/customers', role: 'staff' },
  { path: '/admin/customers/cmvkbgm1f0000r101e4xeztm7', role: 'staff' },
  { path: '/admin/orders', role: 'staff' },
  { path: '/admin/services', role: 'staff' },
  { path: '/admin/products', role: 'staff' },
  { path: '/admin/pricing', role: 'staff' },
  { path: '/admin/tickets', role: 'staff' },
  { path: '/admin/promotions', role: 'staff' },
  { path: '/admin/infrastructure', role: 'staff' },
  { path: '/admin/audit', role: 'staff' },
  { path: '/admin/staff', role: 'staff' },
  { path: '/admin/settings', role: 'staff' },
];

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const out = { at: new Date().toISOString(), routes: [] };

for (const route of ROUTES) {
  const state = route.role === 'anonymous' ? undefined : `${OUT}/state-${route.role}.json`;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: state });
  const page = await context.newPage();
  await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const data = await page.evaluate(() => {
    // --- the colour maths, in the page -------------------------------------
    const parse = (value) => {
      const m = value.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };
    const over = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const lum = (c) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => {
      const la = lum(a);
      const lb = lum(b);
      const hi = Math.max(la, lb);
      const lo = Math.min(la, lb);
      return (hi + 0.05) / (lo + 0.05);
    };
    const toHex = (c) =>
      '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

    /** The colour that is really behind the text. */
    const effectiveBackground = (element) => {
      let node = element;
      let stack = [];
      while (node && node !== document.documentElement.parentNode) {
        const style = getComputedStyle(node);
        const bg = parse(style.backgroundColor);
        if (bg && bg.a > 0) {
          stack.push(bg);
          if (bg.a >= 1) break;
        }
        node = node.parentElement;
      }
      let base = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = stack.length - 1; i >= 0; i -= 1) base = over(stack[i], base);
      return base;
    };

    const describe = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      if (style.visibility === 'hidden' || style.display === 'none') return null;
      const opacity = Number(style.opacity);
      if (opacity === 0) return null;
      // A text that is not visible to the eye is not measured.
      const own = parse(style.color);
      if (!own) return null;
      const bg = effectiveBackground(element);
      const fg = own.a < 1 ? over(own, bg) : own;
      const fontSize = parseFloat(style.fontSize);
      const weight = Number(style.fontWeight) || 400;
      const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
      const r = ratio(fg, bg);
      return {
        text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48),
        selector:
          element.tagName.toLowerCase() +
          (element.id ? `#${element.id}` : '') +
          (element.className && typeof element.className === 'string'
            ? '.' + element.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.')
            : ''),
        color: toHex(fg),
        background: toHex(bg),
        colorRaw: style.color,
        backgroundRaw: style.backgroundColor,
        fontSize,
        weight,
        large,
        ratio: Math.round(r * 100) / 100,
        need: large ? 3 : 4.5,
        pass: r >= (large ? 3 : 4.5),
        opacity,
      };
    };

    // --- the texts ----------------------------------------------------------
    const texts = [];
    const seen = new Set();
    for (const element of document.querySelectorAll('body *')) {
      const hasOwnText = [...element.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
      );
      if (!hasOwnText) continue;
      const d = describe(element);
      if (!d) continue;
      const key = `${d.selector}|${d.color}|${d.background}|${d.fontSize}`;
      if (seen.has(key)) continue;
      seen.add(key);
      texts.push(d);
    }

    // --- the targets --------------------------------------------------------
    const small = [];
    for (const element of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="tab"]')) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (Number(style.opacity) === 0) continue;
      // A control that is hidden inside a closed disclosure is not a target.
      if (element.closest('[hidden], [aria-hidden="true"]')) continue;
      const inline = style.display === 'inline';
      const inText = element.parentElement && ['P', 'SPAN', 'LI', 'TD', 'H1', 'H2', 'H3'].includes(element.parentElement.tagName) && inline;
      if (inText) continue;
      if (rect.width < 24 || rect.height < 24) {
        small.push({
          selector: element.tagName.toLowerCase() + (element.id ? `#${element.id}` : '') + '.' + String(element.className || '').trim().split(/\s+/).slice(0, 3).join('.'),
          text: (element.textContent || element.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
          w: Math.round(rect.width * 10) / 10,
          h: Math.round(rect.height * 10) / 10,
          inline,
        });
      }
    }

    // --- the fields ---------------------------------------------------------
    const fields = [];
    for (const element of document.querySelectorAll('input, textarea, select')) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const id = element.id;
      const label = id ? document.querySelector(`label[for="${id}"]`) : null;
      const ariaLabel = element.getAttribute('aria-label');
      const ariaLabelledBy = element.getAttribute('aria-labelledby');
      const wrapped = element.closest('label');
      const title = element.getAttribute('title');
      const placeholder = element.getAttribute('placeholder');
      fields.push({
        selector: element.tagName.toLowerCase() + (id ? `#${id}` : ''),
        type: element.getAttribute('type') || element.tagName.toLowerCase(),
        name: element.getAttribute('name') || '',
        label: label ? label.textContent.trim() : wrapped ? wrapped.textContent.trim().slice(0, 40) : '',
        ariaLabel: ariaLabel || '',
        ariaLabelledBy: ariaLabelledBy || '',
        title: title || '',
        placeholder: placeholder || '',
        accessibleName: ariaLabel || (label ? label.textContent.trim() : '') || (ariaLabelledBy ? 'via aria-labelledby' : '') || (title || '') || (placeholder ? 'placeholder only' : ''),
        describedBy: element.getAttribute('aria-describedby') || '',
        invalid: element.getAttribute('aria-invalid') || '',
        fontSize: parseFloat(getComputedStyle(element).fontSize),
      });
    }

    // --- the landmarks and the headings -------------------------------------
    const landmarks = {
      header: document.querySelectorAll('header').length,
      nav: document.querySelectorAll('nav').length,
      main: document.querySelectorAll('main').length,
      footer: document.querySelectorAll('footer').length,
      aside: document.querySelectorAll('aside').length,
      navLabels: [...document.querySelectorAll('nav')].map((n) => n.getAttribute('aria-label') || '(none)'),
    };
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
      level: Number(h.tagName[1]),
      text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 60),
    }));

    return {
      texts,
      small,
      fields,
      landmarks,
      headings,
      lang: document.documentElement.lang || '(none)',
      title: document.title,
      hasMainLandmark: document.querySelectorAll('main').length > 0,
    };
  });

  // --- the focus indicator -------------------------------------------------
  const focus = [];
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const outlineWidth = parseFloat(style.outlineWidth) || 0;
      const ringWidth = parseFloat(style.boxShadow?.match(/rgba?\(.*?\)\s+0px\s+0px\s+0px\s+(\d+(?:\.\d+)?)px/)?.[1] ?? '0') || 0;
      return {
        selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + '.' + String(el.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.'),
        text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 32),
        outlineWidth,
        outlineStyle: style.outlineStyle,
        outlineColor: style.outlineColor,
        ringWidth,
        boxShadow: (style.boxShadow || '').slice(0, 80),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        visible: (outlineWidth > 0 && style.outlineStyle !== 'none') || ringWidth > 0,
      };
    });
    if (f) focus.push(f);
  }

  out.routes.push({ path: route.path, role: route.role, ...data, focus });

  const fails = data.texts.filter((t) => !t.pass);
  console.log(
    `${route.path.padEnd(46)} texts=${String(data.texts.length).padStart(3)} contrastFails=${String(fails.length).padStart(2)} smallTargets=${String(data.small.length).padStart(2)} unlabeledFields=${data.fields.filter((f) => !f.accessibleName).length} main=${data.hasMainLandmark} focusNoIndicator=${focus.filter((f) => !f.visible).length}`,
  );
  await context.close();
}

fs.writeFileSync(`${OUT}/a11y-report.json`, JSON.stringify(out, null, 2));
console.log(`\nwrote ${OUT}/a11y-report.json`);
await browser.close();
