import { afterAll, describe, expect, it } from 'vitest';
import { readinessProbes, readinessReport } from '../src/routes/health.js';
import { closeApp, getApp } from './helpers.js';

/**
 * The liveness and the readiness of the API.
 *
 * The health check of the container used to ask the database. A database that
 * is slow for a moment then took the container down and the container was
 * started again, and the database was not any faster for it.
 *
 * The liveness now answers as long as the process is alive, and the readiness
 * answers only when the database and the cache can be used.
 */

afterAll(async () => {
  await closeApp();
});

describe('the liveness of the API', () => {
  it('answers while the process is alive', async () => {
    const app = await getApp();
    const response = await app.inject({ method: 'GET', url: '/api/health/live' });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });

  it('answers on the root as well, for the health check of the container', async () => {
    const app = await getApp();
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
  });

  it('answers even when the database does not answer', async () => {
    const original = readinessProbes.database;
    readinessProbes.database = async () => false;
    try {
      const app = await getApp();
      const response = await app.inject({ method: 'GET', url: '/api/health/live' });
      expect(response.statusCode).toBe(200);
    } finally {
      readinessProbes.database = original;
    }
  });
});

describe('the readiness of the API', () => {
  it('answers when the dependencies can be used', async () => {
    const app = await getApp();
    const response = await app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json().ready).toBe(true);
    expect(response.json().database).toBe(true);
    expect(response.json().redis).toBe(true);
  });

  it('does not answer when the database does not answer', async () => {
    const original = readinessProbes.database;
    readinessProbes.database = async () => false;
    try {
      const app = await getApp();
      const response = await app.inject({ method: 'GET', url: '/api/health/ready' });
      expect(response.statusCode).toBe(503);
      expect(response.json().ready).toBe(false);
      expect(response.json().database).toBe(false);
    } finally {
      readinessProbes.database = original;
    }
  });

  it('does not answer when the cache does not answer', async () => {
    const report = await readinessReport({ database: async () => true, redis: async () => false });
    expect(report.ready).toBe(false);
    expect(report.checks.database).toBe(true);
    expect(report.checks.redis).toBe(false);
  });

  it('does not answer when the database does not answer', async () => {
    const report = await readinessReport({ database: async () => false, redis: async () => true });
    expect(report.ready).toBe(false);
    expect(report.checks.database).toBe(false);
  });

  it('keeps the old answer of the health endpoint', async () => {
    const app = await getApp();
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().service).toBe('blipmade-api');
    expect(response.json().database).toBe(true);
  });
});
