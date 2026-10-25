import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requirePermission, requireStaff } from '../plugins/auth.js';
import { pageOf, pageOrder, parsePagination, withCursor } from '../lib/perf-data-pagination.js';
import * as mail from '../services/mail.js';
import * as mailcow from '../services/mailcow.js';

/**
 * The back office of the hosted mail.
 *
 * The back office is where the operator sees the mail system of everybody:
 * whether it answers, what it holds, what the platform promised it and what it
 * did not manage to do.
 *
 * The back office reads the state of the mail system with the same client the
 * customer flow uses, so what the operator sees is what the customer gets.
 */

/** True when the mail system answered. */
async function mailSystemHealth(): Promise<{
  configured: boolean;
  reachable: boolean;
  version: string | null;
  disk: { used: string; total: string; usedPercent: string } | null;
  error: string | null;
}> {
  if (!mailcow.mailcowConfigured()) {
    return {
      configured: false,
      reachable: false,
      version: null,
      disk: null,
      error: 'The mail system is not configured on this environment.',
    };
  }

  try {
    const [version, disk] = await Promise.all([mailcow.mailcowVersion(), mailcow.mailcowDisk()]);
    return { configured: true, reachable: true, version, disk, error: null };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      version: null,
      disk: null,
      error: (error as Error).message,
    };
  }
}

export async function registerAdminMailRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The health of the mail.
   *
   * The answer carries both sides: what the mail system holds and what the
   * platform believes it holds. The two are compared by the operator, and a
   * difference is the sign that something went wrong somewhere.
   */
  app.get('/admin/mail/health', {
    config: { rateLimit: { max: LIMITS.adminService.address, timeWindow: LIMITS.adminService.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('infrastructure.read'), customerLimit(app, LIMITS.adminService)],
  }, async () => {
    const health = await mailSystemHealth();

    const [platformDomains, platformMailboxes, platformAliases, failedJobs] = await Promise.all([
      prisma.mailDomain.count(),
      prisma.mailbox.count(),
      prisma.mailAlias.count(),
      prisma.mailJob.count({ where: { status: 'failed' } }),
    ]);

    let systemDomains = 0;
    let systemMailboxes = 0;
    let systemAliases = 0;
    if (health.reachable) {
      const [domains, mailboxes, aliases] = await Promise.all([
        mailcow.mailcowDomains(),
        mailcow.mailcowMailboxes(),
        mailcow.mailcowAliases(),
      ]);
      systemDomains = domains.length;
      systemMailboxes = mailboxes.length;
      systemAliases = aliases.length;
    }

    return {
      service: health,
      platform: { domains: platformDomains, mailboxes: platformMailboxes, aliases: platformAliases, failedJobs },
      system: { domains: systemDomains, mailboxes: systemMailboxes, aliases: systemAliases },
      consistent: health.reachable
        ? platformDomains === systemDomains &&
          platformMailboxes === systemMailboxes &&
          platformAliases === systemAliases
        : null,
    };
  });

  /**
   * Every domain of mail of every customer.
   *
   * The list is read in pages, because the number of domains of a platform
   * grows with the number of customers.
   */
  app.get('/admin/mail/domains', { preHandler: requirePermission('infrastructure.read') }, async (request: FastifyRequest) => {
    const query = z.object({ status: z.string().optional(), search: z.string().optional() }).parse(request.query ?? {});
    const { limit, cursor } = parsePagination(request.query, { defaultSize: 50, maxSize: 200 });

    const where: Prisma.MailDomainWhereInput = {};
    if (query.status) where.status = query.status.toUpperCase() as never;
    if (query.search?.trim()) {
      where.OR = [
        { name: { contains: query.search.trim().toLowerCase() } },
        { user: { email: { contains: query.search.trim().toLowerCase() } } },
      ];
    }

    const rows = await prisma.mailDomain.findMany({
      where: withCursor(where, cursor, 'updatedAt'),
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        _count: { select: { mailboxes: true, aliases: true } },
      },
      orderBy: pageOrder('updatedAt'),
      take: limit + 1,
    });

    const page = pageOf(rows, limit, 'updatedAt');
    const total = await prisma.mailDomain.count({ where });

    return {
      domains: page.rows.map((domain) => ({
        id: domain.id,
        name: domain.name,
        status: domain.status.toLowerCase(),
        quotaMb: domain.quotaMb,
        usedMb: domain.usedMb,
        mailboxes: domain._count.mailboxes,
        aliases: domain._count.aliases,
        lastError: domain.lastError,
        customer: { id: domain.user.id, email: domain.user.email },
        createdAt: domain.createdAt,
        updatedAt: domain.updatedAt,
      })),
      total,
      pagination: page.pagination,
    };
  });

  /**
   * The work the platform owes to the mail system.
   *
   * The list shows what failed as well as what worked, because a failure that
   * is not shown is a failure that nobody looks at.
   */
  app.get('/admin/mail/jobs', { preHandler: requirePermission('infrastructure.read') }, async (request: FastifyRequest) => {
    const query = z.object({ status: z.string().optional() }).parse(request.query ?? {});
    const { limit, cursor } = parsePagination(request.query, { defaultSize: 50, maxSize: 200 });

    const where: Prisma.MailJobWhereInput = {};
    if (query.status) where.status = query.status.toLowerCase();

    const rows = await prisma.mailJob.findMany({
      where: withCursor(where, cursor, 'createdAt'),
      include: { domain: { select: { id: true, name: true } } },
      orderBy: pageOrder('createdAt'),
      take: limit + 1,
    });

    const page = pageOf(rows, limit, 'createdAt');
    const total = await prisma.mailJob.count({ where });

    return {
      jobs: page.rows.map((job) => ({
        id: job.id,
        kind: job.kind,
        status: job.status,
        attempts: job.attempts,
        lastError: job.lastError,
        retryable: job.status === 'failed' && mail.isRetryableJobKind(job.kind),
        domain: job.domain ? { id: job.domain.id, name: job.domain.name } : null,
        payload: (job.payload ?? {}) as Record<string, unknown>,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
      total,
      pagination: page.pagination,
    };
  });

  /**
   * Repeats a job of the mail that failed.
   *
   * Only the work that removes something can be repeated. The refusal says so
   * out loud, because a silent answer would leave the operator believing that
   * the work was done.
   */
  app.post('/admin/mail/jobs/:id/retry', {
    config: { rateLimit: { max: LIMITS.adminService.address, timeWindow: LIMITS.adminService.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('infrastructure.write'), customerLimit(app, LIMITS.adminService)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const job = await mail.retryMailJob(id, { id: actor.id, email: actor.email });
    return { job };
  });
}
