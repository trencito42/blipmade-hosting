import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { BLOCKS, forgetContent } from '../src/services/content.js';
import { closeApp, createAdmin, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';

let app: FastifyInstance;

async function staff(permissions: string[]) {
  const user = await prisma.user.create({ data: { email: `c${Date.now()}${Math.random()}@blipmade.test`, passwordHash: await hashPassword(VALID_PASSWORD), role: 'STAFF', firstName: 'C', lastName: 'M', emailVerifiedAt: new Date() } });
  await prisma.staffMember.create({ data: { userId: user.id, permissions } });
  const client = makeClient(app);
  await client.request('POST', '/api/auth/login', { email: user.email, password: VALID_PASSWORD });
  return client;
}

const hero = (title: string) => ({ title, lead: 'A short introduction for the visitor.' });
const publicContent = async () => (await app.inject({ method: 'GET', url: '/api/content' })).json().content;

beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await closeApp();
});
beforeEach(async () => {
  await resetDatabase();
  forgetContent();
});

describe('the words of the public site', () => {
  it('shows nothing until a version is published, and never a draft', async () => {
    const { client } = await createAdmin(app);
    expect(await publicContent()).toEqual({});
    expect((await client.request('PUT', '/api/admin/content/home.hero/draft', { data: hero('Draft title') })).status).toBe(200);
    expect(await publicContent()).toEqual({});

    expect((await client.request('POST', '/api/admin/content/home.hero/publish')).status).toBe(200);
    expect((await publicContent())['home.hero']).toEqual(hero('Draft title'));
  });

  it('keeps the history, takes a version down, and puts an old one back as a new version', async () => {
    const { client } = await createAdmin(app);
    for (const title of ['First', 'Second']) {
      await client.request('PUT', '/api/admin/content/home.hero/draft', { data: hero(title) });
      await client.request('POST', '/api/admin/content/home.hero/publish');
    }
    expect((await publicContent())['home.hero'].title).toBe('Second');

    const detail = await client.request('GET', '/api/admin/content/home.hero');
    expect(detail.body.history.map((row: { status: string }) => row.status)).toEqual(['PUBLISHED', 'ARCHIVED']);
    const first = detail.body.history[1];

    expect((await client.request('POST', '/api/admin/content/home.hero/rollback', { revisionId: first.id })).status).toBe(200);
    expect((await publicContent())['home.hero'].title).toBe('First');
    expect(await prisma.contentRevision.count({ where: { key: 'home.hero' } })).toBe(3);

    expect((await client.request('POST', '/api/admin/content/home.hero/unpublish')).status).toBe(200);
    expect(await publicContent()).toEqual({});
  });

  it('keeps one draft per block and lets it be discarded', async () => {
    const { client } = await createAdmin(app);
    await client.request('PUT', '/api/admin/content/home.hero/draft', { data: hero('One') });
    await client.request('PUT', '/api/admin/content/home.hero/draft', { data: hero('Two') });
    expect(await prisma.contentRevision.count({ where: { key: 'home.hero', status: 'DRAFT' } })).toBe(1);
    expect((await client.request('GET', '/api/admin/content/home.hero')).body.draft.data.title).toBe('Two');
    await client.request('DELETE', '/api/admin/content/home.hero/draft');
    expect((await client.request('POST', '/api/admin/content/home.hero/publish')).status).toBe(400);
  });

  it('refuses markup, scripts, unknown placeholders, unknown fields and unknown blocks', async () => {
    const { client } = await createAdmin(app);
    const bad: [string, unknown][] = [
      ['home.hero', hero('<script>alert(1)</script>')],
      ['home.hero', { ...hero('Title'), lead: 'Click <a href="javascript:alert(1)">here</a>' }],
      ['home.hero', { ...hero('Title'), html: '<b>x</b>' }],
      ['home.hero', { title: '', lead: 'x' }],
      ['home.faq', { items: [{ q: 'Price?', a: 'It is {{secret}}' }] }],
      ['home.faq', { items: [] }],
      ['product.copy', { 'Bad Slug': { tagline: 'x', lead: 'y', fits: [] } }],
      ['seo.pages', { 'apps': { title: 'x', description: 'y' } }],
      ['seo.pages', { '/apps': { title: 'x'.repeat(71), description: 'y' } }],
    ];
    for (const [key, data] of bad) {
      const r = await client.request('PUT', `/api/admin/content/${key}/draft`, { data });
      expect(r.status, `${key} ${JSON.stringify(data)}`).toBe(400);
    }
    expect((await client.request('PUT', '/api/admin/content/not.a.block/draft', { data: {} })).status).toBe(404);
    expect(await prisma.contentRevision.count()).toBe(0);
  });

  it('accepts a real block of every kind, with placeholders only from the list', async () => {
    const { client } = await createAdmin(app);
    for (const [key, block] of Object.entries(BLOCKS)) {
      const r = await client.request('PUT', `/api/admin/content/${key}/draft`, { data: block.example });
      expect(r.status, key).toBe(200);
    }
  });

  it('leaves out of the site a version that no longer fits its shape', async () => {
    await prisma.contentRevision.create({ data: { key: 'home.hero', status: 'PUBLISHED', data: { title: '<script>x</script>', lead: 'y' }, publishedAt: new Date() } });
    expect(await publicContent()).toEqual({});
  });

  it('needs content.write to change and content.read to look, and is not open to settings.write', async () => {
    const reader = await staff(['content.read']);
    expect((await reader.request('GET', '/api/admin/content')).status).toBe(200);
    expect((await reader.request('PUT', '/api/admin/content/home.hero/draft', { data: hero('Nope') })).status).toBe(403);
    const other = await staff(['settings.write', 'products.write']);
    expect((await other.request('GET', '/api/admin/content')).status).toBe(403);
    expect((await other.request('POST', '/api/admin/content/home.hero/publish')).status).toBe(403);
    const writer = await staff(['content.read', 'content.write']);
    expect((await writer.request('PUT', '/api/admin/content/home.hero/draft', { data: hero('Fine') })).status).toBe(200);
    const entry = await prisma.auditLog.findFirst({ where: { action: 'content.draft_saved' } });
    expect(entry?.targetId).toBe('home.hero');
  });

  it('serves the public words to a visitor without a session', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/content' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toContain('max-age');
  });
});
