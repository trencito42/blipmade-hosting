import type { Redis } from 'ioredis';
import { redis } from '../redis.js';

/**
 * The live events of the support conversations.
 *
 * An event is a hint that something changed: it names the conversation and carries no text. The reader asks the API for
 * the text, so the rules about who may read a message are applied in one place. Every API process takes the events from
 * one Redis channel, so a customer connected to one process hears the answer written through another. When Redis does
 * not answer, the events stay inside the process: the conversation is still saved, and the stream is only less live.
 */

export interface SupportEvent {
  type: 'created' | 'message' | 'attachment' | 'status' | 'assigned' | 'typing';
  /** Who caused a typing event, so a person does not hear their own. */
  actor?: 'customer' | 'staff';
  ticketId: string;
  /** The customer the conversation belongs to. */
  ownerId: string;
  /** An internal note: only the staff hears of it. */
  internal: boolean;
  /** The order number of the message, for the events that are a message. */
  seq?: string;
  at: string;
}

export interface Viewer {
  userId: string;
  staff: boolean;
}

/** Whether a viewer may hear of an event. Applied to every event of every stream, not only when the stream opens. */
export function visibleTo(event: SupportEvent, viewer: Viewer): boolean {
  if (viewer.staff) return true;
  if (event.type === 'typing' && event.actor === 'customer') return false;
  return event.ownerId === viewer.userId && !event.internal;
}

const CHANNEL = 'support:events';
type Listener = (event: SupportEvent) => void;
const listeners = new Set<Listener>();
let subscriber: Redis | null = null;

function dispatch(event: SupportEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* one broken stream must not stop the others */
    }
  }
}

function ensureSubscriber(): void {
  if (subscriber) return;
  subscriber = redis.duplicate();
  subscriber.on('error', () => undefined);
  subscriber.on('message', (_channel, payload) => {
    try {
      dispatch(JSON.parse(payload) as SupportEvent);
    } catch {
      /* a payload that is not an event is ignored */
    }
  });
  void subscriber.subscribe(CHANNEL).catch(() => undefined);
}

/** Listens to the events of every process. Returns the function that stops listening. */
export function onSupportEvent(listener: Listener): () => void {
  ensureSubscriber();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tells the streams that a conversation changed. It never throws: the change is already in the database. */
export async function publishSupportEvent(input: Omit<SupportEvent, 'at'>): Promise<void> {
  const event: SupportEvent = { ...input, at: new Date().toISOString() };
  try {
    ensureSubscriber();
    const receivers = await redis.publish(CHANNEL, JSON.stringify(event));
    if (receivers === 0) dispatch(event);
  } catch {
    dispatch(event);
  }
}

/** Closes the connection to Redis. Used when the application stops and by the tests. */
export async function closeSupportEvents(): Promise<void> {
  listeners.clear();
  const current = subscriber;
  subscriber = null;
  if (current) await current.quit().catch(() => undefined);
}
