import type { Product } from '@prisma/client';

/**
 * Whether a product can really be ordered.
 *
 * A row in the catalog only says that a product exists. Two more things have
 * to be true before an order can ever become an instance:
 *
 *   1. the operator allows the product to be ordered (`deployable`), and
 *   2. the panel can build a server for it, which needs the egg of the
 *      product (`eggId`); see resolveEgg() in provisioning.ts.
 *
 * A product that is listed, priced and marked as deployable, but that has no
 * egg mapping, can never be deployed: the order is created, it is paid, and
 * the deployment fails at the step "server_created" with "has no egg mapping
 * yet". Such a product is therefore not orderable, whatever the flag says.
 *
 * The same answer is used by the catalog, by the quote and by the order, so
 * the interface and the server never disagree about what can be bought.
 */
export interface DeploymentAvailability {
  /** The operator allows the product to be ordered. */
  enabled: boolean;
  /** The panel can build a server for it. */
  installable: boolean;
  /** Why the product cannot be ordered. Empty when it can. */
  blockers: string[];
  /** The product can be ordered right now. */
  orderable: boolean;
}

/** The fields of a product the availability is derived from. */
export type AvailabilityProduct = Pick<Product, 'name' | 'deployable' | 'eggId'>;

/**
 * The availability of a product. It is derived from the data of the product,
 * never set by hand, so a product cannot be orderable only because it has a
 * row in the catalog.
 */
export function deploymentAvailability(product: AvailabilityProduct): DeploymentAvailability {
  const enabled = product.deployable;
  // The egg is what the panel turns into a server. Without it there is nothing
  // to install, whatever the image of the product says.
  const installable = product.eggId !== null && product.eggId !== undefined;

  const blockers: string[] = [];
  if (!enabled) blockers.push('It has not been validated for deployment yet.');
  if (!installable) blockers.push('Its image is not installed on the panel yet.');

  return { enabled, installable, blockers, orderable: enabled && installable };
}

/**
 * The message the API answers with when a product cannot be ordered. It names
 * the reason, so the customer is not left with a dead end.
 */
export function unavailableMessage(product: Pick<Product, 'name'>, availability: DeploymentAvailability): string {
  if (availability.orderable) return '';
  if (!availability.blockers.length) return `${product.name} is not available to order yet.`;
  return `${product.name} is not available to order yet: ${availability.blockers.join(' ')}`;
}
