import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  planIsolatedBuild,
  runtimeForProduct,
  sandboxHost,
  signedSandboxHeaders,
} from '../src/services/isolated-build.js';

const previous = {
  url: process.env.SMART_DEPLOY_SANDBOX_URL,
  host: process.env.SMART_DEPLOY_SANDBOX,
  secret: process.env.SMART_DEPLOY_SANDBOX_SECRET,
  nodeEnv: process.env.NODE_ENV,
};

afterEach(() => {
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore('SMART_DEPLOY_SANDBOX_URL', previous.url);
  restore('SMART_DEPLOY_SANDBOX', previous.host);
  restore('SMART_DEPLOY_SANDBOX_SECRET', previous.secret);
  restore('NODE_ENV', previous.nodeEnv);
});

describe('isolated build executor contract', () => {
  it('queues only with an HTTPS endpoint, a secret, and a known runtime', () => {
    process.env.NODE_ENV = 'production';
    process.env.SMART_DEPLOY_SANDBOX_URL = 'https://builder.example.test/base/';
    process.env.SMART_DEPLOY_SANDBOX_SECRET = 'a'.repeat(32);
    expect(sandboxHost()).toBe('https://builder.example.test/base');
    expect(planIsolatedBuild({ buildCommand: 'npm ci', startCommand: 'npm start', runtime: 'node' }).status).toBe('queued');
    expect(planIsolatedBuild({ buildCommand: 'make', startCommand: './app', runtime: null }).status).toBe('blocked_no_sandbox');

    process.env.SMART_DEPLOY_SANDBOX_URL = 'http://builder.example.test';
    expect(planIsolatedBuild({ buildCommand: 'npm ci', startCommand: 'npm start', runtime: 'node' }).status).toBe('blocked_no_sandbox');
  });

  it('signs the exact job id, timestamp, and request bytes', () => {
    const raw = Buffer.from('{"archive":"bytes"}');
    const secret = 'b'.repeat(32);
    const headers = signedSandboxHeaders('job-1', raw, secret, 1234);
    const expected = createHmac('sha256', secret).update('1234.job-1.').update(raw).digest('hex');
    expect(headers).toMatchObject({
      'x-blipmade-timestamp': '1234',
      'x-blipmade-signature': `sha256=${expected}`,
    });
  });

  it('maps only supported product runtimes', () => {
    expect(runtimeForProduct('nodejs')).toBe('node');
    expect(runtimeForProduct('python')).toBe('python');
    expect(runtimeForProduct('rust-runtime')).toBe('rust');
    expect(runtimeForProduct('minecraft-paper')).toBeNull();
  });
});
