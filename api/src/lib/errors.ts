/** Errors that carry an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(statusCode: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new AppError(400, 'bad_request', message, fields);

export const unauthorized = (message = 'Authentication required.') => new AppError(401, 'unauthorized', message);

/**
 * The account is suspended.
 *
 * The code is its own, so the interface can tell a suspended account from a
 * wrong password. The two answers are not the same: the wrong password and
 * the address that does not exist still answer the same way as each other,
 * because a guess must never find out whether an account exists. The account
 * that is suspended is only told so when the owner has already proved that
 * they have the password.
 */
export const accountSuspended = (message = 'This account is suspended.') =>
  new AppError(401, 'account_suspended', message);

export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError(403, 'forbidden', message);

export const notFound = (message = 'Not found.') => new AppError(404, 'not_found', message);

export const conflict = (message: string) => new AppError(409, 'conflict', message);

export const tooMany = (message = 'Too many requests. Try again shortly.') =>
  new AppError(429, 'rate_limited', message);

export const upstream = (message: string) => new AppError(502, 'upstream_error', message);

export const unavailable = (message: string) => new AppError(503, 'unavailable', message);
