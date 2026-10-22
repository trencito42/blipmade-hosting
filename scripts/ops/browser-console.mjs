/**
 * Reads the live console output of a server through the panel's Client API.
 *
 * The console websocket is how a customer sees their application output, so
 * this is the supported way to find out why a container is not serving.
 *
 * TLS verification is never switched off. When the panel certificate is not
 * trusted the script stops and says how to install the CA certificate.
 *
 * Environment:
 *   PTERODACTYL_URL     the panel (default https://panel.blipmade.com)
 *   PANEL_EMAIL         the panel account that signs in
 *   PANEL_PASSWORD      its password (never printed)
 *   PROBE_SERVER_UUID   the uuid of the server to read
 *   CONSOLE_SECONDS     how long to listen (default 20)
 */
import fs from 'node:fs';

const BASE = process.env.PTERODACTYL_URL ?? 'https://panel.blipmade.com';
const EMAIL = process.env.PANEL_EMAIL ?? '';
const PASSWORD = process.env.PANEL_PASSWORD ?? '';
const SERVER_UUID = process.env.PROBE_SERVER_UUID ?? '';
const SECONDS = Number(process.env.CONSOLE_SECONDS ?? 20);

const TLS_HINT = [
  'The certificate of the panel is not trusted by this machine.',
  'Install the CA certificate and point Node at it, for example:',
  '  SSL_CERT_FILE=/etc/ssl/certs/blipmade-ca.pem node scripts/ops/browser-console.mjs',
  'or export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/blipmade-ca.pem',
].join('\n');

const TLS_CODES = [
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
];

/** Tell whether an error is a certificate problem and print what to do. */
function reportError(error, context) {
  const code = String(error?.code ?? error?.cause?.code ?? '');
  console.error(`${context}: ${error.message}`);
  if (TLS_CODES.some((candidate) => code.includes(candidate))) console.error(TLS_HINT);
}

if (!EMAIL || !PASSWORD) {
  console.error('error: PANEL_EMAIL and PANEL_PASSWORD have to be set (the panel account that signs in).');
  console.error('The password is never printed and never written to a file.');
  process.exit(1);
}
if (!SERVER_UUID) {
  console.error('error: PROBE_SERVER_UUID is not set (the uuid of the server to read).');
  process.exit(1);
}

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ??
  '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const WS_MODULE = process.env.WS_MODULE ??
  '/opt/blipmade/tools/browser/node_modules/ws/index.js';

const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;
const wsModule = await import(WS_MODULE);
const WebSocket = wsModule.WebSocket ?? wsModule.default?.WebSocket;

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  let authenticated = false;
  for (let attempt = 1; attempt <= 4 && !authenticated; attempt++) {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.locator('input[name="username"]').fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
      page.locator('button[type="submit"]').click(),
    ]);
    await page.waitForTimeout(3500);

    // The invisible reCAPTCHA occasionally fails, so the session is confirmed
    // against a client endpoint instead of trusting the cookie alone.
    const account = await context.request.get(`${BASE}/api/client/account`);
    const accountText = await account.text();
    authenticated = accountText.trim().startsWith('{');
    console.log(`login attempt ${attempt}: url=${page.url()} authenticated=${authenticated}`);
  }

  if (!authenticated) {
    await page.screenshot({ path: '/tmp/panel-login-failed.png', fullPage: true });
    console.log('could not authenticate; screenshot -> /tmp/panel-login-failed.png');
    throw new Error('no panel session');
  }

  const res = await context.request.get(`${BASE}/api/client/servers/${SERVER_UUID}/websocket`);
  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    console.log('websocket endpoint returned non-JSON:', res.status(), text.slice(0, 300));
    throw new Error('websocket endpoint not JSON');
  }
  const socket = payload.socket ?? payload.data?.socket;
  const token = payload.token ?? payload.data?.token;
  console.log('socket:', socket);
  if (!socket || !token) {
    console.log('raw websocket payload:', JSON.stringify(payload).slice(0, 800));
    throw new Error('no websocket details');
  }

  // The node's public DNS name is not routable from the private network, so
  // the daemon is reached over its internal address instead.
  const wsBase = process.env.WS_BASE;
  const url = wsBase
    ? `${socket.replace(/^wss:\/\/[^/]+/, wsBase)}?token=${encodeURIComponent(token)}`
    : `${socket}?token=${encodeURIComponent(token)}`;
  console.log('console url:', url.replace(token, '<token>'));
  const socketConnection = new WebSocket(url, {
    headers: { Origin: BASE, Authorization: `Bearer ${token}` },
  });
  const seen = [];
  socketConnection.on('open', () => console.log('console websocket open'));
  socketConnection.on('message', (data) => {
    const text = data.toString();
    try {
      const parsed = JSON.parse(text);
      if (parsed.event === 'console output') {
        const line = parsed.args?.output ?? JSON.stringify(parsed.args);
        console.log('[console]', line);
        seen.push(line);
      } else {
        console.log('[event]', JSON.stringify(parsed).slice(0, 300));
      }
    } catch {
      console.log('[raw]', text.slice(0, 300));
      seen.push(text);
    }
  });
  socketConnection.on('error', (err) => reportError(err, 'ws error'));
  socketConnection.on('close', (code) => console.log('ws closed:', code));

  await new Promise((resolve) => setTimeout(resolve, SECONDS * 1000));
  socketConnection.close();
  fs.writeFileSync('/tmp/console-output.txt', seen.join('\n'));
  console.log('captured lines:', seen.length);
} catch (error) {
  reportError(error, 'failed');
} finally {
  await browser.close();
}
