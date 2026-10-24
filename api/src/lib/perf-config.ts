import { z } from 'zod';

/**
 * The limits of the runtime of the API.
 *
 * They live in their own file and not in `env.ts` on purpose: `env.ts` holds
 * the description of the platform (the database, the keys, the origins) and it
 * is read by every part of the stack, while these values are the limits of
 * this one process. Keeping them apart also means that a change here cannot
 * collide with a change of the configuration of the platform.
 *
 * Every limit is read from the environment, so an operator can change it
 * without a new image:
 *
 *   API_REQUEST_TIMEOUT_MS    the whole request must be received in this time
 *   API_CONNECTION_TIMEOUT_MS the socket may be silent for this long
 *   API_KEEPALIVE_TIMEOUT_MS  an idle connection is kept for this long
 *   API_SHUTDOWN_TIMEOUT_MS   the drain of the requests may take this long
 *   METRICS_HOST              the address the metrics endpoint listens on
 *   METRICS_PORT              the port the metrics endpoint listens on
 *   METRICS_TOKEN             the key the metrics endpoint asks for
 *
 * The value `0` means "no limit" and brings back the behaviour the server had
 * before these limits existed, so a limit can be turned off without a change
 * of the code.
 */

/** An empty value means "not set", and not the number zero. */
const fromEnvironment = (fallback: number, min: number, max: number) =>
  z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? fallback : value),
      z.coerce.number().int().min(min).max(max),
    )
    .default(fallback);

const schema = z.object({
  /**
   * The whole request (the head and the body) must be received in this time.
   *
   * The API is behind the web container, so a request that arrives here has
   * already travelled over the local network and the body is at most a few
   * megabytes. Thirty seconds is therefore generous for a real request and
   * short enough for a client that opens a socket and stops writing: such a
   * socket used to stay open for ever.
   */
  API_REQUEST_TIMEOUT_MS: fromEnvironment(30_000, 0, 3_600_000),

  /**
   * The socket may be silent for this long before the server gives it up.
   *
   * This is the limit of the handler as well: a request that runs longer than
   * this without writing to the socket is cut off. The longest call the API
   * makes to another service is the panel, which gives up after twenty
   * seconds, so forty-five seconds leaves room for the answer of the panel
   * and for the work that follows it.
   */
  API_CONNECTION_TIMEOUT_MS: fromEnvironment(45_000, 0, 3_600_000),

  /**
   * How long an idle connection is kept open.
   *
   * The web container reuses its connections to the API, so a short time
   * would mean a new connection for every request that comes after a pause.
   * Fifteen seconds is long enough for the reuse to pay off and short enough
   * that a socket is not held for nothing. (The server kept them for seventy
   * two seconds before.)
   */
  API_KEEPALIVE_TIMEOUT_MS: fromEnvironment(15_000, 0, 3_600_000),

  /**
   * How long the requests that are running may take to finish when the
   * process is asked to stop.
   *
   * The container is given ten seconds by Docker before it is killed, so the
   * deadline is shorter than that: the process leaves by itself, with a clear
   * status, instead of being killed. The requests that are still running when
   * the deadline is reached are cut off on purpose, and the journal says so.
   */
  API_SHUTDOWN_TIMEOUT_MS: fromEnvironment(8_000, 100, 600_000),

  /**
   * The address the metrics endpoint listens on.
   *
   * The default is the loopback of the container, so the endpoint is not
   * reachable from the network of the containers. An operator who runs a
   * collector in the same network sets this to `0.0.0.0` and gives the
   * endpoint a token.
   */
  METRICS_HOST: z.string().trim().min(1).default('127.0.0.1'),

  /** The port the metrics endpoint listens on. It is not published by the compose file. */
  METRICS_PORT: fromEnvironment(3109, 0, 65_535),

  /**
   * The key the metrics endpoint asks for.
   *
   * The endpoint stays closed while this is empty: without a key there is
   * nothing to ask for, and an endpoint that answers without a key would
   * publish the traffic of the platform to everyone who can reach the port.
   */
  METRICS_TOKEN: z.string().default(''),
});

export interface PerfConfig {
  /** The whole request must be received in this time. `0` means no limit. */
  requestTimeoutMs: number;
  /** The socket may be silent for this long. `0` means no limit. */
  connectionTimeoutMs: number;
  /** An idle connection is kept for this long. `0` means the default of the server. */
  keepAliveTimeoutMs: number;
  /** The drain of the requests may take this long. */
  shutdownTimeoutMs: number;
  /** The address the metrics endpoint listens on. */
  metricsHost: string;
  /** The port the metrics endpoint listens on. */
  metricsPort: number;
  /** The key the metrics endpoint asks for. An empty key keeps it closed. */
  metricsToken: string;
}

/**
 * Reads the limits out of an environment.
 *
 * The function is pure on purpose: the limits can be checked without a
 * server and without an environment.
 */
export function parsePerfConfig(raw: Record<string, string | undefined>): PerfConfig {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid performance configuration:\n${issues}`);
  }
  const value = parsed.data;
  return {
    requestTimeoutMs: value.API_REQUEST_TIMEOUT_MS,
    connectionTimeoutMs: value.API_CONNECTION_TIMEOUT_MS,
    keepAliveTimeoutMs: value.API_KEEPALIVE_TIMEOUT_MS,
    shutdownTimeoutMs: value.API_SHUTDOWN_TIMEOUT_MS,
    metricsHost: value.METRICS_HOST,
    metricsPort: value.METRICS_PORT,
    metricsToken: value.METRICS_TOKEN,
  };
}

/** The limits of this process. */
export const perfConfig: PerfConfig = parsePerfConfig(process.env);
