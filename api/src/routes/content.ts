import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requirePermission, requireStaff } from '../plugins/auth.js';
import { BLOCKS, PLACEHOLDERS, blockOf, discardDraft, publishDraft, publishedContent, rollback, saveDraft, unpublish } from '../services/content.js';

/**
 * The words of the public site: the published blocks for everyone, and the editor for the staff.
 * A draft is never visible on the site. A version goes live only by publishing it, and every
 * version stays in the history with a way back.
 */
export async function registerContentRoutes(app: FastifyInstance): Promise<void> {
  const limited = { config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } } };
  const writer = { ...limited, preHandler: [requirePermission('content.write'), customerLimit(app, LIMITS.adminWrite)] };
  const keyOf = (request: FastifyRequest) => z.object({ key: z.string() }).parse(request.params).key;

  app.get('/content', async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=60');
    return { content: await publishedContent() };
  });

  app.get('/admin/content', { preHandler: requirePermission('content.read') }, async () => {
    const rows = await prisma.contentRevision.findMany({ where: { status: { in: ['DRAFT', 'PUBLISHED'] } }, orderBy: { createdAt: 'desc' } });
    return {
      blocks: Object.entries(BLOCKS).map(([key, block]) => {
        const draft = rows.find((row) => row.key === key && row.status === 'DRAFT');
        const published = rows.find((row) => row.key === key && row.status === 'PUBLISHED');
        return { key, label: block.label, description: block.description, hasDraft: Boolean(draft), draftBy: draft?.authorEmail ?? null, published: published ? { id: published.id, at: published.publishedAt, by: published.authorEmail } : null };
      }),
      placeholders: PLACEHOLDERS,
    };
  });

  app.get('/admin/content/:key', { preHandler: requirePermission('content.read') }, async (request) => {
    const key = keyOf(request);
    const block = blockOf(key);
    const revisions = await prisma.contentRevision.findMany({ where: { key }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 });
    return {
      block: { key, label: block.label, description: block.description, example: block.example },
      draft: revisions.find((row) => row.status === 'DRAFT') ?? null,
      published: revisions.find((row) => row.status === 'PUBLISHED') ?? null,
      history: revisions.filter((row) => row.status !== 'DRAFT').map((row) => ({ id: row.id, status: row.status, note: row.note, by: row.authorEmail, at: row.publishedAt ?? row.createdAt, data: row.data })),
    };
  });

  app.put('/admin/content/:key/draft', writer, async (request) => {
    const actor = await requireStaff(request);
    const key = keyOf(request);
    const body = z.object({ data: z.unknown(), note: z.string().max(200).optional() }).strict().parse(request.body ?? {});
    const draft = await saveDraft(key, body.data, actor, body.note);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'content.draft_saved', targetType: 'content', targetId: key, ip: request.ip });
    return { draft };
  });

  app.delete('/admin/content/:key/draft', writer, async (request) => {
    const actor = await requireStaff(request);
    const key = keyOf(request);
    await discardDraft(key);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'content.draft_discarded', targetType: 'content', targetId: key, ip: request.ip });
    return { ok: true };
  });

  app.post('/admin/content/:key/publish', writer, async (request) => {
    const actor = await requireStaff(request);
    const key = keyOf(request);
    const published = await publishDraft(key, actor);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'content.published', targetType: 'content', targetId: key, meta: { revision: published.id }, ip: request.ip });
    return { published };
  });

  app.post('/admin/content/:key/unpublish', writer, async (request) => {
    const actor = await requireStaff(request);
    const key = keyOf(request);
    await unpublish(key);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'content.unpublished', targetType: 'content', targetId: key, ip: request.ip });
    return { ok: true };
  });

  app.post('/admin/content/:key/rollback', writer, async (request) => {
    const actor = await requireStaff(request);
    const key = keyOf(request);
    const { revisionId } = z.object({ revisionId: z.string() }).strict().parse(request.body ?? {});
    const published = await rollback(key, revisionId, actor);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'content.rolled_back', targetType: 'content', targetId: key, meta: { to: revisionId, revision: published.id }, ip: request.ip });
    return { published };
  });
}
