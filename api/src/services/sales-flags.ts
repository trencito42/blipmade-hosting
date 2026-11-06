import { env, paymentsAreEnabled } from '../env.js';
import { stripeTestGateway } from './stripe.js';
import type { AvailabilityContext } from './availability.js';

/**
 * The switches the catalog, the quote and the order share.
 *
 * The local test gateway still counts as checkout being open, so the suite
 * can order without a Stripe key. Production never uses that gateway.
 */
export function catalogSalesContext(): AvailabilityContext {
  return {
    emailSalesEnabled: env.MAIL_SALES_ENABLED,
    paymentsAvailable: paymentsAreEnabled() || stripeTestGateway(),
  };
}
