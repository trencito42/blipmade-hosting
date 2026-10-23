/**
 * Probe: the application api of the panel, with the numeric server id.
 *
 * It reads the server that exists, asks the routes the provisioning needs and
 * checks whether the panel has a generic delete route.
 */
const URL_BASE = process.env.PTERODACTYL_URL;
const APP_KEY = process.env.PTERODACTYL_APP_KEY;
const MEDIA = 'Application/vnd.pterodactyl.v1+json';
const ID = '2';

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

const server = await call('GET', `/api/application/servers/${ID}`);
console.log('=== the server ===');
try {
  const attributes = JSON.parse(server.text).attributes;
  console.log(JSON.stringify(attributes, null, 1).slice(0, 2200));
} catch {
  console.log(server.text.slice(0, 600));
}

console.log('\n=== the routes the provisioning needs ===');
for (const [method, path] of [
  ['POST', `/api/application/servers/${ID}/install`],
  ['POST', `/api/application/servers/${ID}/reinstall`],
  ['GET', `/api/application/servers/${ID}/files/list`],
  ['GET', `/api/application/servers/${ID}/databases`],
  ['GET', `/api/application/servers/${ID}/databases?per_page=10`],
]) {
  const result = await call(method, path);
  console.log(`${method} ${path} -> ${result.status} ${result.text.slice(0, 200).replace(/\n/g, ' ')}`);
}

console.log('\n=== is there a generic delete route? ===');
for (const path of [
  `/api/application/servers/999999/anything`,
  `/api/application/servers/${ID}/no-such-relation`,
]) {
  const result = await call('DELETE', path);
  console.log(`DELETE ${path} -> ${result.status} ${result.text.slice(0, 220).replace(/\n/g, ' ')}`);
}

console.log('\n=== the node ===');
const nodes = await call('GET', '/api/application/nodes');
try {
  console.log(JSON.stringify(JSON.parse(nodes.text).data?.[0]?.attributes, null, 1).slice(0, 1600));
} catch {
  console.log(nodes.text.slice(0, 400));
}

console.log('\n=== the allocations of node 1 ===');
const allocations = await call('GET', '/api/application/nodes/1/allocations?per_page=500');
try {
  const list = JSON.parse(allocations.text).data ?? [];
  console.log('count:', list.length);
  for (const entry of list.slice(0, 8)) {
    const a = entry.attributes;
    console.log(`  id=${a.id} ip=${a.ip} port=${a.port} assigned=${a.assigned} server=${a.server_id}`);
  }
  const free = list.filter((entry) => !entry.attributes.assigned).map((entry) => entry.attributes.port);
  console.log('free ports:', free.slice(0, 20).join(', '));
} catch {
  console.log(allocations.text.slice(0, 400));
}
