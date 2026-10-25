import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { FastifyRequest } from 'fastify';

/**
 * The measures of the API.
 *
 * They are written in the text format of Prometheus, which every collector
 * understands. The measures are kept in the memory of the process and are
 * given away by a listener of their own, which is not the one the public
 * traffic arrives on.
 */

/** The buckets of the duration, in seconds. */
const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/** The route of a request that matched nothing. */
const UNMATCHED_ROUTE = 'unmatched';

/**
 * The status of a request that the client gave up on.
 *
 * The client closed the connection before the answer was ready, so there is
 * no status of the server to report. 499 is the number that is used for it.
 */
const CLIENT_CLOSED_REQUEST = 499;

/** Escapes the value of a label. */
function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** A histogram of the durations. */
class DurationHistogram {
  private readonly counts: number[] = DURATION_BUCKETS.map(() => 0);
  private sum = 0;
  private count = 0;

  observe(seconds: number): void {
    for (let index = 0; index < DURATION_BUCKETS.length; index += 1) {
      if (seconds <= DURATION_BUCKETS[index]!) this.counts[index] = (this.counts[index] ?? 0) + 1;
    }
    this.sum += seconds;
    this.count += 1;
  }

  render(name: string, labels: string): string[] {
    const lines: string[] = [];
    let running = 0;
    for (let index = 0; index < DURATION_BUCKETS.length; index += 1) {
      running += this.counts[index] ?? 0;
      lines.push(`${name}_bucket{${labels},le="${DURATION_BUCKETS[index]}"} ${running}`);
    }
    lines.push(`${name}_bucket{${labels},le="+Inf"} ${this.count}`);
    lines.push(`${name}_sum{${labels}} ${this.sum}`);
    lines.push(`${name}_count{${labels}} ${this.count}`);
    return lines;
  }
}

/** The measures of the process. */
export class MetricsRegistry {
  private readonly requests = new Map<string, { route: string; method: string; status: string; value: number }>();
  private readonly durations = new Map<string, { route: string; method: string; histogram: DurationHistogram }>();
  private inFlight = 0;
  private deadLetterPending: number | null = null;
  private deadLetterPendingMax = 0;

  /** The requests that are running at this moment. */
  get inFlightRequests(): number {
    return this.inFlight;
  }

  /**
   * The jobs that failed for good and are waiting for an operator.
   *
   * The number is `null` until the queue has been looked at, so a process
   * that never watched the queue does not publish a zero: a zero says that
   * no customer is waiting for an operator, and that would not be true.
   */
  get deadLetterPendingJobs(): number | null {
    return this.deadLetterPending;
  }

  /**
   * The number of jobs that are waiting for an operator.
   *
   * The number is given by the process that watches the dead-letter queue,
   * so it is the number of that process and not the number of the whole
   * platform. The highest number that was seen is kept as well, because a
   * queue that was emptied says nothing about the queue that grew while
   * nobody was looking.
   */
  setDeadLetterPending(count: number): void {
    const value = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    this.deadLetterPending = value;
    if (value > this.deadLetterPendingMax) this.deadLetterPendingMax = value;
  }

  /** A request has arrived. */
  beginRequest(): void {
    this.inFlight += 1;
  }

  /**
   * A request is over.
   *
   * The route is the pattern of the route (`/api/catalog/products`) and not
   * the address that was asked for, so the number of the measures does not
   * grow with the number of the addresses a client invents.
   */
  observeRequest(route: string, method: string, status: number, seconds: number): void {
    const label = escapeLabel(route);
    const statusLabel = String(status);

    const requestKey = `${route}|${method}|${statusLabel}`;
    const request = this.requests.get(requestKey);
    if (request) request.value += 1;
    else this.requests.set(requestKey, { route: label, method, status: statusLabel, value: 1 });

    const durationKey = `${route}|${method}`;
    const duration = this.durations.get(durationKey);
    if (duration) duration.histogram.observe(seconds);
    else this.durations.set(durationKey, { route: label, method, histogram: new DurationHistogram() });
  }

  /** A request is over and its number of requests is taken down. */
  endRequest(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  /** The measures in the text format of Prometheus. */
  render(): string {
    const lines: string[] = [];

    lines.push('# HELP bm_http_requests_total The requests that the API answered.');
    lines.push('# TYPE bm_http_requests_total counter');
    for (const entry of this.requests.values()) {
      lines.push(
        `bm_http_requests_total{route="${entry.route}",method="${entry.method}",status="${entry.status}"} ${entry.value}`,
      );
    }

    lines.push('# HELP bm_http_request_duration_seconds How long the requests of the API took.');
    lines.push('# TYPE bm_http_request_duration_seconds histogram');
    for (const entry of this.durations.values()) {
      lines.push(...entry.histogram.render('bm_http_request_duration_seconds', `route="${entry.route}",method="${entry.method}"`));
    }

    lines.push('# HELP bm_http_in_flight_requests The requests that are running at this moment.');
    lines.push('# TYPE bm_http_in_flight_requests gauge');
    lines.push(`bm_http_in_flight_requests ${this.inFlight}`);

    // The gauge of the dead-letter queue is written only after the queue has
    // been looked at, so a process that never watched it publishes nothing
    // rather than a zero that says that no customer is waiting.
    if (this.deadLetterPending !== null) {
      lines.push('# HELP bm_dead_letter_pending_jobs The jobs that failed for good and are waiting for an operator.');
      lines.push('# TYPE bm_dead_letter_pending_jobs gauge');
      lines.push(`bm_dead_letter_pending_jobs ${this.deadLetterPending}`);
      lines.push('# HELP bm_dead_letter_pending_jobs_max The highest number of jobs that were waiting for an operator since the process started.');
      lines.push('# TYPE bm_dead_letter_pending_jobs_max gauge');
      lines.push(`bm_dead_letter_pending_jobs_max ${this.deadLetterPendingMax}`);
    }

    const memory = process.memoryUsage();
    lines.push('# HELP bm_process_resident_memory_bytes The memory of the process that the system holds.');
    lines.push('# TYPE bm_process_resident_memory_bytes gauge');
    lines.push(`bm_process_resident_memory_bytes ${memory.rss}`);
    lines.push('# HELP bm_process_heap_used_bytes The heap of the process that is in use.');
    lines.push('# TYPE bm_process_heap_used_bytes gauge');
    lines.push(`bm_process_heap_used_bytes ${memory.heapUsed}`);
    lines.push('# HELP bm_process_uptime_seconds How long the process has been running.');
    lines.push('# TYPE bm_process_uptime_seconds gauge');
    lines.push(`bm_process_uptime_seconds ${process.uptime()}`);

    const lag = eventLoopLag();
    lines.push('# HELP bm_nodejs_eventloop_lag_seconds How late the event loop was.');
    lines.push('# TYPE bm_nodejs_eventloop_lag_seconds gauge');
    for (const quantile of [50, 90, 99]) {
      lines.push(
        `bm_nodejs_eventloop_lag_seconds{quantile="${(quantile / 100).toFixed(2)}"} ${lag.percentiles[quantile] ?? 0}`,
      );
    }
    lines.push('# HELP bm_nodejs_eventloop_lag_seconds_max The largest delay of the event loop.');
    lines.push('# TYPE bm_nodejs_eventloop_lag_seconds_max gauge');
    lines.push(`bm_nodejs_eventloop_lag_seconds_max ${lag.max}`);

    return `${lines.join('\n')}\n`;
  }
}

/** The measures of this process. */
export const registry = new MetricsRegistry();

/* ------------------------------------------------------------------ *
 * The delay of the event loop.
 * ------------------------------------------------------------------ */

let lagHistogram: ReturnType<typeof monitorEventLoopDelay> | null = null;
let lagTimer: NodeJS.Timeout | null = null;

/**
 * The delay of the event loop, in seconds.
 *
 * The measure is taken over the last ten seconds: the histogram is emptied
 * every ten seconds, so the numbers are the delay of the moment and not the
 * delay of the whole life of the process.
 */
function eventLoopLag(): { percentiles: Record<number, number>; max: number } {
  if (!lagHistogram) {
    lagHistogram = monitorEventLoopDelay({ resolution: 20 });
    lagHistogram.enable();
    lagTimer = setInterval(() => lagHistogram?.reset(), 10_000);
    // The measure must not keep the process alive.
    lagTimer.unref();
  }
  const percentiles: Record<number, number> = {};
  for (const quantile of [50, 90, 99]) {
    const value = lagHistogram.percentile(quantile);
    percentiles[quantile] = Number.isFinite(value) ? value / 1e9 : 0;
  }
  const max = Number.isFinite(lagHistogram.max) ? lagHistogram.max / 1e9 : 0;
  return { percentiles, max };
}

/* ------------------------------------------------------------------ *
 * The measuring of the requests.
 * ------------------------------------------------------------------ */

interface RequestState {
  at: bigint;
  done: boolean;
}

const states = new WeakMap<FastifyRequest, RequestState>();

/** The route of a request, as the pattern of the route. */
function routeOf(request: FastifyRequest): string {
  const url = (request.routeOptions as { url?: string } | undefined)?.url;
  return url ?? UNMATCHED_ROUTE;
}

/** A request has arrived. */
export function beginRequest(request: FastifyRequest): void {
  states.set(request, { at: process.hrtime.bigint(), done: false });
  registry.beginRequest();
}

/**
 * A request is over.
 *
 * The function may be called twice for one request: once when the answer is
 * on its way and once when the connection is closed. Only the first call
 * counts.
 */
export function endRequest(request: FastifyRequest, status: number): void {
  const state = states.get(request);
  if (!state || state.done) return;
  state.done = true;
  states.delete(request);
  registry.endRequest();
  const seconds = Number(process.hrtime.bigint() - state.at) / 1e9;
  registry.observeRequest(routeOf(request), request.method, status, seconds);
}

/** A request that the client gave up on. */
export function endAbortedRequest(request: FastifyRequest): void {
  endRequest(request, CLIENT_CLOSED_REQUEST);
}

/* ------------------------------------------------------------------ *
 * The endpoint that gives the measures away.
 * ------------------------------------------------------------------ */

export interface MetricsLog {
  info: (payload: unknown, message?: string) => void;
  warn: (payload: unknown, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
}

export interface MetricsServerOptions {
  /** Whether the endpoint is wanted at all. */
  enabled: boolean;
  /** The address it listens on. The loopback of the container by default. */
  host: string;
  /** The port it listens on. */
  port: number;
  /** The key it asks for. Without a key the endpoint stays closed. */
  token: string;
  /** The measures it gives away. */
  registry?: MetricsRegistry;
  /** Where it writes what it does. */
  log?: MetricsLog;
}

export interface MetricsServer {
  /** Whether the endpoint listens. */
  readonly started: boolean;
  /** The port it listens on. */
  readonly port: number;
  /** The address it can be reached at. */
  readonly url: string;
  /** Resolves when the endpoint listens, and rejects when it cannot. */
  readonly ready: Promise<void>;
  /** Stops the endpoint. */
  close(): Promise<void>;
}

/** Compares two keys without telling how much of them was right. */
function sameSecret(carried: string, expected: string): boolean {
  const left = createHash('sha256').update(carried).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

/**
 * Starts the endpoint that gives the measures away.
 *
 * The endpoint listens on a port of its own, and not on the port the public
 * traffic arrives on: the web container forwards every path that begins with
 * `/api`, so a path on the public listener would be read by anyone who can
 * reach the site. The listener of the measures is bound to the loopback of
 * the container, so it is not reachable from the network of the containers
 * either.
 *
 * On top of that the endpoint asks for a key. A key is compared in a time
 * that does not depend on how much of it was right, so the answer does not
 * tell a guesser how far it got.
 *
 * Without a key the endpoint does not start: a collector that is set up
 * wrongly must not find an open door.
 */
export function createMetricsServer(options: MetricsServerOptions): MetricsServer {
  const metrics = options.registry ?? registry;
  const log = options.log;

  const closed: MetricsServer = {
    started: false,
    port: 0,
    url: '',
    ready: Promise.resolve(),
    close: async () => undefined,
  };
  if (!options.enabled) {
    log?.info({}, 'the metrics endpoint is turned off');
    return closed;
  }
  if (!options.token) {
    log?.warn({}, 'the metrics endpoint stays closed: no key was given for it');
    return closed;
  }

  const server: Server = createServer((request, response) => {
    const authorization = request.headers.authorization ?? '';
    const carried = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
    if (!carried || !sameSecret(carried, options.token)) {
      response.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end('{"error":"unauthorized"}');
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(metrics.render());
  });

  const ready = new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', (error: Error) => reject(error));
  });
  // The endpoint is internal: a mistake in the address must not stop the API.
  server.on('error', (error: Error) => {
    log?.error({ err: error }, 'the metrics endpoint could not listen');
  });

  server.listen(options.port, options.host, () => {
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : options.port;
    log?.info({ host: options.host, port }, 'the metrics endpoint listens');
  });

  return {
    started: true,
    ready,
    get port() {
      const address = server.address();
      return typeof address === 'object' && address !== null ? address.port : options.port;
    },
    get url() {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : options.port;
      return `http://${options.host}:${port}/metrics`;
    },
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
