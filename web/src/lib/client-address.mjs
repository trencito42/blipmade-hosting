/**
 * The address of the client.
 *
 * The header `X-Forwarded-For` carries a chain of addresses. By its
 * convention the FIRST element is the address of the client that opened the
 * connection and the LAST element is the address of the proxy that is the
 * closest to this server. The address that is written down is the address of
 * the client, never the address of a proxy, so the chain is read from the
 * left and the first address that is not a known proxy is taken.
 *
 * A header is only believed when the request came from a proxy that is known.
 * A client that sends the header itself can therefore never write an address
 * of its own choosing into the log, into the session or into the journal.
 *
 * The module is plain ESM and has no build step, so the server can run it as
 * it is: `node server.mjs`.
 */

/** Removes the brackets of an address and the marker of an IPv4 socket. */
export function normalizeAddress(address) {
  return String(address ?? '')
    .trim()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/^::ffff:/i, '');
}

/** Reads an IPv4 address into four bytes. */
function parseIpv4(text) {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const bytes = new Uint8Array(4);
  for (let index = 0; index < 4; index += 1) {
    if (!/^\d{1,3}$/.test(parts[index])) return null;
    const value = Number(parts[index]);
    if (value > 255) return null;
    bytes[index] = value;
  }
  return bytes;
}

/** Reads the groups of an IPv6 address, with the IPv4 form at the end. */
function parseIpv6Groups(text) {
  const groups = [];
  if (!text) return groups;
  for (const item of text.split(':')) {
    if (item === '') return null;
    if (item.includes('.')) {
      const bytes = parseIpv4(item);
      if (!bytes) return null;
      groups.push((bytes[0] << 8) | bytes[1]);
      groups.push((bytes[2] << 8) | bytes[3]);
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(item)) return null;
    groups.push(Number.parseInt(item, 16));
  }
  return groups;
}

/** Reads an IPv6 address into sixteen bytes. */
function parseIpv6(text) {
  if (!text.includes(':')) return null;
  const marker = text.indexOf('::');
  let head;
  let tail;
  if (marker >= 0) {
    const left = text.slice(0, marker);
    const right = text.slice(marker + 2);
    head = parseIpv6Groups(left);
    tail = parseIpv6Groups(right);
    if (!head || !tail) return null;
    // The "::" stands for at least one group of zeros.
    if (head.length + tail.length > 7) return null;
  } else {
    head = parseIpv6Groups(text);
    if (!head || head.length !== 8) return null;
    tail = [];
  }
  const groups = [...head, ...new Array(8 - head.length - tail.length).fill(0), ...tail];
  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => {
    bytes[index * 2] = group >> 8;
    bytes[index * 2 + 1] = group & 0xff;
  });
  return bytes;
}

/** Reads an address into its bytes. Null when the text is not an address. */
export function parseAddress(address) {
  const text = normalizeAddress(address);
  if (!text) return null;
  if (text.includes(':')) return parseIpv6(text);
  return parseIpv4(text);
}

/**
 * Reads one entry of the list of the proxies: an address or a block of
 * addresses, written as `172.16.0.0/12`.
 */
function parseRule(entry) {
  const text = String(entry ?? '').trim();
  if (!text) return null;
  const marker = text.indexOf('/');
  if (marker < 0) {
    const bytes = parseAddress(text);
    return bytes ? { bytes, prefix: bytes.length * 8 } : null;
  }
  const bytes = parseAddress(text.slice(0, marker));
  const prefix = Number(text.slice(marker + 1));
  if (!bytes || !Number.isInteger(prefix) || prefix < 0 || prefix > bytes.length * 8) return null;
  return { bytes, prefix };
}

/**
 * The list of the addresses of the proxies that are believed.
 *
 * The value comes from the environment as a list separated by commas. An
 * entry that is not an address is ignored, so a typo in the configuration
 * never turns into a rule that believes everything.
 */
export function parseTrustedProxies(value) {
  const entries = Array.isArray(value) ? value : String(value ?? '').split(',');
  const rules = [];
  for (const entry of entries) {
    const rule = parseRule(entry);
    if (rule) rules.push(rule);
  }
  return rules;
}

/** Turns a list of rules or of raw entries into rules. */
function toRules(rules) {
  if (!Array.isArray(rules)) return [];
  if (rules.length === 0) return [];
  if (rules.every((rule) => rule && typeof rule === 'object' && 'bytes' in rule)) return rules;
  return parseTrustedProxies(rules);
}

/** Whether the address is inside the block of the rule. */
function matches(bytes, rule) {
  if (bytes.length !== rule.bytes.length) return false;
  const whole = rule.prefix >> 3;
  const rest = rule.prefix & 7;
  for (let index = 0; index < whole; index += 1) {
    if (bytes[index] !== rule.bytes[index]) return false;
  }
  if (rest === 0) return true;
  const mask = (0xff << (8 - rest)) & 0xff;
  return (bytes[whole] & mask) === (rule.bytes[whole] & mask);
}

/**
 * Whether the address is the address of a proxy that is believed.
 *
 * An empty list believes nobody, so the address of the caller is the address
 * that is written down.
 */
export function isTrustedAddress(address, rules) {
  const bytes = parseAddress(address);
  if (!bytes) return false;
  return toRules(rules).some((rule) => matches(bytes, rule));
}

/** The chain of the header, without the empty entries. */
export function splitChain(header) {
  if (typeof header !== 'string') return [];
  return header
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * The address of the client.
 *
 * The chain of the header is read from the left and the first address that is
 * not a known proxy is the address of the client. When every address of the
 * chain is a known proxy, or when there is no chain at all, the address of the
 * socket is used: the header of an unknown peer is never believed.
 *
 * @param {string} peer The address of the socket the request came in on.
 * @param {string|string[]|undefined} forwardedFor The header of the chain.
 * @param {Array} rules The addresses of the proxies that are believed.
 * @returns {string} The address of the client.
 */
export function resolveClientAddress(peer, forwardedFor, rules = []) {
  const peerAddress = normalizeAddress(peer);
  const trusted = toRules(rules);

  // The header is only read when the request came from a proxy that is known.
  if (!isTrustedAddress(peerAddress, trusted)) return peerAddress;

  for (const candidate of splitChain(forwardedFor)) {
    const address = normalizeAddress(candidate);
    if (!isTrustedAddress(address, trusted)) return address;
  }

  return peerAddress;
}
