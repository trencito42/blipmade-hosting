import { prisma } from './dist/db.js';
import * as operations from './dist/services/panel/operations.js';
import { listDatabases, rotateDatabasePassword } from './dist/services/pterodactyl/client.js';

const instId = process.argv[2] || 'cmw1bjrpw000tns01od7zntpw';

function redact(value) {
  if (!value || typeof value !== 'object') return value;
  const copy = JSON.parse(JSON.stringify(value));
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      if (/pass/i.test(key) && typeof node[key] === 'string') node[key] = '<redacted>';
      else walk(node[key]);
    }
  };
  walk(copy);
  return copy;
}

const app = await prisma.instance.findUnique({
  where: { id: instId },
  include: { product: { select: { generatedVariables: true } } },
});
if (!app?.pterodactylUuid) throw new Error('no instance');
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
const rows = await operations.databases(token, owned);
const row = rows.find((entry) => entry.name.includes('blip')) ?? rows[0];
console.log('row', { id: row?.id, name: row?.name, user: row?.username, hasPass: Boolean(row?.password) });

const listPayload = await listDatabases(token, uuid);
console.log('list count', listPayload.length, 'first hasPass', Boolean(listPayload[0]?.password));

if (row?.id) {
  try {
    const rotated = await rotateDatabasePassword(token, uuid, row.id);
    console.log('rotate', { id: rotated.id, hasPass: Boolean(rotated.password) });
  } catch (error) {
    console.log('rotate error', String(error));
  }
}

await prisma.$disconnect();
