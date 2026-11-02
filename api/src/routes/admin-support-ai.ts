import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requirePermission } from '../plugins/auth.js';
import { ACTIONS, checkBaseUrl, configSchema, credentialConfigured, readConfig, readUsage, runAi, saveConfig } from '../services/support-ai.js';

/**
 * The assistant of the staff: its settings, and the drafts it writes for one conversation.
 *
 * Switching it on or changing it is configuration (`settings.write`). Asking it for a draft is something a person who can
 * answer the conversation does (`tickets.write`), and it sees exactly what that person sees in the thread, no more.
 */

export async function registerAdminSupportAiRoutes(app: FastifyInstance): Promise<void> {
  const limit = { config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } } };

  app.get('/admin/support/ai', { preHandler: requirePermission('tickets.read') }, async () => {
    const [config, usage] = await Promise.all([readConfig(), readUsage()]);
    // The key itself is never sent: only whether the server has one.
    return { config, credentialConfigured: credentialConfigured(), usage: { day: usage.day, tokens: usage.tokens, calls: usage.calls, failures: usage.failures } };
  });

  app.put('/admin/support/ai', { ...limit, preHandler: [requirePermission('settings.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const config = configSchema.parse(request.body);
    const problem = checkBaseUrl(config.baseUrl);
    if (problem) throw badRequest(problem);
    if (config.enabled && !config.model) throw badRequest('Name the model before switching the assistant on.');
    await saveConfig(config);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.ai_configured', meta: { enabled: config.enabled, model: config.model, baseUrl: config.baseUrl }, ip: request.ip });
    return { config, credentialConfigured: credentialConfigured() };
  });

  app.post('/admin/support/conversations/:id/ai', { ...limit, preHandler: [requirePermission('tickets.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest) => {
    const staff = await requirePermission('tickets.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ action: z.enum(ACTIONS), language: z.string().trim().max(40).optional() }).parse(request.body);
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { user: { select: { firstName: true } }, messages: { orderBy: { seq: 'desc' }, take: 12, select: { body: true, internal: true, authorId: true } } },
    });
    if (!ticket) throw notFound('Conversation not found.');
    const result = await runAi(body.action, {
      number: ticket.number,
      subject: ticket.subject,
      customerFirstName: ticket.user.firstName,
      messages: ticket.messages.reverse().map((message) => ({ from: message.authorId === ticket.userId ? ('customer' as const) : ('staff' as const), internal: message.internal, body: message.body })),
    }, body.language);
    await audit({ actorId: staff.id, actorEmail: staff.email, action: 'support.ai_used', targetType: 'ticket', targetId: id, meta: { action: body.action, ok: result.ok, tokens: result.ok ? result.tokens : 0 }, ip: request.ip });
    // A draft is a draft: it is marked as not verified, and the staff member is the one who sends it.
    return result.ok ? { ok: true, text: result.text, verified: false, note: 'A draft from an assistant. Check it before you use it.' } : { ok: false, reason: result.reason, message: result.message };
  });
}
