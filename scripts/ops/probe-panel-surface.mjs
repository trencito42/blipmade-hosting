/**
 * Probe: what does this panel actually expose?
 *
 * It asks the routes the Blipmade client adapter uses, plus the system route
 * that carries the version, and prints the status of every answer.
 */
const URL_BASE = process.env.PTERODACTYL_URL;
const APP_KEY = process.env.PTERODACTYL_APP_KEY;
const MEDIA = 'Application/vnd.pterodactyl.v1+json';

async function probe(method, path, token) {
  try {
    const response = await fetch(`${URL_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token ?? APP_KEY}`,
        Accept: MEDIA,
      },
    });
    const text = await response.text();
    return { status: response.status, text };
  } catch (error) {
    return { status: 0, text: String(error) };
  }
}

console.log('=== the version of the panel ===');
const system = await probe('GET', '/api/system');
console.log('GET /api/system ->', system.status, system.text.slice(0, 400));

console.log('\n=== the client api, with the application key ===');
for (const path of [
  '/api/client',
  '/api/client/account',
  '/api/client/servers',
  '/api/client/auth/login',
  '/api/client/auth/2fa',
  '/api/client/extensions',
]) {
  const result = await probe('GET', path);
  console.log(`GET ${path} -> ${result.status}  ${result.text.slice(0, 160).replace(/\n/g, ' ')}`);
}

console.log('\n=== the application api ===');
for (const path of ['/api/application', '/api/application/allocations', '/api/application/servers?per_page=5']) {
  const result = await probe('GET', path);
  console.log(`GET ${path} -> ${result.status}  ${result.text.slice(0, 200).replace(/\n/g, ' ')}`);
}

console.log('\n=== the servers the application api knows ===');
const servers = await probe('GET', '/api/application/servers?per_page=20');
if (servers.status === 200) {
  try {
    const parsed = JSON.parse(servers.text);
    for (const entry of parsed.data ?? []) {
      const a = entry.attributes;
      console.log(
        `  id=${a.id} uuid=${a.uuid} name="${a.name}" user=${a.user} node=${a.node} ` +
          `allocation=${a.allocation} egg=${a.egg} installed=${a.container?.installed} state=${a.state}`,
      );
    }
  } catch {
    console.log(servers.text.slice(0, 600));
  }
}

console.log('\n=== the users the application api knows ===');
const users = await probe('GET', '/api/application/users?per_page=50');
if (users.status === 200) {
  try {
    const parsed = JSON.parse(users.text);
    for (const entry of parsed.data ?? []) {
      const a = entry.attributes;
      console.log(`  id=${a.id} email=${a.email} username=${a.username} root_admin=${a.root_admin} external_id=${a.external_id}`);
    }
  } catch {
    console.log(users.text.slice(0, 600));
  }
}

console.log('\n=== the nodes ===');
const nodes = await probe('GET', '/api/application/nodes');
if (nodes.status === 200) {
  try {
    const parsed = JSON.parse(nodes.text);
    for (const entry of parsed.data ?? []) {
      const a = entry.attributes;
      console.log(`  id=${a.id} name=${a.name} fqdn=${a.fqdn} scheme=${a.scheme} port=${a.port}`);
    }
  } catch {
    console.log(nodes.text.slice(0, 400));
  }
}
