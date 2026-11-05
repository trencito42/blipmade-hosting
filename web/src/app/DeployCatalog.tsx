import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from '../router';
import { Icon } from '../icons';
import { get, type CatalogProduct } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useCatalogProducts, formatPrice, periodSuffix, memLabel } from '../lib/pricing';
import { isOrderable, startingPrice, startingConfiguration } from '../lib/pricing-contract';
import { ProductTile } from '../ui';
import { StatusPill, SoftButton, TextInput } from '../ui-app';
import { ImportProject } from './ImportProject';
import {
  useCatalogOfferings,
  searchOfferings,
  type CatalogOffering,
  type SearchMatchResult,
} from '../lib/deploy-studio';

export interface CatalogFamilyCard {
  slug: string;
  name: string;
  summary: string;
  group: string;
  variants: { slug?: string; label?: string; product: { slug: string; name?: string; category?: string; orderable: boolean } }[];
  presets?: { slug: string; name: string; variantSlug: string | null }[];
}

/** Legacy matching helper preserved for test compatibility. */
export function familyMatch(family: CatalogFamilyCard, word: string): { variant?: string; preset?: string } {
  const needle = word.trim().toLowerCase();
  if (needle.length < 2) return {};
  const variant = family.variants.find(
    (entry) =>
      entry.product.orderable &&
      entry.slug &&
      [entry.slug, entry.label, entry.product.slug, entry.product.name].some((text) =>
        (text ?? '').toLowerCase().includes(needle),
      ),
  );
  if (variant) return { variant: variant.slug };
  const preset = (family.presets ?? []).find((entry) => `${entry.slug} ${entry.name}`.toLowerCase().includes(needle));
  return preset ? { preset: preset.slug, ...(preset.variantSlug ? { variant: preset.variantSlug } : {}) } : {};
}

/** Legacy link helper preserved for test compatibility. */
export function familyTo(family: CatalogFamilyCard, word: string): string {
  const match = familyMatch(family, word);
  const query = new URLSearchParams();
  if (match.variant) query.set('variant', match.variant);
  if (match.preset) query.set('preset', match.preset);
  const text = query.toString();
  return `/app/deploy/families/${encodeURIComponent(family.slug)}${text ? `?${text}` : ''}`;
}

const CATEGORY_TABS = [
  { id: 'all', label: 'All Services' },
  { id: 'popular', label: 'Popular' },
  { id: 'GAMES', label: 'Games' },
  { id: 'VPS', label: 'VPS' },
  { id: 'EMAIL_HOSTING', label: 'Email Hosting' },
  { id: 'BOTS', label: 'Bots' },
  { id: 'WEB_CMS', label: 'Web & Apps' },
  { id: 'DATABASES', label: 'Databases' },
  { id: 'DEVELOPER_TOOLS', label: 'Dev Tools' },
  { id: 'MONITORING', label: 'Monitoring' },
];

export default function DeployCatalog() {
  const { query: routeQuery } = useRouter();
  const journeyFromQuery =
    routeQuery.journey === 'import' || routeQuery.journey === 'templates' ? routeQuery.journey : 'services';
  const [journey, setJourney] = useState<'services' | 'import' | 'templates' | 'advanced'>(
    journeyFromQuery as 'services' | 'import' | 'templates' | 'advanced',
  );

  // Authoritative data hooks
  const { products, loading: productsLoading } = useCatalogProducts();
  const { offerings, loading: offeringsLoading } = useCatalogOfferings();

  // Legacy families endpoint hook preserved for test compatibility
  const familiesState = useAsync<{ families: CatalogFamilyCard[] }>((signal) => get('/catalog/families', undefined, signal), []);

  const [activeCategory, setActiveCategory] = useState<string>('popular');
  const [search, setSearch] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchMatchResult[]>([]);
  const [searchPending, setSearchPending] = useState<boolean>(false);

  // Real-time universal search
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    setSearchPending(true);
    const timer = setTimeout(() => {
      searchOfferings(trimmed, controller.signal)
        .then((hits) => setSearchResults(hits))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchPending(false));
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  // Featured / Popular offering cards
  const popularOfferings = useMemo(() => {
    const popularSlugs = ['minecraft', 'vps', 'email-hosting', 'discord-bot', 'custom-runtime', 'databases', 'cs2', 'rust'];
    return offerings.filter((o) => popularSlugs.includes(o.slug));
  }, [offerings]);

  // Curated templates
  const curatedTemplates = useMemo(() => {
    const templates: {
      title: string;
      category: string;
      description: string;
      to: string;
      badge: string;
    }[] = [
      {
        title: 'Minecraft Paper Survival SMP',
        category: 'Games',
        description: 'Optimized Paper release pre-configured with survival mechanics and performance tweaks.',
        to: '/app/deploy/minecraft?variant=minecraft-paper&preset=paper-survival',
        badge: 'Popular',
      },
      {
        title: 'Minecraft Forge Modded Server',
        category: 'Games',
        description: 'Forge server loader ready for CurseForge/Modrinth mods and community modpacks.',
        to: '/app/deploy/minecraft?variant=minecraft-forge&preset=forge-modded',
        badge: 'Modded',
      },
      {
        title: 'Discord Moderation Bot',
        category: 'Bots',
        description: 'Clean Node.js bot starter with slash command handler, moderation logs and kick/ban commands.',
        to: '/app/deploy/discord-bot?preset=moderation',
        badge: 'Node.js',
      },
      {
        title: 'Discord Community Welcome Bot',
        category: 'Bots',
        description: 'Automated welcome cards, role assignment on join, and server rule gate.',
        to: '/app/deploy/discord-bot?preset=welcome',
        badge: 'Template',
      },
      {
        title: 'Debian 12 Cloud Node (VPS)',
        category: 'Servers',
        description: 'Hardened Debian 12 minimal virtual machine with root SSH and full hardware isolation.',
        to: '/app/deploy/vps?plan=vps-start',
        badge: 'KVM',
      },
      {
        title: 'Custom Domain Mailbox (Email)',
        category: 'Email',
        description: 'Dedicated Mailcow instance with DKIM, SPF, and anti-spam protection.',
        to: '/app/deploy/email-hosting?plan=email-hosting-starter',
        badge: 'Mailcow',
      },
    ];
    return templates;
  }, []);

  // Filtered offerings by category
  const filteredOfferings = useMemo(() => {
    if (activeCategory === 'popular') return popularOfferings;
    if (activeCategory === 'all') return offerings;
    return offerings.filter((o) => o.category === activeCategory);
  }, [offerings, activeCategory, popularOfferings]);

  return (
    <div className="grid gap-8 pb-12">
      {/* Editorial Header */}
      <header className="grid gap-4 border-b border-line pb-6 pt-2">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[12px] font-bold uppercase tracking-wider text-acc">Deploy Studio 3.0</span>
          <h1 className="font-display text-[30px] font-bold tracking-tight text-ink sm:text-[36px]">
            What are you deploying today?
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-ink3">
            Deploy code from Git or ZIP, choose from curated game & app services, or launch a production-ready template in minutes.
          </p>
        </div>

        {/* Universal Search Bar */}
        <div className="relative mt-2 max-w-2xl">
          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-4 text-ink3">
              <Icon name="search" size={18} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services, frameworks or engines (e.g. Forge, VPS, Laravel, Discord, Postgres, Mail)…"
              className="w-full rounded-2xl border border-line bg-card/80 py-3.5 pl-11 pr-4 text-[14.5px] text-ink placeholder:text-ink3/70 focus:border-acc focus:bg-card focus:outline-none focus:ring-2 focus:ring-acc/30"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3.5 text-ink3 hover:text-ink"
                aria-label="Clear search"
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>

          {/* Search Dropdown Results */}
          {search.trim().length >= 2 && (
            <div className="absolute z-30 mt-2 w-full rounded-2xl border border-line bg-card p-2 shadow-2xl backdrop-blur-md">
              {searchPending ? (
                <div className="p-4 text-center text-[13px] text-ink3">Searching across categories…</div>
              ) : searchResults.length > 0 ? (
                <div className="grid gap-1">
                  {searchResults.map((hit) => {
                    const o = hit.offering;
                    const queryParams = new URLSearchParams();
                    if (hit.matchedVariantSlug) queryParams.set('variant', hit.matchedVariantSlug);
                    if (hit.matchedPresetSlug) queryParams.set('preset', hit.matchedPresetSlug);
                    const qStr = queryParams.toString();
                    const targetLink = `/app/deploy/${encodeURIComponent(o.slug)}${qStr ? `?${qStr}` : ''}`;

                    return (
                      <Link
                        key={o.slug}
                        to={targetLink}
                        className="flex items-center justify-between gap-3 rounded-xl p-3 transition-colors hover:bg-s1"
                      >
                        <div className="flex items-center gap-3">
                          <ProductTile slug={o.slug} icon={o.icon} size={36} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink">{o.name}</span>
                              {hit.matchedVariantSlug && (
                                <span className="rounded bg-acc/15 px-1.5 py-0.5 text-[11px] font-mono text-acc">
                                  {hit.matchedVariantSlug}
                                </span>
                              )}
                              {hit.matchedPresetSlug && (
                                <span className="rounded bg-s1 px-1.5 py-0.5 text-[11px] text-ink2">
                                  {hit.matchedPresetSlug}
                                </span>
                              )}
                            </div>
                            <p className="line-clamp-1 text-[12.5px] text-ink3">{o.summary}</p>
                          </div>
                        </div>

                        <div className="text-right">
                          {o.startingPrice && (
                            <span className="font-mono text-[13.5px] font-bold text-ink">
                              from {formatPrice(o.startingPrice.amount, o.startingPrice.currency)}
                            </span>
                          )}
                          <span className="block text-[11px] uppercase tracking-wider text-ink3">{o.category}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center text-[13px] text-ink3">
                  No matching services or frameworks found for "{search}".
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3 Primary Journey Path Selector */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { id: 'services', label: 'Start a new service', icon: 'rocket' },
            { id: 'import', label: 'Deploy my project (Git / ZIP)', icon: 'code' },
            { id: 'templates', label: 'Start from template', icon: 'box' },
            { id: 'advanced', label: 'All raw SKUs', icon: 'term' },
          ].map((tab) => {
            const active = journey === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setJourney(tab.id as typeof journey)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition-all ${
                  active
                    ? 'bg-acc text-on-acc shadow-md shadow-acc/10'
                    : 'bg-card border border-line text-ink2 hover:border-ink/40 hover:text-ink'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Path A: Deploy My Project (Smart Import) */}
      {journey === 'import' && (
        <section className="grid gap-4">
          <div className="rounded-2xl border border-line bg-card/60 p-6">
            <h3 className="font-display text-[20px] font-bold text-ink">Connect and inspect your repository</h3>
            <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-ink3">
              We inspect your code manifests safely without running code, identify runtime stacks (Node, Python, PHP, Next.js, Laravel), recommend compute sizing, and guide you through configuration.
            </p>
          </div>
          <ImportProject />
        </section>
      )}

      {/* Path C: Curated Templates */}
      {journey === 'templates' && (
        <section className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {curatedTemplates.map((t, idx) => (
              <Link
                key={idx}
                to={t.to}
                className="group grid content-between rounded-[22px] border border-line bg-card p-5 transition-all hover:border-ink/40 hover:bg-card/90"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-ink3">{t.category}</span>
                    <span className="rounded-md bg-s1 px-2 py-0.5 text-[11px] font-medium text-ink2">{t.badge}</span>
                  </div>
                  <h4 className="mt-2 font-display text-[18px] font-bold tracking-tight text-ink group-hover:text-acc">
                    {t.title}
                  </h4>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink3">{t.description}</p>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-line/60 pt-4 text-[13px] font-semibold text-ink">
                  <span>Deploy preset</span>
                  <Icon name="arrow" size={14} className="transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Path B: Start a New Service (Editorial Offerings Grid) */}
      {journey === 'services' && (
        <section className="grid gap-6">
          {/* Category Tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-line/60 pb-3">
            {CATEGORY_TABS.map((tab) => {
              const active = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCategory(tab.id)}
                  className={`rounded-xl px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                    active
                      ? 'bg-acc/15 text-ink font-semibold ring-1 ring-acc'
                      : 'text-ink3 hover:bg-s1 hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Offerings Grid */}
          {offeringsLoading && offerings.length === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-2xl bg-card/60" />
              ))}
            </div>
          ) : filteredOfferings.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredOfferings.map((offering) => {
                const targetLink = `/app/deploy/${encodeURIComponent(offering.slug)}`;
                const isReady = offering.orderable;

                return (
                  <Link
                    key={offering.slug}
                    to={targetLink}
                    className="group grid content-between rounded-[24px] border border-line bg-card p-5 transition-all hover:border-ink/40 hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <ProductTile slug={offering.slug} icon={offering.icon} size={42} />
                        {!isReady && <StatusPill status="unavailable" label={offering.availability.toLowerCase()} />}
                      </div>

                      <div className="mt-3">
                        <h4 className="font-display text-[19px] font-bold tracking-tight text-ink group-hover:text-acc">
                          {offering.name}
                        </h4>
                        <span className="text-[12px] font-medium text-ink3">{offering.category}</span>
                      </div>

                      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink3">{offering.summary}</p>

                      {/* Pill features/variants */}
                      {offering.variants.length > 1 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {offering.variants.slice(0, 3).map((v) => (
                            <span key={v.slug} className="rounded-md bg-s1 px-2 py-0.5 text-[11px] text-ink2">
                              {v.label}
                            </span>
                          ))}
                          {offering.variants.length > 3 && (
                            <span className="rounded-md bg-s1 px-1.5 py-0.5 text-[11px] text-ink3">
                              +{offering.variants.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 flex items-end justify-between border-t border-line/60 pt-4">
                      {offering.startingPrice ? (
                        <div>
                          <span className="text-[11px] text-ink3">from </span>
                          <span className="font-display text-[20px] font-bold text-ink">
                            {formatPrice(offering.startingPrice.amount, offering.startingPrice.currency)}
                          </span>
                          <span className="text-[11px] text-ink3"> {periodSuffix(offering.startingPrice.period)}</span>
                        </div>
                      ) : (
                        <span className="text-[12px] text-ink3">Catalog service</span>
                      )}

                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-s1 text-ink3 transition-colors group-hover:bg-acc group-hover:text-on-acc">
                        <Icon name="arrow" size={14} />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-card p-8 text-center text-ink3">
              No services found in this category.
            </div>
          )}
        </section>
      )}

      {/* Path D: Advanced Raw SKUs List (Preserves expert catalogue access) */}
      {journey === 'advanced' && (
        <section className="grid gap-4">
          <div className="rounded-2xl border border-line bg-card p-5">
            <h3 className="font-display text-[18px] font-semibold text-ink">All Infrastructure SKUs</h3>
            <p className="text-[13px] text-ink3">Direct catalogue access for developers and operators.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p) => {
              const amount = startingPrice(p);
              const orderable = isOrderable(p);

              return (
                <Link
                  key={p.id}
                  to={`/app/deploy/${encodeURIComponent(p.slug)}`}
                  className="rounded-2xl border border-line bg-card p-4 transition-colors hover:border-ink/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink">{p.name}</span>
                    {!orderable && <StatusPill status="unavailable" label="Unavailable" />}
                  </div>
                  <p className="font-mono text-[11.5px] text-ink3">{p.slug}</p>
                  <p className="mt-2 line-clamp-2 text-[12.5px] text-ink3">{p.description}</p>
                  <div className="mt-3 flex justify-between border-t border-line/50 pt-2 text-[12px]">
                    <span className="text-ink3">{p.category}</span>
                    {amount !== null && p.price ? (
                      <span className="font-mono font-semibold text-ink">{formatPrice(amount, p.price.currency)}</span>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
