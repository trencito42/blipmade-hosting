import { describe, expect, it, vi } from 'vitest';

describe('error reporting', () => {
  it('does not report a validation error of a customer', async () => {
    let filter: ((event: Record<string, unknown>, hint: Record<string, unknown>) => unknown) | undefined;
    vi.doMock('@sentry/node', () => ({ init: (options: { beforeSend: typeof filter }) => { filter = options.beforeSend; }, captureException: () => undefined }));
    vi.doMock('../src/env.js', () => ({ env: { SENTRY_DSN: 'https://k@example.invalid/1', SENTRY_ENVIRONMENT: 'test' } }));
    const { initErrorReporting } = await import('../src/lib/sentry.js');
    initErrorReporting('api');
    expect(filter).toBeTypeOf('function');
    expect(filter!({ exception: { values: [{ type: 'ZodError' }] } }, {})).toBeNull();
    expect(filter!({}, { originalException: { name: 'ZodError' } })).toBeNull();
    expect(filter!({ request: { cookies: 'x', headers: {}, data: 'y' }, exception: { values: [{ type: 'TypeError' }] } }, {})).toEqual({ request: {}, exception: { values: [{ type: 'TypeError' }] } });
  });
});
