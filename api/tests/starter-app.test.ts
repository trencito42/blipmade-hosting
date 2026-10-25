import { describe, expect, it } from 'vitest';
import {
  isStarterFile,
  planStarterFiles,
  repairStarterFile,
  starterFiles,
} from '../src/services/starter-apps.js';

/**
 * The application that the platform puts into a new container.
 *
 * The audit found a sold product whose container held nothing but `.npm/` and
 * `bm-test.txt`, with a start-up command (`npm run start`) that had nothing to
 * run. These tests check that the application the platform writes is a real
 * one: a package that the start-up command can run, and a server that answers
 * on the health path of the product.
 *
 * The port is the one of the allocation. The panel gives that port to the
 * container in `SERVER_PORT`, so the application reads that name first: an
 * application that reads only `PORT` listens on a port of its own, and the node
 * publishes the port of the allocation, so nobody reaches it.
 *
 * The files of the platform are also repaired without ever taking the code of a
 * customer away: only a file that is the application of the platform is
 * touched, and only its line of the port is corrected.
 */

describe('the application of a new container', () => {
  const files = starterFiles({
    slug: 'discord-bot',
    name: 'Discord Bot',
    healthPath: '/healthz',
    port: 30001,
  });

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

  it('reads the port of the panel first, so it listens where the node publishes', () => {
    const app = files.find((file) => file.path === 'index.js');
    expect(app!.content).toContain(
      'const port = Number(process.env.SERVER_PORT || process.env.PORT || 30001)',
    );
  });

  it('never falls back to a port of its own when the allocation is known', () => {
    const app = starterFiles({
      slug: 'wordpress',
      name: 'WordPress',
      healthPath: '/',
      port: 8080,
    }).find((file) => file.path === 'index.js');
    expect(app!.content).toContain('const port = Number(process.env.SERVER_PORT || process.env.PORT || 8080)');
    // The port of 3000 was the bug: the node publishes the port of the
    // allocation, and the application listened on another one.
    expect(app!.content).not.toContain('|| 3000)');
  });

  it('cannot be written without the port of the allocation', () => {
    // @ts-expect-error the port of the allocation is required
    expect(() => starterFiles({ slug: 'discord-bot', name: 'Discord Bot', healthPath: '/' })).toThrow();
  });
});

describe('the files of the platform in a container', () => {
  const platform = starterFiles({
    slug: 'discord-bot',
    name: 'Discord Bot',
    healthPath: '/healthz',
    port: 30001,
  });
  const code = platform.find((file) => file.path === 'index.js')!;

  /** The file the platform wrote before the port was corrected. */
  const oldCode = code.content.replace(
    'const port = Number(process.env.SERVER_PORT || process.env.PORT || 30001);',
    'const port = Number(process.env.PORT || 3000);',
  );

  it('is recognized even when the line of the port is the old one', () => {
    expect(isStarterFile(code, oldCode)).toBe(true);
  });

  it('is not recognized when a customer changed the code', () => {
    const customer = oldCode.replace(
      "response.end(\"Discord Bot\" + ' is running on Blipmade.\\n');",
      "response.end('the code of the customer');",
    );
    expect(isStarterFile(code, customer)).toBe(false);
  });

  it('is not recognized when a customer wrote the file from scratch', () => {
    expect(isStarterFile(code, 'console.log("hello");')).toBe(false);
  });

  it('corrects the line of the port and nothing else', () => {
    const repaired = repairStarterFile(code, oldCode);
    expect(repaired).not.toBeNull();
    expect(repaired).toContain('const port = Number(process.env.SERVER_PORT || process.env.PORT || 30001);');
    // Everything but the line of the port stays as it was.
    expect(repaired!.replace(/^const port = .*$/m, '')).toBe(oldCode.replace(/^const port = .*$/m, ''));
  });

  it('leaves the code of a customer alone', () => {
    const customer = oldCode.replace("const startedAt = Date.now();", 'const startedAt = 0; // the customer');
    expect(repairStarterFile(code, customer)).toBeNull();
  });

  it('reports nothing to do when the file is already right', () => {
    expect(repairStarterFile(code, code.content)).toBeNull();
  });
});

describe('what happens to the files of a container', () => {
  const platform = starterFiles({
    slug: 'discord-bot',
    name: 'Discord Bot',
    healthPath: '/healthz',
    port: 30001,
  });
  const code = platform.find((file) => file.path === 'index.js')!;
  const oldCode = code.content.replace(
    'const port = Number(process.env.SERVER_PORT || process.env.PORT || 30001);',
    'const port = Number(process.env.PORT || 3000);',
  );

  it('writes the files that are not in the container', () => {
    const plan = planStarterFiles(platform, new Map());
    expect(plan.map((entry) => entry.action)).toEqual(['write', 'write', 'write']);
    expect(plan[1].content).toContain('SERVER_PORT');
  });

  it('repairs the file of the platform and leaves the rest alone', () => {
    const existing = new Map([
      ['index.js', oldCode],
      ['package.json', platform.find((file) => file.path === 'package.json')!.content],
      ['README.md', platform.find((file) => file.path === 'README.md')!.content],
    ]);
    const plan = planStarterFiles(platform, existing);
    expect(plan.map((entry) => entry.action)).toEqual(['keep', 'repair', 'keep']);
    expect(plan[1].content).toContain('SERVER_PORT');
  });

  it('never writes over the code of a customer', () => {
    const customer = oldCode.replace("const startedAt = Date.now();", 'const startedAt = 0; // the customer');
    const existing = new Map([['index.js', customer]]);
    const plan = planStarterFiles(platform, existing);
    const codePlan = plan.find((entry) => entry.path === 'index.js')!;
    expect(codePlan.action).toBe('keep');
    expect(codePlan.content).toBeNull();
    expect(codePlan.platform).toBe(false);
  });
});
