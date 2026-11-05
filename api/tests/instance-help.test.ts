import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { panelEnv } from './panel-test-env.js';

const panel = { token: '', files: new Map<string, { status: number; body: string }>(), fail: false };

vi.mock('../src/services/panel/credentials.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/panel/credentials.js')>('../src/services/panel/credentials.js');
  return {
    ...actual,
    resolveCustomerCredential: vi.fn(async () => {
      if (!panel.token) {
        const { unavailable } = await import('../src/lib/errors.js');
        throw unavailable('The key bridge of the panel is not installed.');
      }
      return { token: panel.token, panelUserId: 4, externalId: 'ext', source: 'bootstrap' };
    }),
  };
});

const { env } = await import('../src/env.js');
const { prisma } = await import('../src/db.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

function fileList(names: string[]): Response {
  return json({
    object: 'file_list',
    data: names.map((name) => ({
      object: 'file',
      attributes: { name, created_at: '2026-01-01T00:00:00+00:00', modified_at: '2026-01-02T00:00:00+00:00', mode: '-rw-r--r--', is_directory: false, is_file: true, is_symlink: false, size: 10 },
    })),
  });
}

beforeAll(async () => {
  panelEnv(env).PTERODACTYL_URL = 'http://127.0.0.1:9';
  await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
  panel.token = `ptlc_${'a'.repeat(44)}`;
  panel.fail = false;
  panel.files = new Map();
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    if (panel.fail) throw new Error('offline');
    const url = new URL(String(input));
    if (url.pathname.endsWith('/resources')) {
      return json({ object: 'stats', attributes: { current_state: 'running', memory_bytes: 50_000_000, cpu_absolute: 0, disk: { used: 1 }, network: { rx: 0, tx: 0 }, uptime: 1000 } });
    }
    if (url.pathname.endsWith('/files/list')) {
      const directory = url.searchParams.get('directory') ?? '';
      const listed = panel.files.get(`dir:${directory}`);
      if (!listed) return new Response('{"errors":[]}', { status: 404 });
      if (listed.status !== 200) return new Response(listed.body, { status: listed.status });
      return fileList(listed.body.split(',').filter(Boolean));
    }
    if (url.pathname.endsWith('/files/contents')) {
      const file = url.searchParams.get('file') ?? '';
      const found = panel.files.get(file);
      if (!found) return new Response('missing', { status: 404 });
      if (found.status !== 200) return new Response(found.body, { status: found.status });
      return new Response(found.body, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('', { status: 204 });
  }));
});

async function makeInstance(userId: string, slug: string, extra: Record<string, unknown> = {}) {
  const product = await prisma.product.create({
    data: {
      slug, name: slug, category: 'GAMES', description: 'test', icon: 'box',
      minRam: 512, minCpu: 1, minDisk: 5, maxRam: 8192, maxCpu: 4, maxDisk: 100, deployable: true, eggId: 1,
    },
  });
  return prisma.instance.create({
    data: {
      userId, productId: product.id, name: 'proof', status: 'ONLINE', ram: 1024, cpu: 1, disk: 10, price: 0, currency: 'EUR',
      pterodactylServerId: 353, pterodactylUuid: 'server-uuid', ...extra,
    },
  });
}

describe('checking the logs of a server', () => {
  it('says the logs are missing instead of calling that healthy', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'missing@example.com');
    const instance = await makeInstance(userId, 'minecraft-paper');
    const response = await client.request('GET', `/api/instances/${instance.id}/diagnose`);
    expect(response.status).toBe(200);
    expect(response.body.verdict).toBe('insufficient');
    expect(response.body.sources.find((source: { id: string }) => source.id === 'latest-log').state).toBe('missing');
    expect(response.body.sources.find((source: { id: string }) => source.id === 'console').state).toBe('unsupported');
    expect(response.body.summary).not.toMatch(/no known cause/i);
  });

  it('says the panel could not be reached', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'down@example.com');
    const instance = await makeInstance(userId, 'minecraft-paper');
    panel.fail = true;
    const response = await client.request('GET', `/api/instances/${instance.id}/diagnose`);
    expect(response.body.verdict).toBe('unreachable');
    expect(response.body.sources.find((source: { id: string }) => source.id === 'container').state).toBe('failed');
  });

  it('calls a read Minecraft log with no crash healthy', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'ok@example.com');
    const instance = await makeInstance(userId, 'minecraft-paper');
    panel.files.set('/logs/latest.log', { status: 200, body: 'Done (3.0s)! For help, type "help"' });
    panel.files.set('dir:/crash-reports', { status: 200, body: '' });
    const response = await client.request('GET', `/api/instances/${instance.id}/diagnose`);
    expect(response.body.verdict).toBe('clear');
    expect(response.body.findings).toEqual([]);
  });

  it('names a Node.js crash and a Discord token failure from the deployment log', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'bot@example.com');
    const instance = await makeInstance(userId, 'discord-bot');
    panel.files.set('/.blipmade/status.json', { status: 200, body: JSON.stringify({ state: 'failed', id: 'abcdef12', message: 'the process exited' }) });
    panel.files.set('/.blipmade/logs/abcdef12.log', { status: 200, body: 'TOKEN_INVALID\nuncaughtException: bad token' });
    const response = await client.request('GET', `/api/instances/${instance.id}/diagnose`);
    expect(response.body.verdict).toBe('issue');
    const ids = response.body.findings.map((finding: { id: string }) => finding.id);
    expect(ids).toEqual(expect.arrayContaining(['deploy-failed', 'discord-token', 'node-crash']));
  });

  it('reads a Minecraft crash report', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'crash@example.com');
    const instance = await makeInstance(userId, 'minecraft-paper');
    panel.files.set('/logs/latest.log', { status: 200, body: 'Preparing spawn area' });
    panel.files.set('dir:/crash-reports', { status: 200, body: 'crash-1.txt' });
    panel.files.set('/crash-reports/crash-1.txt', { status: 200, body: '---- Minecraft Crash Report ----\njava.lang.OutOfMemoryError: Java heap space' });
    const response = await client.request('GET', `/api/instances/${instance.id}/diagnose`);
    expect(response.body.verdict).toBe('issue');
    expect(response.body.findings.map((finding: { id: string }) => finding.id)).toEqual(expect.arrayContaining(['mc-crash', 'oom']));
  });

  it('keeps a result partial when one source fails', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'part@example.com');
    const instance = await makeInstance(userId, 'minecraft-paper');
    panel.files.set('/logs/latest.log', { status: 200, body: 'Done (3.0s)! For help, type "help"' });
    panel.files.set('dir:/crash-reports', { status: 500, body: 'no' });
    const response = await client.request('GET', `/api/instances/${instance.id}/diagnose`);
    expect(response.body.verdict).toBe('insufficient');
    expect(response.body.sources.find((source: { id: string }) => source.id === 'latest-log').state).toBe('available');
    expect(response.body.sources.find((source: { id: string }) => source.id === 'crash-report').state).toBe('failed');
  });

  it('opens a ticket with the evidence and without the secret, and only for the owner', async () => {
    const app = await getApp();
    const owner = await registerAndLogin(app, 'owner@example.com');
    const other = await registerAndLogin(app, 'other@example.com');
    const instance = await makeInstance(owner.userId, 'nodejs');
    const secret = 'super-secret-token-value-not-for-staff';
    panel.files.set('/.blipmade/status.json', { status: 200, body: JSON.stringify({ state: 'failed', id: 'abcdef12', message: 'build failed' }) });
    panel.files.set('/.blipmade/logs/abcdef12.log', { status: 200, body: `npm ERR! code EUSAGE\nBOT_TOKEN=${secret}\nfatal: repository not found` });
    await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'deploy', message: `token=${secret}` } });
    const bundle = await owner.client.request('GET', `/api/instances/${instance.id}/support-bundle`);
    expect(bundle.status).toBe(200);
    expect(bundle.body.body).toContain('The last deployment failed');
    expect(bundle.body.body).toContain('Deployment log: available');
    expect(bundle.body.body).not.toContain(secret);
    expect(bundle.body.body).toContain('not a log the platform keeps');
    const denied = await other.client.request('GET', `/api/instances/${instance.id}/diagnose`);
    expect(denied.status).toBe(404);
    const ticket = await owner.client.request('POST', '/api/tickets', { subject: bundle.body.subject, body: bundle.body.body, instanceId: bundle.body.instanceId, category: 'TECHNICAL' });
    expect(ticket.status).toBe(201);
    const stored = await prisma.ticket.findFirst({ where: { userId: owner.userId }, include: { messages: true } });
    expect(stored?.instanceId).toBe(instance.id);
    expect(stored?.messages[0]?.body).not.toContain(secret);
    const stolen = await other.client.request('POST', '/api/tickets', { subject: 'Not mine', body: 'Please look', instanceId: instance.id, category: 'TECHNICAL' });
    expect(stolen.status).toBe(400);
  });
});
