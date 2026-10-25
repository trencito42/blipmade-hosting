import { env } from '../env.js';
import { accountSuspended, type AppError } from './errors.js';

/**
 * The answer of the platform for an account that is suspended.
 *
 * The message names the address of the support, so the customer knows where
 * to write, and the address is the one the operator wrote down. When no
 * address is written down, the message asks for the support without naming
 * one, and it never invents an address.
 */
export function suspendedAccountError(): AppError {
  const address = env.MAIL_SUPPORT_EMAIL || env.MAIL_HELP_EMAIL;
  return accountSuspended(
    address
      ? `This account is suspended. Contact ${address} to have it restored.`
      : 'This account is suspended. Contact support to have it restored.',
  );
}
