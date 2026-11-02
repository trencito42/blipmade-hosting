import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth, requirePermission, type AuthUser } from '../plugins/auth.js';
import { hasPermission } from '../lib/permissions.js';
import { forbidden } from '../lib/errors.js';
import { onSupportEvent, visibleTo, type Viewer } from '../services/support-events.js';
import { PRESENCE_WINDOW_MS } from '../services/support-availability.js';

/**
 * The live stream of the support conversations, for a customer and for the staff.
 *
 * Transport: server-sent events. The writes are ordinary requests that carry the authorization and the rate limit of
 * every other route; the stream only says "something changed". It resumes after a break: the browser sends the number
 * of the last message it saw (`Last-Event-ID`), and the messages written since then are sent first, read from the
 * database, so nothing is lost while the connection was down.
 */

const HEARTBEAT_MS = 25_000;
const CATCH_UP = 200;
const MAX_STREAMS_PER_USER = 5;

const open = new Map<string, Set<() => void>>();

function track(userId: string, close: () => void): () => void {
  const set = open.get(userId) ?? new Set<() => void>();
  open.set(userId, set);
  // The oldest connection goes when there are too many: a tab that was forgotten does not keep the new one out.
  while (set.size >= MAX_STREAMS_PER_USER) {
    const oldest = set.values().next().value as (() => void) | undefined;
    if (!oldest) break;
    set.delete(oldest);
    oldest();
  }
  set.add(close);
  return () => {
    set.delete(close);
    if (set.size === 0) open.delete(userId);
  };
}

function lastSeen(request: FastifyRequest): bigint {
  const header = request.headers['last-event-id'];
  const query = (request.query as { after?: string } | undefined)?.after;
  const raw = (Array.isArray(header) ? header[0] : header) ?? query ?? '';
  return /^\d{1,18}$/.test(raw) ? BigInt(raw) : 0n;
}

/** The stream of one reader. `user` is only who it belongs to: a customer, a staff member or a guest of the chat. */
export async function stream(request: FastifyRequest, reply: FastifyReply, user: { id: string }, viewer: Viewer): Promise<void> {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let closed = false;
  // A reader that does not keep up is not allowed to grow a queue in memory: the events are dropped until it drains, and
  // it is told to read again from the database.
  let stalled = false;
  const send = (frame: string): void => {
    if (closed) return;
    if (stalled) return;
    if (!res.write(frame)) {
      stalled = true;
      res.once('drain', () => {
        stalled = false;
        if (!closed) res.write('event: resync\ndata: {}\n\n');
      });
    }
  };

  const stop = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unlisten();
    untrack();
    res.end();
  };
  const untrack = track(user.id, stop);
  const unlisten = onSupportEvent((event) => {
    if (!visibleTo(event, viewer)) return;
    const id = event.seq ? `id: ${event.seq}\n` : '';
    send(`${id}event: ${event.type}\ndata: ${JSON.stringify({ ticketId: event.ticketId, at: event.at, ...(event.actor ? { actor: event.actor } : {}), ...(viewer.staff ? { internal: event.internal } : {}) })}\n\n`);
  });
  const heartbeat = setInterval(() => {
    send(': ping\n\n');
    if (viewer.staff) void touchPresence(user.id);
  }, HEARTBEAT_MS);
  request.raw.on('close', stop);
  request.raw.on('error', stop);

  // The presence is written before the greeting: whoever reads it after "hello" sees this connection.
  if (viewer.staff) await touchPresence(user.id);
  send(`event: hello\ndata: ${JSON.stringify({ serverTime: new Date().toISOString() })}\n\n`);

  // What was written while the connection was down.
  const after = lastSeen(request);
  if (after > 0n) {
    const missed = await prisma.ticketMessage.findMany({
      where: { seq: { gt: after }, ...(viewer.staff ? {} : { internal: false, ticket: { userId: user.id } }) },
      orderBy: { seq: 'asc' },
      take: CATCH_UP + 1,
      select: { seq: true, ticketId: true, internal: true, createdAt: true },
    });
    for (const message of missed.slice(0, CATCH_UP)) {
      send(`id: ${message.seq}\nevent: message\ndata: ${JSON.stringify({ ticketId: message.ticketId, at: message.createdAt.toISOString(), ...(viewer.staff ? { internal: message.internal } : {}) })}\n\n`);
    }
    if (missed.length > CATCH_UP) send('event: resync\ndata: {}\n\n');
  }

  await new Promise<void>((resolve) => {
    res.on('close', resolve);
    res.on('error', resolve);
  });
  stop();
}

/** The presence of a staff member: the choice they made, kept alive by their connections. */
async function touchPresence(userId: string): Promise<void> {
  try {
    const now = new Date();
    // An administrator holds every permission without a row of staff of their own; the presence belongs to a row of staff.
    await prisma.staffMember.upsert({ where: { userId }, update: {}, create: { userId, permissions: [] } });
    await prisma.supportPresence.upsert({
      where: { userId },
      // A first connection of a person who never chose a state means they are here.
      create: { userId, status: 'AVAILABLE', lastSeenAt: now },
      update: { lastSeenAt: now },
    });
  } catch {
    /* presence is a hint; a failure does not close the stream */
  }
}

export async function registerSupportStreamRoutes(app: FastifyInstance): Promise<void> {
  app.get('/support/stream', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAuth(request);
    await stream(request, reply, user, { userId: user.id, staff: false });
  });

  app.get('/admin/support/stream', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requirePermission('tickets.read')(request);
    await stream(request, reply, user, { userId: user.id, staff: true });
  });

  app.put('/admin/support/presence', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
  }, async (request: FastifyRequest) => {
    const user = await requirePermission('tickets.read')(request);
    if (!hasPermission(user.role, user.permissions, 'tickets.write')) throw forbidden('Your role does not allow "tickets.write".');
    const { status } = z.object({ status: z.enum(['AVAILABLE', 'BUSY', 'AWAY', 'OFFLINE']) }).parse(request.body);
    const now = new Date();
    await prisma.staffMember.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, permissions: [] } });
    const row = await prisma.supportPresence.upsert({
      where: { userId: user.id },
      create: { userId: user.id, status, lastSeenAt: now },
      update: { status, lastSeenAt: now },
    });
    return { presence: { status: row.status } };
  });

  /** Who is here. A person counts as present only while a connection of theirs is alive; the choice alone is not enough. */
  app.get('/admin/support/presence', async (request: FastifyRequest) => {
    await requirePermission('tickets.read')(request);
    const rows = await prisma.supportPresence.findMany({ include: { staff: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } } });
    const alive = Date.now() - PRESENCE_WINDOW_MS;
    return {
      staff: rows.map((row) => ({
        userId: row.userId,
        name: `${row.staff.user.firstName} ${row.staff.user.lastName}`.trim() || row.staff.user.email,
        chosen: row.status,
        status: row.lastSeenAt.getTime() >= alive ? row.status : 'OFFLINE',
      })),
    };
  });
}
