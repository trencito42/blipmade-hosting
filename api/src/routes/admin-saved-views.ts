import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { conflict, notFound } from '../lib/errors.js';
import { requireStaff } from '../plugins/auth.js';

const scope = z.enum(['customers', 'orders', 'services', 'tickets']);
const queryValue = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);
const query = z.record(z.string().max(40), queryValue).refine(
  (value) => JSON.stringify(value).length <= 4_096,
  'The saved view is too large.',
);

const listed = {
  id: true,
  scope: true,
  name: true,
  query: true,
  createdAt: true,
} satisfies Prisma.AdminSavedViewSelect;

export async function registerAdminSavedViewRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/saved-views', { preHandler: requireStaff }, async (request: FastifyRequest) => {
    const parsed = z.object({ scope }).parse(request.query ?? {});
    const views = await prisma.adminSavedView.findMany({
      where: { userId: request.user!.id, scope: parsed.scope },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      select: listed,
    });
    return { views };
  });

  app.post('/admin/saved-views', { preHandler: requireStaff }, async (request: FastifyRequest) => {
    const body = z.object({
      scope,
      name: z.string().trim().min(1).max(80),
      query,
    }).strict().parse(request.body ?? {});
    try {
      const view = await prisma.adminSavedView.create({
        data: { userId: request.user!.id, scope: body.scope, name: body.name, query: body.query },
        select: listed,
      });
      return { view };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict('A view with this name already exists in this list.');
      }
      throw error;
    }
  });

  app.delete('/admin/saved-views', { preHandler: requireStaff }, async (request: FastifyRequest) => {
    const parsed = z.object({ scope, id: z.string().min(1).max(100) }).parse(request.query ?? {});
    const removed = await prisma.adminSavedView.deleteMany({
      where: { id: parsed.id, userId: request.user!.id, scope: parsed.scope },
    });
    if (!removed.count) throw notFound('Saved view not found.');
    return { ok: true };
  });
}
