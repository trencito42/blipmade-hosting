import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../env.js';
import { tooMany } from './errors.js';

/**
 * The rate limit counters are kept per key. In production the key is the
 * address of the caller, which is what the limits are meant for.
 *
 * In the test environment the key carries a run number, so every test starts
 * with an empty counter. Without it the limits of one test would count against
 * the next one, which is not what the tests are about.
 */
let run = 0;

/** The number of the current test run. */
export function rateLimitRun(): number {
  return run;
}

/** Starts a new test run, so the rate limit counters start at zero. */
export function rotateRateLimitRun(): void {
  run += 1;
}

/**
 * The policy of a route: how many requests one account may send and how many
 * one address may send, inside one window.
 *
 * Every limit of a route is counted twice, once for each of the two keys:
 *
 *  - the counter of the account protects the node from one customer that asks
 *    for more than the node can carry, no matter how many addresses that
 *    customer uses;
 *  - the counter of the address protects the node from one address that opens
 *    account after account, no matter how many accounts that address uses.
 *
 * A limit that knows only one of the two keys can be walked around: the limit
 * of the address alone lets one customer exhaust the node for everybody, and
 * the limit of the account alone lets one address rotate accounts to get as
 * much as it wants. Both are counted, so both ways around are closed.
 *
 * The limit of the address is the more generous of the two, because one
 * address can be the address of several customers (a company behind one
 * gateway), while one account belongs to one customer.
 */
export interface LimitPolicy {
  /** How many requests the account of the caller may send in the window. */
  account: number;
  /** How many requests the address of the caller may send in the window. */
  address: number;
  /** The length of the window. */
  window: string;
}

/**
 * The limits of the routes, by the work the route does.
 *
 * The route that only writes a row in the database of the platform is the
 * cheapest one and may be used the most. The route that reaches the panel or
 * the node spends the memory and the disk of the node of every customer, so
 * it is the strictest one. The route that sends a message spends the mail
 * transport of the platform, so it is strict as well: an account that may
 * send ten messages in a quarter of an hour cannot turn the platform into a
 * relay.
 *
 * The routes of the back office have limits of their own: a member of the
 * staff does the work of many customers at once (an import, a
 * synchronisation), so the limit of the back office is more generous. The
 * route of the back office that reaches the panel or the queue of the mail is
 * as strict as the route of a customer, because the work it does is the same.
 */
export const LIMITS = {
  /** A route that only writes a row in the database of the platform. */
  accountWrite: { account: 30, address: 120, window: '1 minute' },
  /** A route that reaches the panel, the node or the gateway of the platform. */
  panel: { account: 20, address: 60, window: '1 minute' },
  /** A route that sends a message. */
  mail: { account: 10, address: 30, window: '15 minutes' },
  /** A route that reads a token of an account. */
  token: { account: 10, address: 10, window: '15 minutes' },
  /** A route of the back office that only writes in the database. */
  adminWrite: { account: 60, address: 120, window: '1 minute' },
  /** A route of the back office that reaches the panel, the node or the queue of the mail. */
  adminService: { account: 10, address: 30, window: '1 minute' },
} satisfies Record<string, LimitPolicy>;

/**
 * The key of the counter of an account.
 *
 * The key is the account of the caller and not the address: the limit of the
 * account is the limit of one customer, no matter how many addresses that
 * customer uses.
 *
 * A request that carries no session has no account to count, and the counter
 * of the address is the one that counts for it. The key of such a request is
 * the address of the caller, so the requests of one visitor never share the
 * counter of the whole platform.
 */
export function customerRateLimitKey(request: FastifyRequest): string {
  const customer = request.user?.id;
  const key = customer ? `customer:${customer}` : `address:${request.ip ?? 'unknown'}`;
  // In the test environment the key carries the run number, so the counters
  // of one test do not count against the next one.
  return env.isTest ? `${key}:${rateLimitRun()}` : key;
}

/**
 * The guard of the requests of one account.
 *
 * The counter of the account is a counter of its own: it shares nothing with
 * the counter of the address, so the two limits are two limits and a breach
 * of either one is refused with the same answer as the other.
 *
 * A request without a session is not counted here: there is no account to
 * count, and the counter of the address is the one that counts for it.
 */
export function customerLimit(app: FastifyInstance, policy: LimitPolicy) {
  const limiter = app.createRateLimit({
    max: policy.account,
    timeWindow: policy.window,
    keyGenerator: customerRateLimitKey,
  });

  return async (request: FastifyRequest) => {
    if (!request.user) return;
    const result = await limiter(request);
    if (result.isAllowed) return;
    if (!result.isExceeded) return;
    throw tooMany();
  };
}
