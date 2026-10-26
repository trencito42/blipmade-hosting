/**
 * The Discord channel of the operator.
 *
 * The webhook of the operator was a single address that received the alarm as
 * it was, the body of the platform. Discord does not take such a body: it
 * wants a message of its own, with an embed that carries the severity, the
 * title, the component that is broken, the moment and the name of the
 * occurrence. Sending the body of the platform to Discord is a message that
 * arrives and that nobody can read, so the channel has an adapter of its own.
 *
 * The adapter is careful about three things:
 *
 *   1. Nothing that is a secret leaves the host. The text of the alarm is
 *      cleaned before it is built into the embed: a key, a token, a
 *      password, an address of a customer.
 *   2. The channel does not become a flood. A finding that was already
 *      reported in the same minute is not reported again, and the number of
 *      messages of the hour is bounded.
 *   3. Discord answers with 429 when the channel is busy, and that is not an
 *      error: the message is sent again after the time that Discord asked
 *      for. A 5xx is an error of the other side, so it is tried again a few
 *      times before it is given up.
 *
 * The journal of the alarms and the message by mail stay where they are: this
 * adapter adds a channel, it does not replace the others.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { env } from '../env.js';
import { redis } from '../redis.js';

/** How much the alert matters, in the words of Discord. */
export type DiscordSeverity = 'critical' | 'warning' | 'recovery';

/** The alert that is written for Discord. */
export interface DiscordAlert {
  severity: DiscordSeverity;
  /** The title of the embed. */
  title: string;
  /** What is wrong, in one sentence. */
  description: string;
  /** The part of the platform that is broken. */
  component: string;
  /** The facts of the occurrence, already cleaned. */
  detail: string;
  /** What makes this occurrence the same one and not another one. */
  fingerprint: string;
  /** The name the operator can use to talk about the occurrence. */
  incidentId: string;
  /** When it happened. */
  occurredAt: string;
  /** The page of the operations the operator opens. */
  dashboardUrl?: string;
}

/** What the delivery did. */
export interface DiscordDelivery {
  status: 'sent' | 'skipped' | 'failed';
  reason: string;
  /** The answer of Discord, when there was one. */
  httpStatus?: number;
  /** How many times the message was tried. */
  attempts: number;
}

/** The limits of Discord, and the limits of the platform itself. */
const LIMITS = {
  /** The longest title of an embed. */
  title: 256,
  /** The longest description of an embed. */
  description: 4096,
  /** The longest value of a field. */
  field: 1024,
  /** The longest footer of an embed. */
  footer: 2048,
  /** How many times a message is tried. */
  attempts: 4,
  /** The first pause between two tries. */
  backoffMs: 500,
  /** The longest pause that is waited for when Discord is busy. */
  maxRetryAfterMs: 20_000,
  /** The timeout of one call. */
  timeoutMs: 10_000,
  /** How long a message is not sent again for the same occurrence. */
  dedupeSeconds: 300,
  /** How many messages may leave for Discord in an hour. */
  maxPerHour: 30,
} as const;

/** The colours of the severities. Discord reads them as decimal numbers. */
const COLORS: Record<DiscordSeverity, number> = {
  critical: 0xb32d2d,
  warning: 0xd08700,
  recovery: 0x2f7d32,
};

/** The words of the severities, so that the operator reads them and not a colour. */
const LABELS: Record<DiscordSeverity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  recovery: 'Recovered',
};

/**
 * The patterns that are cleaned out of the text of an alarm.
 *
 * The order matters: the more specific a pattern is, the earlier it is
 * applied, so a key inside a longer string is caught by its own rule and not
 * by the rule of the long strings.
 */
const SECRET_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\bsk_(?:test|live)_[A-Za-z0-9]{8,}/g, replacement: 'sk_<redacted>' },
  { pattern: /\bwhsec_[A-Za-z0-9]{8,}/g, replacement: 'whsec_<redacted>' },
  { pattern: /\b(?:rk|pk)_(?:test|live)_[A-Za-z0-9]{8,}/g, replacement: 'pk_<redacted>' },
  { pattern: /\bage1[0-9a-z]{20,}/g, replacement: 'age1<redacted>' },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi, replacement: 'Bearer <redacted>' },
  { pattern: /\b(Authorization|X-API-Key|Token|Secret|Password|Passwd|Pwd|Api[-_]?Key)\s*[:=]\s*\S{6,}/gi, replacement: '$1=<redacted>' },
  { pattern: /\b([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})\b/gi, replacement: '<email redacted>' },
  { pattern: /\bcm[0-9a-z]{20,}\b/g, replacement: '<id redacted>' },
  { pattern: /([a-z]+:\/\/)[^\s/@:]+:[^\s/@]+@/gi, replacement: '$1<redacted>@' },
  { pattern: /\b[A-Fa-f0-9]{40,}\b/g, replacement: '<hash redacted>' },
  { pattern: /\b[A-Za-z0-9+/]{48,}={0,2}\b/g, replacement: '<blob redacted>' },
];

/**
 * Cleans the text of an alarm, so that nothing secret and nothing about a
 * customer leaves the host.
 */
export function sanitizeAlertText(text: string, limit: number = LIMITS.field): string {
  let clean = text ?? '';
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    clean = clean.replace(pattern, replacement);
  }
  clean = clean.replace(/\r/g, '').trim();
  if (clean.length > limit) {
    clean = `${clean.slice(0, limit - 1)}…`;
  }
  return clean;
}

/**
 * The name of the occurrence.
 *
 * The fingerprint of the finding is the identity of the problem. It is short
 * enough to be written in a chat, and it is the same name in every message,
 * so the operator can search for it.
 */
export function incidentIdOf(fingerprint: string): string {
  const hash = createHash('sha1').update(fingerprint).digest('hex').slice(0, 10);
  return `INC-${hash.toUpperCase()}`;
}

/** The embed of an alert, as Discord wants it. */
export function buildDiscordEmbed(alert: DiscordAlert): Record<string, unknown> {
  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: 'Severity', value: LABELS[alert.severity], inline: true },
    { name: 'Component', value: sanitizeAlertText(alert.component, 200) || 'the platform', inline: true },
    { name: 'Incident', value: alert.incidentId, inline: true },
  ];
  const detail = sanitizeAlertText(alert.detail, LIMITS.field);
  if (detail) {
    fields.push({ name: 'Details', value: detail, inline: false });
  }
  const embed: Record<string, unknown> = {
    title: sanitizeAlertText(alert.title, LIMITS.title),
    description: sanitizeAlertText(alert.description, LIMITS.description),
    color: COLORS[alert.severity],
    timestamp: alert.occurredAt,
    fields,
    footer: { text: sanitizeAlertText(`Blipmade · ${alert.incidentId}`, LIMITS.footer) },
  };
  if (alert.dashboardUrl) {
    embed.url = alert.dashboardUrl;
  }
  return embed;
}

/** The whole message of Discord. */
export function buildDiscordPayload(alert: DiscordAlert): Record<string, unknown> {
  return {
    username: 'Blipmade Ops',
    // Nobody is called out by a message of the platform: an alarm is a
    // message about the platform, not about a person.
    allowed_mentions: { parse: [] },
    embeds: [buildDiscordEmbed(alert)],
  };
}

/**
 * The address of the Discord channel.
 *
 * The address is a secret: it carries the token that lets anybody write in
 * the channel of the operator. It is never written in a log, and it never
 * leaves the host in a message of the platform.
 *
 * It can be written down in the environment of the platform, or in a file
 * that only the owner of the platform can read. The file is the better way:
 * the address does not travel with the rest of the environment, and it is
 * not in a copy of the configuration.
 */
export function discordWebhookUrl(): string {
  const direct = env.OPS_DISCORD_WEBHOOK_URL.trim();
  if (direct) return direct;
  const file = env.OPS_DISCORD_WEBHOOK_FILE.trim();
  if (!file) return '';
  try {
    return readFileSync(file, 'utf8').trim();
  } catch (error) {
    console.error('[ops] the file of the Discord channel could not be read', (error as Error).message);
    return '';
  }
}

/**
 * Tells whether an address is a webhook of Discord.
 *
 * An address that is not one is refused: the payload of Discord would be
 * sent to an address that does not expect it, and the answer of that address
 * could carry the payload back to somebody.
 */
export function isDiscordWebhookUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname !== 'discord.com' && parsed.hostname !== 'discordapp.com' && parsed.hostname !== 'canary.discord.com') {
      return false;
    }
    return /^\/api\/(v\d+\/)?webhooks\/\d+\/[\w-]+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** The key under which a message that was sent is remembered. */
function dedupeKey(alert: DiscordAlert): string {
  const hash = createHash('sha1').update(`${alert.fingerprint}|${alert.severity}`).digest('hex').slice(0, 16);
  return `ops:discord:sent:${hash}`;
}

/** The key under which the number of messages of the hour is counted. */
const RATE_KEY = 'ops:discord:hour';

/**
 * Claims the right to send one message.
 *
 * Two guards: the same occurrence is not sent twice in a short time, and the
 * number of messages of the hour is bounded.
 */
async function claimDelivery(alert: DiscordAlert): Promise<{ allowed: boolean; reason: string }> {
  const key = dedupeKey(alert);
  const fresh = await redis.set(key, alert.occurredAt, 'EX', LIMITS.dedupeSeconds, 'NX');
  if (!fresh) {
    return { allowed: false, reason: 'the same occurrence was already sent' };
  }
  const count = await redis.incr(RATE_KEY);
  if (count === 1) await redis.expire(RATE_KEY, 3600);
  if (count > LIMITS.maxPerHour) {
    return { allowed: false, reason: 'the limit of the messages of the hour was reached' };
  }
  return { allowed: true, reason: 'the occurrence was claimed' };
}

/** How long to wait before the next try. */
function backoff(attempt: number): number {
  return LIMITS.backoffMs * 2 ** (attempt - 1);
}

/** How long Discord asked to wait. */
function retryAfterMs(response: Response, body: string): number {
  const header = response.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, LIMITS.maxRetryAfterMs);
    }
  }
  try {
    const parsed = JSON.parse(body) as { retry_after?: number };
    if (typeof parsed.retry_after === 'number' && parsed.retry_after >= 0) {
      return Math.min(parsed.retry_after * 1000, LIMITS.maxRetryAfterMs);
    }
  } catch {
    /* the body of Discord was not JSON: the header is the answer then */
  }
  return 0;
}

/** The options of one delivery, so that a test can drive it. */
export interface DiscordSendOptions {
  /** The address to send to. When it is empty, the configured one is used. */
  url?: string;
  /** The function that sends the message. It is the real fetch in production. */
  fetchImpl?: typeof fetch;
  /** How many tries are made. */
  attempts?: number;
  /** The pause between two tries, in milliseconds. */
  backoffMs?: number;
  /** The function that waits. */
  sleep?: (ms: number) => Promise<void>;
  /** The clock. */
  now?: () => Date;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends one alert to the Discord channel of the operator.
 *
 * The function never throws: a channel that is down must not stop the sweep
 * of the platform, and the journal of the alarms is always written.
 */
export async function sendDiscordAlert(
  alert: DiscordAlert,
  options: DiscordSendOptions = {},
): Promise<DiscordDelivery> {
  const url = (options.url ?? discordWebhookUrl()).trim();
  if (!url) {
    return { status: 'skipped', reason: 'no Discord channel is configured', attempts: 0 };
  }
  if (!isDiscordWebhookUrl(url)) {
    return { status: 'failed', reason: 'the configured address is not a webhook of Discord', attempts: 0 };
  }

  const claim = await claimDelivery(alert);
  if (!claim.allowed) {
    return { status: 'skipped', reason: claim.reason, attempts: 0 };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? realSleep;
  const attempts = options.attempts ?? LIMITS.attempts;
  const wait = options.backoffMs ?? LIMITS.backoffMs;
  const payload = JSON.stringify(buildDiscordPayload(alert));

  let lastStatus = 0;
  let lastReason = 'the message was not sent';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIMITS.timeoutMs);
    try {
      const response = await doFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'blipmade-ops/1',
        },
        body: payload,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const body = await response.text();
      lastStatus = response.status;

      if (response.status === 204 || response.status === 200 || response.status === 201) {
        return { status: 'sent', reason: 'Discord took the message', httpStatus: response.status, attempts: attempt };
      }

      if (response.status === 429) {
        // Discord is busy. The message is sent again after the time that
        // Discord asked for, so nothing is lost and nothing is sent twice.
        const waitMs = retryAfterMs(response, body);
        lastReason = 'Discord asked to wait';
        if (attempt < attempts) {
          await sleep(waitMs > 0 ? waitMs : wait * attempt);
          continue;
        }
        return { status: 'failed', reason: lastReason, httpStatus: response.status, attempts: attempt };
      }

      if (response.status >= 500) {
        lastReason = `Discord answered ${response.status}`;
        if (attempt < attempts) {
          await sleep(wait * attempt);
          continue;
        }
        return { status: 'failed', reason: lastReason, httpStatus: response.status, attempts: attempt };
      }

      // 4xx that is not 429: the address is wrong, or the token is not valid.
      // Trying again would not help, and the message is not sent.
      lastReason = `Discord refused the message with ${response.status}`;
      console.error(`[ops] the Discord channel refused the message with ${response.status}`);
      return { status: 'failed', reason: lastReason, httpStatus: response.status, attempts: attempt };
    } catch (error) {
      clearTimeout(timer);
      lastReason = `the Discord channel could not be reached: ${(error as Error).message}`;
      if (attempt < attempts) {
        await sleep(wait * attempt);
        continue;
      }
    }
  }

  console.error('[ops]', lastReason);
  return { status: 'failed', reason: lastReason, httpStatus: lastStatus, attempts };
}

/**
 * The alert of a finding, written for Discord.
 *
 * The finding is the truth about what is broken; the alert is what the
 * operator reads. The link points at the page of the operations of the
 * platform, so the operator does not have to look for it.
 */
export function toDiscordAlert(input: {
  severity: DiscordSeverity;
  title: string;
  detail: string;
  check: string;
  fingerprint: string;
  occurredAt?: Date;
  dashboardUrl?: string;
}): DiscordAlert {
  const occurredAt = input.occurredAt ?? new Date();
  return {
    severity: input.severity,
    title: input.title,
    description: input.detail,
    component: input.check,
    detail: input.detail,
    fingerprint: input.fingerprint,
    incidentId: incidentIdOf(input.fingerprint),
    occurredAt: occurredAt.toISOString(),
    dashboardUrl: input.dashboardUrl,
  };
}
