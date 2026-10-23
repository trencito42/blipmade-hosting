/**
 * Probe: how can the Blipmade backend obtain a Client API key that is scoped
 * to one customer, without a browser and without touching the panel files?
 *
 * It tries, in order:
 *   1. the client login of the panel, which hands a client token to the
 *      account it authenticates,
 *   2. the application routes that create a token for a user, in the shapes
 *      the Pterodactyl versions use,
 *   3. the token creation of the client API.
 */
const URL_BASE = process.env.PTERODACTYL_URL;
const APP_KEY = process.env.PTERODACTYL_APP_KEY;
const MEDIA = 'Application/vnd.pterodactyl.v1+json';

async function call(method, path, { body, token } = {}) {
  try {
    const response = await fetch(`${URL_BASE}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${APP_KEY}` }),
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

const show = (label, result) => {
  console.log(`\n--- ${label} -> ${result.status}`);
  console.log(result.text.slice(0, 500));
};

// A disposable account on the panel.
const stamp = Date.now().toString(36);
const email = `blipmade-probe-${stamp}@example.test`;
const password = 'Pr0be-Passw0rd-x9';

const created = await call('POST', '/api/application/users', {
  body: {
    email,
    username: `bm_probe_${stamp.slice(-6)}`,
    first_name: 'Blipmade',
    last_name: 'Probe',
    password,
    root_admin: false,
    external_id: `blipmade_acc_probe_${stamp}`,
  },
});
console.log('create user ->', created.status);
const userId = JSON.parse(created.text)?.attributes?.id;
console.log('user id:', userId, 'email:', email);

console.log('\n=========== 1. the client login of the panel ===========');
const login = await call('POST', '/api/client/auth/login', { body: { email, password } });
show('POST /api/client/auth/login', login);
let clientToken = null;
try {
  const parsed = JSON.parse(login.text);
  clientToken = parsed.token ?? parsed.access_token ?? parsed.accessToken ?? null;
} catch {
  /* the body is not json */
}
console.log('client token from login:', clientToken ? `${clientToken.slice(0, 16)}… (${clientToken.length})` : 'none');

if (clientToken) {
  show('GET /api/client/account', await call('GET', '/api/client/account', { token: clientToken }));
  show('GET /api/client/servers', await call('GET', '/api/client/servers', { token: clientToken }));
}

console.log('\n=========== 2. the application routes that create a token ===========');
for (const path of [
  `/api/application/users/${userId}/token`,
  `/api/application/users/${userId}/tokens`,
  `/api/application/users/${userId}/api-tokens`,
  `/api/application/users/${userId}/client-token`,
]) {
  for (const body of [{ type: 'client' }, { type: 'api' }, {}]) {
    const result = await call('POST', path, { body });
    console.log(`POST ${path} ${JSON.stringify(body)} -> ${result.status}`);
    if (result.status !== 404) console.log('   ', result.text.slice(0, 300));
  }
}

console.log('\n=========== 3. what the application api answers ===========');
for (const path of ['/api/application/users', '/api/application/servers', '/api/application/nodes', '/api/application/nests']) {
  const result = await call('GET', path);
  console.log(`GET ${path} -> ${result.status}`);
}

console.log('\n=========== 4. the panel version ===========');
const html = await call('GET', '/');
console.log('GET / ->', html.status);
const version = html.text.match(/"version"\s*:\s*"([^"]+)"/) ?? html.text.match(/v1\.(\d+\.\d+)/);
console.log('version hint:', version ? version[0] : 'none');
console.log('\ncleanup user id:', userId, email);
