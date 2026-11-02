import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';
import * as operations from '../services/panel/operations.js';
import * as client from '../services/pterodactyl/client.js';
import { enqueueGitDeploy } from '../services/queue.js';
import {
  GIT_RUNTIMES, cleanBranch, cleanCommand, cleanEnv, cleanRepoUrl, currentRelease, installGit, listReleases, newWebhookSecret,
  openWebhookSecret, parseEnvKeys, parseEnvValues, readLog, readStatus, uninstallGit, verifyGithubSignature, BLIPMADE_DIR,
} from '../services/git-deploy.js';

/**
 * Deploy from Git, from the Deploy tab of an instance. The build runs in the instance's own container (see
 * services/git-deploy.ts); these routes only keep the settings, queue the deployments, and read what came of them.
 */
export async function registerGitDeployRoutes(app: FastifyInstance): Promise<void> {
  const write = {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  };
  const idParam = z.object({ id: z.string() });

  async function load(request: FastifyRequest) {
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id, request.method, request.url);
    const product = await prisma.instance.findUnique({ where: { id: instance.id }, select: { product: { select: { slug: true } } } });
    return { user, instance, supported: GIT_RUNTIMES.has(product?.product.slug ?? '') };
  }

  const settingsSchema = z.object({
    repoUrl: z.string().max(300),
    branch: z.string().max(100).default('main'),
    buildCommand: z.string().max(500).default(''),
    startCommand: z.string().max(500).default('npm start'),
    autoDeploy: z.boolean().default(false),
    // Names and values of the variables of the app. A value of null keeps the value that is already there.
    env: z.record(z.string(), z.string().nullable()).optional(),
  });

  app.get('/instances/:id/git', async (request: FastifyRequest) => {
    const { instance, supported } = await load(request);
    const row = await prisma.gitDeploy.findUnique({ where: { instanceId: instance.id } });
    if (!row) return { supported, configured: false };
    const token = await operations.customerToken(instance);
    let envKeys: string[] = [];
    try {
      envKeys = parseEnvKeys((await client.readFile(token, instance.pterodactylUuid as string, `${BLIPMADE_DIR}/app.env`)).content);
    } catch {
      envKeys = [];
    }
    const [status, releases, current] = await Promise.all([readStatus(instance), listReleases(instance), currentRelease(instance)]);
    return {
      supported,
      configured: true,
      repoUrl: row.repoUrl,
      branch: row.branch,
      buildCommand: row.buildCommand,
      startCommand: row.startCommand,
      autoDeploy: row.autoDeploy,
      webhookUrl: `${process.env.PUBLIC_ORIGIN ?? 'https://blipmade.com'}/api/webhooks/github/${instance.id}`,
      hasWebhookSecret: Boolean(row.webhookSecret),
      envKeys,
      status,
      releases,
      current,
      lastDeployAt: row.lastDeployAt,
    };
  });

  app.put('/instances/:id/git', write, async (request: FastifyRequest) => {
    const { user, instance, supported } = await load(request);
    if (!supported) throw badRequest('Deploy from Git is for Node.js apps and bots for now.');
    const body = settingsSchema.parse(request.body ?? {});
    const config = {
      repoUrl: cleanRepoUrl(body.repoUrl),
      branch: cleanBranch(body.branch),
      buildCommand: cleanCommand(body.buildCommand, 'buildCommand', false),
      startCommand: cleanCommand(body.startCommand, 'startCommand', true),
    };
    const token = await operations.customerToken(instance);
    const uuid = instance.pterodactylUuid as string;

    // The variables: the customer's own values, written into the container only.
    let env: Record<string, string> | null = null;
    if (body.env) {
      let old: Record<string, string> = {};
      try {
        old = parseEnvValues((await client.readFile(token, uuid, `${BLIPMADE_DIR}/app.env`)).content);
      } catch {
        old = {};
      }
      const merged: Record<string, string> = {};
      for (const [key, value] of Object.entries(body.env)) {
        if (value === null) {
          if (key in old) merged[key] = old[key]!;
        } else {
          merged[key] = value;
        }
      }
      env = cleanEnv(merged);
    }

    const existing = await prisma.gitDeploy.findUnique({ where: { instanceId: instance.id } });
    const installed = await installGit(instance, config, env);
    let webhookSecret: string | null = null;
    let sealed = existing?.webhookSecret ?? null;
    if (body.autoDeploy && !sealed) {
      const made = newWebhookSecret();
      sealed = made.sealed;
      webhookSecret = made.plain;
    }
    await prisma.gitDeploy.upsert({
      where: { instanceId: instance.id },
      create: { instanceId: instance.id, ...config, autoDeploy: body.autoDeploy, webhookSecret: sealed, previousStartup: installed.previousStartup },
      update: { ...config, autoDeploy: body.autoDeploy, webhookSecret: sealed, ...(installed.previousStartup ? { previousStartup: installed.previousStartup } : {}) },
    });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.git_configured', targetType: 'instance', targetId: instance.id, meta: { repoUrl: config.repoUrl, branch: config.branch, autoDeploy: body.autoDeploy } });
    // The secret is shown once, when it is made.
    return { saved: true, webhookSecret };
  });

  app.post('/instances/:id/git/webhook-secret', write, async (request: FastifyRequest) => {
    const { user, instance } = await load(request);
    const row = await prisma.gitDeploy.findUnique({ where: { instanceId: instance.id } });
    if (!row) throw notFound('Set up the repository first.');
    const made = newWebhookSecret();
    await prisma.gitDeploy.update({ where: { instanceId: instance.id }, data: { webhookSecret: made.sealed } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.git_webhook_secret_rotated', targetType: 'instance', targetId: instance.id });
    return { webhookSecret: made.plain };
  });

  app.post('/instances/:id/git/deploy', write, async (request: FastifyRequest) => {
    const { user, instance } = await load(request);
    const row = await prisma.gitDeploy.findUnique({ where: { instanceId: instance.id } });
    if (!row) throw notFound('Set up the repository first.');
    const deployId = randomUUID();
    const queued = await enqueueGitDeploy({ instanceId: instance.id, deployId, action: 'build', by: user.email });
    if (!queued) throw conflict('A deployment is already waiting or running for this instance.');
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.git_deploy', targetType: 'instance', targetId: instance.id, meta: { deployId } });
    return { queued: true, deployId };
  });

  app.post('/instances/:id/git/rollback', write, async (request: FastifyRequest) => {
    const { user, instance } = await load(request);
    const { release } = z.object({ release: z.string().regex(/^\d{14}-[0-9a-f]{8}$/) }).parse(request.body ?? {});
    const row = await prisma.gitDeploy.findUnique({ where: { instanceId: instance.id } });
    if (!row) throw notFound('Set up the repository first.');
    if (!(await listReleases(instance)).includes(release)) throw notFound('That release is not there any more.');
    const deployId = randomUUID();
    const queued = await enqueueGitDeploy({ instanceId: instance.id, deployId, action: 'rollback', release, by: user.email });
    if (!queued) throw conflict('A deployment is already waiting or running for this instance.');
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.git_rollback', targetType: 'instance', targetId: instance.id, meta: { release } });
    return { queued: true, deployId };
  });

  // The history: what the worker wrote down for every deployment.
  app.get('/instances/:id/git/deployments', async (request: FastifyRequest) => {
    const { instance } = await load(request);
    const events = await prisma.instanceEvent.findMany({
      where: { instanceId: instance.id, type: 'deploy' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { message: true, createdAt: true },
    });
    const byId = new Map<string, { id: string; state: string; action: string; by: string; release: string; commit: string; message: string; at: Date; startedAt: Date | null }>();
    for (const event of events.slice().reverse()) {
      const [, id, state, ...rest] = event.message.split(':');
      if (!id || !state) continue;
      const entry = byId.get(id) ?? { id, state: 'started', action: 'build', by: '', release: '', commit: '', message: '', at: event.createdAt, startedAt: null };
      if (state === 'started') {
        entry.action = rest[0] ?? 'build';
        entry.by = rest.slice(1).join(':');
        entry.startedAt = event.createdAt;
      } else {
        entry.state = state;
        entry.release = rest[0] ?? '';
        entry.commit = rest[1] ?? '';
        entry.message = rest.slice(2).join(':');
        entry.at = event.createdAt;
      }
      byId.set(id, entry);
    }
    return { deployments: [...byId.values()].sort((a, b) => b.at.getTime() - a.at.getTime()) };
  });

  app.get('/instances/:id/git/log', async (request: FastifyRequest) => {
    const { instance } = await load(request);
    const { deploy } = z.object({ deploy: z.string() }).parse(request.query);
    try {
      return { log: await readLog(instance, deploy) };
    } catch {
      throw notFound('There is no log for that deployment.');
    }
  });

  app.delete('/instances/:id/git', write, async (request: FastifyRequest) => {
    const { user, instance } = await load(request);
    const row = await prisma.gitDeploy.findUnique({ where: { instanceId: instance.id } });
    if (!row) return { removed: false };
    await uninstallGit(instance, row.previousStartup);
    await prisma.gitDeploy.delete({ where: { instanceId: instance.id } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.git_removed', targetType: 'instance', targetId: instance.id });
    return { removed: true };
  });

  // The signed webhook of the repository. The body arrives as text, because the signature is over the exact bytes.
  app.post('/webhooks/github/:id', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute', keyGenerator: addressRateLimitKey } },
  }, async (request: FastifyRequest, reply) => {
    const { id } = idParam.parse(request.params);
    const row = await prisma.gitDeploy.findUnique({ where: { instanceId: id } });
    const secret = row?.autoDeploy ? openWebhookSecret(row.webhookSecret) : null;
    const raw = typeof request.body === 'string' ? request.body : '';
    // The same answer for an unknown instance, a repository without auto deploy and a wrong signature.
    if (!row || !secret || !verifyGithubSignature(secret, raw, request.headers['x-hub-signature-256'] as string | undefined)) {
      throw unauthorized('The signature is not correct.');
    }
    const event = String(request.headers['x-github-event'] ?? '');
    if (event === 'ping') return reply.send({ ok: true });
    if (event !== 'push') return reply.send({ ignored: event });
    let payload: { ref?: string; repository?: { html_url?: string } };
    try {
      payload = JSON.parse(raw);
    } catch {
      throw badRequest('The body is not JSON.');
    }
    // Only the branch that was chosen, and only the repository that was chosen.
    const sameRepo = String(payload.repository?.html_url ?? '').toLowerCase().replace(/\.git$/, '') === row.repoUrl.toLowerCase();
    if (payload.ref !== `refs/heads/${row.branch}` || !sameRepo) return reply.send({ ignored: 'another branch or repository' });
    const queued = await enqueueGitDeploy({ instanceId: id, deployId: randomUUID(), action: 'build', by: 'push to ' + row.branch });
    return reply.code(queued ? 202 : 200).send({ queued });
  });
}
