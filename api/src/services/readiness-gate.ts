import type { Product, ProductPrice } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { deploymentAvailability, type DeploymentAvailability } from './availability.js';
import { catalogSalesContext } from './sales-flags.js';
import * as ptero from './pterodactyl/application.js';
import * as proxmox from './proxmox.js';

/**
 * The readiness gate: one rule that says whether a product can really be
 * sold, used by the checkout (server-side), the admin and the storefront.
 *
 *   ready = eligibleFulfillment && resolvedEgg && providerReady
 *         && priceQuoteValid && capacityReady && planValid
 *
 * `visible` and `deployable` alone are not enough: they only say what the
 * operator wants. The gate also asks the facts: is the egg known, is the
 * provider reachable, is the price a real price, is there room on a node.
 * For a VPS or a mail plan the egg and the panel node do not apply.
 */

export type GateCheckId =
  | 'eligibleFulfillment'
  | 'resolvedEgg'
  | 'providerReady'
  | 'priceQuoteValid'
  | 'capacityReady'
  | 'planValid';

export interface GateCheck {
  id: GateCheckId;
  ok: boolean;
  /** Plain words: what is missing when `ok` is false. */
  message: string;
}

export interface ReadinessGate {
  ready: boolean;
  checks: GateCheck[];
  /** The messages of the failed checks. */
  blockers: string[];
}

/** What the platform knows about the outside world, read once for many products. */
export interface GateFacts {
  panelConfigured: boolean;
  /** Eggs imported from the panel. `known` is false when none was ever imported. */
  eggs: { known: boolean; ids: Set<number>; names: Set<string> };
  /** Usable nodes with their free room. `null` when the panel could not be read. */
  nodes: { freeMemoryMb: number; freeDiskMb: number }[] | null;
  proxmoxConfigured: boolean;
  /** Hypervisor room and VPS slots. `null` when Proxmox could not be read. */
  vpsCapacity: { freeMemoryMb: number; freeDiskGb: number; usedSlots: number; maxSlots: number } | null;
}

const lower = (value: string) => value.trim().toLowerCase();

let cached: { at: number; facts: GateFacts } | null = null;
const TTL_MS = 30_000;

/** Replaced by the test setup: the suite has no panel. */
let source: () => Promise<GateFacts> = readFacts;
export function setGateFactsSource(next: (() => Promise<GateFacts>) | null): void {
  source = next ?? readFacts;
  cached = null;
}

async function readFacts(): Promise<GateFacts> {
  const eggRows = await prisma.egg.findMany({ select: { pterodactylId: true, name: true } });
  const panelConfigured = env.pterodactylEnabled;
  let nodes: GateFacts['nodes'] = null;
  if (panelConfigured) {
    try {
      const all = await ptero.listNodes();
      nodes = all
        .filter((node) => !node.maintenance_mode)
        .map((node) => ({
          freeMemoryMb: node.memory + node.memory_overallocate - node.allocated_resources.memory,
          freeDiskMb: node.disk + node.disk_overallocate - node.allocated_resources.disk,
        }));
    } catch {
      nodes = null;
    }
  }
  const proxmoxConfigured = Boolean(env.VPS_PROXMOX_URL && env.VPS_PROXMOX_TOKEN);
  let vpsCapacity: GateFacts['vpsCapacity'] = null;
  if (proxmoxConfigured) {
    try {
      const [host, members] = await Promise.all([proxmox.nodeResources(), proxmox.poolMembers()]);
      vpsCapacity = {
        freeMemoryMb: host.freeMemoryMb,
        freeDiskGb: host.freeDiskGb,
        usedSlots: members.length,
        maxSlots: Math.min(env.VPS_MAX_SLOTS, 254 - env.VPS_HOST_OFFSET),
      };
    } catch {
      vpsCapacity = null;
    }
  }
  return {
    panelConfigured,
    eggs: { known: eggRows.length > 0, ids: new Set(eggRows.map((egg) => egg.pterodactylId)), names: new Set(eggRows.map((egg) => lower(egg.name))) },
    nodes,
    proxmoxConfigured,
    vpsCapacity,
  };
}

export async function gateFacts(): Promise<GateFacts> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.facts;
  const facts = await source();
  cached = { at: Date.now(), facts };
  return facts;
}

type GateProduct = Pick<
  Product,
  | 'name' | 'slug' | 'deployable' | 'eggId' | 'eggName' | 'visible' | 'fulfilment'
  | 'minRam' | 'defaultRam' | 'maxRam' | 'minCpu' | 'defaultCpu' | 'maxCpu' | 'minDisk' | 'defaultDisk' | 'maxDisk'
>;

/**
 * The gate for one product. Pure: the facts are given. `quote` is the price
 * of the default plan for one month, when it could be made.
 */
export function evaluateGate(
  product: GateProduct,
  prices: Pick<ProductPrice, 'period' | 'active'>[],
  quote: number | null,
  facts: GateFacts,
  availability: DeploymentAvailability = deploymentAvailability(product, catalogSalesContext()),
): ReadinessGate {
  const checks: GateCheck[] = [];
  const add = (id: GateCheckId, ok: boolean, message: string) => checks.push({ id, ok, message });
  const server = product.fulfilment === 'SERVER';
  const vps = product.fulfilment === 'VPS';

  add('eligibleFulfillment', availability.orderable, availability.orderable ? 'The operator has opened the product.' : availability.blockers.join(' ') || 'The product is not open for orders.');

  if (server) {
    const named = product.eggId !== null || Boolean(product.eggName);
    let ok = named;
    let message = named ? 'The product names its egg.' : 'The product names no egg, so the panel cannot build it.';
    if (named && facts.eggs.known) {
      const found = (product.eggId !== null && facts.eggs.ids.has(product.eggId)) || Boolean(product.eggName && facts.eggs.names.has(lower(product.eggName)));
      ok = found;
      message = found ? 'The egg exists on the panel.' : 'The egg of the product is not among the eggs imported from the panel.';
    }
    add('resolvedEgg', ok, message);

    const providerOk = facts.panelConfigured && facts.nodes !== null;
    add('providerReady', providerOk, providerOk ? 'The panel answers.' : facts.panelConfigured ? 'The panel could not be reached.' : 'The panel is not configured.');

    const need = { memory: product.defaultRam, disk: product.defaultDisk * 1024 };
    const fits = (facts.nodes ?? []).some((node) => node.freeMemoryMb >= need.memory && node.freeDiskMb >= need.disk);
    add('capacityReady', providerOk && fits, !providerOk ? 'Capacity is unknown while the panel is out of reach.' : fits ? 'A node has room for the default plan.' : 'No node has room for the default plan.');
  } else if (vps) {
    add('providerReady', facts.proxmoxConfigured, facts.proxmoxConfigured ? 'The VPS hypervisor is configured.' : 'The VPS hypervisor is not configured.');
    const cap = facts.vpsCapacity;
    const ramOk = Boolean(cap && cap.freeMemoryMb >= product.defaultRam);
    const diskOk = Boolean(cap && cap.freeDiskGb >= product.defaultDisk);
    const slotOk = Boolean(cap && cap.usedSlots < cap.maxSlots);
    add(
      'capacityReady',
      Boolean(facts.proxmoxConfigured && ramOk && diskOk && slotOk),
      !facts.proxmoxConfigured
        ? 'Capacity is unknown while the hypervisor is not configured.'
        : !cap
          ? 'The hypervisor capacity could not be read.'
          : !slotOk
            ? 'No VPS slot is left.'
            : !ramOk
              ? 'The hypervisor does not have enough free memory for the default plan.'
              : !diskOk
                ? 'The hypervisor does not have enough free disk for the default plan.'
                : 'The hypervisor has room for the default plan.',
    );
  } else {
    add('providerReady', env.MAIL_SALES_ENABLED, env.MAIL_SALES_ENABLED ? 'Hosted mail is on sale.' : 'Hosted mail is not on sale at the moment.');
  }

  const hasMonthly = prices.some((price) => price.period === 'MONTHLY' && price.active);
  const quoteOk = hasMonthly && quote !== null && quote > 0;
  add('priceQuoteValid', quoteOk, quoteOk ? 'The default plan has a price above zero.' : !hasMonthly ? 'There is no active monthly price.' : 'The default plan quotes zero or cannot be quoted.');

  const ordered = vps || (
    product.minRam <= product.defaultRam && product.defaultRam <= product.maxRam &&
    product.minCpu <= product.defaultCpu && product.defaultCpu <= product.maxCpu &&
    product.minDisk <= product.defaultDisk && product.defaultDisk <= product.maxDisk
  );
  add('planValid', ordered, ordered ? 'Minimum, default and maximum are in order.' : 'Minimum, default and maximum are not in order.');

  const blockers = checks.filter((check) => !check.ok).map((check) => check.message);
  return { ready: blockers.length === 0, checks, blockers };
}

/** The gate for a product that is loaded with its prices. */
export async function productGate(
  product: GateProduct & { id: string; prices: ProductPrice[] },
  facts?: GateFacts,
): Promise<ReadinessGate> {
  const { priceConfiguration, resourceRates } = await import('./pricing.js');
  const known = facts ?? (await gateFacts());
  const monthly = product.prices.find((price) => price.period === 'MONTHLY' && price.active);
  const quote = monthly
    ? await resourceRates()
        .then((rates) => priceConfiguration(monthly, product, { ram: product.defaultRam, cpu: product.defaultCpu, disk: product.defaultDisk }, [], rates, 'MONTHLY', 0))
        .catch(() => null)
    : null;
  return evaluateGate(product, product.prices, quote, known);
}

/**
 * The availability seen by customers and by staff once the gate is known:
 * a product that the operator opened but the gate refuses is shown as
 * temporarily unavailable with the reasons, never as orderable.
 */
export function withGate(availability: DeploymentAvailability, gate: ReadinessGate): DeploymentAvailability & { readiness: ReadinessGate } {
  if (!availability.orderable || gate.ready) return { ...availability, readiness: gate };
  return { ...availability, state: 'TEMPORARILY_UNAVAILABLE', orderable: false, blockers: gate.blockers, readiness: gate };
}
