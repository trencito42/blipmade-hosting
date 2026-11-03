import { useMemo, useState } from 'react';
import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link, useParams } from '../router';
import { deployPathFor, type ResourceConfiguration } from '../lib/pricing-contract';
import { mailCheckoutPath } from './EmailHosting';
import { ButtonLink, EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton } from '../ui-app';

interface FamilyVariant {
  slug: string;
  label: string;
  product: { slug: string; name: string; fulfilment?: string; defaultRam: number; defaultCpu: number; defaultDisk: number; orderable: boolean; availability: string };
}
interface FamilyPreset {
  slug: string;
  name: string;
  variantSlug: string | null;
  version: number;
  summary: string;
  recommendedRamMb: number | null;
  recommendedCpu: number | null;
  recommendedDiskGb: number | null;
}
interface FamilyAddon {
  slug: string;
  name: string;
  summary: string;
  kind: string;
  variantSlugs: string[];
  optionCode: string | null;
  serviceSlug: string | null;
  serviceName: string | null;
}
interface PublicFamily {
  slug: string;
  name: string;
  summary: string;
  group: string;
  variants: FamilyVariant[];
  presets: FamilyPreset[];
  addons: FamilyAddon[];
}

/** Chooses a prepared variant and preset, then continues on the existing product checkout. */
export default function FamilyDeploy() {
  const { slug = '' } = useParams();
  const state = useAsync<{ family: PublicFamily }>((signal) => get(`/catalog/families/${encodeURIComponent(slug)}`, undefined, signal), [slug]);
  const family = state.data?.family;
  const [variantSlug, setVariantSlug] = useState<string | null>(null);
  const [presetSlug, setPresetSlug] = useState<string | null>(null);
  const [addonSlugs, setAddonSlugs] = useState<string[]>([]);
  const variant = family?.variants.find((entry) => entry.slug === (variantSlug ?? family.variants[0]?.slug)) ?? null;
  const presets = useMemo(
    () => (family && variant ? family.presets.filter((preset) => preset.variantSlug === null || preset.variantSlug === variant.slug) : []),
    [family, variant],
  );
  const preset = presets.find((entry) => entry.slug === presetSlug) ?? null;
  const addons = family && variant ? family.addons.filter((addon) => addon.variantSlugs.includes(variant.slug) && addon.kind !== 'MANAGED_SERVICE') : [];
  const managed = family && variant ? family.addons.filter((addon) => addon.variantSlugs.includes(variant.slug) && addon.kind === 'MANAGED_SERVICE' && addon.serviceSlug) : [];
  const config: ResourceConfiguration | null = variant
    ? {
        ram: preset?.recommendedRamMb ?? variant.product.defaultRam,
        cpu: preset?.recommendedCpu ?? variant.product.defaultCpu,
        disk: preset?.recommendedDiskGb ?? variant.product.defaultDisk,
      }
    : null;
  const optionCodes = addons.filter((addon) => addonSlugs.includes(addon.slug) && addon.optionCode).map((addon) => addon.optionCode!);
  const chosenAddons = addons.filter((addon) => addonSlugs.includes(addon.slug)).map((addon) => addon.slug);
  const href = !variant ? null
    : variant.product.fulfilment === 'EMAIL' ? mailCheckoutPath(variant.product.slug)
      : variant.product.fulfilment === 'VPS' ? `/app/vps/new?plan=${encodeURIComponent(variant.product.slug)}`
        : config ? deployPathFor(variant.product.slug, config, optionCodes, {
          family: family!.slug,
          variant: variant.slug,
          ...(preset ? { preset: preset.slug, presetVersion: String(preset.version) } : {}),
          ...(chosenAddons.length ? { addons: chosenAddons.join(',') } : {}),
        }) : null;

  return (
    <div className="grid gap-4">
      {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the family" />
        : state.error ? <ErrorState title="This family is not available" message={state.error.message} onRetry={state.reload} />
        : !family || !variant ? <EmptyState title="Nothing is ready in this family." description="The products stay in the catalog." />
        : (
          <>
            <Panel title={family.name} description={family.summary}>
              <fieldset className="grid gap-2">
                <legend className="text-[14px] font-medium text-ink">Variant</legend>
                {family.variants.map((entry) => (
                  <label key={entry.slug} className="flex min-h-11 items-center gap-3 rounded-2xl border border-line px-3 text-[14px] text-ink">
                    <input type="radio" name="variant" className="size-5" checked={variant.slug === entry.slug} onChange={() => { setVariantSlug(entry.slug); setPresetSlug(null); setAddonSlugs([]); }} />
                    <span>{entry.label}</span>
                    <span className="ml-auto text-[12.5px] text-ink3">{entry.product.orderable ? 'Ready' : entry.product.availability.toLowerCase()}</span>
                  </label>
                ))}
              </fieldset>
            </Panel>
            {presets.length > 0 && (
              <Panel title="Preset">
                <fieldset className="grid gap-2">
                  <legend className="sr-only">Preset</legend>
                  <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-line px-3 text-[14px]"><input type="radio" name="preset" className="size-5" checked={preset === null} onChange={() => setPresetSlug(null)} />No preset</label>
                  {presets.map((entry) => (
                    <label key={entry.slug} className="flex min-h-11 items-center gap-3 rounded-2xl border border-line px-3 text-[14px]">
                      <input type="radio" name="preset" className="size-5" checked={preset?.slug === entry.slug} onChange={() => setPresetSlug(entry.slug)} />
                      <span>{entry.name}<span className="mt-0.5 block text-[12.5px] text-ink3">Version {entry.version}. {entry.summary}</span></span>
                    </label>
                  ))}
                </fieldset>
              </Panel>
            )}
            {addons.length > 0 && (
              <Panel title="Add-ons">
                <ul className="grid gap-2">
                  {addons.map((addon) => (
                    <li key={addon.slug}>
                      <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-line px-3 text-[14px]">
                        <input type="checkbox" className="size-5" checked={addonSlugs.includes(addon.slug)} onChange={(event) => setAddonSlugs(event.target.checked ? [...addonSlugs, addon.slug] : addonSlugs.filter((value) => value !== addon.slug))} />
                        <span>{addon.name}<span className="mt-0.5 block text-[12.5px] text-ink3">{addon.summary}</span></span>
                      </label>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            {managed.length > 0 && (
              <Panel title="Separate services">
                <ul className="grid gap-2">
                  {managed.map((addon) => (
                    <li key={addon.slug}><Link to={`/app/deploy/${encodeURIComponent(addon.serviceSlug!)}`} className="text-[14px] font-medium text-acc">{addon.serviceName}</Link></li>
                  ))}
                </ul>
              </Panel>
            )}
            <div className="flex flex-wrap gap-2">
              {href && variant.product.orderable ? <ButtonLink to={href}>Continue with {variant.product.name}</ButtonLink> : <PrimaryButton type="button" disabled>Not ready to order</PrimaryButton>}
              <Link to="/app/deploy" className="inline-flex min-h-11 items-center px-3 text-[14px] text-ink2">All products</Link>
            </div>
          </>
        )}
    </div>
  );
}
