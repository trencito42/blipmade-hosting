import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';
import {
  chmodFile,
  copyFile,
  createSchedule,
  listActivity,
  listAllocations,
  listDatabases,
  listSchedules,
  moveFile,
  readFile,
  renameFile,
  runSchedule,
  uploadFile,
} from '../src/services/pterodactyl/client.js';

/**
 * The routes and the bodies of the client API of the panel.
 *
 * The panel is never contacted. The answers are the ones that Pterodactyl
 * 1.15 really sends, and every request is checked, so a change of the panel
 * that breaks an operation is caught here and not by a customer.
 */

const ORIGINAL = {
  PTERODACTYL_URL: env.PTERODACTYL_URL,
  PANEL_KEYMINT_URL: env.PANEL_KEYMINT_URL,
  PANEL_KEYMINT_SECRET: env.PANEL_KEYMINT_SECRET,
  PTERODACTYL_APP_KEY: env.PTERODACTYL_APP_KEY,
};

function setEnv(key: keyof typeof ORIGINAL, value: string): void {
  Object.defineProperty(env, key, { value, configurable: true, writable: true, enumerable: true });
}

/** The key of a customer. */
const CLIENT_KEY = `ptlc_${'a'.repeat(44)}`;

interface Call {
  url: string;
  method: string;
  body: unknown;
}

let calls: Call[] = [];

/**
 * Answers every call with the payload of the test. The body of the request is
 * kept, so a test can check what was sent.
 */
function stubFetch(payload: unknown, status = 200): void {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      let body: unknown = undefined;
      if (typeof init?.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      calls.push({ url, method: init?.method ?? 'GET', body });
      // A body of null keeps the answer legal for the statuses that carry none.
      // Text is sent as it is, so the endpoints that answer with plain text can
      // be faked too.
      const answer = payload === undefined ? null : typeof payload === 'string' ? payload : JSON.stringify(payload);
      return new Response(answer, {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

/** The path of the call, without the address of the panel. */
function pathOf(index = 0): string {
  return new URL(calls[index]!.url).pathname;
}

/** The query of the call, without the address of the panel. */
function queryOf(index = 0): string {
  return new URL(calls[index]!.url).search;
}

beforeEach(() => {
  setEnv('PTERODACTYL_URL', 'https://panel.example.test');
  setEnv('PANEL_KEYMINT_URL', '');
  setEnv('PANEL_KEYMINT_SECRET', '');
  setEnv('PTERODACTYL_APP_KEY', 'ptla_admin_key');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  setEnv('PTERODACTYL_URL', ORIGINAL.PTERODACTYL_URL);
  setEnv('PANEL_KEYMINT_URL', ORIGINAL.PANEL_KEYMINT_URL);
  setEnv('PANEL_KEYMINT_SECRET', ORIGINAL.PANEL_KEYMINT_SECRET);
  setEnv('PTERODACTYL_APP_KEY', ORIGINAL.PTERODACTYL_APP_KEY);
});

describe('the activity of the panel', () => {
  it('reads the name of the event and the moment out of the panel answer', async () => {
    stubFetch({
      object: 'list',
      data: [
        {
          object: 'activity_log',
          attributes: {
            id: 'a1',
            event: 'server:power.start',
            is_api: true,
            ip: '10.77.0.13',
            description: null,
            properties: { signal: 'start' },
            timestamp: '2026-10-23T03:20:24+00:00',
          },
        },
      ],
    });

    const entries = await listActivity(CLIENT_KEY, 'server-uuid');

    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe('server:power.start');
    expect(entries[0]!.created_at).toBe('2026-10-23T03:20:24+00:00');
    expect(entries[0]!.meta).toMatchObject({ signal: 'start', ip: '10.77.0.13', is_api: true });
  });
});

describe('the addresses of the server', () => {
  it('reads them from the network route of the panel', async () => {
    stubFetch({
      object: 'list',
      data: [
        {
          object: 'allocation',
          attributes: { id: 74, ip: '10.77.0.11', ip_alias: 'node-1', port: 30001, notes: '', is_default: true },
        },
      ],
    });

    const allocations = await listAllocations(CLIENT_KEY, 'server-uuid');

    expect(pathOf()).toBe('/api/client/servers/server-uuid/network/allocations');
    expect(allocations[0]).toMatchObject({ id: 74, ip: '10.77.0.11', port: 30001, alias: 'node-1', is_default: true });
  });
});

describe('the databases of the server', () => {
  it('asks for the password and reads the host out of the answer', async () => {
    stubFetch({
      object: 'list',
      data: [
        {
          object: 'database',
          attributes: {
            id: 'eK3pQz',
            name: 'app',
            username: 'u_app',
            host: { address: '10.77.0.11', port: 3306 },
            connections_from: '%',
            password: 'secret',
          },
        },
      ],
    });

    const databases = await listDatabases(CLIENT_KEY, 'server-uuid');

    expect(queryOf()).toContain('include=password');
    expect(databases[0]).toMatchObject({
      id: 'eK3pQz',
      name: 'app',
      username: 'u_app',
      host: '10.77.0.11',
      port: 3306,
      remote: '%',
      password: 'secret',
    });
  });
});

describe('the files of the server', () => {
  it('sends the folder of a rename under the name the panel expects', async () => {
    stubFetch(undefined, 204);

    await renameFile(CLIENT_KEY, 'server-uuid', '/logs/app.log', '/logs/app.txt');

    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.body).toEqual({ root: '/logs', files: [{ from: 'app.log', to: 'app.txt' }] });
  });

  it('copies a file with the location the panel expects', async () => {
    stubFetch(undefined, 204);

    await copyFile(CLIENT_KEY, 'server-uuid', '/logs/app.log', '/archive/app.log');

    expect(calls[0]!.body).toEqual({ location: '/logs/app.log' });
    // The panel names the copy after the original, "app copy.log", and the
    // copy is moved to the place the customer asked for.
    expect(calls[1]!.body).toEqual({ root: '/', files: [{ from: '/logs/app copy.log', to: '/archive/app.log' }] });
  });

  it('moves a file with a rename that starts at the root', async () => {
    stubFetch(undefined, 204);

    await moveFile(CLIENT_KEY, 'server-uuid', '/logs/app.log', '/archive/app.log');

    expect(calls[0]!.body).toEqual({ root: '/', files: [{ from: '/logs/app.log', to: '/archive/app.log' }] });
  });

  it('uploads a file by writing it, so the node is never named', async () => {
    stubFetch(undefined, 204);

    await uploadFile(CLIENT_KEY, 'server-uuid', '/logs', 'app.log', Buffer.from('hello'));

    expect(pathOf()).toBe('/api/client/servers/server-uuid/files/write');
    expect(queryOf()).toContain('file=%2Flogs%2Fapp.log');
  });
});

describe('the schedules of the server', () => {
  it('reads the cron out of its parts and the action out of the task', async () => {
    stubFetch({
      object: 'list',
      data: [
        {
          object: 'server_schedule',
          attributes: {
            id: 4,
            name: 'Nightly',
            cron: { minute: '0', hour: '3', day_of_month: '*', month: '*', day_of_week: '*' },
            is_active: true,
            last_run_at: '2026-10-22T03:00:00+00:00',
            next_run_at: '2026-10-23T03:00:00+00:00',
            relationships: {
              tasks: {
                object: 'list',
                data: [
                  {
                    object: 'schedule_task',
                    attributes: { id: 9, action: 'power', payload: 'restart', time_offset: 0, sequence_id: 1 },
                  },
                ],
              },
            },
          },
        },
      ],
    });

    const schedules = await listSchedules(CLIENT_KEY, 'server-uuid');

    expect(schedules[0]).toMatchObject({
      id: 4,
      name: 'Nightly',
      cron: '0 3 * * *',
      action: 'power',
      active: true,
      payload: { signal: 'restart' },
      last_run: '2026-10-22T03:00:00+00:00',
      next_run: '2026-10-23T03:00:00+00:00',
    });
  });

  it('creates the schedule and then the task it runs', async () => {
    stubFetch({ object: 'server_schedule', attributes: { id: 12 } });

    await createSchedule(CLIENT_KEY, 'server-uuid', {
      name: 'Nightly',
      cron: '0 3 * * *',
      action: 'power',
      active: true,
      payload: { signal: 'restart' },
    });

    expect(calls[0]!.body).toMatchObject({ name: 'Nightly', is_active: true, minute: '0', hour: '3', month: '*' });
    expect(pathOf(1)).toBe('/api/client/servers/server-uuid/schedules/12/tasks');
    expect(calls[1]!.body).toMatchObject({ action: 'power', payload: 'restart', time_offset: 0 });
  });

  it('runs a schedule with the route the panel has', async () => {
    stubFetch(undefined, 204);

    await runSchedule(CLIENT_KEY, 'server-uuid', 12);

    expect(pathOf()).toBe('/api/client/servers/server-uuid/schedules/12/execute');
  });
});

describe('the permissions of a file', () => {
  it('sends the mode as the octal digits the node takes', async () => {
    stubFetch(undefined, 204);

    await chmodFile(CLIENT_KEY, 'server-uuid', '/logs/app.log', 420);

    // The node reads the permissions as octal digits, so the number is
    // written back as those digits.
    expect(calls[0]!.body).toEqual({ root: '/logs', files: [{ file: 'app.log', mode: '644' }] });
  });
});

describe('the content of a file', () => {
  it('reads the answer of the panel as it is', async () => {
    stubFetch('line one\nline two\n');

    const file = await readFile(CLIENT_KEY, 'server-uuid', '/logs/app.log');

    expect(pathOf()).toBe('/api/client/servers/server-uuid/files/contents');
    expect(queryOf()).toContain('file=%2Flogs%2Fapp.log');
    expect(file.content).toBe('line one\nline two\n');
  });
});
