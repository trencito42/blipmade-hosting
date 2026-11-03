import { describe, expect, it } from 'vitest';
import { confirmedServiceSelection, connectionVariable, missingCompanions } from '../src/services/project-links.js';

describe('confirmed project services', () => {
  it('links only a database the project declared and the customer confirmed', () => {
    const chosen = confirmedServiceSelection(['postgresql', 'redis'], ['redis']);
    expect(chosen).toEqual({ ok: true, chosen: ['redis'] });
  });

  it('does not add PostgreSQL when the project did not declare it', () => {
    const chosen = confirmedServiceSelection(['redis'], ['postgresql']);
    expect(chosen.ok).toBe(false);
  });

  it('refuses to provision MariaDB from this egg', () => {
    const chosen = confirmedServiceSelection(['mariadb'], ['mariadb']);
    expect(chosen.ok).toBe(false);
    if (!chosen.ok) expect(chosen.message).toMatch(/no password variable/);
  });

  it('requires every confirmed service on the order', () => {
    expect(missingCompanions(['postgresql', 'redis'], ['nodejs', 'redis'])).toEqual(['postgresql']);
  });

  it('builds a postgres URL and refuses an unbound address', () => {
    const ready = connectionVariable({ slug: 'postgresql', user: 'pterodactyl', password: 'a b', host: '203.0.113.10', port: 5432, database: 'pterodactyl' });
    expect(ready?.value).toBe('postgresql://pterodactyl:a%20b@203.0.113.10:5432/pterodactyl');
    expect(connectionVariable({ slug: 'redis', user: '', password: 'secret', host: '0.0.0.0', port: 6379, database: '' })).toBeNull();
    expect(connectionVariable({ slug: 'redis', user: '', password: 'secret', host: '203.0.113.10', port: 6379, database: '' })?.key).toBe('REDIS_URL');
  });
});
