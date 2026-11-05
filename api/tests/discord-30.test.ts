import { describe, expect, it } from 'vitest';
import { DESIRED_GUILD_STATE_V1, PROTECTED_DISCORD_CHANNEL_IDS } from '../src/services/discord/desired-state.js';
import { computeManagedRoleDelta } from '../src/services/discord/community.js';
import { verifyDiscordInteractionSignature } from '../src/services/discord/interaction-util.js';
import { generateKeyPairSync, sign } from 'node:crypto';

describe('Discord 3.0 desired state', () => {
  it('preserves protected bugs forum by id', () => {
    const row = DESIRED_GUILD_STATE_V1.channels.find((c) => c.key === 'protected_bugs_forum');
    expect(row?.existingId).toBe('1565844667147493376');
    expect(row?.preserveOnly).toBe(true);
    expect(PROTECTED_DISCORD_CHANNEL_IDS).toContain('1565844667147493376');
  });

  it('does not duplicate support_desk binding keys', () => {
    const keys = DESIRED_GUILD_STATE_V1.channels.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('managed role delta', () => {
  it('only removes managed roles not in grant set', () => {
    const managed = ['r-verified', 'r-customer', 'r-staff'];
    const delta = computeManagedRoleDelta(['r-verified', 'r-other-bot'], managed, ['r-customer']);
    expect(delta.add).toEqual(['r-customer']);
    expect(delta.remove).toEqual(['r-verified']);
    expect(delta.remove).not.toContain('r-other-bot');
  });
});

describe('interaction signature verification', () => {
  it('accepts valid ed25519 signatures', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pubHex = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = '{"type":1}';
    const sig = sign(null, Buffer.from(timestamp + body), privateKey).toString('hex');
    expect(verifyDiscordInteractionSignature(body, sig, timestamp, pubHex)).toBe(true);
  });

  it('rejects tampered bodies', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pubHex = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = '{"type":1}';
    const sig = sign(null, Buffer.from(timestamp + body), privateKey).toString('hex');
    expect(verifyDiscordInteractionSignature('{"type":2}', sig, timestamp, pubHex)).toBe(false);
  });
});

describe('protected-only sync mode', () => {
  it('plans nothing but the protected channel', async () => {
    const { desiredStateFromConfig } = await import('../src/services/discord/guild-sync.js');
    const { DESIRED_GUILD_STATE_V1 } = await import('../src/services/discord/desired-state.js');
    const full = desiredStateFromConfig(DESIRED_GUILD_STATE_V1);
    expect(full.channels.length).toBeGreaterThan(5);
    const only = desiredStateFromConfig({ ...DESIRED_GUILD_STATE_V1, mode: 'protected_only' });
    expect(only.categories).toEqual([]);
    expect(only.channels.map((channel) => channel.existingId)).toEqual(['1565844667147493376']);
  });
});
