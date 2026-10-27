import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  buildDiscordPayload,
  incidentIdOf,
  isDiscordWebhookUrl,
  sanitizeAlertText,
  sendDiscordAlert,
  toDiscordAlert,
  type DiscordAlert,
} from '../src/services/ops-alert-discord.js';

/**
 * The Discord channel of the operator.
 *
 * Discord answers with its own rules: 204 when it takes the message, 429 when
 * it is busy and asks how long to wait, and 5xx when the other side has a
 * problem. The tests put a real server in front of the adapter, so the
 * retries, the limits and the shape of the message are checked on the same
 * code path that the production uses.
 */

/** What the fake Discord saw. */
interface Seen {
  bodies: string[];
  headers: Array<Record<string, string | string[] | undefined>>;
}

/** One answer of the fake Discord. */
interface Answer {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}

/**
 * A server that answers like Discord.
 *
 * The answers are given one after the other: the first call gets the first
 * answer, the second call the second one, and when they run out the last one
 * is used again.
 */
async function startDiscord(answers: Answer[]): Promise<{
  target: string;
  seen: Seen;
  close: () => Promise<void>;
}> {
  const seen: Seen = { bodies: [], headers: [] };
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      seen.bodies.push(Buffer.concat(chunks).toString('utf8'));
      seen.headers.push(request.headers);
      const answer = answers[Math.min(seen.bodies.length - 1, answers.length - 1)] ?? { status: 204 };
      response.writeHead(answer.status, answer.headers ?? {});
      response.end(answer.body ?? '');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    target: `http://127.0.0.1:${port}/api/webhooks/1/token`,
    seen,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/**
 * The fetch that sends to the fake Discord.
 *
 * The adapter believes that it speaks to Discord, because the address it is
 * given is an address of Discord. The call itself goes to the server of the
 * test, so the body that is really sent is the one that is checked.
 */
function fetchTo(target: string): typeof fetch {
  return (async (_input: unknown, init?: RequestInit) => {
    const response = await fetch(target, init);
    return response;
  }) as unknown as typeof fetch;
}

/** An alert of the tests. */
function alert(overrides: Partial<DiscordAlert> = {}): DiscordAlert {
  return {
    severity: 'critical',
    title: 'The mail server does not answer',
    description: 'The mail system did not answer for three checks in a row.',
    component: 'mailcow',
    detail: 'the check of the mail system failed: connection refused',
    fingerprint: `mailcow:health:${randomUUID()}`,
    incidentId: 'INC-0123456789',
    occurredAt: '2026-10-26T12:00:00.000Z',
    dashboardUrl: 'https://blipmade.com/admin/ops',
    ...overrides,
  };
}

describe('the Discord channel of the operator', () => {
  let close: (() => Promise<void>) | null = null;

  beforeEach(() => {
    close = null;
  });

  afterEach(async () => {
    if (close) await close();
    close = null;
  });

  it('builds an embed with the severity, the component, the moment and the occurrence', () => {
    const payload = buildDiscordPayload(alert());
    const embed = (payload.embeds as Record<string, unknown>[])[0];
    expect(embed.title).toContain('mail server');
    expect(embed.timestamp).toBe('2026-10-26T12:00:00.000Z');
    expect(embed.url).toBe('https://blipmade.com/admin/ops');
    const names = (embed.fields as { name: string }[]).map((field) => field.name);
    expect(names).toContain('Severity');
    expect(names).toContain('Component');
    expect(names).toContain('Incident');
    expect(names).toContain('Details');
    const severity = (embed.fields as { name: string; value: string }[]).find((f) => f.name === 'Severity');
    expect(severity?.value).toBe('Critical');
    const incident = (embed.fields as { name: string; value: string }[]).find((f) => f.name === 'Incident');
    expect(incident?.value).toBe('INC-0123456789');
  });

  it('gives every field of the embed a value, because Discord refuses a field without one', () => {
    // Discord answers a message with an embed that holds a field without a
    // value with a 400, and the whole alarm is lost with it. The severity of
    // the test message of the script of the channel was not in the map of the
    // words, so the field of the severity went out empty.
    for (const severity of ['critical', 'warning', 'recovery', 'info'] as const) {
      const payload = buildDiscordPayload(alert({ severity }));
      const embed = (payload.embeds as Record<string, unknown>[])[0];
      const fields = embed.fields as { name: string; value: string }[];
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        expect(typeof field.value).toBe('string');
        expect(field.value.length).toBeGreaterThan(0);
      }
    }
  });

  it('falls back to the word of a severity that is not known', () => {
    const payload = buildDiscordPayload(alert({ severity: 'unknown' as unknown as DiscordAlert['severity'] }));
    const embed = (payload.embeds as Record<string, unknown>[])[0];
    const fields = embed.fields as { name: string; value: string }[];
    const severity = fields.find((field) => field.name === 'Severity');
    expect(severity?.value).toBe('unknown');
  });

  it('calls nobody out and lets no message mention a customer', () => {
    const payload = buildDiscordPayload(alert({ detail: 'the customer jane.doe@example.com cannot sign in' }));
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(JSON.stringify(payload)).not.toContain('jane.doe@example.com');
    expect(JSON.stringify(payload)).toContain('email redacted');
  });

  it('cleans the secrets out of the text of an alarm', () => {
    // The values are fixtures of the test, not keys of anybody. They have
    // the shape of a key, because the shape is what the cleaner looks for.
    const clean = sanitizeAlertText(
      'the key sk_live_abc123456 and the token whsec_RB1IpW6CZdmgE6mRmK7pi54EiwlRe0lF are not right',
    );
    expect(clean).not.toContain('sk_live_abc123456');
    expect(clean).not.toContain('whsec_RB1IpW6CZdmgE6mRmK7pi54EiwlRe0lF');
    expect(clean).toContain('redacted');
  });

  it('cleans a password that is written in a pair of words', () => {
    const clean = sanitizeAlertText('password=hunter2secret');
    expect(clean).not.toContain('hunter2secret');
  });

  it('shortens a text that is longer than Discord allows', () => {
    const clean = sanitizeAlertText('x'.repeat(5000), 100);
    expect(clean.length).toBeLessThanOrEqual(100);
  });

  it('refuses an address that is not a webhook of Discord', () => {
    expect(isDiscordWebhookUrl('https://discord.com/api/webhooks/123/tok')).toBe(true);
    expect(isDiscordWebhookUrl('https://discordapp.com/api/v10/webhooks/123/tok')).toBe(true);
    expect(isDiscordWebhookUrl('https://example.com/hook')).toBe(false);
    expect(isDiscordWebhookUrl('http://discord.com/api/webhooks/123/tok')).toBe(false);
    expect(isDiscordWebhookUrl('')).toBe(false);
  });

  it('gives the same name to the same occurrence', () => {
    expect(incidentIdOf('mailcow:health')).toBe(incidentIdOf('mailcow:health'));
    expect(incidentIdOf('mailcow:health')).not.toBe(incidentIdOf('mailcow:other'));
  });

  it('writes the alert of a finding with the name of the occurrence', () => {
    const built = toDiscordAlert({
      severity: 'warning',
      title: 'The disk of the host is filling up',
      detail: 'the disk is at 91%',
      check: 'host',
      fingerprint: 'host:disk',
    });
    expect(built.severity).toBe('warning');
    expect(built.component).toBe('host');
    expect(built.incidentId).toBe(incidentIdOf('host:disk'));
  });

  it('sends the message and says that it was sent', async () => {
    const discord = await startDiscord([{ status: 204 }]);
    close = discord.close;
    const delivery = await sendDiscordAlert(alert(), {
      url: 'https://discord.com/api/webhooks/123456789/secret-token',
      fetchImpl: fetchTo(discord.target),
      sleep: async () => undefined,
    });
    expect(delivery.status).toBe('sent');
    expect(discord.seen.bodies.length).toBe(1);
    const body = JSON.parse(discord.seen.bodies[0]);
    expect(body.embeds[0].title).toContain('mail server');
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it('waits for the time that Discord asks when the channel is busy', async () => {
    const waits: number[] = [];
    let calls = 0;
    const delivery = await sendDiscordAlert(alert(), {
      url: 'https://discord.com/api/webhooks/123/tok',
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(JSON.stringify({ retry_after: 2 }), { status: 429 });
        }
        return new Response(null, { status: 204 });
      },
      sleep: async (ms: number) => {
        waits.push(ms);
      },
    });
    expect(delivery.status).toBe('sent');
    expect(calls).toBe(2);
    expect(waits[0]).toBe(2000);
  });

  it('tries again when the other side has a problem', async () => {
    let calls = 0;
    const delivery = await sendDiscordAlert(alert(), {
      url: 'https://discord.com/api/webhooks/123/tok',
      fetchImpl: async () => {
        calls += 1;
        if (calls < 3) return new Response(null, { status: 502 });
        return new Response(null, { status: 204 });
      },
      sleep: async () => undefined,
    });
    expect(delivery.status).toBe('sent');
    expect(calls).toBe(3);
  });

  it('gives up when Discord refuses the address', async () => {
    let calls = 0;
    const delivery = await sendDiscordAlert(alert(), {
      url: 'https://discord.com/api/webhooks/123/tok',
      fetchImpl: async () => {
        calls += 1;
        return new Response('unknown webhook', { status: 404 });
      },
      sleep: async () => undefined,
    });
    expect(delivery.status).toBe('failed');
    // A refusal is not a moment that is worth trying again.
    expect(calls).toBe(1);
  });

  it('does not send the same occurrence twice in a short time', async () => {
    const fingerprint = `mailcow:health:twice:${randomUUID()}`;
    const first = await sendDiscordAlert(alert({ fingerprint }), {
      url: 'https://discord.com/api/webhooks/123/tok',
      fetchImpl: async () => new Response(null, { status: 204 }),
      sleep: async () => undefined,
    });
    const second = await sendDiscordAlert(alert({ fingerprint }), {
      url: 'https://discord.com/api/webhooks/123/tok',
      fetchImpl: async () => new Response(null, { status: 204 }),
      sleep: async () => undefined,
    });
    expect(first.status).toBe('sent');
    expect(second.status).toBe('skipped');
    expect(second.reason).toContain('already sent');
  });

  it('does not send anything when there is no channel', async () => {
    const delivery = await sendDiscordAlert(alert(), {
      url: '',
      fetchImpl: async () => new Response(null, { status: 204 }),
    });
    expect(delivery.status).toBe('skipped');
    expect(delivery.reason).toContain('no Discord channel');
  });

  it('refuses to send the message of Discord to an address that is not Discord', async () => {
    let called = false;
    const delivery = await sendDiscordAlert(alert(), {
      url: 'https://example.com/collect',
      fetchImpl: async () => {
        called = true;
        return new Response(null, { status: 204 });
      },
    });
    expect(delivery.status).toBe('failed');
    expect(called).toBe(false);
  });
});
