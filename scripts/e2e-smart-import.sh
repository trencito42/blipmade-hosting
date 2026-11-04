#!/usr/bin/env bash
# End-to-end Smart Deploy: import plan → order (importSourceId) → provision → applied import.
# Run on VM103 from /opt/blipmade after deploy. Uses real panel; dev only.
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="e2e-import-$(date -u +%Y%m%d%H%M%S)"
echo "=== Smart import E2E tag=$TAG ==="
E2E_TAG="$TAG" docker compose -f compose.yml -f compose.api.yml exec -T -e E2E_TAG="$TAG" api node <<'NODE'
import { prisma } from './dist/db.js';
import { inspectGitUrl } from './dist/services/import-inspect.js';
import { cleanCommand, cleanRepoUrl } from './dist/services/git-deploy.js';
import { buildQuote } from './dist/services/pricing.js';
import { quoteItemsForImport } from './dist/services/project-links.js';
import { nextOrderNumber } from './dist/services/order-numbers.js';
import { linkImportSourceToOrderItem, recoverStoredImports } from './dist/services/import-apply.js';
import { probeApplicationHealth } from './dist/services/deploy-health.js';
import { fulfilOrder } from './dist/routes/webhooks.js';

const TAG = process.env.E2E_TAG || 'e2e';
const repo = 'https://github.com/trencito42/daily81';

const user = await prisma.user.findFirst({
  where: { instances: { some: { name: 'daily81' } } },
  select: { id: true, email: true },
});
if (!user) throw new Error('No user with daily81 instance found for E2E');

const product = await prisma.product.findUnique({ where: { slug: 'nodejs' }, select: { id: true, defaultRam: true, defaultCpu: true, defaultDisk: true } });
if (!product) throw new Error('nodejs product missing');

const proposal = await inspectGitUrl(repo);
if (!proposal.build || !proposal.start) throw new Error('daily81 inspect failed');

const source = await prisma.importSource.create({
  data: {
    userId: user.id,
    productSlug: 'nodejs',
    kind: 'git',
    repoUrl: cleanRepoUrl(repo),
    branch: 'main',
    buildCommand: cleanCommand(proposal.build, 'buildCommand', false),
    startCommand: cleanCommand(proposal.start, 'startCommand', true),
    confirmedServices: ['attached_mysql'],
  },
});

let items = quoteItemsForImport([
  { productSlug: 'nodejs', ram: 2048, cpu: product.defaultCpu, disk: product.defaultDisk, name: TAG, importSourceId: source.id, managedImport: true },
], []);

const quote = await buildQuote(items, null, user.id, 'MONTHLY');
const serverLine = quote.items.find((row) => row.productSlug === 'nodejs');
if (!serverLine?.importSourceId) throw new Error('buildQuote dropped importSourceId');

const order = await prisma.order.create({
  data: {
    number: await nextOrderNumber(),
    userId: user.id,
    status: 'PAID',
    total: quote.total,
    discount: quote.discount,
    currency: quote.currency,
    items: {
      create: quote.items.map((line, index) => ({
        productId: line.productId,
        name: line.instanceName ?? line.name,
        quantity: 1,
        unitAmount: line.unitAmount,
        total: line.total,
        currency: line.currency,
        fulfillmentStatus: 'PROVISIONING',
        config: {
          ram: line.ram,
          cpu: line.cpu,
          disk: line.disk,
          optionCodes: line.optionCodes,
          period: 'MONTHLY',
          fulfilment: line.fulfilment,
          instanceName: TAG,
          importSourceId: items[index]?.importSourceId ?? line.importSourceId,
        },
      })),
    },
  },
  include: { items: true },
});

const serverItem = order.items.find((row) => row.productId === product.id);
if (!serverItem) throw new Error('order missing server line');
const cfg = serverItem.config as { importSourceId?: string };
if (cfg.importSourceId !== source.id) throw new Error(`order config missing importSourceId (got ${cfg.importSourceId})`);
console.log('order_ok', order.id, 'importSourceId', cfg.importSourceId);

await fulfilOrder(order.id);

const deadline = Date.now() + 45 * 60 * 1000;
let instance = null;
while (Date.now() < deadline) {
  instance = await prisma.instance.findFirst({
    where: { orderId: order.id, name: TAG },
    include: { product: { select: { slug: true } } },
  });
  if (instance?.status === 'ONLINE') break;
  await new Promise((r) => setTimeout(r, 15000));
}
if (!instance?.pterodactylUuid) throw new Error('instance not online in time');

await linkImportSourceToOrderItem(instance);
await recoverStoredImports();

const imp = await prisma.importSource.findUnique({ where: { id: source.id } });
let applied = imp?.appliedAt;
while (!applied && Date.now() < deadline) {
  await recoverStoredImports();
  const row = await prisma.importSource.findUnique({ where: { id: source.id } });
  applied = row?.appliedAt;
  if (row?.phase === 'failed') throw new Error(`import failed: ${row.lastError}`);
  await new Promise((r) => setTimeout(r, 20000));
}
if (!applied) throw new Error('import not applied in time');

const health = await probeApplicationHealth(instance, instance.product.slug);
console.log(JSON.stringify({
  ok: true,
  tag: TAG,
  instanceId: instance.id,
  importPhase: imp?.phase,
  health,
  orderId: order.id,
  importSourceId: source.id,
}, null, 2));

await prisma.$disconnect();
NODE
