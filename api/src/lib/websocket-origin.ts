/**
 * Console sockets authenticate with a session cookie. Unlike fetch(), the WebSocket
 * constructor does not send the application's CSRF header. A browser controlled
 * by another origin must therefore be rejected before the socket is upgraded.
 *
 * Exact origin comparison matters here: a customer can host a page on
 * *.apps.blipmade.com, which may be same-site with the customer dashboard.
 * SameSite cookies alone cannot be relied upon for this boundary.
 */
function parseHttpOrigin(value: string): string | null {
  if (!value || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin === 'null' ? null : url.origin;
  } catch {
    return null;
  }
}

/**
 * Only configured first-party frontend origins may use the cookie-based relay.
 * Missing, null, wildcard and subdomain origins fail closed.
 */
export function isAllowedWebSocketOrigin(
  header: string | string[] | undefined,
  appOrigins: string,
): boolean {
  if (typeof header !== 'string') return false;
  const origin = parseHttpOrigin(header);
  if (!origin) return false;
  return appOrigins.split(',').some((configured) => {
    const allowed = parseHttpOrigin(configured.trim());
    return allowed !== null && allowed === origin;
  });
}
