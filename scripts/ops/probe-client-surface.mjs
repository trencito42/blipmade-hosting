/**
 * Probe: which client routes does the panel have?
 *
 * Only GET and HEAD are used, so nothing is written. A 403 means the route
 * exists and only a client key may use it; a 404 means it does not exist.
 */
const URL_BASE = process.env.PTERODACTYL_URL;
const APP_KEY = process.env.PTERODACTYL_APP_KEY;
const MEDIA = 'Application/vnd.pterodactyl.v1+json';
const UUID = 'de443738-488e-45c3-be83-786e9f64b56e';

async function probe(path) {
  const response = await fetch(`${URL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${APP_KEY}`, Accept: MEDIA },
  });
  const text = await response.text();
  let supported = '';
  try {
    supported = JSON.parse(text)?.errors?.[0]?.detail?.match(/Supported methods: ([^.]+)\./)?.[1] ?? '';
  } catch {
    /* not json */
  }
  return { status: response.status, supported };
}

const PATHS = [
  `/api/client/servers/${UUID}`,
  `/api/client/servers/${UUID}/files/list`,
  `/api/client/servers/${UUID}/files/contents`,
  `/api/client/servers/${UUID}/files/write`,
  `/api/client/servers/${UUID}/files/delete`,
  `/api/client/servers/${UUID}/files/rename`,
  `/api/client/servers/${UUID}/files/copy`,
  `/api/client/servers/${UUID}/files/upload`,
  `/api/client/servers/${UUID}/files/compress`,
  `/api/client/servers/${UUID}/files/decompress`,
  `/api/client/servers/${UUID}/files/chmod`,
  `/api/client/servers/${UUID}/backups`,
  `/api/client/servers/${UUID}/backups/1`,
  `/api/client/servers/${UUID}/backups/1/download`,
  `/api/client/servers/${UUID}/backups/1/restore`,
  `/api/client/servers/${UUID}/databases`,
  `/api/client/servers/${UUID}/databases/1`,
  `/api/client/servers/${UUID}/databases/1/credentials`,
  `/api/client/servers/${UUID}/schedules`,
  `/api/client/servers/${UUID}/schedules/1`,
  `/api/client/servers/${UUID}/schedules/1/run`,
  `/api/client/servers/${UUID}/allocations`,
  `/api/client/servers/${UUID}/allocation`,
  `/api/client/servers/${UUID}/startup`,
  `/api/client/servers/${UUID}/activity`,
  `/api/client/servers/${UUID}/settings/rename`,
  `/api/client/servers/${UUID}/settings/reinstall`,
  `/api/client/servers/${UUID}/websocket`,
  `/api/client/servers/${UUID}/resources`,
  `/api/client/servers/${UUID}/power`,
  `/api/client/servers/${UUID}/command`,
];

for (const path of PATHS) {
  const result = await probe(path);
  const short = path.replace(`/api/client/servers/${UUID}`, '');
  const verdict = result.status === 403 ? 'EXISTS' : result.status === 404 ? 'absent' : String(result.status);
  console.log(`${short.padEnd(26)} -> ${String(result.status).padStart(4)} ${verdict.padEnd(7)} ${result.supported}`);
}
