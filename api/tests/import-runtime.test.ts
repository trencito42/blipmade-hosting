import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { VITE_START, importProductFor, inspectArchive, inspectManifests, manifestUrls } from '../src/services/import-inspect.js';

describe('import runtime plans', () => {
  it('builds Next.js and starts it on the server port', () => {
    const plan = inspectManifests([{ path: 'package.json', text: JSON.stringify({ dependencies: { next: '15.0.0', react: '19.0.0' }, scripts: { build: 'next build' } }) }]);
    expect(plan.productSlug).toBe('nodejs');
    expect(plan.confidence).toBe('confirmed');
    expect(plan.build).toBe('npm install && npm run build');
    expect(plan.start).toContain('$SERVER_PORT');
    expect(plan.recommendedRam).toBe(2048);
  });

  it('reads a Next.js Prisma project as MySQL when the schema says mysql', () => {
    const plan = inspectManifests([
      { path: 'package.json', text: JSON.stringify({ dependencies: { next: '15.0.0', '@prisma/client': '6.0.0', prisma: '6.0.0' }, scripts: { build: 'next build', start: 'next start -p 3007 -H 0.0.0.0' } }) },
      { path: 'prisma/schema.prisma', text: 'generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "mysql"\n  url = env("DATABASE_URL")\n}\n' },
      { path: '.env.example', text: 'DATABASE_URL=\nNEXTAUTH_SECRET=\n' },
    ]);
    expect(plan.services.map((service) => service.slug)).toEqual(['attached_mysql']);
    expect(plan.services[0]?.certainty).toBe('confirmed');
    expect(plan.build).toBe('npm install && npx prisma generate && npx prisma migrate deploy && npm run build');
    expect(plan.start).toBe('npx next start -p $SERVER_PORT -H 0.0.0.0');
    expect(plan.envNames).toEqual(['DATABASE_URL', 'NEXTAUTH_SECRET']);
  });

  it('fetches the Prisma schema for daily81', () => {
    const urls = manifestUrls('https://github.com/trencito42/daily81');
    expect(urls).toContain('https://raw.githubusercontent.com/trencito42/daily81/HEAD/prisma/schema.prisma');
  });

  it('does not invent PostgreSQL from Prisma alone', () => {
    const plan = inspectManifests([{ path: 'package.json', text: JSON.stringify({ dependencies: { next: '15.0.0', '@prisma/client': '6.0.0' }, scripts: { build: 'next build' } }) }]);
    expect(plan.services).toEqual([]);
    expect(plan.notes.join(' ')).toMatch(/no database was added/);
  });

  it('serves a Vite build with Node and does not add a package', () => {
    const plan = inspectManifests([{ path: 'package.json', text: JSON.stringify({ dependencies: { vite: '6.0.0' }, scripts: { build: 'vite build' } }) }]);
    expect(plan.start).toBe(VITE_START);
    expect(plan.start!.length).toBeLessThanOrEqual(500);
    expect(plan.build).toBe('npm install && npm run build');
    expect(plan.notes.join(' ')).toMatch(/does not install a static server/);
  });

  it('starts FastAPI with uvicorn and keeps Redis as a suggestion', () => {
    const plan = inspectManifests([{ path: 'requirements.txt', text: 'fastapi==0.115.0\nuvicorn==0.32.0\nredis==5.0.0\n' }]);
    expect(plan.productSlug).toBe('python');
    expect(plan.confidence).toBe('likely');
    expect(plan.build).toBe('pip install -r requirements.txt');
    expect(plan.start).toContain('uvicorn main:app');
    expect(plan.services.map((service) => service.slug)).toContain('redis');
    expect(plan.notes.join(' ')).toMatch(/main:app/);
  });

  it('installs Laravel with Composer inside the PHP container', () => {
    const plan = inspectManifests([{ path: 'composer.json', text: JSON.stringify({ require: { php: '^8.2', 'laravel/framework': '^11.0' } }) }]);
    expect(plan.productSlug).toBe('php');
    expect(plan.build).toContain('composer.phar install');
    expect(plan.start).toContain('artisan serve');
    expect(plan.notes.join(' ')).not.toMatch(/no PHP product/);
  });

  it('does not invent a database for a plain Node script', () => {
    const plan = inspectManifests([{ path: 'package.json', text: JSON.stringify({ scripts: { start: 'node server.js' } }) }]);
    expect(plan.confidence).toBe('confirmed');
    expect(plan.start).toBe('node server.js');
    expect(plan.services).toEqual([]);
  });

  it('lets the customer deploy a Node.js project as a Discord Bot, and keeps Python on Python', () => {
    const node = inspectManifests([{ path: 'package.json', text: JSON.stringify({ scripts: { start: 'node index.js' } }) }]);
    expect(node.productSlug).toBe('nodejs');
    expect(node.runtime).toBe('nodejs');
    expect(importProductFor(node, 'discord-bot')).toEqual({ slug: 'discord-bot' });
    expect(importProductFor(node, 'nodejs')).toEqual({ slug: 'nodejs' });
    expect(importProductFor(node)).toEqual({ slug: 'nodejs' });
    const refused = importProductFor(node, 'python');
    expect('error' in refused && refused.error).toMatch(/cannot be deployed as Python/);
    expect('error' in refused && refused.error).toMatch(/Discord Bot or Node\.js/);

    const discordJs = inspectManifests([{ path: 'package.json', text: JSON.stringify({ dependencies: { 'discord.js': '14.0.0' }, scripts: { start: 'node index.js' } }) }]);
    expect(discordJs.productSlug).toBe('discord-bot');
    expect(importProductFor(discordJs, 'nodejs')).toEqual({ slug: 'nodejs' });
    expect(importProductFor(discordJs, 'discord-bot')).toEqual({ slug: 'discord-bot' });

    const pythonBot = inspectManifests([{ path: 'requirements.txt', text: 'discord.py==2.4.0\n' }]);
    expect(pythonBot.productSlug).toBe('python');
    expect(pythonBot.runtime).toBe('python');
    expect(pythonBot.notes.join(' ')).toMatch(/Python runtime/);
    expect(importProductFor(pythonBot, 'python')).toEqual({ slug: 'python' });
    const notNode = importProductFor(pythonBot, 'discord-bot');
    expect('error' in notNode && notNode.error).toMatch(/runs on Python/);
    expect('error' in notNode && notNode.error).toMatch(/Choose Python/);
  });

  it('flags a Procfile worker without inventing a second product', () => {
    const plan = inspectManifests([
      { path: 'package.json', text: JSON.stringify({ scripts: { start: 'node server.js' } }) },
      { path: 'Procfile', text: 'web: node server.js\nworker: node jobs.js\n' },
    ]);
    expect(plan.services.map((service) => service.slug)).toContain('worker');
    expect(plan.services.find((service) => service.slug === 'worker')?.certainty).toBe('possible');
  });

  it('reads a tar.gz without executing it', () => {
    const content = Buffer.from(JSON.stringify({ scripts: { start: 'node index.js' } }));
    const header = Buffer.alloc(512);
    header.write('package.json');
    const size = content.length.toString(8).padStart(11, '0') + '\0';
    header.write(size, 124, 12, 'latin1');
    header.write('0', 156);
    header.write('ustar', 257);
    header.write('        ', 148);
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    const pad = (512 - (content.length % 512)) % 512;
    const tar = Buffer.concat([header, content, Buffer.alloc(pad), Buffer.alloc(1024)]);
    const plan = inspectArchive(gzipSync(tar));
    expect(plan.productSlug).toBe('nodejs');
    expect(plan.start).toBe('node index.js');
  });
});
