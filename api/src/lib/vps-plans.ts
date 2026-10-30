import type { PrismaClient } from '@prisma/client';

/**
 * The plans of the virtual private servers.
 *
 * A plan has fixed resources and a price a month. The plans are written hidden and
 * off sale: the operator switches a plan on when the machine has been proved from
 * the order to the login. A plan that is already there belongs to the operator and
 * is never written over.
 */
export interface VpsPlanDraft {
  slug: string;
  name: string;
  description: string;
  ram: number;
  cpu: number;
  disk: number;
  /** The price of a month, in cents of a euro. */
  amount: number;
  sortOrder: number;
}

export const VPS_PLANS: VpsPlanDraft[] = [
  { slug: 'vps-start', name: 'VPS Start', description: 'A small server of your own, with root access. For a bot, a test or a small API.', ram: 1024, cpu: 1, disk: 20, amount: 249, sortOrder: 200 },
  { slug: 'vps-plus', name: 'VPS Plus', description: 'Two vCPU and 2 GB of memory for a website, an API with a small database, or a CI runner.', ram: 2048, cpu: 2, disk: 30, amount: 349, sortOrder: 201 },
  { slug: 'vps-pro', name: 'VPS Pro', description: 'Room for the backend of an application: the API, its database and a worker on one machine.', ram: 4096, cpu: 2, disk: 50, amount: 449, sortOrder: 202 },
  { slug: 'vps-max', name: 'VPS Max', description: 'Four vCPU and 8 GB of memory for a busy backend or several services on one machine.', ram: 8192, cpu: 4, disk: 80, amount: 699, sortOrder: 203 },
];

/** The address of its own for a VPS, a monthly extra. */
export const DEDICATED_IP_OPTION = { code: 'dedicated-ipv4', name: 'Dedicated IPv4 address', description: 'An address that only your server uses, with every port open to it.', amount: 399 };

export async function seedVpsPlans(prisma: PrismaClient): Promise<{ written: number; kept: number }> {
  let written = 0;
  let kept = 0;
  for (const plan of VPS_PLANS) {
    if (await prisma.product.findUnique({ where: { slug: plan.slug } })) {
      kept += 1;
      continue;
    }
    await prisma.product.create({
      data: {
        slug: plan.slug,
        name: plan.name,
        category: 'VPS',
        fulfilment: 'VPS',
        description: plan.description,
        icon: 'server',
        eggId: null,
        visible: false,
        deployable: false,
        sortOrder: plan.sortOrder,
        minRam: plan.ram,
        defaultRam: plan.ram,
        maxRam: plan.ram,
        minCpu: plan.cpu,
        defaultCpu: plan.cpu,
        maxCpu: plan.cpu,
        minDisk: plan.disk,
        defaultDisk: plan.disk,
        maxDisk: plan.disk,
        prices: { create: { period: 'MONTHLY', baseAmount: plan.amount, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' } },
      },
    });
    written += 1;
  }
  if (!(await prisma.productOption.findUnique({ where: { code: DEDICATED_IP_OPTION.code } }))) {
    await prisma.productOption.create({ data: { ...DEDICATED_IP_OPTION, productId: null, recurring: true } });
    written += 1;
  }
  return { written, kept };
}
