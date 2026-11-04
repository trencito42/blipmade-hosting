import { createPublicKey, verify } from 'node:crypto';

/** Verify Discord interaction signatures (Ed25519). */
export function verifyDiscordInteractionSignature(
  rawBody: string,
  signatureHex: string,
  timestamp: string,
  publicKeyHex: string,
): boolean {
  if (!publicKeyHex || publicKeyHex.length < 32) return false;
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(publicKeyHex, 'hex'),
      ]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

export function interactionJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function ephemeral(content: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 4,
    data: {
      content,
      flags: 64,
      ...(extra ?? {}),
    },
  };
}

export function updateMessage(content: string, components?: unknown[]): Record<string, unknown> {
  return {
    type: 7,
    data: {
      content,
      ...(components ? { components } : {}),
    },
  };
}

export function modal(customId: string, title: string, fields: { id: string; label: string; style?: 1 | 2; placeholder?: string }[]): Record<string, unknown> {
  return {
    type: 9,
    data: {
      custom_id: customId,
      title: title.slice(0, 45),
      components: fields.map((field) => ({
        type: 1,
        components: [
          {
            type: 4,
            custom_id: field.id,
            label: field.label.slice(0, 45),
            style: field.style ?? 2,
            placeholder: field.placeholder?.slice(0, 100),
            required: true,
            max_length: field.id === 'subject' ? 160 : 2000,
          },
        ],
      })),
    },
  };
}
