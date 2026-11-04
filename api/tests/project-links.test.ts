import { describe, expect, it } from 'vitest';
import { secretsForEgg } from '../src/services/instance-credentials.js';
import { confirmedServiceSelection, connectionVariable, dependencyReady, importMayBuild, mariadbGrantCommand, mariadbGrantSql, mariadbPassword, missingCompanions, quoteItemsForImport } from '../src/services/project-links.js';

describe('confirmed project services', () => {
  it('links only a database the project declared and the customer confirmed', () => {
    const chosen = confirmedServiceSelection(['postgresql', 'redis'], ['redis']);
    expect(chosen).toEqual({ ok: true, chosen: ['redis'] });
  });

  it('does not add PostgreSQL when the project did not declare it', () => {
    const chosen = confirmedServiceSelection(['redis'], ['postgresql']);
    expect(chosen.ok).toBe(false);
  });

  it('accepts attached MySQL without ordering a standalone MariaDB server', () => {
    const chosen = confirmedServiceSelection(['attached_mysql'], ['attached_mysql']);
    expect(chosen).toEqual({ ok: true, chosen: ['attached_mysql'] });
    const items = quoteItemsForImport(
      [{ productSlug: 'nodejs', ram: 2048 }],
      [{ slug: 'attached_mysql', ram: 0, cpu: 0, disk: 0 }],
    );
    expect(items.map((item) => item.productSlug)).toEqual(['nodejs']);
  });

  it('provisions MariaDB when the project declared it and the customer confirmed it', () => {
    const chosen = confirmedServiceSelection(['mariadb'], ['mariadb']);
    expect(chosen).toEqual({ ok: true, chosen: ['mariadb'] });
  });

  it('builds a MariaDB URL and a grant that the console command does not reveal', () => {
    const password = 'Abcdefghijkmnop234';
    expect(mariadbPassword(password)).toBe(password);
    expect(mariadbPassword('short')).toBeNull();
    expect(mariadbPassword("abc'defghijklmnop")).toBeNull();
    const sql = mariadbGrantSql(password);
    expect(sql).toContain("IDENTIFIED BY 'Abcdefghijkmnop234'");
    expect(sql).toContain('CREATE DATABASE IF NOT EXISTS blipmade');
    expect(mariadbGrantSql('bad password')).toBeNull();
    expect(mariadbGrantCommand()).toBe('source /home/container/.blipmade/grant.sql');
    expect(mariadbGrantCommand()).not.toContain(password);
    expect(secretsForEgg({ DB_PASSWORD: password, PGPASSWORD: 'kept' }, ['PGPASSWORD'])).toEqual({ PGPASSWORD: 'kept' });
    const ready = connectionVariable({ slug: 'mariadb', user: 'blipmade', password, host: '203.0.113.10', port: 3306, database: 'blipmade' });
    expect(ready).toEqual({ key: 'DATABASE_URL', value: `mysql://blipmade:${password}@203.0.113.10:3306/blipmade` });
  });

  it('requires every confirmed service on the order', () => {
    expect(missingCompanions(['postgresql', 'redis'], ['nodejs', 'redis'])).toEqual(['postgresql']);
  });

  it('does not inject credentials before the database port answers', () => {
    expect(dependencyReady({ online: true, portOpen: false })).toBe(false);
    expect(dependencyReady({ online: true, portOpen: true })).toBe(true);
  });

  it('does not build the application until the confirmed database is connected', () => {
    expect(importMayBuild({ confirmed: 1, linked: false }).build).toBe(false);
    expect(importMayBuild({ confirmed: 0, linked: false }).build).toBe(true);
    expect(importMayBuild({ confirmed: 1, linked: true }).build).toBe(true);
  });

  it('adds the confirmed database to the quote', () => {
    const items = quoteItemsForImport(
      [{ productSlug: 'nodejs', ram: 2048 }],
      [{ slug: 'postgresql', ram: 1024, cpu: 1, disk: 10 }],
    );
    expect(items.map((item) => item.productSlug)).toEqual(['nodejs', 'postgresql']);
  });

  it('builds a postgres URL and refuses an unbound address', () => {
    const ready = connectionVariable({ slug: 'postgresql', user: 'pterodactyl', password: 'a b', host: '203.0.113.10', port: 5432, database: 'pterodactyl' });
    expect(ready?.value).toBe('postgresql://pterodactyl:a%20b@203.0.113.10:5432/pterodactyl');
    expect(connectionVariable({ slug: 'redis', user: '', password: 'secret', host: '0.0.0.0', port: 6379, database: '' })).toBeNull();
    expect(connectionVariable({ slug: 'redis', user: '', password: 'secret', host: '203.0.113.10', port: 6379, database: '' })?.key).toBe('REDIS_URL');
  });
});
