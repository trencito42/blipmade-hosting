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
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__shifts.push({
        t: Math.round(entry.startTime),
        value: entry.value,
        sources: (entry.sources || []).map((s) => ({
          node: s.node ? `${s.node.tagName}.${s.node.className || ''}`.slice(0, 60) : '?',
          html: s.node ? (s.node.outerHTML || '').slice(0, 110) : '',
          prev: s.previousRect ? [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height] : null,
          cur: s.currentRect ? [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height] : null,
        })),
      });
    }
  });
  observer.observe({ type: 'layout-shift', buffered: true });
});

await page.goto(url, { waitUntil: 'load', timeout: 45000 });
await page.waitForTimeout(2500);

const shifts = await page.evaluate(() => window.__shifts);
console.log(`URL: ${url}`);
console.log(`salturi: ${shifts.length}`);
for (const s of shifts) {
  console.log(`\n  t=${s.t}ms valoare=${s.value}`);
  for (const src of s.sources) {
    console.log(`    nod: ${src.node}`);
    console.log(`    html: ${src.html}`);
    console.log(`    inainte: ${JSON.stringify(src.prev)} -> dupa: ${JSON.stringify(src.cur)}`);
  }
}
await browser.close();
