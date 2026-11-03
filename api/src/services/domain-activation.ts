/** Whether a hostname may be shown as active. A game hostname is never activated by an HTTP route. */
export function activationStatus(input: { purpose: string; routeApplied: boolean; httpsReady: boolean }): 'ACTIVE' | 'PENDING_DNS' {
  if (input.purpose === 'game') return 'PENDING_DNS';
  return input.routeApplied && input.httpsReady ? 'ACTIVE' : 'PENDING_DNS';
}

/** Asks the public hostname whether HTTPS answers. A certificate error is not ready. */
export async function httpsAnswers(hostname: string): Promise<boolean> {
  try {
    const response = await fetch(`https://${hostname}/`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    return response.status > 0;
  } catch {
    return false;
  }
}
