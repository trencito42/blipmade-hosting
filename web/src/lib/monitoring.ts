/**
 * Error reporting for the browser, off until the build has a DSN (VITE_SENTRY_DSN).
 *
 * The reporter is loaded on demand, only when there is a DSN, so a site without one pays
 * nothing for it. It sends no personal data: no cookies, no addresses of the person.
 */
type Reporter = { captureException: (error: unknown, hint?: unknown) => void };
let reporter: Promise<Reporter | null> | null = null;

export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || reporter) return;
  reporter = import('@sentry/browser')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? 'production',
        sendDefaultPii: false,
        tracesSampleRate: 0,
      });
      return Sentry as unknown as Reporter;
    })
    .catch(() => null);
}

export function reportClientError(error: unknown, context?: Record<string, unknown>): void {
  void reporter?.then((sentry) => sentry?.captureException(error, { extra: context }));
}
