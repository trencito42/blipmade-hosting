#!/usr/bin/env node
/**
 * Probe real of a product: builds a server on the panel, starts it, asks what
 * answers on the port of the allocation, and removes the server afterwards.
 *
 * The question this script answers is the one the platform asks itself when it
 * opens a product for ordering: "a server of it was really built and answered
 * on a node". The catalog of the panel and the images of the registry are
 * checked without building anything; only this script builds something.
 *
 * The steps are the steps of the provisioning of the platform:
 *
 *   1. the egg of the product is resolved the way `resolveEgg()` does it, by
 *      number and by name;
 *   2. the environment of the egg is read from the panel, which knows the
 *      variables of every egg, and the overrides of the product are laid over
 *      them;
 *   3. the server is created on the panel with the image of the product;
 *   4. the node installs it, which pulls the image and runs the install script
 *      of the egg;
 *   5. the application of the platform is written into the container, so the
 *      start-up command of the egg finds something to run;
 *   6. the container is started and the port of the allocation is asked;
 *   7. the server is deleted, and the address is given back to the panel.
 *
 * Usage (inside the API container, where the panel key and the database are):
 *
 *   node scripts/probe-eggs.mjs --products nodejs,redis,minecraft-paper
 *   node scripts/probe-eggs.mjs --all
 *   node scripts/probe-eggs.mjs --products nodejs --keep
 *
 * The environment it needs:
 *
 *   PTERODACTYL_URL      the panel
 *   PTERODACTYL_APP_KEY  the administrative key of the panel
 *   PROBE_CLIENT_KEY     a client key of the account that owns the servers
 *   PROBE_USER_ID        the id of that account on the panel
 */

import { PrismaClient } from '@prisma/client';
import net from 'node:net';
import http from 'node:http';

const APP_URL = process.env.PTERODACTYL_URL;
const APP_KEY = process.env.PTERODACTYL_APP_KEY;
const CLIENT_KEY = process.env.PROBE_CLIENT_KEY;
const PROBE_USER = Number(process.env.PROBE_USER_ID);

if (!APP_URL || !APP_KEY || !CLIENT_KEY || !PROBE_USER) {
  console.error('Missing PTERODACTYL_URL, PTERODACTYL_APP_KEY, PROBE_CLIENT_KEY or PROBE_USER_ID.');
  process.exit(2);
}

const MEDIA = 'Application/vnd.pterodactyl.v1+json';
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const wanted = args.includes('--all')
  ? null
  : (args[args.indexOf('--products') + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const keep = args.includes('--keep');
const results = [];

function log(step, detail) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${step} ${detail}\n`);
}

async function appRequest(method, path, body) {
  const response = await fetch(`${APP_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(Number(process.env.PROBE_HTTP_TIMEOUT_MS ?? 30_000)),
    headers: {
      Authorization: `Bearer ${APP_KEY}`,
      Accept: MEDIA,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`panel ${method} ${path} -> ${response.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : undefined;
}

async function clientRequest(method, path, options = {}) {
  const url = new URL(`${APP_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    signal: AbortSignal.timeout(Number(process.env.PROBE_HTTP_TIMEOUT_MS ?? 30_000)),
    headers: {
      Authorization: `Bearer ${CLIENT_KEY}`,
      Accept: MEDIA,
      ...(options.rawBody !== undefined
        ? { 'Content-Type': 'text/plain' }
        : options.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
    },
    body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`client ${method} ${path} -> ${response.status} ${text.slice(0, 300)}`);
  }
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return text;
  }
}

/**
 * Every egg of the panel, with the variables it defines and the value each
 * variable has by default.
 */
async function loadEggs() {
  const nests = await appRequest('GET', '/api/application/nests?per_page=100');
  const byId = new Map();
  const byName = new Map();
  for (const nest of nests.data) {
    const eggs = await appRequest(
      'GET',
      `/api/application/nests/${nest.attributes.id}/eggs?per_page=200&include=variables`,
    );
    for (const item of eggs.data) {
      const egg = item.attributes;
      const variables = egg.relationships?.variables?.data ?? [];
      const record = {
        id: egg.id,
        name: egg.name,
        nest: egg.nest,
        startup: egg.startup,
        dockerImages: egg.docker_images ?? {},
        variables: Object.fromEntries(
          variables.map((variable) => [variable.attributes.env_variable, variable.attributes.default_value ?? '']),
        ),
        variableRules: Object.fromEntries(
          variables.map((variable) => [variable.attributes.env_variable, variable.attributes.rules ?? '']),
        ),
      };
      byId.set(record.id, record);
      const key = record.name.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, record);
    }
  }
  return { byId, byName };
}

function resolveEgg(product, eggs) {
  if (product.eggId !== null && product.eggId !== undefined) {
    return eggs.byId.get(product.eggId) ?? null;
  }
  if (product.eggName) {
    return eggs.byName.get(product.eggName.trim().toLowerCase()) ?? null;
  }
  return null;
}

async function freeAllocations() {
  const nodes = await appRequest('GET', '/api/application/nodes?per_page=100');
  const free = [];
  for (const node of nodes.data) {
    const allocations = await appRequest(
      'GET',
      `/api/application/nodes/${node.attributes.id}/allocations?per_page=500`,
    );
    for (const allocation of allocations.data) {
      if (!allocation.attributes.assigned) {
        free.push({
          nodeId: node.attributes.id,
          id: allocation.attributes.id,
          ip: allocation.attributes.ip,
          port: allocation.attributes.port,
        });
      }
    }
  }
  free.sort((a, b) => b.port - a.port);
  return free;
}

function tcpProbe(host, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function httpProbe(host, port, path = '/', timeoutMs = 6000) {
  return new Promise((resolve) => {
    const request = http.get({ host, port, path, timeout: timeoutMs }, (response) => {
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 400) body = body.slice(0, 400);
      });
      response.on('end', () => resolve({ status: response.statusCode, body: body.slice(0, 200) }));
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(null);
    });
    request.on('error', () => resolve(null));
  });
}

const STARTER_INDEX = (name, slug, port) => `// ${name}, deployed by Blipmade.
const http = require('node:http');

const port = Number(process.env.SERVER_PORT || process.env.PORT || ${port});
const healthPath = '/';
const startedAt = Date.now();

const server = http.createServer((request, response) => {
  const path = (request.url || '/').split('?')[0];
  if (path === healthPath) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', app: ${JSON.stringify(slug)}, uptime: Math.round((Date.now() - startedAt) / 1000) }));
    return;
  }
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(${JSON.stringify(name)} + ' is running on Blipmade.\\n');
});

server.listen(port, () => {
  console.log('listening on :' + port);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
`;

const STARTER_PACKAGE = (slug, name) =>
  JSON.stringify(
    {
      name: slug,
      version: '1.0.0',
      private: true,
      description: `${name}, deployed by Blipmade.`,
      main: 'index.js',
      scripts: { start: 'node index.js' },
      engines: { node: '>=18' },
    },
    null,
    2,
  ) + '\n';

async function writeStarter(uuid, product, port) {
  const files = [
    ['package.json', STARTER_PACKAGE(product.slug, product.name)],
    ['index.js', STARTER_INDEX(product.name, product.slug, port)],
  ];
  for (const [path, content] of files) {
    await clientRequest('POST', `/api/client/servers/${uuid}/files/write`, {
      query: { file: path },
      rawBody: content,
    });
  }
}

/**
 * Waits until the node has installed the server.
 *
 * The panel knows what the node is doing with a server: the status of the
 * server is "installing" while the installation runs and it is empty when the
 * installation is over. The flag of the panel that says "installed" cannot be
 * read on its own: the panel answers "installed" for a server whose
 * installation was only asked for a moment ago, because the request of the
 * installation travels to the node in the background. A probe that believes
 * that flag starts the server while the installation is still running, finds
 * nothing on the port and says that the product does not answer. Every game
 * that installs for more than a quarter of an hour was closed that way.
 *
 * The state of the client is of no use here: the panel answers nothing for
 * the state of a server that the client key does not own, and the answer it
 * gives for the ones it does own carries no state at all.
 */
async function waitInstalled(serverId, timeoutMs = Number(process.env.PROBE_INSTALL_MS ?? 1_500_000)) {
  const deadline = Date.now() + timeoutMs;
  let seenInstalling = false;
  let status = null;

  while (Date.now() < deadline) {
    const server = await appRequest('GET', `/api/application/servers/${serverId}`);
    const attributes = server.attributes ?? {};
    status = attributes.status ?? null;
    const installed = attributes.container?.installed === 1;

    if (status === 'installing') {
      seenInstalling = true;
    } else if (status === 'install_failed' || status === 'update_failed') {
      return false;
    } else if (seenInstalling && installed) {
      // The node says the installation is over. The panel needs a moment to
      // be told about it, so the answer is asked once more before the server
      // is started.
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      const again = await appRequest('GET', `/api/application/servers/${serverId}`);
      const after = again.attributes ?? {};
      if ((after.status ?? null) !== 'installing' && after.container?.installed === 1) return true;
      status = after.status ?? null;
      seenInstalling = after.status === 'installing';
    }

    await new Promise((resolve) => setTimeout(resolve, 8000));
  }

  return false;
}

async function serverState(uuid) {
  try {
    const server = await clientRequest('GET', `/api/client/servers/${uuid}`);
    const attributes = server?.attributes ?? {};
    return String(attributes.status ?? attributes.state ?? attributes.current_state ?? 'unknown');
  } catch {
    return 'unknown';
  }
}

/**
 * The values a customer gives at the order, and the ones the platform makes.
 *
 * The panel refuses the variables of an egg that are marked as required when
 * they are empty, so a product whose egg asks for a password cannot even be
 * created without one. A real order carries these values, and the probe
 * carries them too: an empty value here would say nothing about the product
 * and everything about the probe.
 */
function customerValues(product) {
  const declarations =
    product.customerVariables && typeof product.customerVariables === 'object'
      ? product.customerVariables
      : {};
  const values = {};
  for (const [name, raw] of Object.entries(declarations)) {
    const declaration = raw && typeof raw === 'object' ? raw : {};
    if (declaration.type === 'password') {
      values[name] = `Pr0be-${Math.random().toString(36).slice(2, 14)}!`;
      continue;
    }
    // A field the customer left empty keeps the default of the egg: the platform
    // drops the empty values too, because an empty value written over a
    // default that exists makes the panel refuse the server.
    if (name === 'MONGO_USER') {
      values[name] = 'mongo';
    }
  }
  return values;
}

/** The secrets the platform makes for an instance. */
function generatedValues(product) {
  const declarations =
    product.generatedVariables && typeof product.generatedVariables === 'object'
      ? product.generatedVariables
      : {};
  const values = {};
  for (const [name, raw] of Object.entries(declarations)) {
    const declaration = raw && typeof raw === 'object' ? raw : {};
    const length = Number(declaration.length);
    const size = Number.isFinite(length) ? Math.min(Math.max(Math.round(length), 12), 32) : 20;
    const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    values[name] = Array.from(
      { length: size },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join('');
  }
  return values;
}

/**
 * The value the platform makes for a variable that has to be filled and that
 * carries no value of its own.
 *
 * The panel refuses a server whose variable is marked as required and left
 * empty, so the probe cannot ask for one: the server of the game would be
 * refused before it starts, and the probe would say nothing about the game.
 * The rule is the one of the platform, in `api/src/services/pterodactyl/
 * environment.ts`: the token of a Steam server is a number, a password is a
 * text of letters and digits, and anything else is a short text.
 */
function generatedValueForVariable(name) {
  const upper = name.toUpperCase();
  const alphabet =
    upper.includes('GSLT')
      ? '0123456789'
      : 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const length = upper.includes('GSLT') ? 10 : /PASS|SECRET|TOKEN|KEY/.test(upper) ? 20 : 12;
  return Array.from(
    { length },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('');
}

/**
 * Fills the variables of the egg that have to be filled and that are empty.
 */
function fillRequiredVariables(environment, rules) {
  const filled = { ...environment };
  for (const [name, rule] of Object.entries(rules ?? {})) {
    const segments = String(rule ?? '')
      .split('|')
      .map((segment) => segment.trim());
    if (!segments.includes('required')) continue;
    const value = filled[name];
    if (value !== undefined && value !== '') continue;
    filled[name] = generatedValueForVariable(name);
  }
  return filled;
}

async function probeOne(product, eggs, allocations) {
  const record = {
    slug: product.slug,
    egg: null,
    image: product.dockerImage,
    installed: false,
    started: false,
    portOpen: false,
    httpStatus: null,
    httpBody: null,
    state: 'unknown',
    error: null,
  };

  const egg = resolveEgg(product, eggs);
  if (!egg) {
    record.error = 'the egg of the product does not exist on the panel';
    return record;
  }
  record.egg = `${egg.id} ${egg.name}`;

  const overrides = product.startup && typeof product.startup === 'object' ? product.startup : {};
  const environment = fillRequiredVariables(
    {
      ...egg.variables,
      ...overrides,
      ...generatedValues(product),
      ...customerValues(product),
    },
    egg.variableRules,
  );
  const startup = product.startupCommand || egg.startup;
  const image = product.dockerImage || Object.values(egg.dockerImages)[0] || '';
  record.startup = startup;
  record.environmentKeys = Object.keys(environment);

  const allocation = allocations.shift();
  if (!allocation) {
    record.error = 'there is no free address on the panel';
    return record;
  }

  const memory = Number(product.defaultRam ?? product.minRam ?? 1024);
  const disk = Number(product.defaultDisk ?? product.minDisk ?? 10) * 1024;
  const cpu = Number(product.defaultCpu ?? product.minCpu ?? 1) * 100;
  const limits = { memory, swap: 0, disk, io: 500, cpu };

  let serverId = null;
  let uuid = null;
  try {
    const created = await appRequest('POST', '/api/application/servers', {
      name: `probe-${product.slug}`,
      description: 'probe harness, removed after the check',
      user: PROBE_USER,
      egg: egg.id,
      docker_image: image,
      startup,
      environment,
      limits,
      resource_limits: limits,
      feature_limits: { databases: 0, backups: 0 },
      allocation: { default: allocation.id, allocations: [allocation.id] },
    });
    serverId = created.attributes.id;
    uuid = created.attributes.uuid;
    record.serverId = serverId;
    record.port = allocation.port;

    // The node starts the installation by itself when the server is created. A
    // second request to install at this point finds the lock taken, fails, and
    // the panel marks the server as failed while the first installation is
    // still running, so the probe only waits.
    const installed = await waitInstalled(serverId);
    record.installed = installed;
    record.installState = await serverState(uuid);
    if (!installed) {
      record.error = 'the installation did not finish: it failed on the node or it took longer than the time given';
      return record;
    }

    await writeStarter(uuid, product, allocation.port);

    await clientRequest('POST', `/api/client/servers/${uuid}/power`, { body: { signal: 'start' } });
    record.started = true;

    const deadline = Date.now() + Number(process.env.PROBE_WAIT_MS ?? 180_000);
    while (Date.now() < deadline) {
      record.state = await serverState(uuid);
      const open = await tcpProbe(allocation.ip, allocation.port);
      if (open) {
        record.portOpen = true;
        const answer = await httpProbe(allocation.ip, allocation.port, '/');
        if (answer) {
          record.httpStatus = answer.status;
          record.httpBody = answer.body;
        }
        break;
      }
      if (record.state === 'stopped' || record.state === 'offline') {
        record.state = `crashed (${record.state})`;
        await new Promise((resolve) => setTimeout(resolve, 4000));
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 6000));
    }
    return record;
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
    return record;
  } finally {
    if (serverId && !keep) {
      try {
        await appRequest('DELETE', `/api/application/servers/${serverId}`);
        record.cleaned = true;
      } catch (error) {
        record.cleaned = false;
        record.cleanError = error instanceof Error ? error.message : String(error);
      }
    }
  }
}

async function main() {
  const eggs = await loadEggs();
  log('eggs', `${eggs.byId.size} eggs read from the panel`);

  const products = await prisma.product.findMany({
    where: wanted ? { slug: { in: wanted } } : { deployable: false },
    orderBy: { slug: 'asc' },
  });

  // The file of the results is read first: a run that was interrupted picks
  // up where it stopped instead of building the same product twice.
  const outputFile = process.env.PROBE_OUTPUT ?? '/tmp/probe-results.json';
  const { readFile, writeFile } = await import('node:fs/promises');
  let results = [];
  try {
    results = JSON.parse(await readFile(outputFile, 'utf-8'));
  } catch {
    results = [];
  }
  const done = new Set(results.map((entry) => entry.slug));
  if (done.size && !args.includes('--force')) {
    log('resume', `${done.size} products were already probed`);
  }
  const pending = products.filter((product) => !done.has(product.slug) || args.includes('--force'));

  if (wanted) {
    const missing = wanted.filter((slug) => !products.some((product) => product.slug === slug));
    if (missing.length) log('warning', `unknown products: ${missing.join(', ')}`);
    // The order of the list is the order of the work: the small products are
    // probed first, so that the answer of the catalogue arrives before the
    // games that take an hour to install.
    pending.sort((a, b) => wanted.indexOf(a.slug) - wanted.indexOf(b.slug));
  }
  log('products', `${pending.length} to probe`);

  const allocations = await freeAllocations();
  log('addresses', `${allocations.length} free on the panel`);

  const concurrency = Number(args[args.indexOf('--concurrency') + 1]) || 3;
  const queue = [...pending];
  const writeResults = async () => {
    await writeFile(outputFile, JSON.stringify(results, null, 2));
  };
  const worker = async () => {
    while (queue.length) {
      const product = queue.shift();
      if (!product) return;
      log('probe', `starting ${product.slug}`);
      const record = await probeOne(product, eggs, allocations);
      results.push(record);
      await writeResults();
      log(
        'probe',
        `${product.slug}: installed=${record.installed} started=${record.started} port=${record.portOpen} http=${record.httpStatus ?? '-'} state=${record.state}${record.error ? ` error=${record.error}` : ''}`,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, products.length) }, worker));

  log('done', `${results.length} probes written to ${outputFile}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
