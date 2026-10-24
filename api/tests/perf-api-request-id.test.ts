import { afterAll, describe, expect, it } from 'vitest';
import {
  isTrustedAddress,
  isValidRequestId,
  REQUEST_ID_HEADER,
  resolveRequestId,
} from '../src/lib/perf-request-id.js';
import { closeApp, getApp } from './helpers.js';

/**
 * The id of a request.
 *
 * The web container sends the id it made to the API, so the journal of the
 * web and the journal of the API speak about the same request. The API only
 * believes the id of a proxy it knows and only when the id is well formed:
 * an id that a client chose could be used to write into the journal and to
 * make two requests look like one.
 */

afterAll(async () => {
  await closeApp();
});

describe('the id of a request', () => {
  it('takes the id of the proxy', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/health/live',
      headers: { [REQUEST_ID_HEADER]: 'web-1234' },
      remoteAddress: '127.0.0.1',
    });
    expect(response.headers[REQUEST_ID_HEADER]).toBe('web-1234');
  });

  it('makes an id of its own when there is none', async () => {
    const app = await getApp();
    const response = await app.inject({ method: 'GET', url: '/api/health/live' });
    const id = response.headers[REQUEST_ID_HEADER];
    expect(typeof id).toBe('string');
    expect(String(id).length).toBeGreaterThan(0);
  });

  it('ignores an id that is not well formed', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/health/live',
      headers: { [REQUEST_ID_HEADER]: 'an id with spaces' },
      remoteAddress: '127.0.0.1',
    });
    expect(response.headers[REQUEST_ID_HEADER]).not.toBe('an id with spaces');
  });

  it('ignores an id that a client chose', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/health/live',
      headers: { [REQUEST_ID_HEADER]: 'chosen-by-the-client' },
      remoteAddress: '203.0.113.5',
    });
    expect(response.headers[REQUEST_ID_HEADER]).not.toBe('chosen-by-the-client');
  });
});

describe('the id of a request outside the server', () => {
  it('takes the id of a proxy that is believed', () => {
    const id = resolveRequestId(
      { headers: { [REQUEST_ID_HEADER]: 'web-1234' }, socket: { remoteAddress: '172.16.0.7' } },
      ['172.16.0.0/12'],
      () => 'made-here',
    );
    expect(id).toBe('web-1234');
  });

  it('makes an id of its own for a client that is not a proxy', () => {
    const id = resolveRequestId(
      { headers: { [REQUEST_ID_HEADER]: 'web-1234' }, socket: { remoteAddress: '203.0.113.5' } },
      ['172.16.0.0/12'],
      () => 'made-here',
    );
    expect(id).toBe('made-here');
  });

  it('makes an id of its own when there is none', () => {
    const id = resolveRequestId({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }, ['127.0.0.1'], () => 'made-here');
    expect(id).toBe('made-here');
  });

  it('refuses an id that is not well formed', () => {
    expect(isValidRequestId('web-1234')).toBe(true);
    expect(isValidRequestId('')).toBe(false);
    expect(isValidRequestId('with a space')).toBe(false);
    expect(isValidRequestId('with\na-new-line')).toBe(false);
    expect(isValidRequestId('x'.repeat(65))).toBe(false);
    expect(isValidRequestId(42)).toBe(false);
  });
});

describe('the addresses that are believed', () => {
  it('believes an address that is in the list', () => {
    expect(isTrustedAddress('127.0.0.1', ['127.0.0.1', '::1'])).toBe(true);
    expect(isTrustedAddress('::1', ['127.0.0.1', '::1'])).toBe(true);
  });

  it('believes a block of addresses', () => {
    expect(isTrustedAddress('172.16.0.7', ['172.16.0.0/12'])).toBe(true);
    expect(isTrustedAddress('172.31.255.254', ['172.16.0.0/12'])).toBe(true);
    expect(isTrustedAddress('172.32.0.1', ['172.16.0.0/12'])).toBe(false);
    expect(isTrustedAddress('10.0.0.1', ['172.16.0.0/12'])).toBe(false);
  });

  it('believes an IPv4 address that was written as an IPv6 address', () => {
    expect(isTrustedAddress('::ffff:127.0.0.1', ['127.0.0.1'])).toBe(true);
  });

  it('believes nothing that cannot be read', () => {
    expect(isTrustedAddress(undefined, ['127.0.0.1'])).toBe(false);
    expect(isTrustedAddress('not-an-address', ['127.0.0.1'])).toBe(false);
    expect(isTrustedAddress('127.0.0.1', ['not-an-address'])).toBe(false);
    expect(isTrustedAddress('127.0.0.1', [])).toBe(false);
  });
});
