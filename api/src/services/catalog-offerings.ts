import type { BillingPeriod, ProductFulfilment } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { badRequest, notFound } from '../lib/errors.js';
import { deploymentAvailability } from './availability.js';
import { catalogSalesContext } from './sales-flags.js';
import { buildQuote, priceBook, priceRowFor, resourceRates } from './pricing.js';

export interface OfferingVariant {
  slug: string;
  label: string;
  productSlug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  fulfilment: ProductFulfilment;
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
  customerVariables: unknown;
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
  fields?: {
    name: string;
    label: string;
    type: 'select' | 'radio' | 'checkbox' | 'text' | 'number' | 'resources' | 'region' | 'domain' | 'plan' | 'addon' | 'os_image' | 'ssh_key';
    options?: { label: string; value: string; description?: string }[];
    defaultValue?: unknown;
    required?: boolean;
  }[];
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

/** Intent & framework dictionary for intelligent search resolution. */
const INTENT_TAGS: Record<string, { tags: string[]; defaultVariant?: string; defaultPreset?: string }> = {
  minecraft: {
    tags: ['minecraft', 'mc', 'paper', 'papermc', 'folia', 'forge', 'bedrock', 'mods', 'modded', 'plugins', 'bukkit', 'spigot', 'survival', 'skyblock', 'smp', 'geyser', 'floodgate'],
    defaultVariant: 'minecraft-paper',
    defaultPreset: 'paper-survival',
  },
  'discord-bot': {
    tags: ['discord', 'bot', 'discord.js', 'discord.py', 'slash commands', 'interactions', 'moderation', 'welcome', 'tickets', 'node', 'python'],
    defaultVariant: 'discord-bot',
    defaultPreset: 'moderation',
  },
  vps: {
    tags: ['vps', 'virtual private server', 'kvm', 'proxmox', 'linux', 'root', 'ssh', 'dedicated ip', 'ubuntu', 'debian', 'almalinux', 'alpine', 'cloud server'],
    defaultVariant: 'vps-start',
  },
  'email-hosting': {
    tags: ['email', 'mail', 'mailbox', 'mailcow', 'domain email', 'smtp', 'imap', 'webmail', 'business email', 'hosted mail'],
    defaultVariant: 'email-hosting-starter',
  },
  databases: {
    tags: ['database', 'db', 'sql', 'nosql', 'postgres', 'postgresql', 'mariadb', 'mysql', 'mongodb', 'mongo', 'redis', 'cache', 'key-value'],
    defaultVariant: 'postgresql',
  },
  'custom-runtime': {
    tags: ['runtime', 'code', 'nodejs', 'node', 'nextjs', 'next', 'python', 'fastapi', 'flask', 'django', 'php', 'laravel', 'golang', 'go', 'rust', 'deno', 'dotnet'],
    defaultVariant: 'nodejs',
  },
  monitoring: {
    tags: ['monitoring', 'metrics', 'grafana', 'prometheus', 'loki', 'uptime', 'uptime kuma', 'status page', 'dashboards', 'alerts'],
    defaultVariant: 'grafana',
  },
  git: {
    tags: ['git', 'forgejo', 'gitea', 'repository', 'version control', 'code hosting'],
    defaultVariant: 'forgejo',
  },
};

const SPECIFIC_VARIANT_TAGS: Record<string, { offeringSlug: string; variantSlug: string }> = {
  forge: { offeringSlug: 'minecraft', variantSlug: 'minecraft-forge' },
  papermc: { offeringSlug: 'minecraft', variantSlug: 'minecraft-paper' },
  paper: { offeringSlug: 'minecraft', variantSlug: 'minecraft-paper' },
  folia: { offeringSlug: 'minecraft', variantSlug: 'minecraft-folia' },
  bedrock: { offeringSlug: 'minecraft', variantSlug: 'minecraft-bedrock' },
  laravel: { offeringSlug: 'custom-runtime', variantSlug: 'php' },
  django: { offeringSlug: 'custom-runtime', variantSlug: 'python' },
  fastapi: { offeringSlug: 'custom-runtime', variantSlug: 'python' },
  nextjs: { offeringSlug: 'custom-runtime', variantSlug: 'nodejs' },
  next: { offeringSlug: 'custom-runtime', variantSlug: 'nodejs' },
  postgres: { offeringSlug: 'databases', variantSlug: 'postgresql' },
  mysql: { offeringSlug: 'databases', variantSlug: 'mariadb' },
  redis: { offeringSlug: 'databases', variantSlug: 'redis' },
  mongodb: { offeringSlug: 'databases', variantSlug: 'mongodb' },
};

function defaultWizardForOffering(slug: string, kind: string): OfferingWizardConfig {
  if (slug === 'minecraft') {
    return {
      version: 1,
      steps: [
        { id: 'software', title: 'Software & Edition', description: 'Choose Java (Paper, Folia, Forge) or Bedrock server engine.', component: 'VariantSelection', required: true },
        { id: 'version', title: 'Game Version', description: 'Select the Minecraft release version.', component: 'SoftwareVersion', required: true },
        { id: 'preset', title: 'Starting Template', description: 'Start blank or choose a curated plugin/mod preset.', component: 'PresetSelection' },
        { id: 'plugins', title: 'Add-ons & Plugins', description: 'Pick Modrinth plugins and mods compatible with your version.', component: 'PluginSelection' },
        { id: 'resources', title: 'Server Resources', description: 'Allocate dedicated RAM, CPU and NVMe storage.', component: 'ResourceConfiguration', required: true },
        { id: 'network', title: 'Server Name & Network', description: 'Choose your instance name and free platform domain label.', component: 'NetworkConfiguration' },
        { id: 'review', title: 'Order & Acceptance', description: 'Review configuration and accept the Minecraft EULA.', component: 'OrderReview', required: true },
      ],
    };
  }
  if (kind === 'vps' || slug === 'vps') {
    return {
      version: 1,
      steps: [
        { id: 'plan', title: 'Choose VPS Plan', description: 'Select compute resources: vCPU, RAM, and NVMe disk.', component: 'PlanComparison', required: true },
        { id: 'image', title: 'Operating System', description: 'Choose a Linux distribution template or mount a custom ISO.', component: 'OperatingSystem', required: true },
        { id: 'access', title: 'SSH & Credentials', description: 'Provide your public SSH key for secure root access.', component: 'EnvironmentSetup', required: true },
        { id: 'network', title: 'Network & Add-ons', description: 'Configure hostname and optional dedicated IPv4 address.', component: 'ConfigurableOptions' },
        { id: 'review', title: 'Review & Billing', description: 'Confirm billing period, review quote, and order.', component: 'OrderReview', required: true },
      ],
    };
  }
  if (kind === 'email' || slug === 'email-hosting') {
    return {
      version: 1,
      steps: [
        { id: 'plan', title: 'Choose Email Plan', description: 'Select mailbox limits, storage quota, and sending limits.', component: 'PlanComparison', required: true },
        { id: 'domain', title: 'Email Domain', description: 'Enter the domain name you want to use for mailboxes.', component: 'DomainConfiguration', required: true },
        { id: 'review', title: 'Review & Billing', description: 'Choose monthly or yearly billing and place order.', component: 'OrderReview', required: true },
      ],
    };
  }
  if (slug === 'discord-bot') {
    return {
      version: 1,
      steps: [
        { id: 'source', title: 'Deployment Source', description: 'Choose Blank Node/Python, connect a Git repository, or start from a bot preset.', component: 'SourceSelection', required: true },
        { id: 'resources', title: 'Bot Resources', description: 'Allocate lightweight CPU and memory limits.', component: 'ResourceConfiguration', required: true },
        { id: 'env', title: 'Environment & Secrets', description: 'Configure bot token and customer variables.', component: 'EnvironmentSetup' },
        { id: 'review', title: 'Review & Deploy', description: 'Confirm quote and launch bot.', component: 'OrderReview', required: true },
      ],
    };
  }
  return {
    version: 1,
    steps: [
      { id: 'resources', title: 'Resources', description: 'Select CPU, memory, and disk size.', component: 'ResourceConfiguration', required: true },
      { id: 'options', title: 'Configuration & Add-ons', description: 'Optional features and parameters.', component: 'ConfigurableOptions' },
      { id: 'review', title: 'Review & Order', description: 'Confirm pricing and checkout.', component: 'OrderReview', required: true },
    ],
  };
}

/**
 * Returns all public offerings for Deploy Studio 3.0.
 * Combines prepared families with standalone orderable products so no product is hidden.
 */
export async function publicOfferings(): Promise<CatalogOffering[]> {
  const rates = await resourceRates();

  // Load all products with active prices and options
  const products = await prisma.product.findMany({
    where: { visible: true },
    include: {
      prices: { where: { active: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] },
      options: { where: { active: true } },
      catalogVariant: { select: { id: true, familyId: true, slug: true, label: true, active: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  // Load families
  const families = await prisma.catalogFamily.findMany({
    where: { prepared: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      variants: {
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        include: {
          product: {
            include: {
              prices: { where: { active: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] },
              options: { where: { active: true } },
            },
          },
        },
      },
      presets: {
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { versions: { where: { publishedAt: { not: null } }, orderBy: { version: 'desc' }, take: 1 } },
      },
      addons: {
        where: { active: true },
        orderBy: { name: 'asc' },
        include: {
          productOption: { select: { code: true, name: true, amount: true, currency: true, active: true } },
          product: { select: { slug: true, name: true, visible: true } },
          compatibilities: { select: { variantId: true } },
        },
      },
    },
  });

  const offerings: CatalogOffering[] = [];
  const handledProductSlugs = new Set<string>();

  for (const family of families) {
    const activeVariants = family.variants.filter((variant) => variant.product.visible);
    if (activeVariants.length === 0) continue;

    const kind: CatalogOffering['kind'] =
      family.slug === 'vps' || family.group === 'vps'
        ? 'vps'
        : family.slug === 'email-hosting' || family.group === 'email-hosting'
          ? 'email'
          : 'family';

    const variants: OfferingVariant[] = activeVariants.map((v) => {
      handledProductSlugs.add(v.product.slug);
      const prod = v.product;
      const availability = deploymentAvailability(prod, catalogSalesContext());
      const price = priceRowFor(prod.prices);
      const yearlyPriceRow = prod.prices.find((p) => p.period === 'YEARLY') ?? null;
      const book = price ? priceBook(prod, price, rates) : null;

      const monthlyPrice = price
        ? {
            amount: prod.fulfilment === 'VPS' || prod.fulfilment === 'EMAIL' ? price.baseAmount : book?.minimum.amount ?? price.baseAmount,
            currency: price.currency,
            period: 'MONTHLY',
          }
        : null;

      const yearlyPrice = yearlyPriceRow
        ? { amount: yearlyPriceRow.baseAmount, currency: yearlyPriceRow.currency, period: 'YEARLY' }
        : monthlyPrice
          ? { amount: monthlyPrice.amount * 12, currency: monthlyPrice.currency, period: 'YEARLY' }
          : null;

      return {
        slug: v.slug,
        label: v.label,
        productSlug: prod.slug,
        name: prod.name,
        description: prod.description,
        icon: prod.icon,
        category: prod.category,
        fulfilment: prod.fulfilment,
        minRam: prod.minRam,
        minCpu: prod.minCpu,
        minDisk: prod.minDisk,
        defaultRam: prod.defaultRam,
        defaultCpu: prod.defaultCpu,
        defaultDisk: prod.defaultDisk,
        maxRam: prod.maxRam,
        maxCpu: prod.maxCpu,
        maxDisk: prod.maxDisk,
        orderable: availability.orderable,
        availability: availability.state,
        price: monthlyPrice,
        yearlyPrice,
        customerVariables: prod.customerVariables,
        mailLimits:
          prod.fulfilment === 'EMAIL'
            ? {
                maxDomains: prod.mailMaxDomains,
                maxMailboxes: prod.mailMaxMailboxes,
                maxAliases: prod.mailMaxAliases,
                maxForwarding: prod.mailMaxForwarding,
                totalStorageMb: prod.mailTotalStorageMb,
                mailboxQuotaMb: prod.mailMailboxQuotaMb,
                sendLimit: prod.mailSendLimit,
                sendInterval: prod.mailSendInterval,
              }
            : null,
      };
    });

    const presets: OfferingPreset[] = family.presets
      .filter((p) => p.versions[0])
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        variantSlug: family.variants.find((v) => v.id === p.variantId)?.slug ?? null,
        version: p.versions[0]!.version,
        summary: p.versions[0]!.summary,
        notes: p.versions[0]!.notes,
        recommendedRamMb: p.versions[0]!.recommendedRamMb,
        recommendedCpu: p.versions[0]!.recommendedCpu,
        recommendedDiskGb: p.versions[0]!.recommendedDiskGb,
        plugins: p.versions[0]!.plugins,
      }));

    const addons: OfferingAddon[] = family.addons.map((a) => ({
      slug: a.slug,
      name: a.name,
      summary: a.summary,
      kind: a.kind,
      version: a.version,
      variantSlugs: a.compatibilities
        .map((row) => family.variants.find((v) => v.id === row.variantId && v.product.visible)?.slug)
        .filter((val): val is string => Boolean(val)),
      optionCode: a.kind === 'PLATFORM_FEATURE' && a.productOption?.active ? a.productOption.code : null,
      optionAmount: a.kind === 'PLATFORM_FEATURE' && a.productOption?.active ? a.productOption.amount : null,
      optionCurrency: a.kind === 'PLATFORM_FEATURE' && a.productOption?.active ? a.productOption.currency : null,
      serviceSlug: a.kind === 'MANAGED_SERVICE' && a.product?.visible ? a.product.slug : null,
      serviceName: a.kind === 'MANAGED_SERVICE' && a.product?.visible ? a.product.name : null,
    }));

    // Find starting price
    const orderableVariants = variants.filter((v) => v.orderable && v.price);
    const minPriceVariant = orderableVariants.sort((a, b) => (a.price?.amount ?? 0) - (b.price?.amount ?? 0))[0];
    const startingPrice = minPriceVariant?.price ?? variants.find((v) => v.price)?.price ?? null;

    const primaryCategory = variants[0]?.category ?? (kind === 'vps' ? 'VPS' : kind === 'email' ? 'EMAIL_HOSTING' : 'WEB_CMS');
    const primaryIcon = variants[0]?.icon ?? (kind === 'vps' ? 'server' : kind === 'email' ? 'mail' : 'box');
    const intent = INTENT_TAGS[family.slug] ?? { tags: [family.slug, family.name.toLowerCase()] };

    offerings.push({
      slug: family.slug,
      name: family.name,
      summary: family.summary,
      category: primaryCategory,
      group: family.group,
      icon: primaryIcon,
      kind,
      discovery: family.discovery as CatalogOffering['discovery'],
      sortOrder: family.sortOrder,
      startingPrice,
      orderable: variants.some((v) => v.orderable),
      availability: variants.some((v) => v.orderable) ? 'DEPLOYABLE' : variants[0]?.availability ?? 'COMING_SOON',
      variants,
      presets,
      addons,
      defaultVariantSlug: intent.defaultVariant ?? variants[0]?.slug,
      defaultPresetSlug: intent.defaultPreset ?? presets[0]?.slug,
      searchTags: [...new Set([...intent.tags, ...variants.map((v) => v.label.toLowerCase()), ...presets.map((p) => p.name.toLowerCase())])],
      wizardConfig: defaultWizardForOffering(family.slug, kind),
    });
  }

  // Also include standalone products that are visible and NOT handled by a multi-variant family
  for (const prod of products) {
    if (handledProductSlugs.has(prod.slug)) continue;

    const availability = deploymentAvailability(prod, catalogSalesContext());
    const price = priceRowFor(prod.prices);
    const yearlyPriceRow = prod.prices.find((p) => p.period === 'YEARLY') ?? null;
    const book = price ? priceBook(prod, price, rates) : null;

    const monthlyPrice = price
      ? {
          amount: prod.fulfilment === 'VPS' || prod.fulfilment === 'EMAIL' ? price.baseAmount : book?.minimum.amount ?? price.baseAmount,
          currency: price.currency,
          period: 'MONTHLY',
        }
      : null;

    const yearlyPrice = yearlyPriceRow
      ? { amount: yearlyPriceRow.baseAmount, currency: yearlyPriceRow.currency, period: 'YEARLY' }
      : monthlyPrice
        ? { amount: monthlyPrice.amount * 12, currency: monthlyPrice.currency, period: 'YEARLY' }
        : null;

    const variant: OfferingVariant = {
      slug: prod.slug,
      label: prod.name,
      productSlug: prod.slug,
      name: prod.name,
      description: prod.description,
      icon: prod.icon,
      category: prod.category,
      fulfilment: prod.fulfilment,
      minRam: prod.minRam,
      minCpu: prod.minCpu,
      minDisk: prod.minDisk,
      defaultRam: prod.defaultRam,
      defaultCpu: prod.defaultCpu,
      defaultDisk: prod.defaultDisk,
      maxRam: prod.maxRam,
      maxCpu: prod.maxCpu,
      maxDisk: prod.maxDisk,
      orderable: availability.orderable,
      availability: availability.state,
      price: monthlyPrice,
      yearlyPrice,
      customerVariables: prod.customerVariables,
      mailLimits: null,
    };

    const searchTags = [prod.slug, prod.name.toLowerCase(), prod.category.toLowerCase().replace(/_/g, ' ')];
    if (prod.eggName) searchTags.push(prod.eggName.toLowerCase());

    offerings.push({
      slug: prod.slug,
      name: prod.name,
      summary: prod.description,
      description: prod.description,
      category: prod.category,
      group: prod.category.toLowerCase().replace(/_/g, '-'),
      icon: prod.icon,
      kind: 'product',
      discovery: prod.visible ? 'GROUPED' : 'HIDDEN',
      sortOrder: prod.sortOrder,
      startingPrice: monthlyPrice,
      orderable: availability.orderable,
      availability: availability.state,
      variants: [variant],
      presets: [],
      addons: prod.options.map((opt) => ({
        slug: opt.code,
        name: opt.name,
        summary: opt.description ?? '',
        kind: 'PLATFORM_FEATURE',
        version: 1,
        variantSlugs: [prod.slug],
        optionCode: opt.code,
        optionAmount: opt.amount,
        optionCurrency: opt.currency,
        serviceSlug: null,
        serviceName: null,
      })),
      defaultVariantSlug: prod.slug,
      searchTags,
      wizardConfig: defaultWizardForOffering(prod.slug, 'product'),
    });
  }

  return offerings.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * Resolves a single offering by slug (offering slug, variant slug, or product slug).
 */
export async function getOfferingBySlug(slug: string): Promise<CatalogOffering | null> {
  const normalized = slug.trim().toLowerCase();
  const offerings = await publicOfferings();

  // 1. Direct offering slug match
  const direct = offerings.find((o) => o.slug.toLowerCase() === normalized);
  if (direct) return direct;

  // 2. Specific variant alias (e.g. "forge" -> Minecraft)
  const alias = SPECIFIC_VARIANT_TAGS[normalized];
  if (alias) {
    const matched = offerings.find((o) => o.slug === alias.offeringSlug);
    if (matched) {
      return { ...matched, defaultVariantSlug: alias.variantSlug };
    }
  }

  // 3. Variant product slug match (e.g. "vps-plus" -> VPS offering)
  const byVariant = offerings.find((o) => o.variants.some((v) => v.productSlug.toLowerCase() === normalized || v.slug.toLowerCase() === normalized));
  if (byVariant) {
    const variant = byVariant.variants.find((v) => v.productSlug.toLowerCase() === normalized || v.slug.toLowerCase() === normalized);
    return { ...byVariant, defaultVariantSlug: variant?.slug ?? byVariant.defaultVariantSlug };
  }

  return null;
}

export interface SearchMatchResult {
  offering: CatalogOffering;
  matchedVariantSlug?: string;
  matchedPresetSlug?: string;
  score: number;
}

/**
 * Universal cross-category search for Deploy Studio.
 * Resolves query string to offerings, variants, presets, and frameworks.
 */
export async function searchOfferings(query: string): Promise<SearchMatchResult[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const offerings = await publicOfferings();
  const results: SearchMatchResult[] = [];

  for (const offering of offerings) {
    let score = 0;
    let matchedVariantSlug: string | undefined;
    let matchedPresetSlug: string | undefined;

    // Check specific framework mapping
    const specific = SPECIFIC_VARIANT_TAGS[needle];
    if (specific && specific.offeringSlug === offering.slug) {
      score += 100;
      matchedVariantSlug = specific.variantSlug;
    }

    // Direct offering name / slug match
    if (offering.slug.toLowerCase() === needle || offering.name.toLowerCase() === needle) {
      score += 80;
    } else if (offering.name.toLowerCase().includes(needle) || offering.slug.toLowerCase().includes(needle)) {
      score += 40;
    }

    // Search tags match
    if (offering.searchTags.some((tag) => tag === needle)) {
      score += 50;
    } else if (offering.searchTags.some((tag) => tag.includes(needle))) {
      score += 20;
    }

    // Variant match
    for (const v of offering.variants) {
      if (v.slug.toLowerCase() === needle || v.productSlug.toLowerCase() === needle || v.label.toLowerCase() === needle) {
        score += 60;
        matchedVariantSlug = v.slug;
        break;
      } else if (v.label.toLowerCase().includes(needle) || v.slug.toLowerCase().includes(needle) || v.productSlug.toLowerCase().includes(needle)) {
        score += 25;
        matchedVariantSlug = matchedVariantSlug ?? v.slug;
      }
    }

    // Preset match
    for (const p of offering.presets) {
      if (p.slug.toLowerCase() === needle || p.name.toLowerCase() === needle) {
        score += 55;
        matchedPresetSlug = p.slug;
        if (p.variantSlug) matchedVariantSlug = p.variantSlug;
        break;
      } else if (p.name.toLowerCase().includes(needle) || p.slug.toLowerCase().includes(needle)) {
        score += 20;
        matchedPresetSlug = matchedPresetSlug ?? p.slug;
        if (p.variantSlug) matchedVariantSlug = matchedVariantSlug ?? p.variantSlug;
      }
    }

    if (score > 0) {
      results.push({
        offering: {
          ...offering,
          defaultVariantSlug: matchedVariantSlug ?? offering.defaultVariantSlug,
          defaultPresetSlug: matchedPresetSlug ?? offering.defaultPresetSlug,
        },
        matchedVariantSlug,
        matchedPresetSlug,
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score || a.offering.sortOrder - b.offering.sortOrder);
}

