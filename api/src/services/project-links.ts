/**
 * Optional databases for an imported project.
 *
 * A dependency is linked only when the manifest declared it and the customer confirmed it.
 * MariaDB is detected and left unlinked: that egg has no password variable the platform can set.
 */

export const LINKABLE_SERVICES = ['postgresql', 'redis'] as const;
export type LinkableService = (typeof LINKABLE_SERVICES)[number];

const LINKABLE = new Set<string>(LINKABLE_SERVICES);

export function linkableService(slug: string): slug is LinkableService {
  return LINKABLE.has(slug);
}

/** The services the customer may add. Anything else in the list is refused. */
export function confirmedServiceSelection(detected: string[], requested: string[]): { ok: true; chosen: LinkableService[] } | { ok: false; message: string } {
  const known = new Set(detected.filter(linkableService));
  const chosen: LinkableService[] = [];
  for (const slug of requested) {
    if (!linkableService(slug) || !known.has(slug) || chosen.includes(slug)) {
      return {
        ok: false,
        message: slug === 'mariadb'
          ? 'MariaDB was detected. It is not provisioned automatically because that egg has no password variable the platform can set.'
          : `${slug} was not detected in this project.`,
      };
    }
    chosen.push(slug);
  }
  return { ok: true, chosen };
}

export function missingCompanions(confirmed: string[], orderedSlugs: string[]): string[] {
  return confirmed.filter((slug) => !orderedSlugs.includes(slug));
}

/** The application build waits until every confirmed database has been connected. */
export function importMayBuild(input: { confirmed: number; linked: boolean }): { build: boolean; reason: string | null } {
  if (input.confirmed > 0 && !input.linked) {
    return { build: false, reason: 'Waiting for the confirmed database before the application is built.' };
  }
  return { build: true, reason: null };
}

export function quoteItemsForImport<T extends { productSlug: string; ram?: number; cpu?: number; disk?: number }>(
  items: T[],
  confirmed: { slug: string; ram: number; cpu: number; disk: number }[],
): T[] {
  const next = [...items];
  for (const service of confirmed) {
    if (next.some((item) => item.productSlug === service.slug)) continue;
    next.push({ productSlug: service.slug, ram: service.ram, cpu: service.cpu, disk: service.disk } as T);
  }
  return next;
}

export interface ServiceEndpoint {
  slug: string;
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

/** One environment line for a confirmed database. The password is encoded and never logged here. */
export function connectionVariable(endpoint: ServiceEndpoint): { key: string; value: string } | null {
  const host = endpoint.host.trim();
  if (!host || host === '0.0.0.0' || !Number.isInteger(endpoint.port) || endpoint.port < 1) return null;
  const user = encodeURIComponent(endpoint.user);
  const password = encodeURIComponent(endpoint.password);
  if (endpoint.slug === 'postgresql') {
    const database = encodeURIComponent(endpoint.database || endpoint.user || 'postgres');
    return { key: 'DATABASE_URL', value: `postgresql://${user}:${password}@${host}:${endpoint.port}/${database}` };
  }
  if (endpoint.slug === 'redis') {
    return { key: 'REDIS_URL', value: `redis://:${password}@${host}:${endpoint.port}` };
  }
  return null;
}
