/**
 * Probe: is there any route on this panel that issues a client token, or that
 * reaches the panel's own route table?
 *
 * The customer operations live on the client api, and the client api only
 * accepts a panel-issued client key. So the question is whether the panel can
 * issue one without a browser.
 */
const URL_BASE = process.env.PTERODACTYL_URL;
const APP_KEY = process.env.PTERODACTYL_APP_KEY;
const MEDIA = 'Application/vnd.pterodactyl.v1+json';

async function status(method, path) {
  try {
    const response = await fetch(`${URL_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${APP_KEY}`, Accept: MEDIA, 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify({ type: 'client' }),
    });
    const text = await response.text();
    let note = '';
    try {
      note = JSON.parse(text)?.errors?.[0]?.detail ?? text.slice(0, 120).replace(/\n/g, ' ');
    } catch {
      note = text.slice(0, 120).replace(/\n/g, ' ');
    }
    return { status: response.status, note };
  } catch (error) {
    return { status: 0, note: String(error) };
  }
}

const PATHS = [
  '/api/application/tokens',
  '/api/application/token',
  '/api/application/users/1/token',
  '/api/application/users/1/tokens',
  '/api/application/users/1/api-token',
  '/api/application/users/1/client-token',
  '/api/application/users/1/client',
  '/api/application/users/1/key',
  '/api/application/users/1/keys',
  '/api/client/users/1/token',
  '/api/client/external/blipmade_acc_probe/token',
  '/api/application/external/blipmade_acc_probe/token',
  '/api/headless/token',
  '/api/blipmade/token',
  '/api/internal/token',
  '/api/application/settings',
  '/api/application/info',
  '/api/client/extensions',
  '/api/client/extensions/server',
  '/api/extensions',
];

console.log('=== the paths that could issue a token ===');
for (const path of PATHS) {
  for (const method of ['GET', 'POST']) {
    const result = await status(method, path);
    if (result.status === 404) continue;
    console.log(`${method.padEnd(4)} ${path.padEnd(46)} -> ${result.status}  ${result.note.slice(0, 110)}`);
  }
}

console.log('\n=== what the panel shows of itself ===');
const html = await (await fetch(URL_BASE, { headers: { Accept: 'text/html' } })).text();
console.log('title:', html.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'none');
console.log('generator:', html.match(/<meta[^>]+name="generator"[^>]+content="([^"]*)"/)?.[1] ?? 'none');
console.log('scripts:', [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]).slice(0, 6).join(', '));
console.log('body size:', html.length);
console.log('mentions of "api/client":', (html.match(/api\/client/g) || []).length);
