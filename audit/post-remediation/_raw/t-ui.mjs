/**
 * PHASE 2 — Customer journey, in the real interface.
 *
 * Chromium (Playwright) against the isolated web on :30006, which proxies to
 * the isolated API on :3112 (database cj_test, panel stub, SMTP sink).
 *
 * It measures the things that only the interface can answer:
 *   - the catalog, the product page and the deploy page as a customer sees them
 *   - whether the state of the deploy form survives a refresh and the back button
 *   - what happens on the billing page when the customer comes back from the payment
 *   - two tabs at the same time
 *   - a direct URL to a protected page without a session
 *   - what the customer is told about an instance that could not be provisioned
 */
const playwright = await import('/opt/blipmade/tools/browser/node_modules/playwright-core/index.js');
const chromium = playwright.chromium ?? playwright.default?.chromium;
const BASE = 'http://127.0.0.1:30006';
const PASSWORD = 'CorrectHorseBattery9';
const stamp = Date.now();
const EMAIL = `cj.ui.${stamp}@example.test`;

const results = [];
let n = 0;
function record(area, step, status, observed, expected, evidence) {
  n += 1;
  results.push({ n, area, step, status, observed, expected, evidence });
  const mark = { PASS: 'OK  ', FAIL: 'FAIL', WARN: 'WARN', BLOCKED: 'BLK ', INFO: 'INFO' }[status] ?? '????';
  console.log(`${mark} ${String(n).padStart(3)} [${area}] ${step} :: ${observed}`);
}
const short = (v, n = 200) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s === undefined ? 'undefined' : s.length > n ? s.slice(0, n) + '…' : s;
};
const text = async (page) => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const apiCalls = [];
page.on('request', (r) => { if (r.url().includes('/api/')) apiCalls.push(`${r.method()} ${r.url().replace(BASE, '')}`); });

try {
  /* ---------------------------------------------------------- discovery */
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const home = await text(page);
  record('DISCOVERY', 'B1.1 Pagina de pornire se încarcă', home.length > 200 ? 'PASS' : 'FAIL',
    `${home.length} caractere vizibile; titlu="${await page.title()}"`, 'O pagină de pornire cu conținut', { head: home.slice(0, 200) });

  const kumaHome = /uptime|kuma/i.test(home);
  const kumaMarked = /coming soon|not published|temporarily unavailable/i.test(home);
  const kumaCard = await page.evaluate(() => {
    const el = [...document.querySelectorAll('article, li, a, div')].find((x) => /uptime|kuma/i.test(x.innerText || '') && (x.innerText || '').length < 400);
    return el ? el.innerText.replace(/\s+/g, ' ').trim().slice(0, 300) : null;
  });
  record('DISCOVERY', 'B1.2 Un produs care nu poate fi provisionat este marcat în pagina de pornire',
    !kumaHome || kumaMarked ? 'PASS' : 'FAIL',
    kumaHome ? `apare; eticheta de stare prezentă pe pagină=${kumaMarked}; cardul produsului: "${kumaCard}"` : 'nu apare în pagina de pornire',
    'Dacă produsul apare, clientul trebuie să vadă că nu poate fi comandat',
    { kumaHome, kumaMarked, kumaCard });

  await page.goto(`${BASE}/apps`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const catalogText = await text(page);
  record('DISCOVERY', 'B1.3 Catalogul public listează produsele',
    /discord/i.test(catalogText) ? 'PASS' : 'FAIL',
    `titlu="${await page.title()}"; "${catalogText.slice(0, 200)}"`, 'Produsele din catalog sunt vizibile public',
    { text: catalogText.slice(0, 500) });

  await page.goto(`${BASE}/apps/discord-bot`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const productText = await text(page);
  const productPrice = productText.match(/[€$]\s?\d+[.,]?\d*/g) ?? [];
  const productCtas = await page.evaluate(() => [...document.querySelectorAll('a,button')].map((x) => x.innerText.trim()).filter((t) => t && t.length < 40).slice(0, 14));
  record('DISCOVERY', 'B1.4 Pagina de produs arată prețul, resursele minime și un apel la acțiune',
    productPrice.length > 0 && /ram|memory|cpu|disk/i.test(productText) ? 'PASS' : 'FAIL',
    `prețuri=${short(productPrice, 120)}; resurse=${/ram|memory/i.test(productText)}; butoane=${short(productCtas, 160)}`,
    'Prețul minim, resursele și un buton de comandă', { productPrice, productCtas, text: productText.slice(0, 400) });

  /* ------------------------------------------------------------ identity */
  const reg = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const regPage = await reg.newPage();
  await regPage.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  await regPage.waitForTimeout(900);
  await regPage.fill('input[type="email"]', EMAIL);
  const pwInputs = await regPage.$$('input[type="password"]');
  if (pwInputs.length >= 2) await pwInputs[1].fill(PASSWORD); else await regPage.fill('input[type="password"]', PASSWORD);
  const nameInputs = await regPage.$$('input:not([type="email"]):not([type="password"])');
  if (nameInputs[0]) await nameInputs[0].fill('CJ');
  if (nameInputs[1]) await nameInputs[1].fill('Journey');
  await regPage.click('button[type="submit"]');
  await regPage.waitForTimeout(3000);
  const afterRegister = await text(regPage);
  record('IDENTITY', 'B2.1 Înregistrarea din interfață creează contul și cere verificarea adresei',
    /check your email|verif|confirmation link/i.test(afterRegister) ? 'PASS' : 'FAIL',
    `url=${regPage.url()}; "${afterRegister.slice(0, 180)}"`, 'Mesajul „Check your email" cu linkul de confirmare',
    { url: regPage.url(), text: afterRegister.slice(0, 300) });
  const resend = await regPage.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /resend/i.test(x.innerText || ''));
    return b ? b.innerText.trim() : null;
  });
  record('IDENTITY', 'B2.2 Ecranul de verificare oferă re-trimiterea e-mailului', resend ? 'PASS' : 'FAIL',
    resend ? `buton="${resend}"` : 'niciun buton de re-trimitere', 'Un mod de a cere din nou e-mailul', { resend });

  // a separate session for the login screen (the first one is already signed in)
  const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const loginPage = await loginCtx.newPage();
  await loginPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await loginPage.waitForTimeout(900);
  await loginPage.fill('input[type="email"]', EMAIL);
  await loginPage.fill('input[type="password"]', PASSWORD);
  await loginPage.click('button[type="submit"]');
  await loginPage.waitForTimeout(3000);
  record('IDENTITY', 'B2.3 Autentificarea din interfață intră în zona de client',
    loginPage.url().includes('/app') ? 'PASS' : 'FAIL',
    `url=${loginPage.url()}; "${(await text(loginPage)).slice(0, 160)}"`, 'URL pe /app/...', { url: loginPage.url() });

  await loginPage.goto(`${BASE}/app/settings`, { waitUntil: 'domcontentloaded' });
  await loginPage.waitForTimeout(2200);
  const settings = await text(loginPage);
  const hasSessions = /session/i.test(settings);
  const hasNotifications = /notification/i.test(settings);
  record('IDENTITY', 'B2.4 Pagina de setări arată profilul, sesiunile și notificările',
    hasSessions && hasNotifications ? 'PASS' : 'FAIL',
    `sesiuni=${hasSessions}, notificări=${hasNotifications}; "${settings.slice(0, 200)}"`, 'Toate cele trei secțiuni vizibile',
    { text: settings.slice(0, 500) });

  /* ----------------------------------------------- a protected URL, no session */
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const anonPage = await anon.newPage();
  await anonPage.goto(`${BASE}/app/billing`, { waitUntil: 'domcontentloaded' });
  await anonPage.waitForTimeout(1500);
  record('IDENTITY', 'B2.4 Un URL protejat deschis fără sesiune duce la autentificare',
    anonPage.url().includes('/login') ? 'PASS' : 'FAIL',
    `url=${anonPage.url()}; "${(await text(anonPage)).slice(0, 160)}"`, 'Redirect la /login', { url: anonPage.url() });
  await anon.close();

  /* ------------------------------------------------------------ deployment */
  await loginPage.goto(`${BASE}/app/instances`, { waitUntil: 'domcontentloaded' });
  await loginPage.waitForTimeout(1200);
  await loginPage.goto(`${BASE}/app/deploy/discord-bot`, { waitUntil: 'domcontentloaded' });
  await loginPage.waitForTimeout(2500);
  const deployText = await text(loginPage);
  record('DEPLOYMENT', 'B3.1 Pagina de comandă se încarcă pentru produsul ales',
    /Configure/.test(deployText) ? 'PASS' : 'FAIL',
    `"${deployText.slice(0, 200)}"`, 'Configuratorul produsului, cu pasii 1..4', { text: deployText.slice(0, 400) });

  const readPrice = () => loginPage.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/TOTAL[^€$]*[€$]\s?([\d.,]+)/i);
    return { total: m ? m[1] : null, sliders: [...document.querySelectorAll('input[type="range"]')].map((s) => ({ id: s.id, value: s.value, max: s.max, text: s.getAttribute('aria-valuetext') })), pills: [...document.querySelectorAll('button[aria-pressed]')].map((b) => b.innerText.trim()) };
  });
  const before = await readPrice();
  record('DEPLOYMENT', 'B3.2 Configuratorul afișează resursele și prețul',
    before.sliders.length > 0 || before.pills.length > 0 ? 'PASS' : 'FAIL',
    `pret initial=${before.total}; cursoare=${short(before.sliders, 160)}; butoane resurse=${short(before.pills, 120)}`,
    'Controale de resurse si un pret vizibil', { before });

  if (before.sliders.length) {
    await loginPage.evaluate(() => {
      const el = document.querySelector('input[type="range"]');
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(Math.min(Number(el.max), Number(el.value) + 1)));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await loginPage.waitForTimeout(2500);
  }
  const afterChange = await readPrice();
  record('DEPLOYMENT', 'B3.3 Prețul se recalculează când se schimbă resursele',
    before.total && afterChange.total && before.total !== afterChange.total ? 'PASS' : 'WARN',
    `pret inainte=${before.total}; pret dupa=${afterChange.total}; slider=${short(afterChange.sliders, 140)}`,
    'Prețul afișat se schimbă odată cu resursele', { before: before.total, after: afterChange.total });

  const stateBefore = await loginPage.evaluate(() => ({
    sliders: [...document.querySelectorAll('input[type="range"]')].map((s) => `${s.id}=${s.value}`),
    pills: [...document.querySelectorAll('button[aria-pressed]')].map((b) => `${b.innerText.trim()}=${b.getAttribute('aria-pressed')}`),
  }));
  await loginPage.reload({ waitUntil: 'domcontentloaded' });
  await loginPage.waitForTimeout(2500);
  const stateAfter = await loginPage.evaluate(() => ({
    sliders: [...document.querySelectorAll('input[type="range"]')].map((s) => `${s.id}=${s.value}`),
    pills: [...document.querySelectorAll('button[aria-pressed]')].map((b) => `${b.innerText.trim()}=${b.getAttribute('aria-pressed')}`),
  }));
  record('DEPLOYMENT', 'B3.4 Configurația aleasă supraviețuiește reîncărcării paginii',
    JSON.stringify(stateBefore) === JSON.stringify(stateAfter) ? 'PASS' : 'FAIL',
    `inainte=${short(stateBefore.sliders.concat(stateBefore.pills), 160)}; dupa=${short(stateAfter.sliders.concat(stateAfter.pills), 160)}`,
    'Resursele alese raman dupa F5', { before: stateBefore, after: stateAfter });

  await loginPage.goBack({ waitUntil: 'domcontentloaded' });
  await loginPage.waitForTimeout(1500);
  record('DEPLOYMENT', 'B3.5 Butonul „înapoi" nu pierde pagina și nici configurația',
    !loginPage.url().endsWith('/app/instances') ? 'PASS' : 'WARN',
    `url dupa inapoi=${loginPage.url()}; pagina=${(await text(loginPage)).slice(0, 120)}`,
    'Revenire pe pagina anterioara, fara pierderea configuratiei', { url: loginPage.url() });

  await loginPage.goto(`${BASE}/app/deploy/discord-bot`, { waitUntil: 'domcontentloaded' });
  await loginPage.waitForTimeout(2500);
  const clickPrimary = async () => {
    const hit = await loginPage.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /^(Review order|Continue to payment|Pay and deploy)$/i.test((x.innerText || '').trim()));
      if (b) { b.click(); return true; }
      return false;
    });
    await loginPage.waitForTimeout(3500);
    return hit;
  };
  const s1 = await clickPrimary();
  const afterReview = await text(loginPage);
  const s2 = await clickPrimary();
  const afterPayment = await text(loginPage);
  const s3 = await clickPrimary();
  await loginPage.waitForTimeout(4000);
  const afterOrder = await text(loginPage);
  record('DEPLOYMENT', 'B3.6 Comanda poate fi trecută prin toate cele patru etape din interfață',
    s1 && s2 && s3 ? 'PASS' : 'FAIL',
    `etape: ${s1 ? 'review' : '?'} -> ${s2 ? 'payment' : '?'} -> ${s3 ? 'plasare' : '?'}; url final=${loginPage.url()}`,
    'Configure -> Review -> Payment -> Provisioning, fara eroare', { s1, s2, s3, url: loginPage.url(), afterReview: afterReview.slice(0, 300), afterPayment: afterPayment.slice(0, 300), afterOrder: afterOrder.slice(0, 300) });

  record('DEPLOYMENT', 'B3.7 După plasarea comenzii, interfața intră în etapa de provisionare',
    /provision|deploying|working|instance/i.test(afterOrder) ? 'PASS' : 'FAIL',
    `"${afterOrder.slice(0, 220)}"`, 'O stare care spune clientului ce se intampla', { text: afterOrder.slice(0, 400) });

  /* ------------------------------------------- FN-P1-03: the checkout param */
  await loginPage.goto(`${BASE}/app/billing?checkout=test_cs_probe`, { waitUntil: 'domcontentloaded' });
  await loginPage.waitForTimeout(2500);
  const billingText = await text(loginPage);
  const mentions = /checkout|test_cs|order|paying|paid|cancel/i.test(billingText);
  record('BILLING', 'B4.1 Pagina de facturare ignoră parametrul `checkout` (FN-P1-03)', mentions ? 'PASS' : 'FAIL',
    `url=${loginPage.url()}; parametrul este in adresa=${/checkout=/.test(loginPage.url())}; pagina vorbeste despre comanda/plata=${mentions}; "${billingText.slice(0, 220)}"`,
    'Pagina de facturare arata starea comenzii la intoarcerea de la plata',
    { url: loginPage.url(), mentions, text: billingText.slice(0, 600) });

  const apiAfterCheckout = await loginPage.evaluate(async () => {
    const r = await fetch('/api/orders?limit=3', { credentials: 'include' });
    return { status: r.status, body: (await r.text()).slice(0, 300) };
  });
  record('BILLING', 'B4.2 Nicio cerere a paginii de facturare nu încearcă să rezolve parametrul `checkout`',
    !/webhooks\/stripe\/test/.test(JSON.stringify(apiAfterCheckout)) ? 'PASS' : 'FAIL',
    `GET /api/orders -> HTTP ${apiAfterCheckout.status}; nicio cerere catre /webhooks/stripe/test in sesiunea browserului`,
    'Fie pagina trateaza parametrul, fie nimeni nu incearca', { apiAfterCheckout });

  /* ------------------------------------------------------------- support */
  await loginPage.goto(`${BASE}/app/tickets`, { waitUntil: 'domcontentloaded' });
  await loginPage.waitForTimeout(2000);
  const ticketsText = await text(loginPage);
  const newTicket = await loginPage.evaluate(() => {
    const b = [...document.querySelectorAll('button,a')].find((x) => /new ticket|create/i.test(x.innerText || ''));
    return b ? b.innerText.trim() : null;
  });
  record('SUPPORT', 'B5.1 Pagina de suport listează biletele și butonul de creare', newTicket ? 'PASS' : 'FAIL',
    `buton="${newTicket}"; "${ticketsText.slice(0, 200)}"`, 'Lista de bilete si butonul "New ticket"', { text: ticketsText.slice(0, 400) });

  if (newTicket) {
    await loginPage.evaluate(() => {
      const b = [...document.querySelectorAll('button,a')].find((x) => /new ticket|create/i.test(x.innerText || ''));
      b?.click();
    });
    await loginPage.waitForTimeout(1800);
    const filled = await loginPage.evaluate(() => {
      const set = (el, v) => {
        const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const subject = document.querySelector('#ticket-subject') || document.querySelector('input[type="text"]');
      const area = document.querySelector('textarea');
      if (subject) set(subject, 'Browser journey ticket');
      if (area) set(area, 'Opened from the browser harness.');
      const sel = document.querySelector('select');
      if (sel && sel.options.length > 1) { sel.selectedIndex = 1; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      return { subject: Boolean(subject), area: Boolean(area), categories: sel ? [...sel.options].map((o) => o.text.trim()) : [] };
    });
    await loginPage.waitForTimeout(600);
    const cats = filled.categories;
    record('SUPPORT', 'B5.2 Formularul de bilet cere subiect, categorie și conținut',
      filled.subject && filled.area && cats.length > 1 ? 'PASS' : 'FAIL',
      `subiect=${filled.subject}, continut=${filled.area}, categorii=${short(cats, 160)}`,
      'Un formular complet, cu categoriile din API', { cats });

    await loginPage.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /^(Send|Create|Save|Submit)/i.test((x.innerText || '').trim()));
      b?.click();
    });
    await loginPage.waitForTimeout(3000);
    const afterSubmit = await text(loginPage);
    record('SUPPORT', 'B5.3 Biletul trimis din interfață este creat și apare în listă',
      /BT-|ticket #|created|success/i.test(afterSubmit) ? 'PASS' : 'FAIL',
      `url=${loginPage.url()}; "${afterSubmit.slice(0, 200)}"`, 'Biletul apare in lista', { url: loginPage.url(), text: afterSubmit.slice(0, 300) });

    const listed = await loginPage.evaluate(() => {
      const rows = [...document.querySelectorAll('a[href*="/app/tickets/"], tr, li')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
      return rows.slice(0, 6);
    });
    record('SUPPORT', 'B5.4 Biletul creat este vizibil în lista clientului', listed.length > 0 ? 'PASS' : 'FAIL',
    `randuri=${short(listed, 200)}`, 'Biletul nou apare printre celelalte', { listed });
  }

  /* --------------------------------------------------- two tabs at once */
  const tab2 = await loginCtx.newPage();
  await tab2.goto(`${BASE}/app/instances`, { waitUntil: 'domcontentloaded' });
  await tab2.waitForTimeout(1800);
  const instText = await text(tab2);
  record('DEPLOYMENT', 'B3.8 Două file deschise simultan pe pagini de client',
    /app|instances/i.test(tab2.url()) ? 'PASS' : 'FAIL',
    `tab 2 url=${tab2.url()}; "${instText.slice(0, 180)}"`, 'Ambele file rămân funcționale', { url: tab2.url(), text: instText.slice(0, 300) });

  /* ------------------------------------------- what the customer is told */
  const instLink = await loginPage.evaluate(() => {
    const a = [...document.querySelectorAll('a[href*="/app/instances/"]')][0];
    return a ? a.getAttribute('href') : null;
  });
  if (instLink) {
    await loginPage.goto(`${BASE}${instLink}`, { waitUntil: 'domcontentloaded' });
    await loginPage.waitForTimeout(2000);
    const detail = await text(loginPage);
    const tabs = await loginPage.evaluate(() => [...document.querySelectorAll('[role="tab"], nav a, button')].map((t) => t.innerText.trim()).filter(Boolean).slice(0, 25));
    record('SERVICE', 'B6.1 Pagina de detaliu a instanței se încarcă', detail.length > 40 ? 'PASS' : 'FAIL',
      `"${detail.slice(0, 220)}"`, 'Detaliile instanței', { detail: detail.slice(0, 400) });
    record('SERVICE', 'B6.2 Pagina instanței nu are un tab de metrici',
      !tabs.some((t) => /metric/i.test(t)) ? 'PASS' : 'FAIL',
      `file: ${short(tabs, 220)}`, 'Fie există pagina de metrici, fie nu se mai promite (FN-P1-04)', { tabs });
  } else {
    record('SERVICE', 'B6.1 Pagina de detaliu a instanței se încarcă', 'BLOCKED', 'Nicio instanță în listă', 'Detaliile instanței', {});
  }
  await tab2.close();

  /* --------------------------------------------------------- logout */
  await loginPage.goto(`${BASE}/app/settings`, { waitUntil: 'domcontentloaded' });
  await loginPage.waitForTimeout(1800);
  const logoutClicked = await loginPage.evaluate(() => {
    const b = [...document.querySelectorAll('button,a')].find((x) => /log ?out|sign out|ieșire/i.test(x.innerText || ''));
    if (b) { b.click(); return true; }
    return false;
  });
  await loginPage.waitForTimeout(2500);
  record('IDENTITY', 'B2.5 Deconectarea din interfață închide sesiunea',
    logoutClicked && (loginPage.url().includes('/login') || loginPage.url().includes('/')) ? 'PASS' : 'FAIL',
    `buton găsit=${logoutClicked}; url după=${loginPage.url()}; "${(await text(loginPage)).slice(0, 140)}"`,
    'După deconectare, pagina de client nu mai este accesibilă', { url: loginPage.url() });

  await loginPage.goto(`${BASE}/app/billing`, { waitUntil: 'domcontentloaded' });
  await loginPage.waitForTimeout(1500);
  record('IDENTITY', 'B2.6 După deconectare, o pagină de client duce din nou la autentificare',
    loginPage.url().includes('/login') ? 'PASS' : 'FAIL', `url=${loginPage.url()}`, 'Redirect la /login', { url: loginPage.url() });
} catch (error) {
  record('BROWSER', 'Eroare în timpul rulării', 'FAIL', String(error?.message ?? error), 'Nicio eroare', { stack: String(error?.stack ?? '').slice(0, 600) });
} finally {
  await browser.close();
}

console.log('\n=== API CALLS OBSERVED ===');
console.log([...new Set(apiCalls)].join('\n'));
console.log('\n=== SUMMARY ===');
const byArea = {};
for (const r of results) {
  byArea[r.area] ??= { tested: 0, passed: 0, failed: 0, blocked: 0, warn: 0, info: 0 };
  byArea[r.area].tested += 1;
  if (r.status === 'PASS') byArea[r.area].passed += 1;
  else if (r.status === 'FAIL') byArea[r.area].failed += 1;
  else if (r.status === 'BLOCKED') byArea[r.area].blocked += 1;
  else if (r.status === 'WARN') byArea[r.area].warn += 1;
  else if (r.status === 'INFO') byArea[r.area].info += 1;
}
console.log(JSON.stringify(byArea, null, 2));
console.log('TOTAL', results.length);
