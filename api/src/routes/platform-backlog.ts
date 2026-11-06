import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../plugins/auth.js';
import { env } from '../env.js';
import { fixtureProvider, domainCommerceEnabled } from '../services/domain-commerce.js';
import { cloudflareSaasEnabled, saasPlan } from '../services/cloudflare-saas.js';
import { mailDnsRecords } from '../services/mail-dns.js';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';

export async function registerPlatformBacklogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/domains/commerce/lookup', async (request: FastifyRequest) => {
    await requireAuth(request);
    const { domain } = z.object({ domain: z.string().min(3).max(253) }).parse(request.query ?? {});
    const offer = await fixtureProvider.lookup(domain);
    return {
      enabled: domainCommerceEnabled(),
      provider: fixtureProvider.id,
      selling: false,
      offer: domainCommerceEnabled() ? offer : { ...offer, state: 'disabled', amount: null, note: 'Domain selling is off. No registrar is connected.' },
    };
  });

  app.get('/domains/saas/plan', async (request: FastifyRequest) => {
    await requireAuth(request);
    const { hostname } = z.object({ hostname: z.string().min(3).max(253) }).parse(request.query ?? {});
    return { enabled: cloudflareSaasEnabled(), hostname: saasPlan(hostname, env.DOMAIN_BASE || 'apps.blipmade.com') };
  });

  app.get('/domains/:id/mail-dns-preview', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const domain = await prisma.instanceDomain.findFirst({ where: { id, claimedByUserId: user.id } });
    if (!domain) throw notFound('Domain not found');
    const records = mailDnsRecords({
      domain: domain.hostname,
      mailHostname: env.MAIL_HOSTNAME,
      dkimPublic: null,
      fromAddress: `postmaster@${domain.hostname}`,
    });
    return {
      hostname: domain.hostname,
      writes: false,
      records,
      note: 'Preview only. Existing mail DNS is not changed. Approve writes from the mail product, not from this page.',
    };
  });

  app.get('/admin/domain-commerce', { preHandler: requirePermission('settings.read') }, async () => {
    return {
      selling: false,
      domainCommerceEnabled: domainCommerceEnabled(),
      cloudflareSaasEnabled: cloudflareSaasEnabled(),
      provider: fixtureProvider.label,
      note: 'Connect a real reseller before any registration, renewal or transfer. Fixture lookups never bill.',
    };
  });
}
