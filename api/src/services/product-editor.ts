import { Prisma, type Product, type ProductPrice } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { MAX_STARTUP_VARIABLES } from '../lib/bounded.js';

/**
 * The editor of a product.
 *
 * A change is planned before it is written: the plan lists what changes, which
 * of the changes touch how the product is built or sold, how many services and
 * orders already exist, and what is wrong. Nothing here writes to a running
 * service. A product holds the configuration of NEW orders; a service keeps the
 * size and the settings it was built with.
 */

export type Lifecycle = 'DRAFT' | 'PUBLISHED' | 'UNAVAILABLE' | 'RETIRED';

/** The state of a product, from the two switches and the date of retirement. */
export function lifecycleOf(product: Pick<Product, 'visible' | 'deployable' | 'retiredAt'>): Lifecycle {
  if (product.retiredAt) return 'RETIRED';
  if (product.visible && product.deployable) return 'PUBLISHED';
  if (product.visible) return 'UNAVAILABLE';
  return 'DRAFT';
}

const LIFECYCLE_FLAGS: Record<Lifecycle, { visible: boolean; deployable: boolean }> = {
  DRAFT: { visible: false, deployable: false },
  PUBLISHED: { visible: true, deployable: true },
  UNAVAILABLE: { visible: true, deployable: false },
  RETIRED: { visible: false, deployable: false },
};

const envName = /^[A-Z][A-Z0-9_]{0,63}$/;
const envKeyed = <T extends z.ZodTypeAny>(value: T) => z.record(z.string().regex(envName, 'Use a variable name such as SERVER_PORT.'), value);

const healthProbe = z.union([
  z.object({ kind: z.literal('http'), path: z.string().trim().max(200).optional(), expectStatus: z.array(z.number().int().min(100).max(599)).max(20).optional(), expectBody: z.string().max(200).optional(), timeoutMs: z.number().int().min(500).max(60_000).optional() }),
  z.object({ kind: z.literal('tcp'), timeoutMs: z.number().int().min(500).max(60_000).optional() }),
  z.object({ kind: z.literal('container'), timeoutMs: z.number().int().min(500).max(60_000).optional() }),
]);

const cpu = z.number().min(0.5).max(64).refine((value) => Number.isInteger(value * 2), 'The processor is counted in halves.');

/** The fields of a product that the editor may change. Anything else is refused. */
export const productPatchSchema = z
  .object({
    slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes.'),
    name: z.string().trim().min(2).max(120),
    category: z.enum(['WEB_CMS', 'DEVELOPER_TOOLS', 'MONITORING', 'AUTOMATION', 'BOTS', 'DATABASES', 'GAMES']),
    description: z.string().trim().min(10).max(2000),
    icon: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/, 'Use the name of an icon.'),
    sortOrder: z.number().int().min(-10_000).max(10_000),
    lifecycle: z.enum(['DRAFT', 'PUBLISHED', 'UNAVAILABLE', 'RETIRED']),
    // The two switches are kept for the callers that existed before the states.
    visible: z.boolean(),
    deployable: z.boolean(),
    eggId: z.number().int().positive().nullable(),
    eggName: z.string().trim().min(1).max(120).nullable(),
    dockerImage: z.string().trim().max(300).regex(/^[A-Za-z0-9][A-Za-z0-9._\-/:@]*$/, 'That is not an image reference.').nullable(),
    startup: envKeyed(z.string().max(2000)).nullable(),
    startupCommand: z.string().trim().max(4000).nullable(),
    customerVariables: envKeyed(
      z.object({
        label: z.string().trim().max(120).optional(),
        required: z.boolean().optional(),
        type: z.enum(['text', 'password']).optional(),
        description: z.string().trim().max(300).optional(),
      }),
    ).nullable(),
    generatedVariables: envKeyed(z.object({ length: z.number().int().min(8).max(64) })).nullable(),
    healthProbe: healthProbe.nullable(),
    minRam: z.number().int().min(128).max(1_048_576),
    defaultRam: z.number().int().min(128).max(1_048_576),
    maxRam: z.number().int().min(128).max(1_048_576),
    minCpu: cpu,
    defaultCpu: cpu,
    maxCpu: cpu,
    minDisk: z.number().int().min(1).max(100_000),
    defaultDisk: z.number().int().min(1).max(100_000),
    maxDisk: z.number().int().min(1).max(100_000),
    docsUrl: z.string().trim().max(300).regex(/^(https:\/\/|\/)[^\s]*$/, 'Use an https address or a path that starts with /.').nullable(),
    installGuide: z.string().max(8000).nullable(),
  })
  .partial()
  .strict();

export type ProductPatch = z.infer<typeof productPatchSchema>;

type Risk = 'safe' | 'risky';

/** What each field touches. A risky field changes how a product is built, run or sold. */
const FIELD_RISK: Record<keyof ProductPatch, { risk: Risk; note: string }> = {
  name: { risk: 'safe', note: 'Shown to customers. Existing services keep working.' },
  description: { risk: 'safe', note: 'Shown to customers.' },
  icon: { risk: 'safe', note: 'Shown to customers.' },
  sortOrder: { risk: 'safe', note: 'Changes the order of the catalogue.' },
  docsUrl: { risk: 'safe', note: 'Link shown to customers.' },
  installGuide: { risk: 'safe', note: 'Guidance stored with the product.' },
  visible: { risk: 'risky', note: 'Changes what customers see.' },
  deployable: { risk: 'risky', note: 'Changes whether the product can be ordered.' },
  lifecycle: { risk: 'risky', note: 'Changes whether the product is listed and can be ordered. Existing services are not touched.' },
  slug: { risk: 'risky', note: 'The address of the product pages and the reference of its orders.' },
  category: { risk: 'risky', note: 'Moves the product to another group of the catalogue.' },
  eggId: { risk: 'risky', note: 'New servers are built from another egg. Existing servers keep theirs.' },
  eggName: { risk: 'risky', note: 'New servers are built from another egg. Existing servers keep theirs.' },
  dockerImage: { risk: 'risky', note: 'New servers and rebuilds use another image.' },
  startup: { risk: 'risky', note: 'New servers start with other variables.' },
  startupCommand: { risk: 'risky', note: 'New servers start with another command.' },
  customerVariables: { risk: 'risky', note: 'Changes what a customer must fill when ordering.' },
  generatedVariables: { risk: 'risky', note: 'Changes the secrets the platform makes for new servers.' },
  healthProbe: { risk: 'risky', note: 'Changes how a new deployment is declared working.' },
  minRam: { risk: 'risky', note: 'Limits of new orders.' },
  defaultRam: { risk: 'risky', note: 'Size offered to new orders.' },
  maxRam: { risk: 'risky', note: 'Limits of new orders.' },
  minCpu: { risk: 'risky', note: 'Limits of new orders.' },
  defaultCpu: { risk: 'risky', note: 'Size offered to new orders.' },
  maxCpu: { risk: 'risky', note: 'Limits of new orders.' },
  minDisk: { risk: 'risky', note: 'Limits of new orders.' },
  defaultDisk: { risk: 'risky', note: 'Size offered to new orders.' },
  maxDisk: { risk: 'risky', note: 'Limits of new orders.' },
};

export interface FieldChange {
  field: keyof ProductPatch;
  from: unknown;
  to: unknown;
  risk: Risk;
  note: string;
}

export interface Check {
  id: string;
  level: 'blocker' | 'warning' | 'info';
  ok: boolean;
  message: string;
}

export interface ProductUsage {
  instances: number;
  orderItems: number;
  vpsServices: number;
}

export interface ChangePlan {
  changes: FieldChange[];
  errors: string[];
  readiness: Check[];
  usage: ProductUsage;
  /** The change is risky and the product is sold or has customers, so the operator has to confirm it. */
  requiresConfirmation: boolean;
  lifecycleFrom: Lifecycle;
  lifecycleTo: Lifecycle;
  data: Prisma.ProductUpdateInput;
}

type WithPrices = Product & { prices: ProductPrice[] };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function usageOf(productId: string): Promise<ProductUsage> {
  const [instances, orderItems, vpsServices] = await Promise.all([
    prisma.instance.count({ where: { productId } }),
    prisma.orderItem.count({ where: { productId } }),
    prisma.vpsService.count({ where: { productId } }),
  ]);
  return { instances, orderItems, vpsServices };
}

/**
 * Whether the product can really be sold and built. Blockers stop the publication; warnings and
 * notes do not. This does not run a deployment: only the probe of the eggs on the node proves one.
 */
export async function readinessOf(product: WithPrices): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (id: string, level: Check['level'], ok: boolean, message: string) => checks.push({ id, level, ok, message });
  const server = product.fulfilment === 'SERVER';

  if (server) {
    const named = product.eggId !== null || Boolean(product.eggName);
    add('egg-set', 'blocker', named, named ? 'The product names its egg.' : 'The product names no egg, so the panel cannot build it.');
    if (named) {
      const egg = await prisma.egg.findFirst({
        where: { OR: [...(product.eggId !== null ? [{ pterodactylId: product.eggId }] : []), ...(product.eggName ? [{ name: product.eggName }] : [])] },
      });
      add('egg-known', 'blocker', Boolean(egg), egg ? `The egg "${egg.name}" is imported from the panel.` : 'The egg is not in the list imported from the panel. Import the eggs first.');
    }
    add('health-probe', 'warning', Boolean(product.healthProbe), product.healthProbe ? 'A health check declares when a deployment works.' : 'There is no health check, so a deployment is only checked by the container state.');
  }
  const ranges = product.minRam <= product.defaultRam && product.defaultRam <= product.maxRam && product.minCpu <= product.defaultCpu && product.defaultCpu <= product.maxCpu && product.minDisk <= product.defaultDisk && product.defaultDisk <= product.maxDisk;
  if (product.fulfilment !== 'VPS') add('ranges', 'blocker', ranges, ranges ? 'Minimum, default and maximum are in order.' : 'Minimum, default and maximum are not in order.');
  const monthly = product.prices.find((price) => price.period === 'MONTHLY' && price.active);
  add('price', 'blocker', Boolean(monthly), monthly ? 'An active monthly price exists.' : 'There is no active monthly price.');
  if (product.fulfilment === 'EMAIL') add('mail-price', 'blocker', Boolean(monthly && monthly.baseAmount > 0), 'A mail plan needs a price above zero.');
  add('docs', 'warning', Boolean(product.docsUrl), product.docsUrl ? 'A documentation link is set.' : 'No documentation link.');
  add('guide', 'info', Boolean(product.installGuide), product.installGuide ? 'Installation guidance is written.' : 'No installation guidance is written.');
  return checks;
}

const SERVER_ONLY: (keyof ProductPatch)[] = ['eggId', 'eggName', 'dockerImage', 'startup', 'startupCommand', 'customerVariables', 'generatedVariables', 'healthProbe'];
const SIZE_FIELDS: (keyof ProductPatch)[] = ['minRam', 'defaultRam', 'maxRam', 'minCpu', 'defaultCpu', 'maxCpu', 'minDisk', 'defaultDisk', 'maxDisk'];

/** Plans a change without writing anything. */
export async function planProductChange(product: WithPrices, patch: ProductPatch): Promise<ChangePlan> {
  const errors: string[] = [];
  const usage = await usageOf(product.id);
  const sold = usage.instances + usage.orderItems + usage.vpsServices > 0;
  const lifecycleFrom = lifecycleOf(product);

  // The states and the two switches are one thing: say it once.
  if (patch.lifecycle !== undefined && (patch.visible !== undefined || patch.deployable !== undefined)) {
    errors.push('Send the state or the two switches, not both.');
  }
  const flags = patch.lifecycle ? LIFECYCLE_FLAGS[patch.lifecycle] : null;
  const effective: ProductPatch = { ...patch };
  if (flags) {
    effective.visible = flags.visible;
    effective.deployable = flags.deployable;
  }
  const retiring = patch.lifecycle === 'RETIRED';
  const leavingRetired = lifecycleFrom === 'RETIRED' && patch.lifecycle !== undefined && patch.lifecycle !== 'RETIRED';

  if (product.fulfilment !== 'SERVER') {
    for (const field of SERVER_ONLY) if (patch[field] !== undefined) errors.push(`${field} applies to servers only; this product is delivered as ${product.fulfilment === 'EMAIL' ? 'mail' : 'a VPS'}.`);
  }
  if (product.fulfilment === 'VPS') {
    for (const field of SIZE_FIELDS) if (patch[field] !== undefined) errors.push('The size of a VPS plan is changed in the VPS plans, not here.');
  }
  if (patch.category !== undefined && product.fulfilment !== 'SERVER') errors.push('The category of a mail plan or a VPS plan cannot change.');
  if (patch.category !== undefined && sold && patch.category !== product.category) errors.push('The category of a product that has been sold cannot change.');
  if (patch.slug !== undefined && patch.slug !== product.slug) {
    if (sold) errors.push('The slug of a product that has been sold is fixed: its pages, links and orders refer to it. Retire it and publish a new product instead.');
    else if (await prisma.product.findUnique({ where: { slug: patch.slug } })) errors.push('A product with this slug already exists.');
  }
  if (patch.startup && Object.keys(patch.startup).length > MAX_STARTUP_VARIABLES) errors.push('Too many startup variables.');

  const merged: Product & { prices: ProductPrice[] } = {
    ...product,
    ...(Object.fromEntries(Object.entries(effective).filter(([key]) => key !== 'lifecycle')) as Partial<Product>),
    retiredAt: retiring ? new Date() : leavingRetired ? null : product.retiredAt,
  } as WithPrices;

  const changes: FieldChange[] = [];
  for (const key of Object.keys(effective) as (keyof ProductPatch)[]) {
    if (key === 'lifecycle' || (flags && (key === 'visible' || key === 'deployable'))) continue;
    const from = (product as Record<string, unknown>)[key];
    const to = effective[key];
    if (!same(from, to)) changes.push({ field: key, from, to, ...FIELD_RISK[key] });
  }
  const lifecycleTo = lifecycleOf(merged);
  if (lifecycleTo !== lifecycleFrom) changes.push({ field: 'lifecycle', from: lifecycleFrom, to: lifecycleTo, ...FIELD_RISK.lifecycle });

  if (merged.fulfilment !== 'VPS') {
    const order = (low: number, mid: number, high: number) => low <= mid && mid <= high;
    if (!order(merged.minRam, merged.defaultRam, merged.maxRam)) errors.push('Memory: the minimum, the default and the maximum must be in that order.');
    if (!order(merged.minCpu, merged.defaultCpu, merged.maxCpu)) errors.push('Processor: the minimum, the default and the maximum must be in that order.');
    if (!order(merged.minDisk, merged.defaultDisk, merged.maxDisk)) errors.push('Disk: the minimum, the default and the maximum must be in that order.');
  }

  const readiness = await readinessOf(merged);
  // A product may only be moved to the published state when nothing blocks it.
  if (lifecycleTo === 'PUBLISHED' && lifecycleFrom !== 'PUBLISHED') {
    for (const check of readiness) if (check.level === 'blocker' && !check.ok) errors.push(`It cannot be published: ${check.message}`);
  }
  // A product that is published and stays so must not be edited into a state that cannot be built.
  if (lifecycleTo === 'PUBLISHED' && lifecycleFrom === 'PUBLISHED') {
    for (const check of readiness) if (check.level === 'blocker' && !check.ok) errors.push(`This change leaves a published product that cannot be sold: ${check.message}`);
  }

  const data: Prisma.ProductUpdateInput = {};
  for (const change of changes) {
    if (change.field === 'lifecycle') continue;
    const value = change.to;
    (data as Record<string, unknown>)[change.field] =
      value === null && ['startup', 'customerVariables', 'generatedVariables', 'healthProbe'].includes(change.field) ? Prisma.JsonNull : value;
  }
  if (lifecycleTo !== lifecycleFrom) {
    data.visible = merged.visible;
    data.deployable = merged.deployable;
    data.retiredAt = merged.retiredAt;
  }

  const risky = changes.some((change) => change.risk === 'risky');
  return {
    changes,
    errors,
    readiness,
    usage,
    requiresConfirmation: risky && (sold || lifecycleFrom === 'PUBLISHED'),
    lifecycleFrom,
    lifecycleTo,
    data,
  };
}
