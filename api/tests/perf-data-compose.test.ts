import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The resilience of the containers.
 *
 * The compose files are read by the stacks of the audit as well, so they must
 * stay valid. They are read here as text, because the machine that runs the
 * tests has no Docker on it and cannot ask Docker what it thinks of them.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function composeFiles(): Array<{ name: string; body: string }> {
  return ['compose.yml', 'compose.api.yml', 'compose.web.yml'].map((name) => ({
    name,
    body: readFileSync(path.join(root, name), 'utf8'),
  }));
}

/** The services of every compose file, with the lines that belong to them. */
function services(): Array<{ file: string; service: string; lines: string[] }> {
  const found: Array<{ file: string; service: string; lines: string[] }> = [];
  for (const { name, body } of composeFiles()) {
    const lines = body.split('\n');
    let inServices = false;
    let current: { file: string; service: string; lines: string[] } | null = null;
    for (const line of lines) {
      // A key of the top level ends the block of the services.
      if (/^[a-z0-9_-]+:\s*$/.test(line)) {
        if (current) {
          found.push(current);
          current = null;
        }
        inServices = line.trim() === 'services:';
        continue;
      }
      if (!inServices) continue;
      const start = line.match(/^ {2}([a-z0-9_-]+):\s*$/);
      if (start) {
        if (current) found.push(current);
        current = { file: name, service: start[1], lines: [] };
        continue;
      }
      if (current) current.lines.push(line);
    }
    if (current) found.push(current);
  }
  return found;
}

/** The five services of the platform. */
const PLATFORM_SERVICES = ['postgres', 'redis', 'api', 'worker', 'web'];

describe('the compose files of the platform', () => {
  it('hold the five services of the platform', () => {
    const names = services().map((entry) => entry.service);
    for (const service of PLATFORM_SERVICES) {
      expect(names).toContain(service);
    }
  });

  it('bound the log of every service, so the disk cannot be filled by the logs', () => {
    for (const entry of services()) {
      const text = entry.lines.join('\n');
      expect(text, `${entry.file}:${entry.service}`).toContain('logging:');
      expect(text, `${entry.file}:${entry.service}`).toContain('driver: json-file');
      // The size of one file and the number of files are both named, so the
      // log has a bound that does not depend on the traffic.
      expect(text, `${entry.file}:${entry.service}`).toMatch(/max-size:\s*"\d+[kmg]"/);
      expect(text, `${entry.file}:${entry.service}`).toMatch(/max-file:\s*"\d+"/);
    }
  });

  it('give every service a bound of memory, of processor and of processes', () => {
    for (const entry of services()) {
      const text = entry.lines.join('\n');
      expect(text, `${entry.file}:${entry.service}`).toMatch(/mem_limit:\s*\d+[kmg]/);
      expect(text, `${entry.file}:${entry.service}`).toMatch(/cpus:\s*[\d.]+/);
      expect(text, `${entry.file}:${entry.service}`).toMatch(/pids_limit:\s*\d+/);
    }
  });

  it('keep the bounds of the five services below the memory of the machine', () => {
    // The machine has about 4.3 GB that can be used. The bounds of the five
    // containers have to fit in it, so that a container that grows takes the
    // other ones down with it, and never the database alone.
    const totalMb = services().reduce((sum, entry) => {
      const match = entry.lines.join('\n').match(/mem_limit:\s*(\d+)([kmg])/);
      if (!match) return sum;
      const value = Number(match[1]);
      const unit = match[2];
      const inMb = unit === 'g' ? value * 1024 : unit === 'm' ? value : value / 1024;
      return sum + inMb;
    }, 0);
    expect(totalMb).toBeGreaterThan(0);
    expect(totalMb).toBeLessThanOrEqual(4300);
  });

  it('give every service a health check and a restart policy', () => {
    for (const entry of services()) {
      const text = entry.lines.join('\n');
      expect(text, `${entry.file}:${entry.service}`).toContain('healthcheck:');
      expect(text, `${entry.file}:${entry.service}`).toContain('restart: unless-stopped');
    }
  });

  it('keep the health check of every service on its own port', () => {
    const byService = new Map(services().map((entry) => [entry.service, entry.lines.join('\n')]));
    expect(byService.get('api')).toContain('http://127.0.0.1:3100/health');
    expect(byService.get('worker')).toContain('http://127.0.0.1:3101/health');
    expect(byService.get('web')).toContain('http://127.0.0.1:3000/healthz');
    expect(byService.get('postgres')).toContain('pg_isready');
    expect(byService.get('redis')).toContain('redis-cli');
  });
});
