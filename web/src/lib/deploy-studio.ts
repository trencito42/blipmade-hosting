import { useEffect, useMemo, useState } from 'react';
import { api, get, post, type CatalogProduct, type Order, type Quote } from './api';
import { useAsync } from './useAsync';

export interface OfferingVariant {
  slug: string;
  label: string;
  productSlug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  fulfilment: string;
  minRam: number;
  minCpu: number;
  minDisk: number;
  defaultRam: number;
  defaultCpu: number;
  defaultDisk: number;
  maxRam: number;
  maxCpu: number;
  maxDisk: number;
  orderable: boolean;
  availability: string;
  price: { amount: number; currency: string; period: string } | null;
  yearlyPrice: { amount: number; currency: string; period: string } | null;
  customerVariables?: Record<string, { label: string; description?: string; required?: boolean; defaultValue?: string }>;
  mailLimits?: {
    maxDomains: number | null;
    maxMailboxes: number | null;
    maxAliases: number | null;
    maxForwarding: number | null;
    totalStorageMb: number | null;
    mailboxQuotaMb: number | null;
    sendLimit: number | null;
    sendInterval: string | null;
  } | null;
}

export interface OfferingPreset {
  slug: string;
  name: string;
  variantSlug: string | null;
  version: number;
  summary: string;
  notes: string;
  recommendedRamMb: number | null;
  recommendedCpu: number | null;
  recommendedDiskGb: number | null;
  plugins: string[];
}

export interface OfferingAddon {
  slug: string;
  name: string;
  summary: string;
  kind: string;
  version: number;
  variantSlugs: string[];
  optionCode: string | null;
  optionAmount: number | null;
  optionCurrency: string | null;
  serviceSlug: string | null;
  serviceName: string | null;
}

export interface OfferingWizardStep {
  id: string;
  title: string;
  description?: string;
  component: string;
  required?: boolean;
}

export interface OfferingWizardConfig {
  version: number;
  defaultStep?: string;
  steps: OfferingWizardStep[];
}

export interface CatalogOffering {
  slug: string;
  name: string;
  summary: string;
  description?: string;
  category: string;
  group: string;
  icon: string;
  kind: 'family' | 'vps' | 'email' | 'product';
  discovery: 'FEATURED' | 'GROUPED' | 'ADVANCED' | 'HIDDEN';
  sortOrder: number;
  startingPrice: { amount: number; currency: string; period: string } | null;
  orderable: boolean;
  availability: string;
  variants: OfferingVariant[];
  presets: OfferingPreset[];
  addons: OfferingAddon[];
  defaultVariantSlug?: string;
  defaultPresetSlug?: string;
  searchTags: string[];
  wizardConfig?: OfferingWizardConfig;
}

export interface SearchMatchResult {
  offering: CatalogOffering;
  matchedVariantSlug?: string;
  matchedPresetSlug?: string;
  score: number;
}

/** Fetches all catalog offerings from the server. */
export function useCatalogOfferings() {
  const state = useAsync<{ offerings: CatalogOffering[] }>((signal) => get('/catalog/offerings', undefined, signal), []);
  return {
    offerings: state.data?.offerings ?? [],
    loading: state.loading,
    error: state.error,
    reload: state.reload,
  };
}

/** Fetches a single catalog offering by slug or alias. */
export function useCatalogOffering(slug: string) {
  const state = useAsync<{ offering: CatalogOffering }>(
    (signal) => (slug ? get(`/catalog/offerings/${encodeURIComponent(slug)}`, undefined, signal) : Promise.reject(new Error('No slug'))),
    [slug],
  );
  return {
    offering: state.data?.offering ?? null,
    loading: state.loading,
    error: state.error,
    reload: state.reload,
  };
}

/** Client search helper that queries the universal search endpoint. */
export async function searchOfferings(query: string, signal?: AbortSignal): Promise<SearchMatchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const res = await get<{ matches: SearchMatchResult[] }>('/catalog/search', { q: trimmed }, signal);
  return res.matches;
}

