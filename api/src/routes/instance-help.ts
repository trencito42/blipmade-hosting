import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import * as operations from '../services/panel/operations.js';
import * as client from '../services/pterodactyl/client.js';
import { diagnose, redact, tail } from '../services/diagnosis.js';
import { readStatus } from '../services/git-deploy.js';
import { requireAuth } from '../plugins/auth.js';

/**
 * Help for a server that does not start: what its logs say in plain words, and a ticket text with the facts support
 * asks for first, with the secrets taken out.
 */
export async function registerInstanceHelpRoutes(app: FastifyInstance): Promise<void> {
  async function gather(request: FastifyRequest) {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id, request.method, request.url);
    const row = await prisma.instance.findUnique({
      where: { id: instance.id },
      select: { name: true, status: true, ram: true, cpu: true, disk: true, product: { select: { slug: true, name: true } } },
    });
    const token = await operations.customerToken(instance);
    const uuid = instance.pterodactylUuid as string;
    // The places a server writes why it stopped: the game log, and the log of the last Git deployment.
    const sources: { name: string; text: string }[] = [];
    try {
      sources.push({ name: 'logs/latest.log', text: (await client.readFile(token, uuid, '/logs/latest.log')).content });
    } catch { /* no game log */ }
    try {
      const status = await readStatus(instance);
      if (status.id) sources.push({ name: 'the last deployment', text: (await client.readFile(token, uuid, `/.blipmade/logs/${status.id}.log`)).content });
    } catch { /* no deployment */ }
    return { instance, row, sources };
  }

  app.get('/instances/:id/diagnose', async (request: FastifyRequest) => {
    const { row, sources } = await gather(request);
    const text = sources.map((source) => tail(source.text, 200)).join('\n');
    return {
      findings: diagnose(text, row?.product.slug ?? ''),
      looked: sources.map((source) => source.name),
    };
  });

  app.get('/instances/:id/support-bundle', async (request: FastifyRequest) => {
    const { instance, row, sources } = await gather(request);
    const events = await prisma.instanceEvent.findMany({ where: { instanceId: instance.id }, orderBy: { createdAt: 'desc' }, take: 10, select: { type: true, message: true, createdAt: true } });
    const text = sources.map((source) => tail(source.text, 200)).join('\n');
    const findings = diagnose(text, row?.product.slug ?? '');
    const lines = [
      `Product: ${row?.product.name ?? 'unknown'} (${row?.product.slug ?? ''})`,
      `Name: ${row?.name ?? ''}`,
      `Status: ${row?.status ?? ''} · ${row?.ram ?? 0} MB, ${row?.cpu ?? 0} CPU, ${row?.disk ?? 0} GB`,
      '',
      findings.length ? `What the platform found:\n${findings.map((entry) => `- ${entry.title}`).join('\n')}` : 'The platform found no known cause in the logs.',
      '',
      'Latest events:',
      ...events.map((event) => `- ${event.createdAt.toISOString().slice(0, 16).replace('T', ' ')} ${event.type}: ${redact(event.message).slice(0, 160)}`),
      ...sources.flatMap((source) => ['', `Last lines of ${source.name} (secrets removed):`, redact(tail(source.text, 40))]),
      '',
      'What I was doing and what I expected:',
      '',
    ];
    return { subject: `Help with ${row?.name ?? 'my server'}`, body: lines.join('\n'), instanceId: instance.id };
  });
}
