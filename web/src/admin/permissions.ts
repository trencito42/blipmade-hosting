/**
 * The permission gates of the admin area.
 *
 * The rules live here, away from the interface, so every screen asks the same
 * question in the same way and so the answer can be tested without a browser.
 * The server decides what an account may really do; these helpers only tell
 * the interface what to show.
 */

/** The staff account of the operator, with the permissions it holds. */
export interface GateUser {
  role: string;
  permissions?: string[];
}

/** True when the account may do what the permission names. */
export function can(user: GateUser | null | undefined, permission: string): boolean {
  if (!user) return false;
  // Administrators hold every permission server-side, so the client mirrors that.
  if (user.role === 'ADMIN') return true;
  return (user.permissions ?? []).includes(permission);
}

/** The gates of the pricing screen: reading the prices and changing them. */
export function pricingGate(user: GateUser | null | undefined): { mayRead: boolean; mayWrite: boolean } {
  return {
    mayRead: can(user, 'pricing.read'),
    mayWrite: can(user, 'pricing.write'),
  };
}
