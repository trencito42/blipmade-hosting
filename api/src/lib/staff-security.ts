import net from 'node:net';
import { prisma } from '../db.js';
import { env } from '../env.js';

/**
 * Two rules that protect the area of the staff, both off until an administrator turns them on:
 *
 *  - every member of the staff must have two-factor authentication;
 *  - the area is reachable only from a list of addresses (single addresses or ranges).
 *
 * The rules are kept in the settings of the platform and read through a short cache, so they cost
 * one lookup every half minute and not one per request.
 */
export const STAFF_2FA_KEY = 'security.staff_2fa_required';
export const ADMIN_ALLOWLIST_KEY = 'security.admin_ip_allowlist';

export interface StaffSecurity {
  require2fa: boolean;
  ipAllowlist: string[];
}

let cache: { at: number; value: StaffSecurity } | null = null;

export function forgetStaffSecurity(): void {
  cache = null;
}

export async function staffSecurity(): Promise<StaffSecurity> {
  if (env.STAFF_SECURITY_OFF === 'true') return { require2fa: false, ipAllowlist: [] };
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const rows = await prisma.setting.findMany({ where: { key: { in: [STAFF_2FA_KEY, ADMIN_ALLOWLIST_KEY] } } });
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const list = map.get(ADMIN_ALLOWLIST_KEY);
  const value: StaffSecurity = {
    require2fa: map.get(STAFF_2FA_KEY) === true,
    ipAllowlist: Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string') : [],
  };
  cache = { at: Date.now(), value };
  return value;
}

/** An address as a number of bits, for the comparison with a range. */
function toBits(address: string): string | null {
  const clean = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (net.isIPv4(clean)) return clean.split('.').map((part) => Number(part).toString(2).padStart(8, '0')).join('');
  if (net.isIPv6(clean)) {
    const [head = '', tail = ''] = clean.split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    const groups = clean.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
    return groups.map((group) => parseInt(group || '0', 16).toString(2).padStart(16, '0')).join('');
  }
  return null;
}

/** Is the address in the list? An entry is an address ("203.0.113.7") or a range ("203.0.113.0/24"). */
export function ipAllowed(address: string, list: string[]): boolean {
  const bits = toBits(address);
  if (!bits) return false;
  return list.some((entry) => {
    const [base = '', prefix] = entry.trim().split('/');
    const baseBits = toBits(base);
    if (!baseBits || baseBits.length !== bits.length) return false;
    const length = prefix === undefined ? baseBits.length : Number(prefix);
    return Number.isInteger(length) && length >= 0 && length <= baseBits.length && bits.slice(0, length) === baseBits.slice(0, length);
  });
}

/** Does an entry of the list make sense? */
export function validAllowlistEntry(entry: string): boolean {
  const [base = '', prefix] = entry.trim().split('/');
  const bits = toBits(base);
  if (!bits) return false;
  if (prefix === undefined) return true;
  const length = Number(prefix);
  return Number.isInteger(length) && length >= 0 && length <= bits.length;
}
