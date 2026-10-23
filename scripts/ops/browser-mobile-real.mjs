import fs from 'node:fs';

/**
 * The check of the customer panel on a phone.
 *
 * The script signs in, walks the routes of the panel on the widths of the
 * phones and writes down what does not fit.
 *
 * The measurement that matters is the width of the layout viewport. When the
 * content of a page is wider than the screen, the browser widens the layout
 * viewport to hold it and the page is cut off at the edge. The body hides the
 * overflow, so the page cannot be panned back and the user sees a clipped
 * page with the text outside its card and a navigation that is spread over
 * the width of the wide screen.
 *
 * That is why the width of the layout viewport is read and not only the width
 * of the scroll area: the scroll area of the document is the width of the
 * layout viewport, so it always agrees with itself.
 *
 * It never pays anything and never removes anything from the panel of a
 * customer: it signs in and out of the account it was given.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';
const ADMIN_EMAIL = process.env.BM_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.BM_ADMIN_PASSWORD ?? '';
const SHOT_DIR = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/mobile';
const PREFIX = process.env.BM_PREFIX ?? 'mobile';
const WIDTHS = (process.env.BM_WIDTHS ?? '320,360,375,390,430,440').split(',').map(Number);
const ROUTES = (process.env.BM_ROUTES ?? '/app').split(',');
const HEIGHT = Number(process.env.BM_HEIGHT ?? 956);
const ROLE = process.env.BM_ROLE ?? 'customer';
const SEED = process.env.BM_SEED === '1';
const OPEN_SHEET = process.env.BM_OPEN_SHEET === '1';

const problems = [];
const notes = [];

function check(condition, message) {
  if (condition) notes.push(message);
  else problems.push(message);
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });

/**
 * A context with the flags of the device emulation of the DevTools: the page
 * believes it runs on a phone, the pixels are dense and the finger is the
 * pointer.
 */
async function phoneContext(width) {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  return context;
}

async function signIn(p, email, password) {
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type="email"]', email);
  await p.fill('input[type="password"]', password);
  await p.click('button[type="submit"]');
  await p.waitForURL(/\/(app|admin)(\/|$)/, { timeout: 20000 });
}

const user = ROLE === 'admin' ? { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } : { email: EMAIL, password: PASSWORD };
if (!user.email) {
  console.error('no credentials for the role ' + ROLE);
  process.exit(2);
}

// --- the long content -------------------------------------------------------

const LONG_SUBJECT =
  'My Discord bot keeps crashing after the latest update and I cannot open the console to read the logs';
const LONG_BODY =
  'Since Tuesday the bot stops answering within a couple of minutes after it starts. The console opens and closes again straight away, so I cannot read the error that is written there. I have restarted the instance four times and the same thing happens every time. I have not changed anything in the configuration, and the only thing that changed is the platform update on Monday evening. Please tell me what I can check, or roll the instance back to the previous version of the platform.';

if (SEED) {
  const ctx = await phoneContext(WIDTHS[0]);
  const p = await ctx.newPage();
  await signIn(p, user.email, user.password);
  await p.goto(`${BASE}/app/tickets`, { waitUntil: 'networkidle' });
  const existing = await p.locator(`text=${LONG_SUBJECT.slice(0, 40)}`).count();
  if (existing > 0) {
    notes.push('the long ticket is already there');
  } else {
    await p.getByRole('button', { name: /new ticket/i }).first().click();
    await p.waitForSelector('#new-ticket-form', { timeout: 10000 });
    await p.fill('#ticket-subject', LONG_SUBJECT);
    await p.selectOption('#ticket-category', { index: 1 });
    await p.fill('#ticket-message', LONG_BODY);
    await p.getByRole('button', { name: /create ticket/i }).first().click();
    await p.waitForTimeout(2500);
    check((await p.locator(`text=${LONG_SUBJECT.slice(0, 40)}`).count()) > 0, 'the long ticket was not created');
  }
  await ctx.close();
}

// --- the measurement --------------------------------------------------------

// One session for the whole walk. The window is resized for every width, so
// the login is used once: the login allows ten attempts every fifteen minutes
// for an address.
const sessionContext = await phoneContext(WIDTHS[WIDTHS.length - 1]);
const page = await sessionContext.newPage();
page.on('pageerror', (error) => problems.push(`page error: ${String(error).slice(0, 160)}`));
await signIn(page, user.email, user.password);

for (const width of WIDTHS) {
  // The window is resized instead of opening a new session: the login allows
  // ten attempts every fifteen minutes for an address, and a session that is
  // opened again for every width would spend them all.
  await page.setViewportSize({ width, height: HEIGHT });

  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    // The sheet of the phone bar is a state of its own: it is measured too.
    if (OPEN_SHEET) {
      const more = page.locator('[data-bottom-nav] button[aria-expanded]');
      if (await more.count()) {
        await more.first().click();
        await page.waitForTimeout(500);
      }
    }

    const report = await page.evaluate(() => {
      const root = document.documentElement;

      const path = (element) => {
        const parts = [];
        let current = element;
        while (current && current !== document.documentElement && parts.length < 7) {
          let name = current.tagName.toLowerCase();
          if (current.id) name += `#${current.id}`;
          else if (current.className && typeof current.className === 'string') {
            const classes = current.className.trim().split(/\s+/).filter(Boolean).slice(0, 5);
            if (classes.length) name += `.${classes.join('.')}`;
          }
          parts.unshift(name);
          current = current.parentElement;
        }
        return parts.join(' > ');
      };

      const spilling = [];
      for (const element of document.querySelectorAll('body *')) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        // A strip that scrolls on purpose is allowed to be wider than the
        // screen; a box that does not scroll must not be.
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
        // A text that is cut with an ellipsis is cut on purpose.
        if (style.textOverflow === 'ellipsis') continue;
        // The live region for the screen reader is one pixel wide on purpose.
        if (element.clientWidth <= 1) continue;

        // The content of the element is measured against the box of the
        // element. A child that bleeds out of the box on purpose (a strip
        // that runs from edge to edge of the screen) is left out of the
        // measurement, so the measurement only names the content that has no
        // room.
        const box = element.getBoundingClientRect();
        const own = getComputedStyle(element);
        const left = box.left + parseFloat(own.borderLeftWidth || '0') + parseFloat(own.paddingLeft || '0');
        const right = box.right - parseFloat(own.borderRightWidth || '0') - parseFloat(own.paddingRight || '0');
        let far = left;
        for (const child of element.children) {
          const childStyle = getComputedStyle(child);
          if (childStyle.display === 'none' || childStyle.visibility === 'hidden') continue;
          const childBox = child.getBoundingClientRect();
          if (!childBox.width) continue;
          // A child that starts before the box of its parent runs out of the
          // box on purpose.
          if (childBox.left < left - 0.5) continue;
          if (childBox.right > far) far = childBox.right;
        }
        const over = Math.round(far - right);
        if (over <= 1) continue;

        // The text of the element itself counts too, when it is a text node.
        const ownOver = element.scrollWidth - element.clientWidth;
        if (ownOver <= 1) continue;

        spilling.push({
          path: path(element),
          over: Math.max(over, ownOver),
          overflowX: style.overflowX,
          whiteSpace: style.whiteSpace,
          text: (element.textContent || '').trim().slice(0, 60),
        });
      }
      spilling.sort((a, b) => b.over - a.over);

      // The navigation of the phone has to sit inside the screen.
      const nav = document.querySelector('[data-bottom-nav]');
      const tabs = nav
        ? [...nav.querySelectorAll('a, button')].map((t) => {
            const box = t.getBoundingClientRect();
            return {
              text: (t.textContent || '').trim().slice(0, 14),
              left: Math.round(box.left),
              right: Math.round(box.right),
              w: Math.round(box.width),
              h: Math.round(box.height),
            };
          })
        : [];

      // Controls that are too small to be hit with a finger.
      const small = [];
      for (const element of document.querySelectorAll('button, a[href], select, input, textarea')) {
        const box = element.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (element.closest('nav[aria-label="All pages"]')) continue;
        if (box.height < 36 || box.width < 28) {
          small.push(`${Math.round(box.width)}x${Math.round(box.height)} ${path(element)}`);
        }
      }

      // The content that reaches past the edge of the screen is cut off by the
      // body and cannot be reached by the finger.
      const past = [];
      for (const element of document.querySelectorAll('body *')) {
        const box = element.getBoundingClientRect();
        if (!box.width) continue;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (box.right <= window.innerWidth + 1) continue;
        // A strip that scrolls on purpose may be wider than the screen.
        let scrolls = false;
        let parent = element.parentElement;
        while (parent && parent !== document.body) {
          const parentStyle = getComputedStyle(parent);
          if (['auto', 'scroll'].includes(parentStyle.overflowX)) {
            scrolls = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (scrolls) continue;
        past.push(`${Math.round(box.right)} ${path(element)} ${(element.textContent || '').trim().slice(0, 40)}`);
      }

      const before = window.scrollX;
      window.scrollTo(9999, 0);
      const after = window.scrollX;
      window.scrollTo(0, 0);

      return {
        innerWidth: window.innerWidth,
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        visualWidth: window.visualViewport ? Math.round(window.visualViewport.width) : null,
        canScrollSideways: after > before,
        spilling: spilling.slice(0, 8),
        navWidth: nav ? Math.round(nav.getBoundingClientRect().width) : null,
        tabs,
        small: small.slice(0, 8),
        past: past.slice(0, 8),
      };
    });

    const label = `${width}-${route.replace(/^\//, '').replace(/\//g, '_') || 'home'}`;
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${SHOT_DIR}/${PREFIX}-${label}.png`, fullPage: process.env.BM_FULLPAGE !== '0' });

    const grown = report.innerWidth > width;
    console.log(
      `\n=== ${route} @ ${width}px  layout=${report.innerWidth} visual=${report.visualWidth} scroll=${report.scrollWidth} nav=${report.navWidth} sideways=${report.canScrollSideways}`,
    );
    for (const item of report.spilling) console.log('   SPILL ', JSON.stringify(item));
    for (const item of report.past) console.log('   PAST  ', item);
    for (const item of report.small) console.log('   small ', item);
    if (report.tabs.length) console.log('   tabs  ', JSON.stringify(report.tabs));

    check(
      !grown,
      `${route} @ ${width}px: the layout viewport grew to ${report.innerWidth}px, so the page is cut off at the edge`,
    );
    check(
      report.scrollWidth <= width + 1,
      `${route} @ ${width}px: the page is ${report.scrollWidth}px wide and cannot be shown on a ${width}px screen`,
    );
    check(
      report.past.length === 0,
      `${route} @ ${width}px: ${report.past.length} element(s) reach past the edge of the screen`,
    );
    check(
      report.navWidth === null || report.navWidth <= width,
      `${route} @ ${width}px: the navigation of the phone is ${report.navWidth}px wide and does not fit`,
    );
    for (const tab of report.tabs) {
      check(
        tab.right <= width + 1 && tab.left >= -1,
        `${route} @ ${width}px: the tab "${tab.text}" is outside the screen (${tab.left}..${tab.right})`,
      );
    }
    check(report.spilling.length === 0, `${route} @ ${width}px: ${report.spilling.length} element(s) let their text leave the box`);
  }
}

console.log(`\n--- ${notes.length} notes, ${problems.length} problems`);
for (const note of notes) console.log('  ok  ', note);
for (const problem of problems) console.log('  FAIL', problem);

await browser.close();
process.exit(problems.length ? 1 : 0);
