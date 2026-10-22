import { Redis } from 'ioredis';
import { env } from './env.js';

/**
 * A single Redis connection is shared for the API and reused by BullMQ.
 * BullMQ requires `maxRetriesPerRequest: null` on connections it owns.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
});

redis.on('error', (err: Error) => {
  // Redis errors are surfaced through the health endpoint; never crash the API.
  console.error('[redis]', err.message);
});

export async function redisPing(): Promise<boolean> {
  try {
    const res = await redis.ping();
    return res === 'PONG';
  } catch {
    return false;
  }
}
