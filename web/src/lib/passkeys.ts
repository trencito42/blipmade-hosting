import { startAuthentication, startRegistration, browserSupportsWebAuthn, browserSupportsWebAuthnAutofill } from '@simplewebauthn/browser';
import { post } from './api';

/** Does this browser do passkeys at all? */
export const passkeysSupported = (): boolean => typeof window !== 'undefined' && browserSupportsWebAuthn();

/** The words for what went wrong in the browser, when the person closed the prompt or has no key. */
export function passkeyFailure(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'AbortError') return 'The passkey prompt was closed or timed out.';
  if (name === 'InvalidStateError') return 'This device already has a passkey for the account.';
  if (error instanceof Error && error.message) return error.message;
  return 'The passkey did not work.';
}

/** Signs in with a passkey alone: the browser lists the passkeys of this site. */
export async function authenticateWithPasskey<T>(): Promise<T> {
  const { challengeId, options } = await post<{ challengeId: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>('/auth/passkey/options');
  const response = await startAuthentication({ optionsJSON: options });
  return post<T>('/auth/passkey/verify', { challengeId, response });
}

/** The second step of a password sign-in, with a passkey. */
export async function secondStepWithPasskey<T>(token: string): Promise<T> {
  const { options } = await post<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>('/auth/login/2fa/passkey/options', { token });
  const response = await startAuthentication({ optionsJSON: options });
  return post<T>('/auth/login/2fa/passkey/verify', { token, response });
}

/** Adds a passkey to the account that is signed in. */
export async function registerPasskey(name?: string): Promise<{ passkey: { id: string; name: string } }> {
  const { options } = await post<{ options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>('/settings/passkeys/options');
  const response = await startRegistration({ optionsJSON: options });
  return post('/settings/passkeys', { response, name });
}

/**
 * Passkeys in the field of the address: the browser lists the passkeys of this site when the
 * person focuses the field, and picking one signs them in. Resolves with the answer of the
 * server, or null when the browser cannot offer it. It stays pending until a passkey is picked.
 */
export async function authenticateWithAutofill<T>(): Promise<T | null> {
  if (!passkeysSupported() || !(await browserSupportsWebAuthnAutofill())) return null;
  const { challengeId, options } = await post<{ challengeId: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>('/auth/passkey/options');
  const response = await startAuthentication({ optionsJSON: options, useBrowserAutofill: true });
  return post<T>('/auth/passkey/verify', { challengeId, response });
}
