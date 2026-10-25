import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeFor, verifyContainerDeployment } from '../src/services/provisioning.js';

/**
 * The check that says whether a deployment really works.
 *
 * A product that exposes a port is asked over the network. A product that does
 * not, like a bot that only talks to another service, has nothing to answer,
 * so the panel is asked about the server instead.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the check of a deployment', () => {
  it('asks a product that exposes a port over the network', () => {
    expect(probeFor({ healthProbe: null }).kind).toBe('http');
    expect(probeFor({ healthProbe: { kind: 'tcp' } as never }).kind).toBe('tcp');
    expect(probeFor({ healthProbe: { kind: 'http', path: '/health' } as never }).path).toBe('/health');
  });

  it('asks the panel for a product that does not expose a port', () => {
    const probe = probeFor({ healthProbe: { kind: 'container' } as never });

    expect(probe.kind).toBe('container');
  });

  it('refuses a server that the node does not report as running', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              object: 'stats',
              attributes: { state: 'offline', is_suspended: false, disk: { used: 4096 }, uptime: 0 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    const result = await verifyContainerDeployment('ptlc_key', 'server-uuid', { kind: 'container' }, { attempts: 2, delayMs: 1 });

    // A container that the node does not report as running is not a service,
    // so the deployment cannot be called healthy.
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('offline');
  });

  it('accepts a server that the node reports as running', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              object: 'stats',
              attributes: { state: 'running', is_suspended: false, disk: { used: 4096 }, uptime: 12_000 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    const result = await verifyContainerDeployment('ptlc_key', 'server-uuid', { kind: 'container' });

    expect(result.ok).toBe(true);
    expect(result.message).toContain('running');
  });

  it('refuses a server the panel does not answer about', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no answer', { status: 502, headers: { 'Content-Type': 'text/plain' } })),
    );

    const result = await verifyContainerDeployment('ptlc_key', 'server-uuid', { kind: 'container' }, { attempts: 2, delayMs: 1 });

    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});
