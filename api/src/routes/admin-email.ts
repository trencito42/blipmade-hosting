import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { emailTemplateCatalog, emailTemplateDefaults, emailTemplateSample, renderEmailTemplate } from '../lib/email-design.js';
import { emailOverrideOf, loadEmailOverrides, saveEmailOverride, type EmailOverride } from '../lib/email-overrides.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { sendMail } from '../lib/mailer.js';
import { addressRateLimitKey, requirePermission, requireStaff } from '../plugins/auth.js';
import { EVENT_DEFINITIONS } from '../services/notification-events.js';

/**
 * The tools around the wording of the emails: a preview of a draft that is not saved, the versions of a
 * template with a way back, a test message to the staff member who asks, and the map from the events of
 * the platform to the templates, with what was really delivered.
 *
 * The structure and the design of a template stay in the code. Only the wording of four parts is open,
 * and a wording that cannot be rendered never reaches a customer: the wording of the code is used.
 */

export const wordingSchema = z
  .object({
    subject: z.string().trim().max(200).optional(),
    heading: z.string().trim().max(200).optional(),
    preheader: z.string().trim().max(200).optional(),
    note: z.string().trim().max(400).optional(),
  })
  .strict();

/** Refuses a wording that uses a placeholder the template does not know, or markup. */
export function assertValidWording(id: string, body: EmailOverride): void {
  const defaults = emailTemplateDefaults(id);
  if (!defaults) throw notFound('Template not found.');
  const allowed = new Set(defaults.placeholders);
  for (const [field, text] of Object.entries(body)) {
    for (const match of (text ?? '').matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
      if (!allowed.has(match[1]!)) {
        throw badRequest(`${field}: "{{${match[1]}}}" is not a placeholder of this template. Use: ${[...allowed].map((name) => `{{${name}}}`).join(', ') || 'none'}.`, { [field]: `"{{${match[1]}}}" is not a placeholder of this template.` });
      }
    }
    if (/[<>]/.test(text ?? '')) throw badRequest(`${field}: write plain text, without < or >.`, { [field]: 'Plain text only.' });
  }
}

/** The body of a preview or a test: a draft of the wording and nothing else, so a request cannot name a recipient. */
const draftOf = (body: unknown): EmailOverride => z.object({ draft: wordingSchema.optional() }).strict().parse(body ?? {}).draft ?? {};

export async function registerAdminEmailRoutes(app: FastifyInstance): Promise<void> {
  const limited = { config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } } };
  const idOf = (request: FastifyRequest) => z.object({ id: z.string() }).parse(request.params).id;
  const known = (id: string) => {
    if (!emailTemplateDefaults(id)) throw notFound('Template not found.');
    return id;
  };

  /** Renders a draft with made-up values. The draft is not saved. */
  app.post('/admin/email-templates/:id/preview', { preHandler: [requirePermission('settings.read')] }, async (request) => {
    const id = known(idOf(request));
    const draft = draftOf(request.body);
    assertValidWording(id, draft);
    const sample = emailTemplateSample(id);
    const rendered = Object.keys(draft).length ? renderEmailTemplate(id, sample, { ...(emailOverrideOf(id) ?? {}), ...draft }) : renderEmailTemplate(id, sample);
    return { preview: { subject: rendered.subject, preheader: rendered.preheader, text: rendered.text, html: rendered.html, usesDraft: Object.keys(draft).length > 0, note: 'Made-up values. Show the html in a sandboxed frame.' } };
  });

  /** The saved versions of the wording of a template, newest first. */
  app.get('/admin/email-templates/:id/versions', { preHandler: [requirePermission('settings.read')] }, async (request) => {
    const id = known(idOf(request));
    const entries = await prisma.auditLog.findMany({
      where: { targetType: 'email-template', targetId: id, action: { in: ['admin.email_template.update', 'admin.email_template.reset', 'admin.email_template.restore'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: { id: true, action: true, actorEmail: true, createdAt: true, meta: true },
    });
    return { versions: entries.map((entry) => ({ id: entry.id, action: entry.action, actorEmail: entry.actorEmail, createdAt: entry.createdAt, before: (entry.meta as any)?.before ?? null, after: (entry.meta as any)?.after ?? null })) };
  });

  /** Puts back the wording that a version left. The wording is checked again. */
  app.post('/admin/email-templates/:id/restore', { ...limited, preHandler: [requirePermission('settings.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request) => {
    const actor = await requireStaff(request);
    const id = known(idOf(request));
    const { versionId, side } = z.object({ versionId: z.string(), side: z.enum(['before', 'after']).default('after') }).strict().parse(request.body ?? {});
    const entry = await prisma.auditLog.findFirst({ where: { id: versionId, targetType: 'email-template', targetId: id } });
    if (!entry) throw notFound('That version was not found.');
    const wording = wordingSchema.parse((entry.meta as any)?.[side] ?? {});
    assertValidWording(id, wording);
    const before = emailOverrideOf(id) ?? null;
    await saveEmailOverride(id, wording);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.email_template.restore', targetType: 'email-template', targetId: id, meta: { before, after: emailOverrideOf(id) ?? null, from: versionId, side }, ip: request.ip });
    return { override: emailOverrideOf(id) ?? null };
  });

  /** Sends the template, with made-up values, to the address of the staff member who asks and to nobody else. */
  app.post('/admin/email-templates/:id/test', { ...limited, preHandler: [requirePermission('settings.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request) => {
    const actor = await requireStaff(request);
    const id = known(idOf(request));
    const draft = draftOf(request.body);
    assertValidWording(id, draft);
    const sample = emailTemplateSample(id);
    const rendered = Object.keys(draft).length ? renderEmailTemplate(id, sample, { ...(emailOverrideOf(id) ?? {}), ...draft }) : renderEmailTemplate(id, sample);
    const result = await sendMail({ to: actor.email, subject: `[Test] ${rendered.subject}`, text: rendered.text, html: rendered.html, kind: 'template-test' });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.email_template.test', targetType: 'email-template', targetId: id, meta: { state: result.state }, ip: request.ip });
    return { sentTo: actor.email, state: result.state, transport: result.transport };
  });

  /** Each event of the platform, its template, whether the wording was changed, and what was delivered in 30 days. */
  app.get('/admin/email-templates/coverage', { preHandler: [requirePermission('settings.read')] }, async () => {
    await loadEmailOverrides();
    const templates = new Set(emailTemplateCatalog().map((entry) => entry.id));
    const since = new Date(Date.now() - 30 * 86_400_000);
    const grouped = await prisma.mailDelivery.groupBy({ by: ['kind', 'state'], where: { createdAt: { gte: since } }, _count: { _all: true } });
    const byKind = new Map<string, Record<string, number>>();
    for (const row of grouped) byKind.set(row.kind, { ...(byKind.get(row.kind) ?? {}), [row.state]: row._count._all });
    const events = Object.values(EVENT_DEFINITIONS).map((definition) => ({
      event: definition.type,
      template: definition.template,
      templateExists: templates.has(definition.template),
      email: definition.channels.includes('email'),
      changed: emailOverrideOf(definition.template) !== undefined,
      delivered30d: byKind.get(definition.type) ?? byKind.get(definition.template) ?? {},
    }));
    return { events, missing: events.filter((row) => row.email && !row.templateExists).map((row) => row.event), orphans: [...templates].filter((id) => !events.some((row) => row.template === id)) };
  });
}
