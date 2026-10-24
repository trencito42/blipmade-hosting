import { randomUUID } from 'node:crypto';

/**
 * The request id of a request.
 *
 * The web container sends the id it made to the API, so the journal of the
 * web and the journal of the API speak about the same request. The API only
 * believes the id of a proxy it knows, and only when the id is well formed:
 * an id that a client chose could be used to write into the journal of the
 * platform and to make two requests look like one.
 */

/** The header the id travels in. The web container forwards it as it is. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * The longest id that is taken over.
 *
 * The id ends up in the journal and in the answer of the API, so it has to be
 * short. Sixty-four characters is enough for a UUID and for the name of a
 * request.
 */
export const MAX_REQUEST_ID_LENGTH = 64;

/**
 * What an id may look like.
 *
 * Only the characters that are safe in a header, in a line of a journal and in
 * a link are allowed: no line break, no space, no quotation mark.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/** Whether the value may be used as the id of a request. */
export function isValidRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_REQUEST_ID_LENGTH &&
    REQUEST_ID_PATTERN.test(value)
  );
}

/* ------------------------------------------------------------------ *
 * The addresses that are believed.
 *
 * The list comes from the environment (`TRUSTED_PROXIES`) and holds an
 * address or a block of addresses, written as `172.16.0.0/12`.
 * ------------------------------------------------------------------ */

interface ParsedAddress {
  version: 4 | 6;
  value: bigint;
  bits: number;
}

/** Reads an IPv4 address. Returns null when the text is not one. */
function parseIpv4(text: string): bigint | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

/** Reads an IPv6 address, with or without `::` and with a trailing IPv4. */
function parseIpv6(text: string): bigint | null {
  let source = text;
  const zone = source.indexOf('%');
  if (zone !== -1) source = source.slice(0, zone);
  if (!source.includes(':')) return null;

  const groups = (part: string): bigint[] | null => {
    if (!part) return [];
    const pieces = part.split(':');
    const values: bigint[] = [];
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index]!;
      if (piece.includes('.')) {
        // An IPv4 address may only stand at the end, and it stands for two groups.
        if (index !== pieces.length - 1) return null;
        const v4 = parseIpv4(piece);
        if (v4 === null) return null;
        values.push((v4 >> 16n) & 0xffffn, v4 & 0xffffn);
        continue;
      }
      if (!/^[0-9A-Fa-f]{1,4}$/.test(piece)) return null;
      values.push(BigInt(parseInt(piece, 16)));
    }
    return values;
  };

  const halves = source.includes('::') ? source.split('::') : [source, undefined];
  if (halves.length > 2) return null;
  const head = groups(halves[0]!);
  if (!head) return null;

  let all: bigint[];
  if (halves[1] === undefined) {
    if (head.length !== 8) return null;
    all = head;
  } else {
    const tail = groups(halves[1]);
    if (!tail) return null;
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    all = [...head, ...new Array<bigint>(missing).fill(0n), ...tail];
  }

  return all.reduce((accumulator, group) => (accumulator << 16n) | group, 0n);
}

/**
 * Reads an address.
 *
 * An IPv4 address that was written as an IPv6 address (`::ffff:127.0.0.1`) is
 * read as the IPv4 address it stands for, because that is how it is seen on
 * the socket.
 */
export function parseAddress(text: string): ParsedAddress | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const v4 = parseIpv4(trimmed);
  if (v4 !== null) return { version: 4, value: v4, bits: 32 };

  const v6 = parseIpv6(trimmed);
  if (v6 === null) return null;

  // ::ffff:a.b.c.d is the same address as a.b.c.d.
  const mapped = (v6 >> 32n) === 0xffffn;
  if (mapped) return { version: 4, value: v6 & 0xffffffffn, bits: 32 };
  return { version: 6, value: v6, bits: 128 };
}

/** Reads an entry of the list of trusted addresses: an address or a block. */
function parseTrustedEntry(entry: string): { base: ParsedAddress; prefix: number } | null {
  const [address, prefixText, ...rest] = entry.trim().split('/');
  if (rest.length > 0) return null;
  const base = parseAddress(address ?? '');
  if (!base) return null;
  if (prefixText === undefined) return { base, prefix: base.bits };
  if (!/^\d{1,3}$/.test(prefixText)) return null;
  const prefix = Number(prefixText);
  if (prefix > base.bits) return null;
  return { base, prefix };
}

/**
 * Whether the address is one of the addresses that are believed.
 *
 * An address that cannot be read is not believed, and a list that cannot be
 * read is empty: a broken entry never widens the trust.
 */
export function isTrustedAddress(address: string | undefined, trusted: readonly string[]): boolean {
  if (!address) return false;
  const parsed = parseAddress(address);
  if (!parsed) return false;

  for (const entry of trusted) {
    const range = parseTrustedEntry(entry);
    if (!range) continue;
    if (range.base.version !== parsed.version) continue;
    const shift = BigInt(parsed.bits - range.prefix);
    if ((parsed.value >> shift) === (range.base.value >> shift)) return true;
  }
  return false;
}

/** The part of a request the id is taken from. */
export interface RequestIdSource {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | undefined } | undefined;
}

/**
 * The id of a request.
 *
 * The id of the proxy is taken when the request came through a proxy that is
 * believed and when the id is well formed. In every other case a new id is
 * made here, so that the journal of the API always names a request that the
 * API itself has seen.
 */
export function resolveRequestId(
  source: RequestIdSource,
  trusted: readonly string[],
  makeId: () => string = () => randomUUID(),
): string {
  const carried = source.headers[REQUEST_ID_HEADER];
  if (typeof carried === 'string' && isValidRequestId(carried)) {
    if (isTrustedAddress(source.socket?.remoteAddress, trusted)) return carried;
  }
  return makeId();
}
