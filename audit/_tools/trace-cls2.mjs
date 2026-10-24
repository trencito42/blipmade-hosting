const playwright = await import('/opt/blipmade/tools/browser/node_modules/playwright-core/index.js');
const chromium = playwright.chromium ?? playwright.default?.chromium;

const url = process.argv[2] || 'http://127.0.0.1:30020/apps/wordpress';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 412, height: 823 } });

await page.addInitScript(() => {
  window.__shifts = [];
  window.__firstFooter = null;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__shifts.push({
        t: Math.round(entry.startTime),
        value: entry.value,
        sources: (entry.sources || []).map((s) => ({
          tag: s.node ? s.node.tagName : '?',
          cls: s.node && typeof s.node.className === 'string' ? s.node.className.slice(0, 40) : '',
          prev: s.previousRect ? [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height] : null,
          cur: s.currentRect ? [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height] : null,
        })),
      });
    }
  });
  observer.observe({ type: 'layout-shift', buffered: true });

  // Se pastreaza primul subsol intalnit, ca sa se vada daca acelasi nod este
  // inlocuit mai tarziu.
  const grab = () => {
    if (!window.__firstFooter) {
      const f = document.querySelector('footer');
      if (f) window.__firstFooter = f;
    }
  };
  new MutationObserver(grab).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', grab);
});

await page.goto(url, { waitUntil: 'load', timeout: 45000 });
await page.waitForTimeout(3000);

const result = await page.evaluate(() => {
  const f = window.__firstFooter;
  const current = document.querySelector('footer');
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  };
  return {
    shifts: window.__shifts,
    firstFooterFound: Boolean(f),
    firstFooterConnected: f ? f.isConnected : null,
    firstFooterRect: rect(f),
    currentFooterRect: rect(current),
    sameNode: f === current,
    bodyHeight: document.body.scrollHeight,
    footerCount: document.querySelectorAll('footer').length,
    mainHeight: document.querySelector('main') ? Math.round(document.querySelector('main').getBoundingClientRect().height) : null,
  };
});

console.log(`URL: ${url}`);
console.log(`subsoluri in pagina: ${result.footerCount} | primul subsol conectat: ${result.firstFooterConnected} | acelasi nod: ${result.sameNode}`);
console.log(`rect primul subsol: ${JSON.stringify(result.firstFooterRect)} | rect subsol curent: ${JSON.stringify(result.currentFooterRect)}`);
console.log(`inaltime main: ${result.mainHeight} | inaltime body: ${result.bodyHeight}`);
for (const s of result.shifts) {
  console.log(`\n  t=${s.t}ms valoare=${s.value}`);
  for (const src of s.sources) {
    console.log(`    ${src.tag}.${src.cls}  ${JSON.stringify(src.prev)} -> ${JSON.stringify(src.cur)}`);
  }
}
await browser.close();
