import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, registerAndLogin, resetDatabase } from './helpers.js';

/**
 * The back office of the hosted mail.
 *
 * The back office is where the operator sees the mail system of everybody:
 * whether it answers, what it holds, what the platform promised it and what it
 * did not manage to do.
 *
 * The mail system is faked at the module level, so the tests never reach a
 * real mail server.
 */

const mailcowMock = vi.hoisted(() => ({
  reachable: true,
  version: '55982ac',
  domains: [] as unknown[],
  mailboxes: [] as unknown[],
  aliases: [] as unknown[],
  failures: new Map<string, string>(),
}));

vi.mock('../src/services/mailcow.js', () => {
  const refuse = (fn: string) => {
    const reason = mailcowMock.failures.get(fn);
    if (reason) throw new Error(reason);
  };
  return {
    mailcowConfigured: () => true,
    mailcowVersion: async () => {
      refuse('version');
      return mailcowMock.version;
    },
    mailcowDisk: async () => {
      refuse('disk');
      return { used: '6.6G', total: '127G', usedPercent: '6%' };
    },
    mailcowDomains: async () => {
      refuse('domains');
      return mailcowMock.domains;
    },
    mailcowMailboxes: async () => {
      refuse('mailboxes');
      return mailcowMock.mailboxes;
    },
    mailcowAliases: async () => {
      refuse('aliases');
      return mailcowMock.aliases;
    },
    mailcowCreateDomain: async (input: unknown) => {
      refuse('createDomain');
      return input;
    },
    mailcowDeleteDomain: async (input: unknown) => {
      refuse('deleteDomain');
      return input;
    },
    mailcowDeleteDomainWithItsContent: async (input: unknown) => {
      record('deleteDomainWithItsContent', input);
      const domain = typeof input === 'string' ? input : String(input);
      mailcowMock.domains.delete(domain);
    },
    mailcowCreateDkim: async () => {
      refuse('createDkim');
      return 'thekey';
    },
    mailcowEnsureDkim: async () => {
      refuse('createDkim');
      return {
        pubkey: 'thekey',
        txt: 'v=DKIM1; k=rsa; p=thekey',
        selector: 'dkim',
      };
    },
    mailcowCreateMailbox: async (input: unknown) => {
      refuse('createMailbox');
      return input;
    },
    mailcowDeleteMailbox: async (input: unknown) => {
      refuse('deleteMailbox');
      return input;
    },
    mailcowCreateAlias: async (input: unknown) => {
      refuse('createAlias');
      return input;
    },
    mailcowDeleteAlias: async (input: unknown) => {
      refuse('deleteAlias');
      return input;
    },
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
  mailcowMock.reachable = true;
  mailcowMock.domains = [];
  mailcowMock.mailboxes = [];
  mailcowMock.aliases = [];
  mailcowMock.failures.clear();
});

describe('the health of the mail in the back office', () => {
  it('says what the mail system holds and what the platform holds', async () => {
    const { client: admin } = await createAdmin(app);

    mailcowMock.domains = [{ domain_name: 'acme.ro' }];
    mailcowMock.mailboxes = [{ username: 'contact@acme.ro' }];

    const answer = await admin.request('GET', '/api/admin/mail/health');
    expect(answer.status).toBe(200);
    expect(answer.body.service.configured).toBe(true);
    expect(answer.body.service.reachable).toBe(true);
    expect(answer.body.service.version).toBe('55982ac');
    expect(answer.body.system.domains).toBe(1);
    expect(answer.body.platform.domains).toBe(0);
    expect(answer.body.consistent).toBe(false);
  });

  it('says that the two sides tell the same story when they do', async () => {
    const { client: admin } = await createAdmin(app);
    const { client: customer } = await registerAndLogin(app, 'owner@example.com');
    const created = await customer.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;
    await customer.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'contact' });

    mailcowMock.domains = [{ domain_name: 'acme.ro' }];
    mailcowMock.mailboxes = [{ username: 'contact@acme.ro' }];

    const answer = await admin.request('GET', '/api/admin/mail/health');
    expect(answer.body.platform.domains).toBe(1);
    expect(answer.body.system.domains).toBe(1);
    expect(answer.body.platform.mailboxes).toBe(1);
    expect(answer.body.system.mailboxes).toBe(1);
    expect(answer.body.consistent).toBe(true);
  });

  it('says that the mail system is down without breaking', async () => {
    const { client: admin } = await createAdmin(app);
    mailcowMock.failures.set('version', 'the mail system did not answer');

    const answer = await admin.request('GET', '/api/admin/mail/health');
    expect(answer.status).toBe(200);
    expect(answer.body.service.reachable).toBe(false);
    expect(answer.body.service.error).toContain('did not answer');
    expect(answer.body.consistent).toBeNull();
  });

  it('is not open to a customer', async () => {
    const { client: customer } = await registerAndLogin(app, 'owner@example.com');
    const answer = await customer.request('GET', '/api/admin/mail/health');
    expect(answer.status).toBe(403);
  });

  it('is not open to a visitor that is not signed in', async () => {
    const answer = await app.inject({ method: 'GET', url: '/api/admin/mail/health' });
    expect(answer.statusCode).toBe(401);
  });
});

describe('the domains of mail in the back office', () => {
  it('shows the domains of every customer', async () => {
    const { client: admin } = await createAdmin(app);
    const { client: first } = await registerAndLogin(app, 'first@example.com');
    const { client: second } = await registerAndLogin(app, 'second@example.com');
    await first.request('POST', '/api/mail/domains', { name: 'one.ro' });
    await second.request('POST', '/api/mail/domains', { name: 'two.ro' });

    const answer = await admin.request('GET', '/api/admin/mail/domains');
    expect(answer.status).toBe(200);
    expect(answer.body.total).toBe(2);
    const names = answer.body.domains.map((domain: { name: string }) => domain.name).sort();
    expect(names).toEqual(['one.ro', 'two.ro']);
  });

  it('finds a domain by the name of the customer', async () => {
    const { client: admin } = await createAdmin(app);
    const { client: customer } = await registerAndLogin(app, 'owner@example.com');
    await customer.request('POST', '/api/mail/domains', { name: 'acme.ro' });

    const answer = await admin.request('GET', '/api/admin/mail/domains?search=owner');
    expect(answer.body.total).toBe(1);
    expect(answer.body.domains[0].customer.email).toBe('owner@example.com');
  });

  it('is not open to a customer', async () => {
    const { client: customer } = await registerAndLogin(app, 'owner@example.com');
    const answer = await customer.request('GET', '/api/admin/mail/domains');
    expect(answer.status).toBe(403);
  });
});

describe('the work of the mail in the back office', () => {
  it('shows the work and the reason of a refusal', async () => {
    const { client: admin } = await createAdmin(app);
    const { client: customer } = await registerAndLogin(app, 'owner@example.com');

    mailcowMock.failures.set('createDkim', 'the key could not be made');
    await customer.request('POST', '/api/mail/domains', { name: 'acme.ro' });

    const answer = await admin.request('GET', '/api/admin/mail/jobs?status=failed');
    expect(answer.status).toBe(200);
    expect(answer.body.total).toBe(1);
    expect(answer.body.jobs[0].lastError).toContain('the key could not be made');
    expect(answer.body.jobs[0].retryable).toBe(false);
  });

  it('repeats the work that removes something', async () => {
    const { client: admin } = await createAdmin(app);
    const { client: customer } = await registerAndLogin(app, 'owner@example.com');

    const created = await customer.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;
    const mailbox = await customer.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'contact' });
    const mailboxId = mailbox.body.mailbox.id as string;

    // The mail system refuses to remove the mailbox, so the work stays
    // unfinished and the mailbox stays in the platform.
    mailcowMock.failures.set('deleteMailbox', 'the mail system refused');
    const refused = await customer.request('DELETE', `/api/mail/domains/${domainId}/mailboxes/${mailboxId}`);
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.mailbox.count()).toBe(1);

    const failed = await admin.request('GET', '/api/admin/mail/jobs?status=failed');
    expect(failed.body.total).toBe(1);
    const jobId = failed.body.jobs[0].id as string;
    expect(failed.body.jobs[0].kind).toBe('mailbox.delete');
    expect(failed.body.jobs[0].retryable).toBe(true);

    mailcowMock.failures.clear();
    const answer = await admin.request('POST', `/api/admin/mail/jobs/${jobId}/retry`);
    expect(answer.status).toBe(200);
    expect(answer.body.job.status).toBe('done');
    expect(answer.body.job.attempts).toBe(2);

    // The repetition is the whole operation: what was left behind in the
    // platform is gone as well, so the two sides tell the same story.
    expect(await prisma.mailbox.count()).toBe(0);
  });

  it('refuses to repeat the work that creates something', async () => {
    const { client: admin } = await createAdmin(app);
    const { client: customer } = await registerAndLogin(app, 'owner@example.com');

    mailcowMock.failures.set('createDkim', 'the key could not be made');
    await customer.request('POST', '/api/mail/domains', { name: 'acme.ro' });

    const failed = await admin.request('GET', '/api/admin/mail/jobs?status=failed');
    const jobId = failed.body.jobs[0].id as string;

    const answer = await admin.request('POST', `/api/admin/mail/jobs/${jobId}/retry`);
    expect(answer.status).toBe(409);
    expect(String(answer.body.error?.message)).toContain('again');
  });

  it('keeps the reason of a refusal when the repetition fails too', async () => {
    const { client: admin } = await createAdmin(app);
    const { client: customer } = await registerAndLogin(app, 'owner@example.com');

    const created = await customer.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;
    const mailbox = await customer.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'contact' });
    const mailboxId = mailbox.body.mailbox.id as string;

    mailcowMock.failures.set('deleteMailbox', 'the mail system refused');
    await customer.request('DELETE', `/api/mail/domains/${domainId}/mailboxes/${mailboxId}`);

    const failed = await admin.request('GET', '/api/admin/mail/jobs?status=failed');
    const jobId = failed.body.jobs[0].id as string;

    const answer = await admin.request('POST', `/api/admin/mail/jobs/${jobId}/retry`);
    expect(answer.status).toBeGreaterThanOrEqual(400);

    const after = await admin.request('GET', '/api/admin/mail/jobs?status=failed');
    expect(after.body.jobs[0].attempts).toBe(2);
    expect(after.body.jobs[0].lastError).toContain('refused');
  });

  it('writes down who repeated the work', async () => {
    const { client: admin, userId: adminId } = await createAdmin(app);
    const { client: customer } = await registerAndLogin(app, 'owner@example.com');

    const created = await customer.request('POST', '/api/mail/domains', { name: 'acme.ro' });
    const domainId = created.body.domain.id as string;
    const mailbox = await customer.request('POST', `/api/mail/domains/${domainId}/mailboxes`, { localPart: 'contact' });
    const mailboxId = mailbox.body.mailbox.id as string;

    mailcowMock.failures.set('deleteMailbox', 'the mail system refused');
    await customer.request('DELETE', `/api/mail/domains/${domainId}/mailboxes/${mailboxId}`);

    const failed = await admin.request('GET', '/api/admin/mail/jobs?status=failed');
    const jobId = failed.body.jobs[0].id as string;

    mailcowMock.failures.clear();
    await admin.request('POST', `/api/admin/mail/jobs/${jobId}/retry`);

    const entry = await prisma.auditLog.findFirst({ where: { action: 'mail.job.retry' } });
    expect(entry).toBeTruthy();
    expect(entry?.actorId).toBe(adminId);
  });
});
