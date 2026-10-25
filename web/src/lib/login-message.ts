/**
 * The message of a sign-in that was refused.
 *
 * The account of a customer can be suspended by the operator. The customer is
 * then told what happened and where to write, because a customer who is only
 * told that the password is wrong will think the account is lost and will
 * write to the support about a password that was never wrong.
 *
 * A wrong password answers the same way as an address that does not exist.
 * The answer never says whether an account exists, and it never says that an
 * account was suspended to somebody who does not have the password.
 */
export function loginFailureMessage(error: { code: string; message: string; status: number }): string {
  if (error.code === 'account_suspended') return error.message;
  if (error.status === 429 || error.code === 'rate_limited') {
    return 'Too many attempts. Try again in 5 minutes.';
  }
  if (error.status === 0) {
    return 'Cannot reach the Blipmade API. Check your connection and try again.';
  }
  if (error.status === 401) return 'Email or password is incorrect.';
  return error.message;
}
