/**
 * Probe: the exact shape of the application api of this panel.
 *
 * For every path it tries every method. A 404 means the path does not exist.
 * A 405 carries the list of methods the path does support, which is how the
 * real surface is found.
 */
const URL_BASE = process.env.PTERODACTYL_URL;
const APP_KEY = process.env.PTERODACTYL_APP_KEY;
const MEDIA = 'Application/vnd.pterodactyl.v1+json';

const UUID = 'aec52a41-0445-4c03-bab9-82f1af8ed621';
const ID = '2';

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

async function tryMethod(method, path) {
  try {
    const response = await fetch(`${URL_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${APP_KEY}`,
        Accept: MEDIA,
        'Content-Type': 'application/json',
      },
      body: method === 'GET' ? undefined : JSON.stringify({}),
    });
    const text = await response.text();
    let supported = '';
    let note = '';
    try {
      const parsed = JSON.parse(text);
      note = parsed?.errors?.[0]?.detail ?? '';
      const match = note.match(/Supported methods: ([^.]+)\./);
      if (match) supported = match[1];
    } catch {
      note = text.slice(0, 100).replace(/\n/g, ' ');
    }
    return { status: response.status, supported, note, text };
  } catch (error) {
    return { status: 0, supported: '', note: String(error), text: '' };
  }
}

/** The path is tried with the numeric id and with the uuid. */
const PATHS = [
  '/api/application/servers',
  `/api/application/servers/${ID}`,
  `/api/application/servers/${UUID}`,
  `/api/application/servers/${ID}/details`,
  `/api/application/servers/${UUID}/details`,
  `/api/application/servers/${ID}/files`,
  `/api/application/servers/${UUID}/files`,
  `/api/application/servers/${ID}/power`,
  `/api/application/servers/${UUID}/power`,
  `/api/application/servers/${ID}/websocket`,
  `/api/application/servers/${UUID}/websocket`,
  `/api/application/servers/${ID}/command`,
  `/api/application/servers/${UUID}/command`,
  `/api/application/servers/${ID}/backups`,
  `/api/application/servers/${UUID}/backups`,
  `/api/application/servers/${ID}/schedules`,
  `/api/application/servers/${UUID}/schedules`,
  `/api/application/servers/${ID}/databases`,
  `/api/application/servers/${UUID}/databases`,
  `/api/application/servers/${ID}/activity`,
  `/api/application/servers/${UUID}/activity`,
  `/api/application/servers/${ID}/allocation`,
  `/api/application/servers/${UUID}/allocation`,
  `/api/application/servers/${ID}/startup`,
  `/api/application/servers/${UUID}/startup`,
];

for (const path of PATHS) {
  const found = [];
  let sample = '';
  for (const method of METHODS) {
    const result = await tryMethod(method, path);
    if (result.status === 404) continue;
    if (result.status === 405) {
      found.push(`${method}:405(${result.supported})`);
      continue;
    }
    found.push(`${method}:${result.status}`);
    if (!sample) sample = result.text.slice(0, 160).replace(/\n/g, ' ');
  }
  if (!found.length) {
    console.log(`${path}\n    (no route)`);
    continue;
  }
  console.log(`${path}\n    ${found.join('  ')}\n    ${sample}`);
}
