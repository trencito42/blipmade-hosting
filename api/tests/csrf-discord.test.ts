import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { csrfGuard } from '../src/plugins/csrf.js';

const post = (url: string) => ({ method: 'POST', url, cookies: {}, headers: {} }) as unknown as FastifyRequest;

describe('Discord interactions and CSRF', () => {
  it('lets the signed call of Discord in, without a cookie', () => {
    expect(() => csrfGuard(post('/api/integrations/discord/interactions'))).not.toThrow();
  });
  it('still asks for a token on every other write', () => {
    expect(() => csrfGuard(post('/api/integrations/discord/server/sync'))).toThrow();
    expect(() => csrfGuard(post('/api/admin/integrations/discord/server/sync'))).toThrow();
  });
});
