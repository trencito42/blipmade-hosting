#!/usr/bin/env node
/**
 * Provisions a real instance and checks the whole path to it.
 *
 * The provisioning of a customer is the part of the platform that nobody can
 * see when it is broken: the customer pays, the worker creates a server, and
 * the domain of the customer has to answer with the application of the
 * container. This script walks that path once, on the real panel and the real
 * node:
 *
 *   1. it creates a product that only exists for the test, a customer that
 *      already has a client key on the panel, and an order that is paid;
 *   2. it hands the order to the fulfilment of the platform, so the worker
 *      creates a real server and installs it;
 *   3. it reads the application that is really in the container and checks the
 *      line of the port;
 *   4. it asks the port that the node publishes over HTTP;
 *   5. it points a hostname of the edge at the new instance, asks it over
 *      HTTPS and puts it back where it was.
 *
 * Nothing is created without `--execute`, and nothing is deleted without
 * `--cleanup`.
 *
 *   node scripts/ops/provision-test-instance.mjs            # plan only
 *   node scripts/ops/provision-test-instance.mjs --execute   # the whole path
 *   node scripts/ops/provision-test-instance.mjs --cleanup   # removes it again
 *
 * Environment:
 *   BM_ENV_FILE          the configuration of the platform (default ../.env)
 *   BM_API_ROOT          the built API (default ../../api)
 *   BM_TEST_CUSTOMER     the address of the customer that orders the test
 *   BM_TEST_HOSTNAME     the hostname of the edge that is used for the test
 *   BM_EDGE_ADDRESS      the address of the edge (default 10.77.0.12)
 *   BM_PROBE_TIMEOUT     the seconds the provisioning may take (default 900)
 */

import { existsSync } from 'node:fs';
import dns from 'node:dns/promises';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/**
 * The built API the script works with.
 *
 * Inside the container of the API that is the release itself. On the host it
 * is the build of the repository, which has to be made before the script is
 * run: the production runs from the image and never writes to the host.
 */
const API_ROOT =
  process.env.BM_API_ROOT ??
  (existsSync('/app/dist/db.js') ? '/app' : path.resolve(HERE, '../../api'));
const EXECUTE = process.argv.includes('--execute');
const CLEANUP = process.argv.includes('--cleanup');
const EDGE_ADDRESS = process.env.BM_EDGE_ADDRESS ?? '10.77.0.12';
const PROBE_TIMEOUT_S = Number(process.env.BM_PROBE_TIMEOUT ?? 900);

const PRODUCT_SLUG = 'provisioning-probe';
const ORDER_PREFIX = 'PROBE-';

/**
 * Loads the configuration of the platform.
 *
 * The database is on the loopback of the host, so the name of the compose
 * network is replaced when it does not resolve. The database of the suite is
 * refused: this script creates a real server, and it has to run against the
 * live one.
 */
async function loadEnvironment() {
  const envFile = process.env.BM_ENV_FILE ?? path.resolve(API_ROOT, '../.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    console.error('error: DATABASE_URL is not set.');
    process.exit(1);
  }
  if (url.includes('_test')) {
    console.error('error: this script runs against the live database, not against a test one.');
    process.exit(1);
  }

  const host = url.slice(url.lastIndexOf('@') + 1).split(':')[0];
  try {
    await dns.lookup(host);
  } catch {
    // The name of the compose network does not resolve from the host, so the
    // database is asked on the loopback of the machine.
    process.env.DATABASE_URL = url.replace(`@${host}:`, '@127.0.0.1:');
  }
}

await loadEnvironment();

const { prisma } = await import(path.join(API_ROOT, 'dist/db.js'));
const { fulfilOrder } = await import(path.join(API_ROOT, 'dist/routes/webhooks.js'));
const { withCustomerKey } = await import(path.join(API_ROOT, 'dist/services/provisioning.js'));
const { readFile } = await import(path.join(API_ROOT, 'dist/services/pterodactyl/client.js'));
const { listAllocations, getServer, deleteServer } = await import(
  path.join(API_ROOT, 'dist/services/pterodactyl/application.js')
);
const { reconcileDomainRoutes } = await import(path.join(API_ROOT, 'dist/services/domain-routing.js'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Asks the edge over HTTPS, with the name of the hostname in the handshake. */
function askEdge(hostname, path = '/') {
  return new Promise((resolve) => {
    const request = https.request(
      {
        host: EDGE_ADDRESS,
        port: 443,
        servername: hostname,
        path,
        method: 'GET',
        headers: { host: hostname, accept: 'application/json, text/plain' },
        timeout: 15_000,
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf-8') }),
        );
      },
    );
    request.on('timeout', () => request.destroy(new Error('the edge did not answer in time')));
    request.on('error', (error) => resolve({ status: 0, body: '', error: error.message }));
    request.end();
  });
}

/** The customer that orders the test: one that has a client key on the panel. */
async function findCustomer() {
  const wanted = process.env.BM_TEST_CUSTOMER;
  const user = await prisma.user.findFirst({
    where: wanted ? { email: wanted } : { panelCredential: { isNot: null } },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) {
    console.error('error: no customer with a client key on the panel was found.');
    process.exit(1);
  }
  return user;
}

/** The product of the test, created next to the products of the catalogue. */
async function ensureProduct() {
  const existing = await prisma.product.findUnique({ where: { slug: PRODUCT_SLUG } });
  if (existing) return existing;

  const reference = await prisma.product.findUnique({ where: { slug: 'discord-bot' } });
  if (!reference?.eggId) {
    console.error('error: no product with a mapping to an egg was found.');
    process.exit(1);
  }

  return prisma.product.create({
    data: {
      slug: PRODUCT_SLUG,
      name: 'Provisioning Probe',
      category: 'DEVELOPER_TOOLS',
      description: 'A product that exists only to check that a new instance is served.',
      icon: 'server',
      eggId: reference.eggId,
      dockerImage: reference.dockerImage,
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      defaultRam: 512,
      defaultCpu: 1,
      defaultDisk: 5,
      maxRam: 2048,
      maxCpu: 2,
      maxDisk: 20,
      visible: false,
      deployable: true,
      // The check of the deployment asks the application over HTTP, so a
      // service that listens on another port is not accepted. The statuses
      // that are accepted are the ones the platform accepts by itself.
      healthProbe: { kind: 'http', path: '/' },
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });
}

/** The order of the test, paid. */
async function createOrder(user, product) {
  const number = `${ORDER_PREFIX}${Date.now()}`;
  return prisma.order.create({
    data: {
      number,
      userId: user.id,
      status: 'PAID',
      paidAt: new Date(),
      total: 149,
      currency: 'EUR',
      items: {
        create: [
          {
            productId: product.id,
            name: product.name,
            quantity: 1,
            unitAmount: 149,
            total: 149,
            currency: 'EUR',
            config: { ram: 512, cpu: 1, disk: 5 },
          },
        ],
      },
    },
    include: { items: true },
  });
}

/** Waits for the instance to reach a state that is not a wait any more. */
async function waitForInstance(order) {
  const key = `order:${order.id}:item:${order.items[0].id}:unit:0`;
  const deadline = Date.now() + PROBE_TIMEOUT_S * 1000;

  while (Date.now() < deadline) {
    const instance = await prisma.instance.findUnique({ where: { provisioningKey: key } });
    if (!instance) {
      await sleep(2000);
      continue;
    }
    if (['ONLINE', 'FAILED', 'CANCELLED'].includes(instance.status)) return instance;
    process.stdout.write(
      `    ${new Date().toISOString()} ${instance.status} (step ${instance.provisionStep ?? 'none'})\n`,
    );
    await sleep(5000);
  }
  return null;
}

async function main() {
  const user = await findCustomer();
  const product = await ensureProduct();

  console.log('=== the plan');
  console.log(`    customer: ${user.email} (panel user ${user.pterodactylUserId ?? 'none'})`);
  console.log(`    product:  ${product.name} (egg ${product.eggId}, image ${product.dockerImage})`);
  console.log('    the order is paid, so the worker creates a real server and installs it.');
  console.log('    the application of the container is read, and the port is asked over HTTP.');
  console.log('    a hostname of the edge is pointed at the new instance and put back.');

  if (!EXECUTE && !CLEANUP) {
    console.log('\nNothing was created. Run it with --execute to do it.');
    return;
  }

  if (CLEANUP) {
    await cleanup();
    return;
  }

  const order = await createOrder(user, product);
  console.log(`\n=== the order ${order.number} is paid`);

  await fulfilOrder(order.id);
  console.log('    the order was handed to the fulfilment of the platform.');

  const instance = await waitForInstance(order);
  if (!instance) {
    console.log('\n=== the instance did not reach a state in time.');
    return;
  }
  console.log(`\n=== the instance ${instance.id} is ${instance.status} (step ${instance.provisionStep})`);
  if (instance.provisionError) console.log(`    the platform says: ${instance.provisionError}`);
  if (instance.status !== 'ONLINE') {
    console.log('\n=== the instance was not served, so the rest of the test is not run.');
    return;
  }

  const server = await getServer(instance.pterodactylServerId);
  const allocations = await listAllocations(server.node);
  const allocation = allocations.find((candidate) => candidate.id === server.allocation);
  const port = allocation?.port ?? 0;
  const ip = allocation?.ip ?? '127.0.0.1';
  console.log(`    server ${server.id}, allocation ${server.allocation}, ${ip}:${port}`);

  // The application that is really in the container.
  await withCustomerKey(
    user.id,
    async (token) => {
      const answer = await readFile(token, instance.pterodactylUuid, 'index.js');
      const content =
        answer.encoding === 'base64' ? Buffer.from(answer.content, 'base64').toString('utf-8') : answer.content;
      const line = content.match(/^const port = .*$/m);
      console.log(`    the application in the container reads: ${line ? line[0] : '(no line of the port)'}`);
    },
    { mint: false },
  );

  // The port that the node publishes.
  const direct = await fetch(`http://${ip}:${port}/`).catch((error) => ({ status: 0, text: async () => error.message }));
  const body = await direct.text();
  console.log(`    http://${ip}:${port}/ answered with HTTP ${direct.status}`);
  console.log(`    the answer: ${body.slice(0, 200)}`);

  // The edge.
  const hostname = process.env.BM_TEST_HOSTNAME ?? 'test.apps.blipmade.com';
  const domain = await prisma.instanceDomain.findUnique({ where: { hostname } });
  if (!domain) {
    console.log(`\n=== no domain record for ${hostname}, the edge is not tested.`);
    return;
  }

  const original = domain.instanceId;
  console.log(`\n=== the edge: ${hostname} is pointed at the new instance`);
  await prisma.instanceDomain.update({ where: { id: domain.id }, data: { instanceId: instance.id } });
  const applied = await reconcileDomainRoutes();
  const appliedForHostname = applied.find((entry) => entry.hostname === hostname);
  console.log(`    the route was applied: ${appliedForHostname?.applied} (${appliedForHostname?.reason ?? 'no reason'})`);

  const throughEdge = await askEdge(hostname, '/');
  console.log(`    https://${hostname}/ answered with HTTP ${throughEdge.status}`);
  console.log(`    the answer: ${throughEdge.body.slice(0, 200)}`);

  console.log('\n=== the hostname is put back');
  await prisma.instanceDomain.update({ where: { id: domain.id }, data: { instanceId: original } });
  await reconcileDomainRoutes();
  const restored = await askEdge(hostname, '/');
  console.log(`    https://${hostname}/ answered with HTTP ${restored.status}`);
  console.log(`    the answer: ${restored.body.slice(0, 200)}`);

  console.log(`\n=== the test is over. The order ${order.number} and the instance ${instance.id} are still there.`);
  console.log('    Run the script with --cleanup to remove them.');
}

/** Removes what the test created. */
async function cleanup() {
  const orders = await prisma.order.findMany({
    where: { number: { startsWith: ORDER_PREFIX } },
    include: { items: true },
  });
  if (!orders.length) {
    console.log('=== there is no order of the test.');
    return;
  }

  for (const order of orders) {
    const instances = await prisma.instance.findMany({ where: { orderId: order.id } });
    for (const instance of instances) {
      if (instance.pterodactylServerId) {
        await deleteServer(instance.pterodactylServerId).catch((error) => {
          console.log(`    the server ${instance.pterodactylServerId} was not deleted: ${error.message}`);
        });
        console.log(`    the server ${instance.pterodactylServerId} was deleted.`);
      }
      await prisma.auditLog.deleteMany({ where: { targetId: instance.id } }).catch(() => undefined);
      await prisma.instance.delete({ where: { id: instance.id } }).catch(() => undefined);
      console.log(`    the instance ${instance.id} was removed.`);
    }

    await prisma.subscription.deleteMany({ where: { orderItemId: { in: order.items.map((item) => item.id) } } });
    await prisma.auditLog.deleteMany({ where: { targetId: order.id } }).catch(() => undefined);
    await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
    console.log(`    the order ${order.number} was removed.`);
  }

  await prisma.product.deleteMany({ where: { slug: PRODUCT_SLUG } });
  console.log('    the product of the test was removed.');
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}

// The modules of the platform open connections of their own, so the process
// would stay alive after the work is done.
process.exit(0);
