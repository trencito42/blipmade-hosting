import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { emailTemplateCatalog, emailTemplateDefaults, renderEmailTemplate } from '../src/lib/email-design.js';
import { loadEmailOverrides } from '../src/lib/email-overrides.js';
import { closeApp, createAdmin, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';

let app: FastifyInstance;
const ID = 'account-welcome';

async function staff(permissions: string[]) {
  const user = await prisma.user.create({ data: { email: `em${Date.now()}${Math.random()}@blipmade.test`, passwordHash: await hashPassword(VALID_PASSWORD), role: 'STAFF', firstName: 'E', lastName: 'M', emailVerifiedAt: new Date() } });
  await prisma.staffMember.create({ data: { userId: user.id, permissions } });
  const client = makeClient(app);
  await client.request('POST', '/api/auth/login', { email: user.email, password: VALID_PASSWORD });
  return { client, email: user.email };
}

beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await closeApp();
});
beforeEach(async () => {
  await resetDatabase();
  await loadEmailOverrides();
});

describe('the preview of a template', () => {
  it('renders a draft with made-up values and does not save it', async () => {
    const { client } = await createAdmin(app);
    const placeholders = emailTemplateDefaults(ID)!.placeholders;
    const draft = { heading: placeholders[0] ? `Hello {{${placeholders[0]}}}` : 'Hello there' };
    const r = await client.request('POST', `/api/admin/email-templates/${ID}/preview`, { draft });
    expect(r.status).toBe(200);
    expect(r.body.preview.usesDraft).toBe(true);
    expect(r.body.preview.html).toContain('Hello');
    expect(r.body.preview.html).not.toMatch(/<script/i);
    expect(await prisma.setting.count({ where: { key: `email.template.${ID}` } })).toBe(0);
  });

  it('refuses an unknown placeholder, markup and an unknown field', async () => {
    const { client } = await createAdmin(app);
    expect((await client.request('POST', `/api/admin/email-templates/${ID}/preview`, { draft: { heading: 'Hi {{nobody.here}}' } })).status).toBe(400);
    expect((await client.request('POST', `/api/admin/email-templates/${ID}/preview`, { draft: { heading: '<b>Hi</b>' } })).status).toBe(400);
    expect((await client.request('POST', `/api/admin/email-templates/${ID}/preview`, { draft: { html: '<p>x</p>' } })).status).toBe(400);
    expect((await client.request('POST', '/api/admin/email-templates/nothing-like-it/preview', {})).status).toBe(404);
  });

  it('renders every template of the catalogue with made-up values', async () => {
    const { client } = await createAdmin(app);
    for (const entry of emailTemplateCatalog()) {
      const r = await client.request('POST', `/api/admin/email-templates/${entry.id}/preview`, {});
      expect(r.status, entry.id).toBe(200);
      expect(r.body.preview.subject.length, entry.id).toBeGreaterThan(0);
    }
  });
});

describe('the versions of a template', () => {
  it('keeps the wording before and after each change and puts an old one back', async () => {
    const { client } = await createAdmin(app);
    expect((await client.request('PUT', `/api/admin/email-templates/${ID}`, { heading: 'First wording' })).status).toBe(200);
    expect((await client.request('PUT', `/api/admin/email-templates/${ID}`, { heading: 'Second wording' })).status).toBe(200);

    const list = await client.request('GET', `/api/admin/email-templates/${ID}/versions`);
    expect(list.body.versions).toHaveLength(2);
    expect(list.body.versions[0]).toMatchObject({ before: { heading: 'First wording' }, after: { heading: 'Second wording' } });

    const first = list.body.versions[1];
    const restored = await client.request('POST', `/api/admin/email-templates/${ID}/restore`, { versionId: first.id });
    expect(restored.status).toBe(200);
    expect(restored.body.override).toMatchObject({ heading: 'First wording' });
    expect(renderEmailTemplate(ID, {}).html).toContain('First wording');

    await client.request('DELETE', `/api/admin/email-templates/${ID}`);
    const after = await client.request('GET', `/api/admin/email-templates/${ID}/versions`);
    expect(after.body.versions[0].action).toBe('admin.email_template.reset');
    expect(after.body.versions[0].before).toMatchObject({ heading: 'First wording' });
  });

  it('refuses a version of another template', async () => {
    const { client } = await createAdmin(app);
    await client.request('PUT', `/api/admin/email-templates/${ID}`, { heading: 'Mine' });
    const versions = await client.request('GET', `/api/admin/email-templates/${ID}/versions`);
    const other = emailTemplateCatalog().find((entry) => entry.id !== ID)!.id;
    expect((await client.request('POST', `/api/admin/email-templates/${other}/restore`, { versionId: versions.body.versions[0].id })).status).toBe(404);
  });
});

describe('the fallback', () => {
  it('uses the wording of the code when a changed wording cannot be rendered', async () => {
    await prisma.setting.create({ data: { key: `email.template.${ID}`, value: { heading: 'Stored wording' } } });
    await loadEmailOverrides();
    expect(renderEmailTemplate(ID, {}).html).toContain('Stored wording');
    // A draft that cannot be rendered is reported; a stored one never breaks a customer's message.
    expect(() => renderEmailTemplate(ID, {}, { heading: undefined, subject: undefined })).not.toThrow();
  });
});

describe('the test message', () => {
  it('goes to the staff member who asks, and to nobody else', async () => {
    const { client, email } = await staff(['settings.read', 'settings.write']);
    const r = await client.request('POST', `/api/admin/email-templates/${ID}/test`, { to: 'someone@else.com' });
    expect(r.status).toBe(400);
    const ok = await client.request('POST', `/api/admin/email-templates/${ID}/test`, {});
    expect(ok.status).toBe(200);
    expect(ok.body.sentTo).toBe(email);
    const sent = await prisma.mailDelivery.findFirst({ where: { kind: 'template-test' } });
    expect(sent?.to).toBe(email);
  });

  it('needs settings.write', async () => {
    const { client } = await staff(['settings.read']);
    expect((await client.request('POST', `/api/admin/email-templates/${ID}/test`, {})).status).toBe(403);
    expect(await prisma.mailDelivery.count({ where: { kind: 'template-test' } })).toBe(0);
  });
});

describe('the map of the events', () => {
  it('names the template of every event and reports none missing', async () => {
    const { client } = await createAdmin(app);
    const r = await client.request('GET', '/api/admin/email-templates/coverage');
    expect(r.status).toBe(200);
    expect(r.body.events.length).toBeGreaterThanOrEqual(84);
    expect(r.body.missing).toEqual([]);
    expect(r.body.events.every((row: { templateExists: boolean }) => row.templateExists)).toBe(true);
  });
});
