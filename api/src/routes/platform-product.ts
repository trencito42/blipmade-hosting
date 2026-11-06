import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { requireAuth, requirePermission } from '../plugins/auth.js';
import { addonDecision, installedAddonSlugs, mergeManifestAddons, parseInstallSpec } from '../services/addon-lifecycle.js';
import { campaignMayDeliver, campaignTransition, matchesSegment, spendBand, type SegmentFilter } from '../services/crm.js';
import { fixtureProvider, domainCommerceEnabled } from '../services/domain-commerce.js';
import { nextRegistrationState, quoteToRegistration, sellingAllowed, type RegistrationEvent, type RegistrationState } from '../services/domain-lifecycle.js';
import { cloudflareSaasEnabled, memorySaasAdapter, saasPlan, saasTransition } from '../services/cloudflare-saas.js';
import { applyMailDns, mailDnsWritesEnabled, previewMailDns, rollbackCopy, type MailZoneRow } from '../services/mail-dns-apply.js';
import { mailDnsRecords } from '../services/mail-dns.js';
import { planIsolatedBuild } from '../services/isolated-build.js';
import * as operations from '../services/panel/operations.js';
import * as panelClient from '../services/pterodactyl/client.js';
import { pluginFileFor } from '../services/minecraft.js';
import { DNS_PREVIEW_TTL_MS, approvalDecision, recordsFingerprint } from '../services/dns-approval.js';

const saasMemory = memorySaasAdapter();

async function ownedInstance(request: FastifyRequest) {
  const user = await requireAuth(request);
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const instance = await operations.loadOwnedInstance(user.id, id, request.method, request.url);
  return { user, instance };
}

export async function registerPlatformProductRoutes(app: FastifyInstance): Promise<void> {
  app.get('/instances/:id/addons', async (request: FastifyRequest) => {
    const { instance } = await ownedInstance(request);
    const row = await prisma.instance.findUnique({
      where: { id: instance.id },
      select: { productId: true, product: { select: { slug: true } }, installationManifest: true },
    });
    const variant = row
      ? await prisma.catalogVariant.findUnique({
          where: { productId: row.productId },
          include: { family: { include: { addons: { where: { active: true }, include: { compatibilities: { select: { variantId: true } } } } } } },
        })
      : null;
    const addons = variant
      ? variant.family.addons.filter((addon) => addon.compatibilities.length === 0 || addon.compatibilities.some((entry) => entry.variantId === variant.id))
      : [];
    const installed = installedAddonSlugs(row?.installationManifest);
    const jobs = await prisma.instanceAddonJob.findMany({ where: { instanceId: instance.id }, orderBy: { createdAt: 'desc' }, take: 20 });
    return {
      productSlug: row?.product.slug ?? null,
      installed,
      jobs: jobs.map((job) => ({ id: job.id, addonSlug: job.addonSlug, action: job.action, status: job.status, error: job.error, writes: job.writes, createdAt: job.createdAt })),
      addons: addons.map((addon) => ({
        slug: addon.slug,
        name: addon.name,
        summary: addon.summary,
        kind: addon.kind,
        version: addon.version,
        installSpec: addon.installSpec,
        installed: installed.includes(addon.slug),
      })),
      note: 'SOFTWARE add-ons write files only through a verified adapter after a locked backup.',
    };
  });

  app.post('/instances/:id/addons/:slug', async (request: FastifyRequest) => {
    const { user, instance } = await ownedInstance(request);
    if (instance.userId !== user.id) throw forbidden('Only the owner can change add-ons.');
    const { slug } = z.object({ id: z.string(), slug: z.string().min(2).max(60) }).parse(request.params);
    const body = z.object({
      action: z.enum(['install', 'update', 'remove', 'reconcile']),
      confirmBackup: z.boolean(),
      idempotencyKey: z.string().min(8).max(80).optional(),
      gameVersion: z.string().regex(/^\d+\.\d+(\.\d+)?$/).optional(),
    }).parse(request.body ?? {});
    const row = await prisma.instance.findUnique({
      where: { id: instance.id },
      select: { productId: true, product: { select: { slug: true } }, installationManifest: true, pterodactylUuid: true },
    });
    if (!row) throw notFound('Instance not found.');
    const variant = await prisma.catalogVariant.findUnique({
      where: { productId: row.productId },
      include: { family: { include: { addons: { include: { compatibilities: { select: { variantId: true } } } } } } },
    });
    const addon = variant?.family.addons.find((entry) => entry.slug === slug);
    if (!variant || !addon) throw notFound('Add-on not found for this family.');
    const compatible = !addon.compatibilities.length || addon.compatibilities.some((entry) => entry.variantId === variant.id);
    const installed = installedAddonSlugs(row.installationManifest).includes(slug);
    let hasBackup = body.confirmBackup;
    if (body.confirmBackup && instance.pterodactylUuid) {
      const token = await operations.customerToken(instance);
      try {
        await panelClient.createBackup(token, instance.pterodactylUuid, { name: `Before add-on ${slug}`.slice(0, 100), locked: true });
        hasBackup = true;
      } catch {
        throw badRequest('A locked backup could not be made, so the add-on was not changed.');
      }
    }
    const decision = addonDecision({
      kind: addon.kind,
      compatible,
      action: body.action,
      installed,
      hasBackup,
      spec: parseInstallSpec(addon.installSpec),
      productSlug: row.product.slug,
    });
    if (body.idempotencyKey) {
      const existing = await prisma.instanceAddonJob.findUnique({ where: { instanceId_idempotencyKey: { instanceId: instance.id, idempotencyKey: body.idempotencyKey } } });
      if (existing) return { job: existing, replayed: true };
    }
    if (!decision.ok) {
      await prisma.instanceAddonJob.create({
        data: {
          instanceId: instance.id,
          addonSlug: slug,
          action: body.action,
          status: 'failed',
          backupRequired: decision.backupRequired,
          backupOk: hasBackup,
          writes: false,
          error: decision.reason,
          idempotencyKey: body.idempotencyKey,
        },
      });
      throw badRequest(decision.reason);
    }
    let writes = false;
    const spec = parseInstallSpec(addon.installSpec);
    if (decision.writes && spec?.adapter === 'minecraft-plugin' && spec.project && instance.pterodactylUuid) {
      const token = await operations.customerToken(instance);
      const file = await pluginFileFor(spec.project, body.gameVersion ?? '1.21.1');
      if (body.action === 'remove') {
        await panelClient.deleteFile(token, instance.pterodactylUuid, `/plugins/${file.filename}`).catch(() => undefined);
      } else {
        try { await panelClient.createFolder(token, instance.pterodactylUuid, '/plugins'); } catch { /* exists */ }
        await panelClient.pullFile(token, instance.pterodactylUuid, file.url, '/plugins', file.filename);
      }
      writes = true;
    }
    const nextManifest = mergeManifestAddons(row.installationManifest, slug, body.action === 'remove' ? 'removed' : 'installed');
    await prisma.instance.update({ where: { id: instance.id }, data: { installationManifest: nextManifest as object } });
    const job = await prisma.instanceAddonJob.create({
      data: {
        instanceId: instance.id,
        addonSlug: slug,
        action: body.action,
        status: 'succeeded',
        backupRequired: decision.backupRequired,
        backupOk: hasBackup,
        writes,
        idempotencyKey: body.idempotencyKey,
        result: { adapter: decision.adapter },
      },
    });
    await audit({ actorId: user.id, actorEmail: user.email, action: `instance.addon.${body.action}`, targetType: 'instance', targetId: instance.id, meta: { slug, writes } });
    return { job, decision, installed: installedAddonSlugs(nextManifest) };
  });

  app.post('/catalog/import/:id/build', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const source = await prisma.importSource.findFirst({ where: { id, userId: user.id } });
    if (!source) throw notFound('Import not found.');
    const plan = planIsolatedBuild({ buildCommand: source.buildCommand, startCommand: source.startCommand, runtime: source.productSlug });
    const job = await prisma.isolatedBuildJob.create({
      data: {
        importSourceId: source.id,
        status: plan.status,
        buildCommand: plan.buildCommand,
        startCommand: plan.startCommand,
        sandboxHost: plan.sandboxHost,
        lastError: plan.status === 'blocked_no_sandbox' ? plan.note : null,
      },
    });
    return { job, plan };
  });

  app.post('/domains/:id/mail-dns', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const domain = await prisma.instanceDomain.findFirst({ where: { id, claimedByUserId: user.id } });
    if (!domain) throw notFound('Domain not found.');
    const body = z.object({ approve: z.boolean().default(false), previewId: z.string().optional(), sandboxZone: z.array(z.object({ type: z.string(), name: z.string(), value: z.string(), owned: z.boolean().optional() })).optional() }).parse(request.body ?? {});
    const records = mailDnsRecords({ domain: domain.hostname, mailHostname: env.MAIL_HOSTNAME, dkimPublic: null, fromAddress: `postmaster@${domain.hostname}` });
    const zone: MailZoneRow[] = body.sandboxZone ?? [];
    const preview = previewMailDns(records, zone);
    const fingerprint = recordsFingerprint(records.map((record) => ({ type: record.type === 'MX' ? 'TXT' : record.type, name: record.name, content: record.value })));
    if (!body.approve) {
      const stored = await prisma.dnsApproval.create({
        data: { userId: user.id, domainId: domain.id, fingerprint, diff: preview as object, expiresAt: new Date(Date.now() + DNS_PREVIEW_TTL_MS) },
      });
      return { previewId: stored.id, expiresAt: stored.expiresAt, preview, writes: false, rollback: rollbackCopy(preview), note: 'Existing mail DNS is not changed until you approve this preview.' };
    }
    if (!body.previewId) throw badRequest('Approve the preview that was just shown.');
    const saved = await prisma.dnsApproval.findFirst({ where: { id: body.previewId, userId: user.id, domainId: domain.id } });
    if (!saved) throw badRequest('That preview does not belong to this hostname.');
    const live = previewMailDns(records, zone);
    const decision = approvalDecision({
      now: Date.now(),
      expiresAt: saved.expiresAt.getTime(),
      consumedAt: saved.consumedAt?.getTime() ?? null,
      fingerprint: saved.fingerprint,
      currentFingerprint: fingerprint,
      stored: saved.diff as never,
      live: live as never,
    });
    if (!decision.ok) throw badRequest(decision.reason);
    await prisma.dnsApproval.updateMany({ where: { id: saved.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (!mailDnsWritesEnabled()) {
      return { preview, applied: false, note: 'Approval stored. MAIL_DNS_WRITES is off, so customer mail DNS was not changed.', rollback: rollbackCopy(preview) };
    }
    const applied = applyMailDns(records, zone);
    if (applied.conflicts.length) throw badRequest(`Conflicts: ${applied.conflicts.join(', ')}`);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'domain.mail_dns.apply', targetType: 'instance_domain', targetId: domain.id, meta: { written: applied.written } });
    return { preview, applied: true, written: applied.written, rollback: rollbackCopy(preview) };
  });

  app.post('/domains/commerce/orders', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { domain, action } = z.object({ domain: z.string().min(3).max(253), action: z.enum(['register', 'renew', 'transfer']) }).parse(request.body ?? {});
    const offer = await fixtureProvider.lookup(domain);
    if (!sellingAllowed(domainCommerceEnabled(), offer)) {
      throw badRequest('No approved registrar will sell this name. Fixture .example names work only when domain commerce is on.');
    }
    const quoted = quoteToRegistration(user.id, offer, action);
    const row = await prisma.domainRegistration.create({ data: quoted });
    return { order: row, offer, selling: false };
  });

  app.post('/domains/commerce/orders/:id/:event', async (request: FastifyRequest) => {
    await requirePermission('settings.write')(request);
    const { id, event } = z.object({ id: z.string(), event: z.string() }).parse(request.params);
    const row = await prisma.domainRegistration.findUnique({ where: { id } });
    if (!row) throw notFound('Registration not found.');
    const next = nextRegistrationState(row.state as RegistrationState, event as RegistrationEvent);
    if (!next) throw badRequest(`A registration in ${row.state} cannot ${event}.`);
    const updated = await prisma.domainRegistration.update({ where: { id }, data: { state: next } });
    return { order: updated };
  });

  app.get('/admin/crm/segments', { preHandler: requirePermission('customers.read') }, async () => {
    const segments = await prisma.customerSegment.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return { segments, delivery: process.env.MARKETING_DELIVERY_ENABLED === 'true' };
  });

  app.post('/admin/crm/segments', { preHandler: requirePermission('customers.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const body = z.object({ name: z.string().trim().min(2).max(80), filter: z.record(z.string(), z.unknown()) }).parse(request.body ?? {});
    const segment = await prisma.customerSegment.create({ data: { name: body.name, filter: body.filter as object, createdBy: staff.id } });
    return { segment };
  });

  app.post('/admin/crm/segments/:id/preview', { preHandler: requirePermission('customers.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const segment = await prisma.customerSegment.findUnique({ where: { id } });
    if (!segment) throw notFound('Segment not found.');
    const filter = segment.filter as SegmentFilter;
    const users = await prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      take: 200,
      select: { id: true, email: true, tags: true, notificationPreference: { select: { marketing: true } }, customerFacts: true, payments: { select: { amount: true, status: true } } },
    });
    const matches = users.filter((user) => {
      const facts = Object.fromEntries(user.customerFacts.map((fact) => [fact.key, fact.value]));
      const spent = user.payments.filter((payment) => payment.status === 'SUCCEEDED').reduce((sum, payment) => sum + payment.amount, 0);
      facts.spend_band = spendBand(spent);
      return matchesSegment({ facts, tags: user.tags, marketing: user.notificationPreference?.marketing ?? false }, filter);
    });
    return { count: matches.length, sample: matches.slice(0, 20).map((user) => ({ id: user.id, email: user.email })) };
  });

  app.get('/admin/crm/campaigns', { preHandler: requirePermission('promotions.read') }, async () => {
    const campaigns = await prisma.marketingCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { segment: { select: { id: true, name: true } } } });
    return { campaigns, delivery: process.env.MARKETING_DELIVERY_ENABLED === 'true' };
  });

  app.post('/admin/crm/campaigns', { preHandler: requirePermission('promotions.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const body = z.object({ name: z.string().trim().min(2).max(80), body: z.string().trim().min(2).max(5000), segmentId: z.string().nullable().optional() }).parse(request.body ?? {});
    const campaign = await prisma.marketingCampaign.create({ data: { name: body.name, body: body.body, segmentId: body.segmentId ?? null, createdBy: staff.id } });
    await audit({ actorId: staff.id, actorEmail: staff.email, action: 'crm.campaign.created', targetType: 'marketing_campaign', targetId: campaign.id });
    return { campaign };
  });

  app.post('/admin/crm/campaigns/:id/:event', { preHandler: requirePermission('promotions.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const { id, event } = z.object({ id: z.string(), event: z.enum(['submit', 'approve', 'reject', 'suppress']) }).parse(request.params);
    const campaign = await prisma.marketingCampaign.findUnique({ where: { id } });
    if (!campaign) throw notFound('Campaign not found.');
    const next = campaignTransition(campaign.status, event);
    if ('error' in next) throw badRequest(next.error);
    const updated = await prisma.marketingCampaign.update({
      where: { id },
      data: {
        status: next.status,
        suppressed: next.status === 'suppressed',
        approvedAt: event === 'approve' ? new Date() : campaign.approvedAt,
        approvedBy: event === 'approve' ? staff.id : campaign.approvedBy,
      },
    });
    await audit({ actorId: staff.id, actorEmail: staff.email, action: `crm.campaign.${event}`, targetType: 'marketing_campaign', targetId: id });
    return { campaign: updated, gate: campaignMayDeliver({ status: updated.status, suppressed: updated.suppressed, marketingConsent: true }) };
  });

  app.get('/admin/customers/:id/crm', { preHandler: requirePermission('customers.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, tags: true, createdAt: true,
        notificationPreference: { select: { marketing: true, marketingOptInAt: true } },
        customerFacts: true,
        discordCommunityLinks: { select: { discordUserId: true } },
        tickets: { where: { status: { not: 'CLOSED' } }, select: { id: true }, take: 5 },
        payments: { select: { amount: true, status: true } },
      },
    });
    if (!user) throw notFound('Customer not found.');
    const spent = user.payments.filter((payment) => payment.status === 'SUCCEEDED').reduce((sum, payment) => sum + payment.amount, 0);
    return {
      facts: [
        ...user.customerFacts,
        { key: 'spend_band', value: spendBand(spent), source: 'billing' },
        { key: 'marketing', value: user.notificationPreference?.marketing ? 'opt_in' : 'opt_out', source: 'consent' },
        { key: 'support_open', value: user.tickets.length ? 'yes' : 'no', source: 'tickets' },
        { key: 'discord', value: user.discordCommunityLinks.length ? 'linked' : 'none', source: 'discord' },
      ],
      tags: user.tags,
      marketing: user.notificationPreference,
    };
  });

  app.put('/admin/customers/:id/facts/:key', { preHandler: requirePermission('customers.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const { id, key } = z.object({ id: z.string(), key: z.string().min(2).max(40) }).parse(request.params);
    const { value } = z.object({ value: z.string().min(1).max(80) }).parse(request.body ?? {});
    const fact = await prisma.customerFact.upsert({
      where: { userId_key: { userId: id, key } },
      create: { userId: id, key, value, source: 'staff' },
      update: { value, source: 'staff' },
    });
    await audit({ actorId: staff.id, actorEmail: staff.email, action: 'crm.fact.upsert', targetType: 'user', targetId: id, meta: { key } });
    return { fact };
  });

  app.get('/admin/domains/saas', { preHandler: requirePermission('settings.read') }, async () => {
    const rows = await prisma.saasCustomHostname.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return { enabled: cloudflareSaasEnabled(), adapter: cloudflareSaasEnabled() ? 'cloudflare' : 'memory', hostnames: rows };
  });

  app.post('/admin/domains/saas', { preHandler: requirePermission('settings.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const { hostname } = z.object({ hostname: z.string().min(3).max(253) }).parse(request.body ?? {});
    const plan = saasPlan(hostname, env.DOMAIN_BASE || 'apps.blipmade.com');
    if (plan.state === 'disabled') {
      const row = await prisma.saasCustomHostname.create({ data: { userId: staff.id, hostname: plan.hostname, state: 'disabled', lastError: plan.note } });
      return { hostname: row, plan };
    }
    const created = await saasMemory.create(plan.hostname);
    const next = saasTransition('draft', 'submit') ?? 'pending_dns';
    const row = await prisma.saasCustomHostname.create({ data: { userId: staff.id, hostname: plan.hostname, state: next, providerId: created.id } });
    return { hostname: row, plan };
  });

  app.get('/admin/domains/commerce', { preHandler: requirePermission('settings.read') }, async () => {
    const orders = await prisma.domainRegistration.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return { selling: false, enabled: domainCommerceEnabled(), provider: fixtureProvider.label, orders };
  });
}
