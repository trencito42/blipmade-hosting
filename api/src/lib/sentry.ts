import * as Sentry from '@sentry/node';
import { env } from '../env.js';

/**
 * Error reporting, off until the operator sets SENTRY_DSN.
 *
 * With no DSN nothing is sent and nothing is loaded in the way: every call is a no-op. With a
 * DSN, an error the API did not expect (the 500s) and the failures of the worker arrive with
 * the id of the request, so a line of the log and an error of the tracker are the same event.
 * Personal data is not sent: no cookies, no headers, no bodies of requests.
 */
let active = false;

export function initErrorReporting(service: 'api' | 'worker'): void {
  if (!env.SENTRY_DSN || active) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    serverName: service,
    tracesSampleRate: 0,
    beforeSend(event, hint) {
      // A customer who types a wrong value in a form makes a ZodError. It is answered with a 400 and it is not a fault of
      // the platform, so it does not go to the tracker (it made an alert out of every empty field of a login form).
      const original = hint?.originalException as { name?: string } | undefined;
      if (original?.name === 'ZodError' || event.exception?.values?.some((value) => value.type === 'ZodError')) return null;
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
      }
      return event;
    },
  });
  active = true;
}

export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  if (!active) return;
  Sentry.captureException(error, { extra: context });
}
