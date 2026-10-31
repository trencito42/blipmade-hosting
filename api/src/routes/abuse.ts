import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { addressRateLimitKey } from '../plugins/auth.js';

/**
 * The public form to report abuse (spam, phishing, malware, an attack, a copyright claim). Anyone
 * may use it, with no account. It is rate limited hard, and a report that names a hostname that
 * belongs to a service is linked to it, so the staff opens the right account at once.
 */
export async function registerAbuseRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/abuse/report',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour', keyGenerator: addressRateLimitKey } } },
    async (request, reply) => {
      const body = z
        .object({
          name: z.string().trim().min(2).max(100),
          email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
          category: z.enum(['spam', 'phishing', 'malware', 'ddos', 'copyright', 'illegal', 'other']),
          target: z.string().trim().min(3).max(300),
          details: z.string().trim().min(20, 'Describe what happened in at least 20 characters.').max(4000),
          evidenceUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
        })
        .parse(request.body ?? {});

      // A hostname of a service of ours, taken out of the address the report names.
      const host = body.target.replace(/^[a-z]+:\/\//i, '').split(/[/?#:]/)[0]?.toLowerCase() ?? '';
      const domain = host ? await prisma.domain.findFirst({ where: { hostname: host }, select: { instanceId: true } }) : null;

      const report = await prisma.abuseReport.create({
        data: {
          reporterName: body.name,
          reporterEmail: body.email,
          category: body.category,
          target: body.target,
          details: body.details,
          evidenceUrl: body.evidenceUrl || null,
          instanceId: domain?.instanceId ?? null,
          reporterIp: request.ip ?? null,
        },
      });
      await audit({ action: 'abuse.reported', targetType: 'abuse', targetId: report.id, meta: { category: body.category }, ip: request.ip });
      return reply.code(201).send({ received: true, reference: report.id.slice(-8).toUpperCase() });
    },
  );
}
