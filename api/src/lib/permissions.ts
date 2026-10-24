/** Staff permissions. Stored as a string array on StaffMember.permissions. */
export const PERMISSIONS = [
  'customers.read',
  'customers.write',
  'orders.read',
  'orders.write',
  'services.read',
  'services.write',
  'products.read',
  'products.write',
  'pricing.read',
  'pricing.write',
  'tickets.read',
  'tickets.write',
  'promotions.read',
  'promotions.write',
  'infrastructure.read',
  'infrastructure.write',
  'audit.read',
  'staff.read',
  'staff.write',
  'settings.read',
  'settings.write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/** Administrators implicitly hold every permission. */
export function staffPermissions(role: string, granted: string[] = []): string[] {
  if (role === 'ADMIN') return [...PERMISSIONS];
  return granted.filter(isPermission);
}

export function hasPermission(role: string, granted: string[] | undefined, permission: Permission): boolean {
  if (role === 'ADMIN') return true;
  return (granted ?? []).includes(permission);
}

/**
 * The permissions of a wanted list that the actor does not hold.
 *
 * An administrator holds every permission, so the list is empty for an
 * administrator. A staff member only holds the permissions that were granted
 * to them, so the list names the permissions that they would hand out
 * without knowing what they do: an account that can grant more than it holds
 * is an administrator in everything but the name.
 */
export function permissionsNotHeld(role: string, granted: string[] | undefined, wanted: string[]): string[] {
  const held = new Set(staffPermissions(role, granted ?? []));
  return wanted.filter((permission) => !held.has(permission));
}
