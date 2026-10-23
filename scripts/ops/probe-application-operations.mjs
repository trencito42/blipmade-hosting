/**
 * Probe: the extended application api of the panel.
 *
 * It reads the server that the previous round created and asks every route the
 * customer features need. Nothing is written except a power action, and only
 * on the test server.
 */
const URL_BASE = process.env.PTERODACTYL_URL;
const APP_KEY = process.env.PTERODACTYL_APP_KEY;
const MEDIA = 'Application/vnd.pterodactyl.v1+json';
const UUID = 'aec52a41-0445-4c03-bab9-82f1af8ed621';

async function call(method, path, body) {
  try {
    const response = await fetch(`${URL_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${APP_KEY}`,
        Accept: MEDIA,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, text: await response.text() };
  } catch (error) {
    return { status: 0, text: String(error) };
  }
}

const show = (label, result, limit = 700) => {
  console.log(`\n--- ${label} -> ${result.status}`);
  console.log(result.text.slice(0, limit));
};

show('GET details', await call('GET', `/api/application/servers/${UUID}/details`));
show('GET build', await call('GET', `/api/application/servers/${UUID}/build`));
show('GET startup', await call('GET', `/api/application/servers/${UUID}/startup`));
show('GET allocation', await call('GET', `/api/application/servers/${UUID}/allocation`));
show('GET activity', await call('GET', `/api/application/servers/${UUID}/activity`), 400);
show('GET files', await call('GET', `/api/application/servers/${UUID}/files`), 700);
show('GET backups', await call('GET', `/api/application/servers/${UUID}/backups`), 500);
show('GET schedules', await call('GET', `/api/application/servers/${UUID}/schedules`), 500);
show('GET websocket', await call('GET', `/api/application/servers/${UUID}/websocket`), 500);
show('POST websocket', await call('POST', `/api/application/servers/${UUID}/websocket`), 500);
show('GET files/list', await call('GET', `/api/application/servers/${UUID}/files/list`), 500);
show('GET files/contents', await call('GET', `/api/application/servers/${UUID}/files/contents?file=/`), 500);
