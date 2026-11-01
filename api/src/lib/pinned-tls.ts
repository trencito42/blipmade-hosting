import https from 'node:https';
import { timingSafeEqual } from 'node:crypto';
import type { TLSSocket } from 'node:tls';

/**
 * A TLS client that trusts one certificate that the operator wrote down.
 *
 * The hypervisor signs its own certificate, so there is no authority to ask.
 * Skipping the check would let anyone on the private network answer as the
 * hypervisor and read the token of the API, so the certificate is compared to
 * its SHA-256 fingerprint right after the handshake. The comparison runs
 * before the first byte of the request is written: the request waits for the
 * secure connection and the listener below runs first.
 */

/** A fingerprint as bytes, from the usual `AA:BB:..` or plain hex form. */
export function parseFingerprint(text: string): Buffer | null {
  const hex = text.trim().replace(/^sha-?256[:=\s]*/i, '').replace(/[:\s-]/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? Buffer.from(hex, 'hex') : null;
}

/** Whether the certificate presented by the peer is the pinned one. */
export function fingerprintMatches(presented: string | undefined, pinned: Buffer): boolean {
  const actual = presented ? parseFingerprint(presented) : null;
  return actual !== null && actual.length === pinned.length && timingSafeEqual(actual, pinned);
}

/** An agent that refuses every certificate except the pinned one. */
export function pinnedAgent(fingerprint: string): https.Agent {
  const pinned = parseFingerprint(fingerprint);
  if (!pinned) throw new Error('The pinned fingerprint is not a SHA-256 fingerprint.');
  const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
  const create = agent.createConnection.bind(agent) as (options: object, callback?: (error: Error | null, socket: TLSSocket) => void) => TLSSocket;
  (agent as unknown as { createConnection: typeof create }).createConnection = (options, callback) => {
    const socket = create(options, callback);
    socket.once('secureConnect', () => {
      if (!fingerprintMatches(socket.getPeerCertificate()?.fingerprint256, pinned)) {
        socket.destroy(new Error('The certificate of the server is not the pinned one.'));
      }
    });
    return socket;
  };
  return agent;
}
