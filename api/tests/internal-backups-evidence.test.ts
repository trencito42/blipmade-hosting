import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { env } from '../src/env.js';
import { prisma } from '../src/db.js';
import { closeApp, getApp, resetDatabase } from './helpers.js';

const TOKEN = 'test-backup-report-token-not-production';

function tokenEnv(): { BACKUP_REPORT_TOKEN: string } {
  return env as unknown as { BACKUP_REPORT_TOKEN: string };
}

async function agent(app: FastifyInstance, method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url,
    payload,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
  });
}

describe('offsite evidence is not a restore', () => {
  const original = env.BACKUP_REPORT_TOKEN;
  let app: FastifyInstance;

  beforeEach(async () => {
    tokenEnv().BACKUP_REPORT_TOKEN = TOKEN;
    app = await getApp();
    await resetDatabase();
    await prisma.offsiteBackup.create({
      data: {
        kind: 'PLATFORM',
        remotePath: 'platform/blipmade-platform/sample.tar.gz.age',
        sourceId: 'blipmade-platform',
        state: 'OFFSITE_VERIFIED',
        sizeBytes: 100,
        verifiedAt: new Date('2026-11-06T08:00:00.000Z'),
        restoreVerifiedAt: new Date('2026-11-01T00:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    tokenEnv().BACKUP_REPORT_TOKEN = original;
    await closeApp();
  });

  it('records decrypt without clearing or setting restore evidence', async () => {
    const posted = await agent(app, 'POST', '/api/internal/backups/decrypt-verified', {
      remotePath: 'platform/blipmade-platform/sample.tar.gz.age',
      note: 'opened by drill',
    });
    expect(posted.statusCode).toBe(200);

    const row = await prisma.offsiteBackup.findUniqueOrThrow({
      where: { remotePath: 'platform/blipmade-platform/sample.tar.gz.age' },
    });
    expect(row.decryptVerifiedAt).not.toBeNull();
    expect(row.restoreVerifiedAt?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('rejects a listing-style restore-verified post from an old drill', async () => {
    const posted = await agent(app, 'POST', '/api/internal/backups/restore-verified', {
      remotePath: 'platform/blipmade-platform/sample.tar.gz.age',
      note: 'opened by drill',
    });
    expect(posted.statusCode).toBe(400);

    const row = await prisma.offsiteBackup.findUniqueOrThrow({
      where: { remotePath: 'platform/blipmade-platform/sample.tar.gz.age' },
    });
    expect(row.restoreVerifiedAt?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('sets restore only when isolatedRestore is true', async () => {
    const posted = await agent(app, 'POST', '/api/internal/backups/restore-verified', {
      remotePath: 'platform/blipmade-platform/sample.tar.gz.age',
      isolatedRestore: true,
      note: 'scratch database',
    });
    expect(posted.statusCode).toBe(200);

    const row = await prisma.offsiteBackup.findUniqueOrThrow({
      where: { remotePath: 'platform/blipmade-platform/sample.tar.gz.age' },
    });
    expect(row.restoreVerifiedAt).not.toBeNull();
    expect(row.restoreVerifiedAt?.toISOString()).not.toBe('2026-11-01T00:00:00.000Z');
  });
});
