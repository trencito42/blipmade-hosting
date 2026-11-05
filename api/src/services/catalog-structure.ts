import type { CatalogAddonKind } from '@prisma/client';
import { badRequest } from '../lib/errors.js';

/** Customer-facing groups. They are not Product.category values. */
export const CATALOG_GROUPS = [
  'games',
  'discord-bots',
  'websites-apps',
  'databases-caches',
  'tools-automation',
  'voice',
  'custom-runtime',
  'vps',
  'email-hosting',
] as const;

export type CatalogGroup = (typeof CATALOG_GROUPS)[number];

/**
 * The public catalogue does not read families. This constant stays false until
 * the owner explicitly approves a storefront projection.
 */
export const STOREFRONT_PROJECTION_ENABLED = false;

export const STRUCTURE_NOTE =
  'Prepared families stay off the public catalogue, quotes and checkout. Existing products, prices, options and orders are not changed from here.';

export function assertAddonShape(kind: CatalogAddonKind, productId: string | null | undefined, productOptionId: string | null | undefined): void {
  const product = productId ?? null;
  const option = productOptionId ?? null;
  if (kind === 'SOFTWARE' && (product || option)) {
    throw badRequest('A software add-on is not a billed product or a platform feature.');
  }
  if (kind === 'PLATFORM_FEATURE' && (!option || product)) {
    throw badRequest('A platform feature uses an existing priced add-on and no separate product.');
  }
  if (kind === 'MANAGED_SERVICE' && (!product || option)) {
    throw badRequest('A managed service points at its own product and not at a priced add-on.');
  }
}

export function assertActiveHasVariants(active: boolean, variantIds: string[]): void {
  if (active && variantIds.length === 0) {
    throw badRequest('An active add-on needs at least one compatible variant.');
  }
}
