import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';
import * as mail from '../services/mail.js';

/**
 * The routes of the hosted mail.
 *
 * A customer sees only the mail of their own domains: every read and every
 * change is bound to the customer that asked for it, inside the service.
 *
 * The routes of the mail are limited like the routes of a server: a customer
 * that adds domains, mailboxes and aliases spends the resources of the mail
 * server of everybody.
 */

export async function registerMailRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Where the customer reads the mail of a domain of mail.
   *
   * The address comes from the environment of the platform and not from the
   * interface: the customer is sent to the webmail of the platform and never
   * to an address that was written in the source of the page.
   */
  app.get('/mail/webmail', async (request: FastifyRequest) => {
    await requireAuth(request);
    return { url: env.MAIL_WEBMAIL_URL || null, configured: Boolean(env.MAIL_WEBMAIL_URL) };
  });

  app.get('/mail/domains', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    return { domains: await mail.listMailDomains(user.id) };
  });

  app.get('/mail/domains/:id', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    return { domain: await mail.getMailDomain(user.id, id) };
  });

  /**
   * Hosts a domain of mail.
   *
   * The domain has to be a domain the customer owns. The platform does not
   * prove that here: it tells the customer which records of DNS to publish,
   * and the mail of the domain is delivered only when they are published.
   */
  app.post('/mail/domains', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAuth(request);
    const { name } = z.object({ name: z.string().min(1).max(253) }).parse(request.body ?? {});
    const domain = await mail.createMailDomain(user, name);
    return reply.code(201).send({ domain });
  });

  app.delete('/mail/domains/:id', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await mail.deleteMailDomain(user, id);
    return { ok: true };
  });

  app.get('/mail/domains/:id/mailboxes', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    return { mailboxes: await mail.listMailboxes(user.id, id) };
  });

  /**
   * Adds a mailbox to a domain.
   *
   * When the customer brings no password, the platform makes one and answers
   * with it. The password is in the answer and nowhere else: it is not
   * written to the database, not to a log and not to the address of the page.
   */
  app.post('/mail/domains/:id/mailboxes', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { localPart, password } = z
      .object({ localPart: z.string().min(1).max(64), password: z.string().min(10).max(200).optional() })
      .parse(request.body ?? {});
    const mailbox = await mail.createMailbox(user, id, localPart, password);
    return reply.code(201).send({ mailbox });
  });

  app.delete('/mail/domains/:id/mailboxes/:mailboxId', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id, mailboxId } = z
      .object({ id: z.string().min(1), mailboxId: z.string().min(1) })
      .parse(request.params);
    await mail.deleteMailbox(user, id, mailboxId);
    return { ok: true };
  });

  app.get('/mail/domains/:id/aliases', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    return { aliases: await mail.listAliases(user.id, id) };
  });

  app.post('/mail/domains/:id/aliases', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { alias, target } = z
      .object({ alias: z.string().min(1).max(64), target: z.string().min(1).max(253) })
      .parse(request.body ?? {});
    const created = await mail.createAlias(user, id, alias, target);
    return reply.code(201).send({ alias: created });
  });

  app.delete('/mail/domains/:id/aliases/:aliasId', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id, aliasId } = z
      .object({ id: z.string().min(1), aliasId: z.string().min(1) })
      .parse(request.params);
    await mail.deleteAlias(user, id, aliasId);
    return { ok: true };
  });

  /**
   * The records of DNS of a domain, and what is really published.
   *
   * The check is a real lookup, so it costs a trip to the DNS of the world.
   * It is made when the customer asks for it and not on a timer, because
   * nothing changes between two checks of the same customer.
   */
  app.get('/mail/domains/:id/dns', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const status = await mail.mailDnsStatus(user.id, id);
    return { records: status.records, verified: status.verified, missing: status.missing, results: status.results };
  });
}
