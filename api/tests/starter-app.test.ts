import { describe, expect, it } from 'vitest';
import { starterFiles } from '../src/services/starter-apps.js';

/**
 * The application that the platform puts into a new container.
 *
 * The audit found a sold product whose container held nothing but `.npm/` and
 * `bm-test.txt`, with a start-up command (`npm run start`) that had nothing to
 * run. These tests check that the application the platform writes is a real
 * one: a package that the start-up command can run, and a server that answers
 * on the health path of the product.
 */

describe('the application of a new container', () => {
  const files = starterFiles({ slug: 'discord-bot', name: 'Discord Bot', healthPath: '/healthz' });

  it('writes a package the start-up command can run', () => {
    const pkg = files.find((file) => file.path === 'package.json');
    expect(pkg).toBeDefined();

    const parsed = JSON.parse(pkg!.content);
    expect(parsed.name).toBe('discord-bot');
    expect(parsed.private).toBe(true);
    expect(parsed.scripts.start).toBe('node index.js');
    expect(parsed.engines.node).toBe('>=18');
  });

  it('writes an application that answers on the health path of the product', () => {
    const app = files.find((file) => file.path === 'index.js');
    expect(app).toBeDefined();
    expect(app!.content).toContain('const healthPath = "/healthz"');
    expect(app!.content).toContain('response.writeHead(200');
    expect(app!.content).toContain('server.listen(port');
  });

  it('writes the package before the application, because the start reads it', () => {
    expect(files.map((file) => file.path)).toEqual(['package.json', 'index.js', 'README.md']);
  });

  it('tells in the readme what the application is', () => {
    const readme = files.find((file) => file.path === 'README.md');
    expect(readme).toBeDefined();
    expect(readme!.content).toContain('/healthz');
    expect(readme!.content).toContain('Blipmade');
  });

  it('uses the port of the product', () => {
    const app = starterFiles({ slug: 'wordpress', name: 'WordPress', healthPath: '/', port: 8080 }).find(
      (file) => file.path === 'index.js',
    );
    expect(app!.content).toContain('const port = Number(process.env.PORT || 8080)');
  });
});
