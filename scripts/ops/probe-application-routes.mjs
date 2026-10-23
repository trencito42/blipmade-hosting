/**
 * Probe: which server operations does the APPLICATION api of this panel
 * expose? The customer features that only the client api offers (files,
 * console, backups, databases, schedules) decide the architecture, so the
 * surface has to be known exactly.
 *
 * The panel answers 404 when a route does not exist and 422 when it does but
 * the request is invalid, so both mean "the route is there".
 */
const URL_BASE = process.env.PTERODACTYL_URL;
const APP_KEY = process.env.PTERODACTYL_APP_KEY;
const MEDIA = 'Application/vnd.pterodactyl.v1+json';
const UUID = 'aec52a41-0445-4c03-bab9-82f1af8ed621';

async function probe(method, path) {
  try {
    const response = await fetch(`${URL_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${APP_KEY}`, Accept: MEDIA, 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify({}),
    });
    const text = await response.text();
    let note = '';
    try {
      const parsed = JSON.parse(text);
      note = parsed?.errors?.[0]?.detail ?? text.slice(0, 80);
    } catch {
      note = text.slice(0, 80);
    }
    return { status: response.status, note };
  } catch (error) {
    return { status: 0, note: String(error) };
  }
}

const ROUTES = [
  ['GET', `/api/application/servers/${UUID}`],
  ['GET', `/api/application/servers/${UUID}/details`],
  ['GET', `/api/application/servers/${UUID}/build`],
  ['GET', `/api/application/servers/${UUID}/startup`],
  ['POST', `/api/application/servers/${UUID}/install`],
  ['POST', `/api/application/servers/${UUID}/reinstall`],
  ['GET', `/api/application/servers/${UUID}/power`],
  ['POST', `/api/application/servers/${UUID}/power`],
  ['POST', `/api/application/servers/${UUID}/command`],
  ['GET', `/api/application/servers/${UUID}/websocket`],
  ['GET', `/api/application/servers/${UUID}/files`],
  ['GET', `/api/application/servers/${UUID}/files/list`],
  ['GET', `/api/application/servers/${UUID}/backups`],
  ['GET', `/api/application/servers/${UUID}/databases`],
  ['GET', `/api/application/servers/${UUID}/schedules`],
  ['GET', `/api/application/servers/${UUID}/activity`],
  ['GET', `/api/application/servers/${UUID}/allocations`],
  ['GET', `/api/application/servers/${UUID}/allocation`],
  ['GET', '/api/application/allocations'],
  ['GET', '/api/application/nests/1/eggs'],
  ['GET', '/api/application/nodes/1/allocations'],
  ['POST', '/api/application/users'],
  ['PATCH', '/api/application/users/1'],
  ['DELETE', '/api/application/users/999999'],
];

console.log('route                                                     status  verdict');
for (const [method, path] of ROUTES) {
  const result = await probe(method, path);
  const verdict = result.status === 404 ? 'absent' : 'EXISTS';
  console.log(`${method.padEnd(5)} ${path.padEnd(54)} ${String(result.status).padStart(4)}  ${verdict}`);
}
