/** Hostname readiness. A certificate and a healthy application are different facts. */

export type TlsState = 'unknown' | 'ready' | 'unavailable';
export type ApplicationHealth = 'unknown' | 'ready' | 'unhealthy';

/**
 * A completed HTTPS response means the certificate answered.
 * Only a 2xx response means the application looks healthy. A 3xx is not proof, and a 4xx or 5xx is not healthy.
 */
export function classifyHttpsResponse(input: { handshake: boolean; status: number | null }): { tls: TlsState; application: ApplicationHealth } {
  if (!input.handshake) return { tls: 'unavailable', application: 'unknown' };
  if (input.status === null || input.status <= 0) return { tls: 'ready', application: 'unknown' };
  if (input.status >= 200 && input.status < 300) return { tls: 'ready', application: 'ready' };
  if (input.status >= 300 && input.status < 400) return { tls: 'ready', application: 'unknown' };
  return { tls: 'ready', application: 'unhealthy' };
}

/** Whether a hostname may be shown as active. A game hostname is never activated by an HTTP route, and a certificate is required for a website. */
export function activationStatus(input: { purpose: string; routeApplied: boolean; tls: TlsState }): 'ACTIVE' | 'PENDING_DNS' {
  if (input.purpose === 'game') return 'PENDING_DNS';
  return input.routeApplied && input.tls === 'ready' ? 'ACTIVE' : 'PENDING_DNS';
}

/** The columns written after a gateway attempt. Application health never flips the domain to active on its own. */
export function httpDomainUpdate(input: {
  routeApplied: boolean;
  routeId: string | null;
  reason: string | null;
  probe: { tls: TlsState; application: ApplicationHealth } | null;
}): {
  status: 'ACTIVE' | 'PENDING_DNS';
  lastError: string | null;
  tlsStatus: TlsState;
  applicationStatus: ApplicationHealth;
  caddyRouteId: string | null;
} {
  const tls = input.routeApplied && input.probe ? input.probe.tls : 'unknown';
  const application = input.routeApplied && input.probe ? input.probe.application : 'unknown';
  const status = activationStatus({ purpose: 'http', routeApplied: input.routeApplied, tls });
  let lastError = input.reason;
  if (input.routeApplied && tls !== 'ready') {
    lastError = 'The route is added. The certificate is not answering on this hostname yet.';
  } else if (status === 'ACTIVE') {
    lastError = null;
  }
  return { status, lastError, tlsStatus: tls, applicationStatus: application, caddyRouteId: input.routeId };
}

/** Asks the public hostname. A certificate error is unavailable TLS, not an unhealthy application. */
export async function probeHostname(hostname: string): Promise<{ tls: TlsState; application: ApplicationHealth }> {
  try {
    const response = await fetch(`https://${hostname}/`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    return classifyHttpsResponse({ handshake: true, status: response.status });
  } catch {
    return classifyHttpsResponse({ handshake: false, status: null });
  }
}
