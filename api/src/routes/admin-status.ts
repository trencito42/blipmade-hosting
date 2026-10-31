import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { requirePermission, requireStaff } from '../plugins/auth.js';
import { ADMIN_ALLOWLIST_KEY, STAFF_2FA_KEY, forgetStaffSecurity, ipAllowed, staffSecurity, validAllowlistEntry } from '../lib/staff-security.js';
import { twoFactorEnabled } from '../services/second-factor.js';

const STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;
const IMPACTS = ['none', 'minor', 'major', 'critical', 'maintenance'] as const;

/**
 * The journal of incidents and the announcements, written by the staff.
 *
 * An incident has a title, an impact and updates as it goes: investigating, identified, monitoring,
 * resolved. A resolved update closes it. An announcement is a message for the dashboard, with a
 * period: a maintenance window, news. Both are public by design (the status page shows them).
 */
export async function registerAdminStatusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/incidents', { preHandler: [requirePermission('infrastructure.read')] }, async () => {
    const rows = await prisma.incident.findMany({ orderBy: { startedAt: 'desc' }, include: { updates: { orderBy: { createdAt: 'desc' } } }, take: 100 });
    return { incidents: rows };
  });

  app.post('/admin/incidents', { preHandler: [requirePermission('infrastructure.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const body = z
      .object({
        title: z.string().trim().min(3).max(140),
        impact: z.enum(IMPACTS).default('minor'),
        status: z.enum(STATUSES).default('investigating'),
        components: z.array(z.string().max(40)).max(20).default([]),
        message: z.string().trim().min(3).max(2000),
        startsAt: z.string().datetime().optional(),
      })
      .parse(request.body ?? {});
    const incident = await prisma.incident.create({
      data: {
        title: body.title,
        impact: body.impact,
        status: body.status,
        components: body.components,
        startedAt: body.startsAt ? new Date(body.startsAt) : new Date(),
        resolvedAt: body.status === 'resolved' ? new Date() : null,
        updates: { create: { status: body.status, message: body.message } },
      },
      include: { updates: true },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.incident.create', targetType: 'incident', targetId: incident.id, ip: request.ip });
    return { incident };
  });

  app.post('/admin/incidents/:id/updates', { preHandler: [requirePermission('infrastructure.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ status: z.enum(STATUSES), message: z.string().trim().min(3).max(2000) }).parse(request.body ?? {});
    const existing = await prisma.incident.findUnique({ where: { id } });
    if (!existing) throw notFound('Incident not found.');
    const incident = await prisma.incident.update({
      where: { id },
      data: {
        status: body.status,
        resolvedAt: body.status === 'resolved' ? existing.resolvedAt ?? new Date() : null,
        updates: { create: { status: body.status, message: body.message } },
      },
      include: { updates: { orderBy: { createdAt: 'desc' } } },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.incident.update', targetType: 'incident', targetId: id, meta: { status: body.status }, ip: request.ip });
    return { incident };
  });

  app.delete('/admin/incidents/:id', { preHandler: [requirePermission('infrastructure.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const done = await prisma.incident.deleteMany({ where: { id } });
    if (done.count === 0) throw notFound('Incident not found.');
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.incident.delete', targetType: 'incident', targetId: id, ip: request.ip });
    return { ok: true };
  });

  // --- announcements ------------------------------------------------------------------------

  app.get('/admin/announcements', { preHandler: [requirePermission('infrastructure.read')] }, async () => ({
    announcements: await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
  }));

  const announcementSchema = z.object({
    title: z.string().trim().min(3).max(140),
    body: z.string().trim().min(3).max(1000),
    severity: z.enum(['info', 'warning', 'maintenance']).default('info'),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    active: z.boolean().default(true),
  });

  app.post('/admin/announcements', { preHandler: [requirePermission('infrastructure.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const body = announcementSchema.parse(request.body ?? {});
    if (body.endsAt && new Date(body.endsAt) <= new Date(body.startsAt ?? Date.now())) throw badRequest('The end must be after the start.', { endsAt: 'The end must be after the start.' });
    const row = await prisma.announcement.create({ data: { ...body, startsAt: body.startsAt ? new Date(body.startsAt) : new Date(), endsAt: body.endsAt ? new Date(body.endsAt) : null } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.announcement.create', targetType: 'announcement', targetId: row.id, ip: request.ip });
    return { announcement: row };
  });

  app.patch('/admin/announcements/:id', { preHandler: [requirePermission('infrastructure.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = announcementSchema.partial().parse(request.body ?? {});
    const row = await prisma.announcement.update({
      where: { id },
      data: { ...body, ...(body.startsAt ? { startsAt: new Date(body.startsAt) } : {}), ...(body.endsAt !== undefined ? { endsAt: body.endsAt ? new Date(body.endsAt) : null } : {}) },
    }).catch(() => null);
    if (!row) throw notFound('Announcement not found.');
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.announcement.update', targetType: 'announcement', targetId: id, ip: request.ip });
    return { announcement: row };
  });

  app.delete('/admin/announcements/:id', { preHandler: [requirePermission('infrastructure.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const done = await prisma.announcement.deleteMany({ where: { id } });
    if (done.count === 0) throw notFound('Announcement not found.');
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.announcement.delete', targetType: 'announcement', targetId: id, ip: request.ip });
    return { ok: true };
  });

  // --- the security of the staff area ---------------------------------------------------------

  /** The rules, the address the caller comes from, and which members of the staff still have no two-factor. */
  app.get('/admin/security', { preHandler: [requirePermission('settings.read')] }, async (request) => {
    const rules = await staffSecurity();
    const staff = await prisma.user.findMany({
      where: { role: { in: ['STAFF', 'ADMIN'] } },
      select: { id: true, email: true, role: true, twoFactor: { select: { enabledAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      require2fa: rules.require2fa,
      ipAllowlist: rules.ipAllowlist,
      yourAddress: request.ip ?? null,
      staff: staff.map((member) => ({ id: member.id, email: member.email, role: member.role.toLowerCase(), twoFactor: Boolean(member.twoFactor?.enabledAt) })),
    };
  });

  app.put('/admin/security', { preHandler: [requirePermission('settings.write')] }, async (request) => {
    const actor = await requireStaff(request);
    if (actor.role !== 'ADMIN') throw badRequest('Only an administrator changes these rules.');
    const body = z.object({ require2fa: z.boolean(), ipAllowlist: z.array(z.string().trim().min(1).max(64)).max(50) }).parse(request.body ?? {});
    const bad = body.ipAllowlist.find((entry) => !validAllowlistEntry(entry));
    if (bad) throw badRequest(`"${bad}" is not an address or a range such as 203.0.113.0/24.`, { ipAllowlist: `"${bad}" is not an address or a range.` });
    // The rules must not lock out the person who sets them.
    if (body.ipAllowlist.length > 0 && !ipAllowed(request.ip ?? '', body.ipAllowlist)) {
      throw badRequest(`Your own address (${request.ip}) is not in the list, so you would lock yourself out. Add it first.`, { ipAllowlist: 'Your own address must be in the list.' });
    }
    if (body.require2fa && !(await twoFactorEnabled(actor.id))) {
      throw badRequest('Turn on two-factor on your own account first, then require it for everyone.', { require2fa: 'Turn on your own two-factor first.' });
    }
    await prisma.setting.upsert({ where: { key: STAFF_2FA_KEY }, create: { key: STAFF_2FA_KEY, value: body.require2fa }, update: { value: body.require2fa } });
    await prisma.setting.upsert({ where: { key: ADMIN_ALLOWLIST_KEY }, create: { key: ADMIN_ALLOWLIST_KEY, value: body.ipAllowlist }, update: { value: body.ipAllowlist } });
    forgetStaffSecurity();
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.security.update', targetType: 'settings', targetId: 'staff-security', meta: { require2fa: body.require2fa, allowlist: body.ipAllowlist.length }, ip: request.ip });
    return { require2fa: body.require2fa, ipAllowlist: body.ipAllowlist };
  });
}
