export const CATALOG_GROUPS = [
  { value: 'games', label: 'Games' },
  { value: 'discord-bots', label: 'Discord bots' },
  { value: 'websites-apps', label: 'Websites and apps' },
  { value: 'databases-caches', label: 'Databases and caches' },
  { value: 'tools-automation', label: 'Tools and automation' },
  { value: 'voice', label: 'Voice' },
  { value: 'custom-runtime', label: 'Custom runtime' },
] as const;

export const DISCOVERY = [
  { value: 'HIDDEN', label: 'Hidden' },
  { value: 'ADVANCED', label: 'Advanced' },
  { value: 'GROUPED', label: 'Grouped' },
  { value: 'FEATURED', label: 'Featured' },
] as const;

export interface FamilySummary {
  id: string;
  slug: string;
  name: string;
  summary: string;
  group: string;
  discovery: string;
  prepared: boolean;
  sortOrder: number;
  variantCount: number;
  presetCount: number;
  addonCount: number;
}

export interface VariantRow {
  id: string;
  slug: string;
  label: string;
  sortOrder: number;
  active: boolean;
  product: { id: string; slug: string; name: string; visible: boolean; deployable: boolean; fulfilment: string };
}

export interface PresetVersion {
  id: string;
  version: number;
  summary: string;
  notes: string;
  recommendedRamMb: number | null;
  recommendedCpu: number | null;
  recommendedDiskGb: number | null;
  publishedAt: string | null;
}

export interface PresetRow {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  variantId: string | null;
  variant: { id: string; slug: string; label: string } | null;
  versions: PresetVersion[];
}

export interface AddonRow {
  id: string;
  slug: string;
  name: string;
  summary: string;
  kind: 'SOFTWARE' | 'MANAGED_SERVICE' | 'PLATFORM_FEATURE';
  version: number;
  active: boolean;
  productId: string | null;
  productOptionId: string | null;
  product: { id: string; slug: string; name: string } | null;
  productOption: { id: string; code: string; name: string; amount: number; currency: string } | null;
  variantIds: string[];
}

export interface FamilyDetail {
  family: {
    id: string;
    slug: string;
    name: string;
    summary: string;
    group: string;
    discovery: string;
    prepared: boolean;
    sortOrder: number;
    variants: VariantRow[];
    presets: PresetRow[];
    addons: AddonRow[];
  };
  unmappedProducts: { id: string; slug: string; name: string }[];
  note: string;
}

export const groupLabel = (value: string) => CATALOG_GROUPS.find((group) => group.value === value)?.label ?? value;
