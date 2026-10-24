import { describe, expect, it } from 'vitest';
import { parsePerfConfig } from '../src/lib/perf-config.js';

/**
 * The limits of the runtime of the API.
 *
 * The limits are read from the environment, so an operator can change them
 * without a new image. The value that is measured is the default, and the
 * value `0` brings back the behaviour the server had before the limits
 * existed.
 */

describe('the limits of the runtime', () => {
  it('bounds the server by default', () => {
    const config = parsePerfConfig({});
    expect(config.requestTimeoutMs).toBe(30_000);
    expect(config.connectionTimeoutMs).toBe(45_000);
    expect(config.keepAliveTimeoutMs).toBe(15_000);
    expect(config.shutdownTimeoutMs).toBe(8_000);
  });

  it('keeps the metrics endpoint on the loopback of the container', () => {
    const config = parsePerfConfig({});
    expect(config.metricsHost).toBe('127.0.0.1');
    expect(config.metricsPort).toBe(3109);
    // Without a key the endpoint does not open at all.
    expect(config.metricsToken).toBe('');
  });

  it('reads the limits from the environment', () => {
    const config = parsePerfConfig({
      API_REQUEST_TIMEOUT_MS: '12000',
      API_CONNECTION_TIMEOUT_MS: '20000',
      API_KEEPALIVE_TIMEOUT_MS: '5000',
      API_SHUTDOWN_TIMEOUT_MS: '3000',
      METRICS_HOST: '0.0.0.0',
      METRICS_PORT: '9999',
      METRICS_TOKEN: 'a-key',
    });
    expect(config.requestTimeoutMs).toBe(12_000);
    expect(config.connectionTimeoutMs).toBe(20_000);
    expect(config.keepAliveTimeoutMs).toBe(5_000);
    expect(config.shutdownTimeoutMs).toBe(3_000);
    expect(config.metricsHost).toBe('0.0.0.0');
    expect(config.metricsPort).toBe(9_999);
    expect(config.metricsToken).toBe('a-key');
  });

  it('brings back the old behaviour with the value zero', () => {
    const config = parsePerfConfig({
      API_REQUEST_TIMEOUT_MS: '0',
      API_CONNECTION_TIMEOUT_MS: '0',
      API_KEEPALIVE_TIMEOUT_MS: '0',
    });
    expect(config.requestTimeoutMs).toBe(0);
    expect(config.connectionTimeoutMs).toBe(0);
    expect(config.keepAliveTimeoutMs).toBe(0);
  });

  it('reads an empty value as "not set"', () => {
    const config = parsePerfConfig({ API_REQUEST_TIMEOUT_MS: '', API_SHUTDOWN_TIMEOUT_MS: '  ' });
    expect(config.requestTimeoutMs).toBe(30_000);
    expect(config.shutdownTimeoutMs).toBe(8_000);
  });

  it('refuses a limit that makes no sense', () => {
    expect(() => parsePerfConfig({ API_REQUEST_TIMEOUT_MS: '-1' })).toThrow(/Invalid performance configuration/);
    expect(() => parsePerfConfig({ API_SHUTDOWN_TIMEOUT_MS: '0' })).toThrow(/Invalid performance configuration/);
    expect(() => parsePerfConfig({ METRICS_PORT: '70000' })).toThrow(/Invalid performance configuration/);
  });
});
