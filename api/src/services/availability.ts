import type { Product } from '@prisma/client';

/**
 * The availability of a product: one model, used by the catalog, by the
 * quote, by the order and by the interface.
 *
 * A row in the catalog only says that a product exists. Two more facts
 * decide whether it can be sold:
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
 * The four states answer the question "what does the customer see?", so the
 * catalog, the product page, the configurator, the review, the payment and
 * the staff area cannot disagree about the same product.
 */
export type AvailabilityState =
  /** Listed in the catalog and ready to be ordered. */
  | 'DEPLOYABLE'
  /** Listed, but the operator has not validated it for deployment yet. */
  | 'COMING_SOON'
  /** Listed and meant to be sold, but the panel cannot build it right now. */
  | 'TEMPORARILY_UNAVAILABLE'
  /** Not listed in the public catalog. */
  | 'UNPUBLISHED';

export interface DeploymentAvailability {
  /** The state of the product, seen from the outside. */
  state: AvailabilityState;
  /** The operator allows the product to be ordered. */
  enabled: boolean;
  /** The panel can build a server for it. */
  installable: boolean;
  /** The product is listed in the public catalog. */
  visible: boolean;
  /** The product can be ordered right now. */
  orderable: boolean;
  /** Why the product cannot be ordered. Empty when it can. */
  blockers: string[];
}

/** The fields of a product the availability is derived from. */
export type AvailabilityProduct = Pick<Product, 'name' | 'deployable' | 'eggId' | 'visible'>;

/**
 * The availability of a product. It is derived from the data of the product,
 * never set by hand, so a product cannot be orderable only because it has a
 * row in the catalog.
 */
export function deploymentAvailability(product: AvailabilityProduct): DeploymentAvailability {
  const enabled = product.deployable;
  // The egg is what the panel turns into a server. Without it there is
  // nothing to install, whatever the image of the product says.
  const installable = product.eggId !== null && product.eggId !== undefined;
  const visible = product.visible;

  const blockers: string[] = [];
  if (!enabled) blockers.push('It has not been validated for deployment yet.');
  if (!installable) blockers.push('Its image is not installed on the panel yet.');

  let state: AvailabilityState;
  if (!visible) state = 'UNPUBLISHED';
  else if (enabled && installable) state = 'DEPLOYABLE';
  else if (!enabled) state = 'COMING_SOON';
  else state = 'TEMPORARILY_UNAVAILABLE';

  return {
    state,
    enabled,
    installable,
    visible,
    orderable: state === 'DEPLOYABLE',
    blockers: state === 'DEPLOYABLE' ? [] : blockers,
  };
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
