import { describe, expect, it } from 'vitest';
import { VITE_START, inspectManifests } from '../src/services/import-inspect.js';

describe('import runtime plans', () => {
  it('builds Next.js and starts it on the server port', () => {
    const plan = inspectManifests([{ path: 'package.json', text: JSON.stringify({ dependencies: { next: '15.0.0', react: '19.0.0' }, scripts: { build: 'next build' } }) }]);
    expect(plan.productSlug).toBe('nodejs');
    expect(plan.confidence).toBe('likely');
    expect(plan.build).toBe('npm install && npm run build');
    expect(plan.start).toContain('next start');
    expect(plan.start).toContain('$SERVER_PORT');
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
});
