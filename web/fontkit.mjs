/**
 * The Adobe Fonts web project of the interface.
 *
 * The typeface of the interface is proxima nova and it only reaches the
 * browser through the kit of the Adobe Fonts web project of the account. The
 * desktop files are not licensed for web use and are never part of this
 * project.
 *
 * The name of the family is written down in the stylesheet of that kit and
 * nowhere else, so the stylesheet is read when the server starts and the
 * names it declares become the first choice of the interface. The operator
 * can also write the name down by hand with ADOBE_FONTS_FAMILY, and then
 * nothing is read.
 *
 * The functions here are pure, so they can be checked by tests.
 */

/** The only hosts that may serve the stylesheet of the kit. */
export const ADOBE_FONTS_HOSTS = ['use.typekit.net', 'p.typekit.net'];

/** The families that are always the fallback of the interface. */
export const FALLBACK_SANS = ['Geist Variable', 'Inter', 'system-ui', 'sans-serif'];

/**
 * The kit URL of the web project, or null when there is none or when the URL
 * does not belong to Adobe.
 *
 * A stylesheet that is written into the page is loaded by every visitor, so
 * only a URL of Adobe itself may end up there.
 */
export function adobeFontsKitUrl(raw) {
  const value = (raw || '').trim();
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !ADOBE_FONTS_HOSTS.includes(url.host)) return null;
  return url;
}

/**
 * The names of the families that a stylesheet declares.
 *
 * A kit declares one name per face, and the same name is used for the
 * different weights. The names are returned in the order of the stylesheet,
 * without duplicates.
 */
export function familyNames(css) {
  const names = new Set();
  const blocks = String(css || '').match(/@font-face\s*\{[^}]*\}/g) || [];
  for (const block of blocks) {
    const match = block.match(/font-family\s*:\s*(?:(['"])(.*?)\1|([^;}"']+))/i);
    if (!match) continue;
    const name = (match[2] ?? match[3] ?? '').trim();
    if (name) names.add(name);
  }
  return [...names];
}

/**
 * The stack of the interface.
 *
 * The families of proxima nova come first, in the order of the stylesheet.
 * The families of the kit that are not proxima nova come after them, and
 * Geist stays the fallback, so the interface is readable before the kit has
 * arrived and when the kit is not configured at all.
 */
export function buildSansStack(families) {
  const all = [...new Set((families || []).map((name) => String(name).trim()).filter(Boolean))];
  const proxima = all.filter((name) => /proxima/i.test(name));
  const others = all.filter((name) => !/proxima/i.test(name));
  return [...proxima, ...others, ...FALLBACK_SANS];
}

/**
 * The rule that sets the typeface of the interface.
 *
 * It is written after the stylesheet of the bundle, so it is the one that
 * counts.
 */
export function fontSansRule(families) {
  const stack = buildSansStack(families);
  const value = stack.map((name) => `"${name}"`).join(', ');
  return `:root{--font-sans:${value};}`;
}

/**
 * The families of the kit, in the order they are used.
 *
 * The name the operator wrote down comes first, so the operator can correct
 * the reading of the stylesheet without changing the code.
 */
export function orderFamilies(read, written) {
  const explicit = (written || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (explicit.length) return explicit;
  const proxima = read.filter((name) => /proxima/i.test(name));
  return proxima.length ? proxima : read;
}
