import { timingSafeEqual } from 'node:crypto';
import { Resolver } from 'node:dns/promises';

/**
 * The DNS proof of ownership.
 *
 * A hostname only belongs to a customer when they can prove it. The proof is a
 * TXT record with a random token that the platform generated for that hostname.
 * An A record that points at the gateway address proves nothing: every
 * customer of the platform points at the same address, so it cannot be used to
 * tell two hostnames apart.
 *
 * The lookup lives in its own module so the routes can be tested without ever
 * touching the network.
 */

/** The label the proof record is published under. */
export const VERIFICATION_LABEL = '_blipmade-verify';

/** How long the resolver may spend on a single lookup. */
const LOOKUP_TIMEOUT_MS = 5_000;

/** A DNS name may not be longer than this. */
const MAX_NAME_LENGTH = 253;

export interface TxtLookup {
  /** Every value that is published under the name. */
  values: string[];
  /** Why the lookup could not be completed, if it could not. */
  error: string | null;
}

/** The name the TXT record has to be published under for a hostname. */
export function verificationHostFor(hostname: string): string {
  return `${VERIFICATION_LABEL}.${hostname.trim().toLowerCase()}`;
}

/**
 * True when the name is a DNS name a TXT record can be published under. The
 * underscore of the verification label is allowed here, although it is not a
 * valid host name.
 */
export function isDnsName(name: string): boolean {
  if (!name || name.length > MAX_NAME_LENGTH) return false;
  const labels = name.split('.');
  for (const label of labels) {
    if (!label.length || label.length > 63) return false;
    if (!/^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?$/.test(label)) return false;
  }
  return true;
}

/**
 * Reads the TXT records of a name.
 *
 * A name that does not exist yet is not an error: the customer simply has not
 * published the proof yet. A timeout or a broken resolver is reported as an
 * error, so the caller can tell "not yet" apart from "cannot tell".
 */
export async function resolveTxt(host: string): Promise<TxtLookup> {
  const name = host.trim().toLowerCase();
  if (!isDnsName(name)) {
    return { values: [], error: 'The verification name is not a valid DNS name.' };
  }

  const resolver = new Resolver();
  const timer = setTimeout(() => resolver.cancel(), LOOKUP_TIMEOUT_MS);
  try {
    const records = await resolver.resolveTxt(name);
    const values = records
      .map((chunks) => chunks.join('').trim())
      .filter((value) => value.length > 0);
    return { values, error: null };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Nothing is published under that name yet.
    if (code === 'ENOTFOUND' || code === 'ENODATA') return { values: [], error: null };
    if (code === 'ECANCELLED' || code === 'ETIMEOUT') {
      return { values: [], error: 'The DNS lookup timed out. Try again in a moment.' };
    }
    return { values: [], error: 'The DNS records could not be read right now.' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * True when one of the published values is the expected token. The comparison
 * takes the same time for every value, so it cannot be used to guess a token.
 */
export function matchesToken(values: string[], token: string): boolean {
  if (!token) return false;
  const expected = Buffer.from(token);
  return values.some((value) => {
    const candidate = Buffer.from(value.trim());
    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(candidate, expected);
  });
}
