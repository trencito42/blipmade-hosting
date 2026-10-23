/**
 * Probe: which client routes does this panel have?
 *
 * The panel answers 403 with "You are attempting to use an application API key
 * on an endpoint that requires a client API key" when a route exists, and 404
 * when it does not. So the status alone maps the surface.
 */
const URL_BASE = process.env.PTERODACTYL_URL;
const APP_KEY = process.env.PTERODACTYL_APP_KEY;
const MEDIA = 'Application/vnd.pterodactyl.v1+json';
const UUID = 'aec52a41-0445-4c03-bab9-82f1af8ed621';

async function status(method, path) {
  try {
    const response = await fetch(`${URL_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${APP_KEY}`, Accept: MEDIA },
    });
    const text = await response.text();
    let note = '';
    try {
      const parsed = JSON.parse(text);
      note = parsed?.errors?.[0]?.detail ?? '';
    } catch {
      note = text.slice(0, 80);
    }
    return { status: response.status, note };
  } catch (error) {
    return { status: 0, note: String(error) };
  }
}

const ROUTES = [
  ['GET', '/api/client'],
  ['GET', '/api/client/account'],
  ['GET', '/api/client/account/api-tokens'],
  ['POST', '/api/client/account/api-tokens'],
  ['GET', '/api/client/servers'],
  ['GET', `/api/client/servers/${UUID}`],
  ['GET', `/api/client/servers/${UUID}/websocket`],
  ['GET', `/api/client/servers/${UUID}/resources`],
  ['POST', `/api/client/servers/${UUID}/power`],
  ['POST', `/api/client/servers/${UUID}/command`],
  ['GET', `/api/client/servers/${UUID}/files`],
  ['GET', `/api/client/servers/${UUID}/files/list`],
  ['GET', `/api/client/servers/${UUID}/files/contents`],
  ['GET', `/api/client/servers/${UUID}/backups`],
  ['GET', `/api/client/servers/${UUID}/databases`],
  ['GET', `/api/client/servers/${UUID}/schedules`],
  ['GET', `/api/client/servers/${UUID}/startup`],
  ['GET', `/api/client/servers/${UUID}/allocation`],
  ['GET', `/api/client/servers/${UUID}/activity`],
  ['GET', `/api/client/servers/${UUID}/settings/rename`],
  ['GET', `/api/client/servers/${UUID}/settings/reinstall`],
  ['GET', '/api/client/auth/login'],
  ['GET', '/api/client/auth/two-factor'],
  ['GET', '/api/application/users/1/tokens'],
  ['POST', '/api/application/users/1/token'],
];

console.log('route                                              status  note');
for (const [method, path] of ROUTES) {
  const result = await status(method, path);
  const mark = result.status === 403 ? 'EXISTS' : result.status === 404 ? 'absent' : String(result.status);
  console.log(`${method.padEnd(4)} ${path.padEnd(48)} ${String(result.status).padStart(4)}  ${mark} ${result.note.slice(0, 90)}`);
}
