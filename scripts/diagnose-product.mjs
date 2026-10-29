#!/usr/bin/env node
/**
 * Reads the console of a container of a product, to see why the service does
 * not answer on the port of the allocation.
 *
 * The probe of `scripts/probe-eggs.mjs` says that a product does not answer.
 * This script says why: it builds the container of the product the same way
 * the probe does, starts it, waits and reads what the container writes on its
 * console. The console of a game is where it says what it is waiting for.
 *
 * The container is removed at the end, unless `--keep` is given.
 *
 * Usage: node scripts/diagnose-product.mjs --slug minecraft-paper [--wait 180]
 */

import { PrismaClient } from '@prisma/client';
import net from 'node:net';
import http from 'node:http';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const slug = args[args.indexOf('--slug') + 1];
const waitMs = Number(args[args.indexOf('--wait') + 1] ?? 180) * 1000;
const keep = args.includes('--keep');
const APP_URL = process.env.PTERODACTYL_URL;
const APP_KEY = process.env.PTERODACTYL_APP_KEY;
const CLIENT_KEY = process.env.PROBE_CLIENT_KEY;
const PROBE_USER = Number(process.env.PROBE_USER_ID);

const log = (step, detail = '') => console.log(`[${new Date().toISOString().slice(11, 19)}] ${step} ${detail}`);

async function appRequest(method, path, body) {
  const res = await fetch(`${APP_URL}/api/application${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${APP_KEY}`,
      Accept: 'application/vnd.pterodactyl.v1+json',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`application ${method} ${path} -> ${res.status} ${body.slice(0, 400)}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`application ${method} ${path} -> ${res.status} with a page that is not JSON: ${text.slice(0, 400)}`);
  }
}

async function clientRequest(method, path, body) {
  const res = await fetch(`${APP_URL}/api/client${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${CLIENT_KEY}`,
      Accept: 'application/vnd.pterodactyl.v1+json',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`client ${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.text();
}

const tcpProbe = (host, port, timeoutMs = 4000) =>
  new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });

async function main() {
  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product) throw new Error(`the catalogue carries no product called ${slug}`);

  const nests = await appRequest('GET', '/nests?per_page=100');
  const eggs = [];
  for (const nest of nests.data ?? []) {
    const list = await appRequest('GET', `/nests/${nest.attributes.id}/eggs?per_page=200&include=variables`);
    for (const item of list.data ?? []) {
      // The variables of an egg are in the relationships of the list, with
      // the default of each one of them.
      const variables = item.relationships?.variables?.data ?? [];
      eggs.push({
        id: item.attributes.id,
        name: item.attributes.name,
        startup: item.attributes.startup,
        dockerImages: item.attributes.docker_images ?? {},
        variables: Object.fromEntries(
          variables.map((variable) => [variable.attributes.env_variable, variable.attributes.default_value ?? '']),
        ),
      });
    }
  }
  // The number of the egg is the sure way: the panel holds eggs of the same
  // name, and the one of the product is the one with that number.
  const egg =
    eggs.find((candidate) => candidate.id === product.eggId) ??
    eggs.find((candidate) => candidate.name.toLowerCase() === String(product.eggName ?? '').toLowerCase());
  if (!egg) throw new Error(`the panel carries no egg for ${slug}`);

  const nodes = await appRequest('GET', '/nodes?per_page=100');
  let allocation = null;
  for (const node of nodes.data ?? []) {
    const list = await appRequest('GET', `/nodes/${node.attributes.id}/allocations?per_page=500`);
    const free = (list.data ?? []).find((candidate) => !candidate.attributes.assigned);
    if (free) {
      allocation = free.attributes;
      break;
    }
  }
  if (!allocation) throw new Error('the panel has no free address');

  const limits = {
    memory: Number(product.defaultRam ?? 1024),
    swap: 0,
    disk: Number(product.defaultDisk ?? 10) * 1024,
    io: 500,
    cpu: Number(product.defaultCpu ?? 1) * 100,
  };
  // The values the platform writes over the defaults of the egg, such as the
  // version of the jar of a server.
  const overrides = product.startup && typeof product.startup === 'object' ? product.startup : {};
  const environment = { ...egg.variables, ...overrides };
  console.log('DEBUG product.eggId =', product.eggId, '| eggName =', product.eggName, '| egg.id =', egg.id, '| egg.name =', egg.name);
  console.log('DEBUG environment keys =', Object.keys(environment).join(','));
  console.log('DEBUG SERVER_JARFILE =', JSON.stringify(environment.SERVER_JARFILE), '| BUILD_NUMBER =', JSON.stringify(environment.BUILD_NUMBER));

  const created = await appRequest('POST', '/servers', {
    name: `diagnose-${slug}`,
    description: 'diagnostic harness, removed after the read',
    user: PROBE_USER,
    egg: egg.id,
    docker_image: product.dockerImage || Object.values(egg.dockerImages ?? {})[0] || '',
    startup: product.startupCommand || egg.startup,
    environment,
    limits,
    resource_limits: limits,
    feature_limits: { databases: 0, backups: 0 },
    allocation: { default: allocation.id, allocations: [allocation.id] },
  });
  const serverId = created.attributes.id;
  const uuid = created.attributes.uuid;
  log('server created', `${serverId} on port ${allocation.port}`);

  try {
    await appRequest('POST', `/servers/${serverId}/reinstall`);
    log('installing');
    let installed = false;
    for (let i = 0; i < 120; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const server = await appRequest('GET', `/servers/${serverId}`);
      if (server.attributes.state === 'installed') {
        installed = true;
        break;
      }
    }
    log('installed', String(installed));

    await clientRequest('POST', `/servers/${uuid}/power`, JSON.stringify({ signal: 'start' }));
    log('started');

    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 15000));
      const open = await tcpProbe(allocation.ip, allocation.port);
      const state = await clientRequest('GET', `/servers/${uuid}`);
      log('check', `port=${open} state=${state.slice(0, 120)}`);
      if (open) break;
    }

    console.log('\n=== the console of the container ===');
    const logs = await clientRequest('GET', `/servers/${uuid}/logs`);
    console.log(logs.split('\n').slice(-60).join('\n'));
    console.log('=== end of the console ===\n');
  } finally {
    if (!keep) {
      await appRequest('DELETE', `/servers/${serverId}`).catch(() => undefined);
      log('server removed');
    }
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
