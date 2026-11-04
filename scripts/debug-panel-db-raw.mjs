import { prisma } from './dist/db.js';
import * as operations from './dist/services/panel/operations.js';
import { env } from './dist/env.js';

const instId = 'cmw1bjrpw000tns01od7zntpw';
const app = await prisma.instance.findUnique({
  where: { id: instId },
  include: { product: { select: { generatedVariables: true } } },
});
const owned = {
  id: app.id,
  userId: app.userId,
  pterodactylUuid: app.pterodactylUuid,
  pterodactylServerId: app.pterodactylServerId,
  status: app.status,
  generatedVariables: app.generatedVariables,
  productVariables: app.product.generatedVariables,
};
const token = await operations.customerToken(owned);
const uuid = app.pterodactylUuid;
const MEDIA = 'Application/vnd.pterodactyl.v1+json';

async function fetchJson(path, query = {}) {
  const url = new URL(`${env.PTERODACTYL_URL}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: MEDIA },
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { parseError: text.slice(0, 200) };
  }
  return { status: response.status, json };
}

function shape(value, depth = 0) {
  if (depth > 4) return '…';
  if (value === null || typeof value !== 'object') return typeof value;
  if (Array.isArray(value)) return value.map((entry) => shape(entry, depth + 1));
  const out = {};
  for (const key of Object.keys(value)) {
    if (/pass/i.test(key)) out[key] = typeof value[key] === 'string' ? '<string>' : shape(value[key], depth + 1);
    else out[key] = shape(value[key], depth + 1);
  }
  return out;
}

const list = await fetchJson(`/api/client/servers/${uuid}/databases`, { include: 'password' });
console.log('list status', list.status);
console.log(JSON.stringify(shape(list.json), null, 2));

const rowId = list.json?.data?.[0]?.attributes?.id ?? list.json?.data?.[0]?.attributes?.identifier;
if (rowId) {
  const rotate = await fetchJson(`/api/client/servers/${uuid}/databases/${rowId}/rotate-password`, {});
  console.log('rotate method POST');
  const url = new URL(`${env.PTERODACTYL_URL}/api/client/servers/${uuid}/databases/${rowId}/rotate-password`);
  const rotRes = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: MEDIA, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const rotJson = JSON.parse(await rotRes.text());
  console.log('rotate status', rotRes.status);
  console.log(JSON.stringify(shape(rotJson), null, 2));
}

await prisma.$disconnect();
