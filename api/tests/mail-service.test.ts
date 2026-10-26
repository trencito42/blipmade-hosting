import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { env } from '../src/env.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';

/**
 * The service of the hosted mail.
 *
 * The mail system is faked at the module level, so the tests never reach a
 * real mail server and the behaviour of the platform is checked on its own:
 * the isolation between the customers, the limits of the plan, the rules of
 * an alias, the fact that a password is shown once and the journal of the work
 * the platform owes to the mail system.
 */

const mailcowMock = vi.hoisted(() => ({
  calls: [] as Array<{ fn: string; input: unknown }>,
  /** The calls that have to fail, and the reason of the refusal. */
  failures: new Map<string, string>(),
}));

vi.mock('../src/services/mailcow.js', () => {
  const record = (fn: string, input: unknown) => {
    mailcowMock.calls.push({ fn, input });
    const refusal = mailcowMock.failures.get(fn);
    if (refusal) throw new Error(refusal);
  };
  return {
    mailcowConfigured: () => true,
    mailcowCreateDomain: async (input: unknown) => record('createDomain', input),
    mailcowDeleteDomain: async (input: unknown) => record('deleteDomain', input),
    mailcowDeleteDomainWithItsContent: async (input: unknown) => record('deleteDomainWithItsContent', input),
    mailcowCreateDkim: async (input: unknown) => {
      record('createDkim', input);
      return 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtestkey';
    },
    mailcowEnsureDkim: async (input: unknown) => {
      record('createDkim', input);
      return {
        pubkey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtestkey',
        txt: 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtestkey',
        selector: 'dkim',
      };
    },
    mailcowCreateMailbox: async (input: unknown) => record('createMailbox', input),
    mailcowDeleteMailbox: async (input: unknown) => record('deleteMailbox', input),
    mailcowCreateAlias: async (input: unknown) => record('createAlias', input),
    mailcowDeleteAlias: async (input: unknown) => record('deleteAlias', input),
  };
});

let app: FastifyInstance;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
  mailcowMock.calls.length = 0;
  mailcowMock.failures.clear();
});

/**
 * The limits of the plan, written for the duration of the suite.
 *
 * The limits of the platform are read from the environment when the program
 * starts, and they are not meant to change while it runs. The tests change
 * them, because a limit of three domains would mean three more calls to the
 * mail system for every single test.
 */
const limits = env as unknown as {
  MAIL_MAX_DOMAINS_PER_CUSTOMER: number;
  MAIL_MAX_MAILBOXES_PER_DOMAIN: number;
  MAIL_MAX_ALIASES_PER_DOMAIN: number;
};

const originalLimits = { ...limits };

function setLimits(overrides: Partial<typeof originalLimits>): void {
  Object.assign(limits, originalLimits, overrides);
}

afterAll(() => {
  Object.assign(limits, originalLimits);
});

describe('the domains of mail', () => {
  it('hosts a domain for a customer and writes it down', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');

    const created = await client.request('POST', '/api/mail/domains', { name: 'Acme.Ro' });
    expect(created.status).toBe(201);
    expect(created.body.domain.name).toBe('acme.ro');
    expect(created.body.domain.status).toBe('active');

    const stored = await prisma.mailDomain.findFirst({ where: { userId } });
    expect(stored?.name).toBe('acme.ro');
    expect(stored?.status).toBe('ACTIVE');
  });

  it('tells the mail system the limits of the plan', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });

    const call = mailcowMock.calls.find((entry) => entry.fn === 'createDomain');
    expect(call).toBeDefined();
    expect(call?.input).toMatchObject({
      domain: 'acme.ro',
      quotaMb: env.MAIL_MAX_QUOTA_MB_PER_DOMAIN,
      mailboxes: env.MAIL_MAX_MAILBOXES_PER_DOMAIN,
      aliases: env.MAIL_MAX_ALIASES_PER_DOMAIN,
    });
  });

  it('refuses a domain that is already hosted for the same customer', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });

    const again = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    expect(again.status).toBe(409);
  });

  it('refuses a domain that is already hosted for another customer', async () => {
    const { client: first } = await registerAndLogin(app, 'first@example.com');
    await first.request('POST', '/api/mail/domains', { name: 'acme.ro' });

    const { client: second } = await registerAndLogin(app, 'second@example.com');
    const again = await second.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    expect(again.status).toBe(409);
  });

  it('refuses a wildcard, because a wildcard is not a domain that can be hosted', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const answer = await client.request('POST', '/api/mail/domains', { name: '*.acme.ro' });
    expect(answer.status).toBe(400);
  });

  it('refuses a name that is not a domain', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const answer = await client.request('POST', '/api/mail/domains', { name: 'not a domain' });
    expect(answer.status).toBe(400);
  });

  it('refuses a domain that the plan does not allow', async () => {
    setLimits({ MAIL_MAX_DOMAINS_PER_CUSTOMER: 2 });
    const { client } = await registerAndLogin(app, 'owner@example.com');

    expect((await client.request('POST', '/api/mail/domains', { name: 'one.ro' })).status).toBe(201);
    expect((await client.request('POST', '/api/mail/domains', { name: 'two.ro' })).status).toBe(201);

    const third = await client.request('POST', '/api/mail/domains', { name: 'three.ro' });
    expect(third.status).toBe(409);
    expect(String(third.body.error?.message)).toContain('2');
    // The mail system was not asked for the third domain.
    expect(mailcowMock.calls.filter((entry) => entry.fn === 'createDomain')).toHaveLength(2);
  });

  it('does not write the domain down when the mail system refuses it', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    mailcowMock.failures.set('createDomain', 'the mail system refused the domain');

    const answer = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.mailDomain.count({ where: { userId } })).toBe(0);
  });
});

describe('the isolation between the customers', () => {
  it('does not show the domain of another customer', async () => {
    const { client: owner } = await registerAndLogin(app, 'owner@example.com');
    const created = await owner.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;

    const { client: other } = await registerAndLogin(app, 'other@example.com');
    const list = await other.request('GET', '/api/mail/domains');
    expect(list.body.domains).toHaveLength(0);

    const one = await other.request('GET', `/api/mail/domains/${domainId}`);
    expect(one.status).toBe(404);
  });

  it('does not let another customer remove the domain', async () => {
    const { client: owner } = await registerAndLogin(app, 'owner@example.com');
    const created = await owner.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;

    const { client: other } = await registerAndLogin(app, 'other@example.com');
    const answer = await other.request('DELETE', `/api/mail/domains/${domainId}`);
    expect(answer.status).toBe(404);

    expect(await prisma.mailDomain.count()).toBe(1);
    expect(mailcowMock.calls.some((entry) => entry.fn === 'deleteDomain')).toBe(false);
  });

  it('does not let another customer add a mailbox to the domain', async () => {
    const { client: owner } = await registerAndLogin(app, 'owner@example.com');
    const created = await owner.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;

    const { client: other } = await registerAndLogin(app, 'other@example.com');
    const answer = await other.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'contact' });
    expect(answer.status).toBe(404);
    expect(mailcowMock.calls.some((entry) => entry.fn === 'createMailbox')).toBe(false);
  });

  it('does not let another customer read the mailboxes of the domain', async () => {
    const { client: owner } = await registerAndLogin(app, 'owner@example.com');
    const created = await owner.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;
    await owner.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'contact' });

    const { client: other } = await registerAndLogin(app, 'other@example.com');
    const answer = await other.request('GET', `/api/mail/domains/${domainId}/mailboxes`);
    expect(answer.status).toBe(404);
    expect(answer.body.mailboxes).toBeUndefined();
  });

  it('does not let a visitor that is not signed in see the domains', async () => {
    const client = makeClient(app);
    const answer = await client.request('GET', '/api/mail/domains');
    expect(answer.status).toBe(401);
  });
});

describe('the mailboxes of a domain', () => {
  it('makes a password and shows it once', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const created = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;

    const answer = await client.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'contact' });
    expect(answer.status).toBe(201);
    expect(answer.body.mailbox.address).toBe('contact@acme.ro');
    expect(typeof answer.body.mailbox.password).toBe('string');
    expect(answer.body.mailbox.password.length).toBeGreaterThanOrEqual(10);

    // The password is not kept anywhere: not in the mailbox, not in the
    // journal of the work and not in the log of the audit.
    const mailbox = await prisma.mailbox.findFirst({ where: { address: 'contact@acme.ro' } });
    expect(mailbox).toBeTruthy();
    expect(JSON.stringify(mailbox)).not.toContain(answer.body.mailbox.password);

    const jobs = await prisma.mailJob.findMany({ where: { kind: 'mailbox.create' } });
    expect(jobs).toHaveLength(1);
    expect(JSON.stringify(jobs)).not.toContain(answer.body.mailbox.password);

    const logs = await prisma.auditLog.findMany();
    expect(JSON.stringify(logs)).not.toContain(answer.body.mailbox.password);

    // The list of the mailboxes never carries a password.
    const list = await client.request('GET', `/api/mail/domains/${domainId}/mailboxes`);
    expect(JSON.stringify(list.body)).not.toContain(answer.body.mailbox.password);
  });

  it('uses the password that the customer brought', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const created = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;

    const answer = await client.request('POST', `/api/mail/domains/${domainId}/mailboxes`, {
      localPart: 'contact',
      password: 'A-Very-Long-Password-2026',
    });
    expect(answer.status).toBe(201);
    expect(answer.body.mailbox.password).toBe('A-Very-Long-Password-2026');

    const call = mailcowMock.calls.find((entry) => entry.fn === 'createMailbox');
    expect(call?.input).toMatchObject({ localPart: 'contact', domain: 'acme.ro' });
  });

  it('refuses a password that is too short', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const created = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;

    const answer = await client.request('POST', `/api/mail/domains/${domainId}/mailboxes`, {
      localPart: 'contact',
      password: 'short',
    });
    expect(answer.status).toBe(400);
    expect(mailcowMock.calls.some((entry) => entry.fn === 'createMailbox')).toBe(false);
  });

  it('refuses a name of mailbox that is not a name', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const created = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;

    const answer = await client.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'not a name' });
    expect(answer.status).toBe(400);
  });

  it('refuses a mailbox that the plan of the domain does not allow', async () => {
    setLimits({ MAIL_MAX_MAILBOXES_PER_DOMAIN: 2 });
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const created = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;

    expect((await client.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'one' })).status).toBe(201);
    expect((await client.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'two' })).status).toBe(201);

    const third = await client.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'three' });
    expect(third.status).toBe(409);
    expect(mailcowMock.calls.filter((entry) => entry.fn === 'createMailbox')).toHaveLength(2);
  });

  it('removes a mailbox of the customer', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const created = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;
    const mailbox = await client.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'contact' });
    const mailboxId = mailbox.body.mailbox.id as string;

    const answer = await client.request('DELETE', `/api/mail/domains/${domainId}/mailboxes/${mailboxId}`);
    expect(answer.status).toBe(200);
    expect(await prisma.mailbox.count()).toBe(0);
    expect(mailcowMock.calls.some((entry) => entry.fn === 'deleteMailbox')).toBe(true);
  });

  it('removes the aliases that deliver to the mailbox that goes away', async () => {
    // The mail system removes the aliases of a mailbox by itself when the
    // mailbox goes. The platform has to remove them too, or it shows an alias
    // that delivers nowhere.
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const created = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;
    const mailbox = await client.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'contact' });
    const mailboxId = mailbox.body.mailbox.id as string;
    await client.request('POST', `/api/mail/domains/${domainId}/aliases`, { alias: 'info', target: 'contact' });

    const answer = await client.request('DELETE', `/api/mail/domains/${domainId}/mailboxes/${mailboxId}`);
    expect(answer.status).toBe(200);
    expect(await prisma.mailAlias.count()).toBe(0);
    expect(mailcowMock.calls.some((entry) => entry.fn === 'deleteAlias')).toBe(true);

    const list = await client.request('GET', `/api/mail/domains/${domainId}/aliases`);
    expect(list.body.aliases).toHaveLength(0);
  });
});

describe('the aliases of a domain', () => {
  it('adds an alias that delivers to a mailbox of the same domain', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const created = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;
    await client.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'contact' });

    const answer = await client.request('POST', `/api/mail/domains/${domainId}/aliases`, {
      alias: 'info',
      target: 'contact',
    });
    expect(answer.status).toBe(201);
    expect(answer.body.alias.alias).toBe('info@acme.ro');
    expect(answer.body.alias.target).toBe('contact@acme.ro');
  });

  it('refuses an alias that delivers outside the domain', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const created = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;
    await client.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'contact' });

    const answer = await client.request('POST', `/api/mail/domains/${domainId}/aliases`, {
      alias: 'info',
      target: 'someone@elsewhere.example',
    });
    expect(answer.status).toBe(400);
    expect(mailcowMock.calls.some((entry) => entry.fn === 'createAlias')).toBe(false);
  });

  it('refuses an alias that delivers to a mailbox that does not exist', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const created = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;

    const answer = await client.request('POST', `/api/mail/domains/${domainId}/aliases`, {
      alias: 'info',
      target: 'nobody@acme.ro',
    });
    expect(answer.status).toBe(400);
  });

  it('refuses an alias that the plan of the domain does not allow', async () => {
    setLimits({ MAIL_MAX_ALIASES_PER_DOMAIN: 1 });
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const created = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;
    await client.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'contact' });

    expect((await client.request('POST', `/api/mail/domains/${domainId}/aliases`, { alias: 'info', target: 'contact' })).status).toBe(201);
    const second = await client.request('POST', `/api/mail/domains/${domainId}/aliases`, { alias: 'sales', target: 'contact' });
    expect(second.status).toBe(409);
  });
});

describe('the journal of the work of the mail', () => {
  it('writes down every piece of work and its outcome', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const created = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;

    const jobs = await prisma.mailJob.findMany({ orderBy: { createdAt: 'asc' } });
    expect(jobs.map((job) => job.kind)).toEqual(['domain.create', 'domain.create']);
    expect(jobs.every((job) => job.status === 'done')).toBe(true);
    expect(jobs[0]?.domainId).toBeNull();
  });

  it('keeps the reason of a refusal', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    mailcowMock.failures.set('createDkim', 'the key could not be made');

    await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });

    const failed = await prisma.mailJob.findFirst({ where: { status: 'failed' } });
    expect(failed).toBeTruthy();
    expect(failed?.kind).toBe('domain.create');
    expect(failed?.lastError).toContain('the key could not be made');
  });

  it('does not repeat a work that can be repeated by hand', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    mailcowMock.failures.set('createMailbox', 'the mailbox was refused');

    const created = await client.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;
    await client.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'contact' });

    const jobs = await prisma.mailJob.findMany({ where: { kind: 'mailbox.create' } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe('failed');
    expect(await prisma.mailbox.count()).toBe(0);
  });
});
