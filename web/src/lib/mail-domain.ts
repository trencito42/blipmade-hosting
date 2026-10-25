/**
 * The check of the name of a domain of mail.
 *
 * It lives in a module of its own, and not in the dashboard of the mail, so
 * the storefront of the plans — which is a public page — does not carry the
 * whole dashboard with it.
 */

/** The shape of one label of a hostname: letters, digits and dashes. */
const HOSTNAME_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Checks the name of a domain of mail.
 *
 * The customer types a hostname they own, so the shape of the name is
 * checked here: a name without a dot is not a hostname, and a name with a
 * protocol or a path is an address of a page and not a hostname.
 *
 * The answer is the sentence to show under the field, or null when the name
 * can be used.
 */
export function validateMailDomainName(name: string): string | null {
  const value = name.trim().toLowerCase();
  if (!value) return 'Enter the hostname you want to use.';
  if (/\s/.test(value)) return 'A hostname cannot contain spaces.';
  if (value.includes('://') || /^[a-z][a-z0-9+.-]*:/.test(value)) {
    return 'Write the hostname on its own, without a protocol or a port, like acme.ro.';
  }
  if (value.includes('/')) return 'Write only the hostname, without a path, like acme.ro.';
  if (!value.includes('.')) return 'A hostname needs at least one dot, like acme.ro.';
  if (value.length > 253) return 'That hostname is too long.';

  for (const label of value.split('.')) {
    if (!HOSTNAME_LABEL.test(label)) {
      return 'That is not a valid hostname. Use letters, digits and dashes, like acme.ro.';
    }
  }
  return null;
}
