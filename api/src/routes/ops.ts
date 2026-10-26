import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { requirePermission } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { env } from '../env.js';
import {
  acknowledgeOpsFinding,
  listOpsAlerts,
  opsChannels,
  opsHealthSnapshot,
  type OpsCheckId,
} from '../services/ops-health.js';

/**
 * The dashboard of the operations.
 *
 * These routes are the place where the operator looks at the platform itself
 * instead of at the customers. They answer three questions: is the platform
 * well, what was said about it, and could an alarm have reached the operator
 * if the mail server had been down.
 *
 * Every route of this part carries a limit, like every other route of the
 * back office: a dashboard that is polled by accident must not be able to
 * turn the platform into a machine that answers questions.
 *
 * The permission is the one of the infrastructure, because everything that
 * is shown here is about the machine and not about a customer.
 */

const CHECK_IDS = [
  'provisioning',
  'webhooks',
  'delivery',
  'backup',
  'offsite',
  'restore',
  'mailcow',
  'capacity',
  'certificate',
  'incident',
  'security',
] as const;

/**
 * The file in which an operator declares an incident.
 *
 * The incident is a file and not a row of the database, because it has to
 * survive a platform that cannot reach its own database, and because it has
 * to be readable by the scripts of the host.
 */
function incidentPath(): string {
  return join(env.opsStatusDir, 'incident.json');
}

export async function registerOpsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The state of the platform.
   */
  app.get('/ops/health', { preHandler: requirePermission('infrastructure.read') }, async () => {
    const snapshot = await opsHealthSnapshot();
    return snapshot;
  });

  /**
   * The alarms that were sent, and what the platform remembers about them.
   */
  app.get('/ops/alerts', { preHandler: requirePermission('infrastructure.read') }, async (request: FastifyRequest) => {
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(200).optional() })
      .parse(request.query ?? {});
    return listOpsAlerts(query.limit ?? 50);
  });

  /**
   * The channels an alarm can travel by.
   */
  app.get('/ops/channels', { preHandler: requirePermission('infrastructure.read') }, async () => {
    return opsChannels();
  });

  /**
   * An operator takes a finding in hand.
   *
   * The alarm of a finding that is acknowledged is not sent again until the
   * finding itself changes, so the person who is working on a problem is not
   * buried under it.
   */
  app.post(
    '/ops/checks/:id/ack',
    { preHandler: [requirePermission('infrastructure.write'), customerLimit(app, LIMITS.adminWrite)] },
    async (request: FastifyRequest) => {
      const params = z.object({ id: z.enum(CHECK_IDS) }).parse(request.params ?? {});
      const body = z
        .object({ fingerprint: z.string().trim().max(200).optional(), note: z.string().trim().max(500).optional() })
        .parse(request.body ?? {});

      const acknowledged = await acknowledgeOpsFinding(
        params.id as OpsCheckId,
        body.fingerprint,
      );
      if (!acknowledged) {
        throw notFound('There is no finding of this check that is waiting for an operator.');
      }

      await audit({
        actorId: request.user?.id ?? null,
        actorEmail: request.user?.email ?? null,
        action: 'ops.finding_acknowledged',
        targetType: 'ops_check',
        targetId: params.id,
        meta: { fingerprint: body.fingerprint ?? null, note: body.note ?? null },
      });

      return { ok: true };
    },
  );

  /**
   * An operator declares an incident.
   *
   * The sweep of the health of the platform turns the incident into an alarm,
   * so the platform says out loud what the operator already knows.
   */
  app.post(
    '/ops/incident',
    { preHandler: [requirePermission('infrastructure.write'), customerLimit(app, LIMITS.adminWrite)] },
    async (request: FastifyRequest) => {
      const body = z
        .object({
          message: z.string().trim().min(3).max(500),
          until: z.string().trim().datetime().nullable().optional(),
        })
        .parse(request.body ?? {});

      const until = body.until ? new Date(body.until) : null;
      if (until && Number.isNaN(until.getTime())) {
        throw badRequest('The end of the incident is not a moment in time.');
      }

      try {
        await mkdir(env.opsStatusDir, { recursive: true });
        await writeFile(
          incidentPath(),
          `${JSON.stringify({ message: body.message, until: until ? until.toISOString() : null, declaredAt: new Date().toISOString() }, null, 2)}\n`,
          { mode: 0o644 },
        );
      } catch (error) {
        throw badRequest(`The incident could not be written: ${(error as Error).message}`);
      }

      await audit({
        actorId: request.user?.id ?? null,
        actorEmail: request.user?.email ?? null,
        action: 'ops.incident_declared',
        targetType: 'ops_incident',
        targetId: 'platform',
        meta: { message: body.message, until: until ? until.toISOString() : null },
      });

      return { ok: true };
    },
  );

  /**
   * An operator closes the incident.
   */
  app.delete(
    '/ops/incident',
    { preHandler: [requirePermission('infrastructure.write'), customerLimit(app, LIMITS.adminWrite)] },
    async (request: FastifyRequest) => {
      try {
        await mkdir(env.opsStatusDir, { recursive: true });
        await writeFile(
          incidentPath(),
          `${JSON.stringify({ message: '', until: null, closedAt: new Date().toISOString() }, null, 2)}\n`,
          { mode: 0o644 },
        );
      } catch (error) {
        throw badRequest(`The incident could not be closed: ${(error as Error).message}`);
      }

      await audit({
        actorId: request.user?.id ?? null,
        actorEmail: request.user?.email ?? null,
        action: 'ops.incident_closed',
        targetType: 'ops_incident',
        targetId: 'platform',
      });

      return { ok: true };
    },
  );
}
