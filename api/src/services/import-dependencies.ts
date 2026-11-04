/**
 * Databases an imported application needs.
 *
 * MySQL/MariaDB on the application server uses the panel database feature (included in the plan).
 * PostgreSQL, Redis and a standalone MariaDB server are separate products.
 */

export const ATTACHED_MYSQL = 'attached_mysql' as const;

/** Companion products provisioned as their own instances on the order. */
export const COMPANION_PRODUCTS = ['postgresql', 'redis', 'mariadb'] as const;
export type CompanionProduct = (typeof COMPANION_PRODUCTS)[number];

const COMPANIONS = new Set<string>(COMPANION_PRODUCTS);

export function isAttachedMysql(slug: string): boolean {
  return slug === ATTACHED_MYSQL;
}

export function companionProduct(slug: string): slug is CompanionProduct {
  return COMPANIONS.has(slug);
}

/** Shown in inspect UI: attached MySQL is included; companion lines are billable products. */
export function importServiceLinkable(slug: string): boolean {
  return slug === ATTACHED_MYSQL || companionProduct(slug);
}

export function importServiceBillable(slug: string): boolean {
  return companionProduct(slug);
}

/** Default selection for a new import plan: attach MySQL when detected, not a standalone server. */
export function defaultConfirmedServices(detected: string[]): string[] {
  if (detected.includes(ATTACHED_MYSQL)) return [ATTACHED_MYSQL];
  return [];
}
