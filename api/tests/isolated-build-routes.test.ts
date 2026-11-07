import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';

const savedUrl = process.env.SMART_DEPLOY_SANDBOX_URL;
const savedSecret = process.env.SMART_DEPLOY_SANDBOX_SECRET;

describe('isolated build routes', () => {
  beforeAll(async () => { await getApp(); });
  afterAll(async () => {
    if (savedUrl === undefined) delete process.env.SMART_DEPLOY_SANDBOX_URL;
    else process.env.SMART_DEPLOY_SANDBOX_URL = savedUrl;
    if (savedSecret === undefined) delete process.env.SMART_DEPLOY_SANDBOX_SECRET;
    else process.env.SMART_DEPLOY_SANDBOX_SECRET = savedSecret;
    await closeApp();
  });
  beforeEach(async () => {
    delete process.env.SMART_DEPLOY_SANDBOX_URL;
    delete process.env.SMART_DEPLOY_SANDBOX_SECRET;
    await resetDatabase();
  });

  it('shows blocked state, queues when configured, hides bytes, and cancels by tenant', async () => {
    const app = await getApp();
    const owner = await registerAndLogin(app, 'isolated-owner@example.test');
    const source = await prisma.importSource.create({
      data: {
        userId: owner.userId,
        productSlug: 'nodejs',
        kind: 'zip',
        buildCommand: 'npm run build',
        startCommand: 'npm start',
        zipBytes: Buffer.from('archive'),
        zipBytesLength: 7,
      },
    });

    const blocked = await owner.client.request('POST', `/api/catalog/import/${source.id}/build`, {});
    expect(blocked.status).toBe(200);
    expect(blocked.body.job).toMatchObject({ status: 'blocked_no_sandbox', runtime: 'node' });

    process.env.SMART_DEPLOY_SANDBOX_URL = 'http://127.0.0.1:3210';
    process.env.SMART_DEPLOY_SANDBOX_SECRET = 'route-test-secret-that-is-long-enough';
    const queued = await owner.client.request('POST', `/api/catalog/import/${source.id}/build`, {});
    expect(queued.status).toBe(200);
    expect(queued.body.job).toMatchObject({ status: 'queued', runtime: 'node' });

    const history = await owner.client.request('GET', `/api/catalog/import/${source.id}/builds`);
    expect(history.status).toBe(200);
    expect(history.body.jobs).toHaveLength(2);
    expect(history.body.jobs[0]).not.toHaveProperty('artifactBytes');

    const stranger = await registerAndLogin(app, 'isolated-stranger@example.test');
    expect((await stranger.client.request('GET', `/api/catalog/import/${source.id}/builds`)).status).toBe(404);
    expect((await stranger.client.request('POST', `/api/catalog/builds/${queued.body.job.id}/cancel`, {})).status).toBe(404);

    const cancelled = await owner.client.request('POST', `/api/catalog/builds/${queued.body.job.id}/cancel`, {});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');
  });
});
