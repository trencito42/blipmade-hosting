import { afterAll, describe, expect, it } from 'vitest';
import { beginRequest, createMetricsServer, endRequest, registry } from '../src/lib/perf-metrics.js';
import { closeApp, getApp } from './helpers.js';

/**
 * The measures of the API.
 *
 * The measures are given away by a listener of their own: the web container
 * forwards every path that begins with `/api`, so a path on the listener the
 * public traffic arrives on would be read by anyone who can reach the site.
 *
 * The listener of the measures is bound to the loopback of the container and
 * asks for a key. Without a key it does not open at all.
 */

afterAll(async () => {
  await closeApp();
});

describe('the endpoint of the measures', () => {
  it('does not open without a key', () => {
    const server = createMetricsServer({ enabled: true, host: '127.0.0.1', port: 0, token: '' });
    expect(server.started).toBe(false);
  });

  it('does not open when it is turned off', () => {
    const server = createMetricsServer({ enabled: false, host: '127.0.0.1', port: 0, token: 'a-key' });
    expect(server.started).toBe(false);
  });

  it('answers only to the collector that knows the key', async () => {
    // A request is answered first, so the measures have something to show.
    const app = await getApp();
    await app.inject({ method: 'GET', url: '/api/health/live' });

    const server = createMetricsServer({ enabled: true, host: '127.0.0.1', port: 0, token: 'the-key' });
    try {
      await server.ready;

      const withoutKey = await fetch(server.url);
      expect(withoutKey.status).toBe(401);

      const wrongKey = await fetch(server.url, { headers: { authorization: 'Bearer the-wrong-key' } });
      expect(wrongKey.status).toBe(401);

      const withKey = await fetch(server.url, { headers: { authorization: 'Bearer the-key' } });
      expect(withKey.status).toBe(200);
      expect(withKey.headers.get('content-type')).toContain('text/plain');

      const body = await withKey.text();
      expect(body).toContain('bm_http_requests_total');
      expect(body).toContain('bm_http_request_duration_seconds_bucket');
      expect(body).toContain('bm_http_in_flight_requests');
      expect(body).toContain('bm_process_resident_memory_bytes');
      expect(body).toContain('bm_process_heap_used_bytes');
      expect(body).toContain('bm_nodejs_eventloop_lag_seconds');
    } finally {
      await server.close();
    }
  });

  it('is not on the listener the public traffic arrives on', async () => {
    const app = await getApp();
    expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/metrics' })).statusCode).toBe(404);
    // The web container forwards every path that begins with /api.
    expect((await app.inject({ method: 'GET', url: '/api/metrics' })).body).not.toContain('bm_http_requests_total');
  });
});

describe('the measures themselves', () => {
  it('counts the requests by route and by status', async () => {
    const app = await getApp();
    await app.inject({ method: 'GET', url: '/api/health/live' });
    await app.inject({ method: 'GET', url: '/api/health/live' });

    const text = registry.render();
    expect(text).toMatch(/bm_http_requests_total\{route="\/api\/health\/live",method="GET",status="200"\} [1-9]/);
    expect(text).toContain('# TYPE bm_http_requests_total counter');
  });

  it('measures how long the requests took', async () => {
    const app = await getApp();
    await app.inject({ method: 'GET', url: '/api/health/live' });
    const text = registry.render();
    expect(text).toContain('bm_http_request_duration_seconds_bucket{route="/api/health/live",method="GET",le="+Inf"}');
    expect(text).toContain('bm_http_request_duration_seconds_count{route="/api/health/live",method="GET"}');
  });

  it('counts the requests that are running', () => {
    const before = registry.inFlightRequests;
    const request = { routeOptions: { url: '/api/perf-measure' }, method: 'GET' } as never;

    beginRequest(request);
    expect(registry.inFlightRequests).toBe(before + 1);

    endRequest(request, 200);
    expect(registry.inFlightRequests).toBe(before);
  });

  it('counts a request only once, even when it ends twice', () => {
    const before = registry.inFlightRequests;
    const request = { routeOptions: { url: '/api/perf-measure' }, method: 'GET' } as never;

    beginRequest(request);
    endRequest(request, 200);
    endRequest(request, 200);
    expect(registry.inFlightRequests).toBe(before);
  });
});
