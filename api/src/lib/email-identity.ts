/** Domains whose alias syntax is stable enough to canonicalise safely. */
const PLUS_ALIAS_DOMAINS = new Set(['outlook.com', 'hotmail.com', 'live.com']);

export function emailIdentity(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return normalized;
  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);

  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.split('+', 1)[0].replaceAll('.', '');
    domain = 'gmail.com';
  } else if (PLUS_ALIAS_DOMAINS.has(domain)) {
    local = local.split('+', 1)[0];
  }
  return `${local}@${domain}`;
}

/**
 * Well-known throwaway-mailbox services. It is a short local list, not a complete one: operators add
 * more with DISPOSABLE_EMAIL_DOMAINS, and the risk score looks at the same signal.
 */
const BUILT_IN_DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'sharklasers.com',
  'grr.la', 'spam4.me', '10minutemail.com', '10minutemail.net', '20minutemail.com', 'tempmail.com', 'temp-mail.org',
  'temp-mail.io', 'tempmail.net', 'tempmailo.com', 'tempail.com', 'throwawaymail.com', 'yopmail.com', 'yopmail.net',
  'yopmail.fr', 'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'trashmail.com',
  'trashmail.net', 'trashmail.de', 'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'burnermail.io',
  'discard.email', 'discardmail.com', 'mailcatch.com', 'mytemp.email', 'tmail.ws', 'tmpmail.org', 'tmpmail.net',
  'moakt.com', 'mail.tm', 'inboxkitten.com', 'harakirimail.com', 'spamgourmet.com', 'getairmail.com', 'anonbox.net',
  'mailsac.com', 'emailfake.com', 'fakemail.net', 'luxusmail.org', 'cuvox.de', 'dayrep.com', 'einrot.com', 'fleckens.hu',
  'gustr.com', 'jourrapide.com', 'rhyta.com', 'superrito.com', 'teleworm.us', 'armyspy.com', 'minuteinbox.com',
]);

export function isDisposableEmail(email: string, configuredDomains: string): boolean {
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  if (!domain) return false;
  const matches = (blocked: string) => domain === blocked || domain.endsWith(`.${blocked}`);
  if ([...BUILT_IN_DISPOSABLE].some(matches)) return true;
  return configuredDomains
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some(matches);
}
