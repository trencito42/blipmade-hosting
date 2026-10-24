const playwright = await import('/opt/blipmade/tools/browser/node_modules/playwright-core/index.js');
const chromium = playwright.chromium ?? playwright.default?.chromium;

const url = process.argv[2] || 'http://127.0.0.1:30020/apps/wordpress';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 412, height: 823 } });

await page.addInitScript(() => {
  window.__events = [];
  const started = performance.now();
  const stamp = () => Math.round(performance.now() - started);
  const describe = (n) =>
    n.nodeType === 1
      ? `${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}${n.className && typeof n.className === 'string' ? '.' + n.className.split(' ').slice(0, 2).join('.') : ''}`
      : `#${n.nodeType}`;
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        window.__events.push({ t: stamp(), kind: 'adaugat', node: describe(n), html: (n.outerHTML || '').slice(0, 90) });
      }
      for (const n of r.removedNodes) {
        if (n.nodeType !== 1) continue;
        window.__events.push({ t: stamp(), kind: 'eliminat', node: describe(n), html: (n.outerHTML || '').slice(0, 90) });
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
});

await page.goto(url, { waitUntil: 'load', timeout: 45000 });
await page.waitForTimeout(2500);

const events = await page.evaluate(() => window.__events);
const big = events.filter((e) => /footer|main|nav|root|section|article/i.test(e.html + e.node));
console.log(`evenimente: ${events.length}, relevante: ${big.length}`);
for (const e of big.slice(0, 30)) {
  console.log(`  [${e.t}ms] ${e.kind}: ${e.node} :: ${e.html}`);
}
await browser.close();
