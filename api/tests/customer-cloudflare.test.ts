import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteOwnedRecords, previewCustomerRecords, publishCustomerRecords, zoneForToken } from '../src/services/customer-cloudflare.js';

/** A small Cloudflare: one zone with records, and a log of every call, so the tests can say what was and was not written. */
interface Row { id: string; type: string; name: string; content?: string; proxied?: boolean; data?: Record<string, unknown> }
let rows: Row[];
let calls: string[];
let zones: { id: string; name: string; status: string; name_servers: string[] }[];
let tokenStatus: string;
let nextId = 1;

function reply(result: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status < 400, result, errors: status < 400 ? [] : [{ message: 'refused' }] }), { status });
}

beforeEach(() => {
  rows = [];
  calls = [];
  nextId = 1;
  tokenStatus = 'active';
  zones = [{ id: 'z1', name: 'example.com', status: 'active', name_servers: ['a.ns.cloudflare.com', 'b.ns.cloudflare.com'] }];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const path = url.pathname.replace('/client/v4', '');
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${path}`);
    if (path === '/user/tokens/verify') return reply({ status: tokenStatus });
    if (path === '/zones') return reply(zones);
    const list = path.match(/^\/zones\/z1\/dns_records$/);
    if (list && method === 'GET') {
      const name = url.searchParams.get('name');
      return reply(rows.filter((row) => !name || row.name === name));
    }
    if (list && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as Row;
      const row = { ...body, id: `r${nextId++}` };
      rows.push(row);
      return reply(row);
    }
    const one = path.match(/^\/zones\/z1\/dns_records\/(\w+)$/);
    if (one && method === 'PATCH') {
      const row = rows.find((entry) => entry.id === one[1]);
      if (!row) return reply(null, 404);
      Object.assign(row, JSON.parse(String(init?.body)));
      return reply(row);
    }
    if (one && method === 'DELETE') {
      rows = rows.filter((entry) => entry.id !== one[1]);
      return reply({ id: one[1] });
    }
    return reply(null, 404);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const a = { type: 'A', name: 'app.example.com', content: '203.0.113.10' };

describe('the token of a customer', () => {
  it('is kept only when it is active and sees exactly one active zone it can read', async () => {
    expect(await zoneForToken('t')).toEqual({ zoneId: 'z1', zoneName: 'example.com', nameServers: ['a.ns.cloudflare.com', 'b.ns.cloudflare.com'] });
    tokenStatus = 'expired';
    await expect(zoneForToken('t')).rejects.toThrow(/not active/);
    tokenStatus = 'active';
    zones.push({ id: 'z2', name: 'other.com', status: 'active', name_servers: [] });
    await expect(zoneForToken('t')).rejects.toThrow(/exactly one zone/);
    zones.pop();
    zones[0]!.status = 'pending';
    await expect(zoneForToken('t')).rejects.toThrow(/not active on Cloudflare/);
  });

  it('never asks Cloudflare to change the zone itself, only its records', async () => {
    await zoneForToken('t');
    await publishCustomerRecords('t', 'z1', 'example.com', [a]);
    expect(calls.filter((call) => /^(PATCH|PUT|DELETE|POST) \/zones\/z1$/.test(call))).toEqual([]);
  });
});

describe('writing records', () => {
  it('writes a record once: the second run finds it unchanged and writes nothing', async () => {
    const first = await publishCustomerRecords('t', 'z1', 'example.com', [a]);
    expect(first.written).toEqual(['A app.example.com']);
    expect(first.created).toHaveLength(1);
    const writes = calls.filter((call) => call.startsWith('POST')).length;
    const again = await publishCustomerRecords('t', 'z1', 'example.com', [a], first.created.map((row) => ({ type: row.type, name: row.name, cloudflareId: row.cloudflareId })));
    expect(again.created).toEqual([]);
    expect(calls.filter((call) => call.startsWith('POST')).length).toBe(writes);
    expect(rows).toHaveLength(1);
    const preview = await previewCustomerRecords('t', 'z1', 'example.com', [a], []);
    expect(preview[0]!.action).toBe('unchanged');
  });

  it('leaves a record of the customer alone when its value differs, and says so', async () => {
    rows.push({ id: 'mine', type: 'A', name: 'app.example.com', content: '198.51.100.7' });
    const result = await publishCustomerRecords('t', 'z1', 'example.com', [a]);
    expect(result.written).toEqual([]);
    expect(result.skipped.join(' ')).toMatch(/different value/);
    expect(rows).toEqual([{ id: 'mine', type: 'A', name: 'app.example.com', content: '198.51.100.7' }]);
    expect((await previewCustomerRecords('t', 'z1', 'example.com', [a], []))[0]!.action).toBe('conflict');
  });

  it('updates only a record this platform wrote, and a CNAME beside an address is a conflict', async () => {
    rows.push({ id: 'ours', type: 'A', name: 'app.example.com', content: '198.51.100.7' });
    const updated = await publishCustomerRecords('t', 'z1', 'example.com', [a], [{ type: 'A', name: 'app.example.com', cloudflareId: 'ours' }]);
    expect(updated.written).toEqual(['A app.example.com']);
    expect(rows[0]!.content).toBe('203.0.113.10');
    rows.length = 0;
    rows.push({ id: 'c', type: 'CNAME', name: 'www.example.com', content: 'elsewhere.example.net' });
    const clash = await publishCustomerRecords('t', 'z1', 'example.com', [{ type: 'A', name: 'www.example.com', content: '203.0.113.10' }]);
    expect(clash.skipped.join(' ')).toMatch(/different value/);
    expect(rows).toHaveLength(1);
  });

  it('adds a proof of ownership beside the TXT records that are already there and keeps them', async () => {
    rows.push({ id: 'spf', type: 'TXT', name: 'example.com', content: 'v=spf1 include:_spf.example.net ~all' });
    const result = await publishCustomerRecords('t', 'z1', 'example.com', [{ type: 'TXT', name: 'example.com', content: 'blipmade-verify=abc' }]);
    expect(result.written).toEqual(['TXT example.com']);
    expect(rows.map((row) => row.content)).toEqual(['v=spf1 include:_spf.example.net ~all', 'blipmade-verify=abc']);
  });

  it('writes the game address as a SRV record and skips a name outside the connected zone', async () => {
    const srv = { type: 'SRV', name: '_minecraft._tcp.example.com', content: '0 5 25565 play.example.com', data: { priority: 0, weight: 5, port: 25565, target: 'play.example.com' } };
    const result = await publishCustomerRecords('t', 'z1', 'example.com', [srv, { type: 'A', name: 'x.other.com', content: '203.0.113.10' }]);
    expect(result.written).toEqual(['SRV _minecraft._tcp.example.com']);
    expect(result.skipped.join(' ')).toMatch(/outside the connected zone/);
    expect(rows.find((row) => row.type === 'SRV')!.data).toMatchObject({ port: 25565, target: 'play.example.com' });
    const again = await publishCustomerRecords('t', 'z1', 'example.com', [srv]);
    expect(again.created).toEqual([]);
    expect(rows.filter((row) => row.type === 'SRV')).toHaveLength(1);
  });

  it('removes only the records it wrote', async () => {
    rows.push({ id: 'theirs', type: 'A', name: 'keep.example.com', content: '198.51.100.9' });
    const result = await publishCustomerRecords('t', 'z1', 'example.com', [a]);
    const removed = await deleteOwnedRecords('t', 'z1', result.created.map((row) => row.cloudflareId));
    expect(removed).toHaveLength(1);
    expect(rows.map((row) => row.id)).toEqual(['theirs']);
    expect(await deleteOwnedRecords('t', 'z1', ['../zones/z1'])).toEqual([]);
  });

  it('does not call a proxied record unchanged: a record of the customer is named, one of ours is put back to DNS only', async () => {
    rows.push({ id: 'theirs', type: 'A', name: 'app.example.com', content: '203.0.113.10', proxied: true } as Row);
    const preview = await previewCustomerRecords('t', 'z1', 'example.com', [a], []);
    expect(preview[0]).toMatchObject({ action: 'conflict', current: '203.0.113.10 (proxied by Cloudflare)' });
    const refused = await publishCustomerRecords('t', 'z1', 'example.com', [a], []);
    expect(refused.written).toEqual([]);
    expect(refused.skipped.join(' ')).toMatch(/proxied by Cloudflare\. Turn the proxy off/);
    expect((rows[0] as Row & { proxied?: boolean }).proxied).toBe(true);

    const fixed = await publishCustomerRecords('t', 'z1', 'example.com', [a], [{ type: 'A', name: 'app.example.com', cloudflareId: 'theirs' }]);
    expect(fixed.written).toEqual(['A app.example.com']);
    expect((rows[0] as Row & { proxied?: boolean }).proxied).toBe(false);
    expect((await previewCustomerRecords('t', 'z1', 'example.com', [a], []))[0]!.action).toBe('unchanged');
  });
});
