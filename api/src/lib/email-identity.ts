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

export function isDisposableEmail(email: string, configuredDomains: string): boolean {
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  if (!domain) return false;
  return configuredDomains
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}
