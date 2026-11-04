import { env } from '../../env.js';
import { badRequest } from '../../lib/errors.js';

export const DISCORD_API = 'https://discord.com/api/v10';

export function parseDiscordError(text: string): string {
  try {
    const json = JSON.parse(text) as { message?: string; code?: number };
    if (json.code === 50013) return 'The bot lacks permission (often role hierarchy — move the bot role above managed roles).';
    if (json.code === 10007) return 'This Discord user is not in the server anymore.';
    if (json.code === 10004) return 'The configured Discord server was not found. Check DISCORD_GUILD_ID.';
    if (json.message) return json.message;
  } catch {
    /* plain text */
  }
  return text.slice(0, 500) || 'Discord API error';
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function botFetch(path: string, init?: RequestInit, attempt = 0): Promise<Response> {
  if (!env.DISCORD_BOT_TOKEN) throw badRequest('Discord community is not configured.');
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 429 && attempt < 4) {
    const retry = Number(res.headers.get('retry-after') ?? '1');
    await sleep(Math.min(10, retry) * 1000);
    return botFetch(path, init, attempt + 1);
  }
  return res;
}
