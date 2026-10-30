/**
 * The capacity of the platform, and the policy of the shared processors.
 *
 * The panel publishes the memory and the disk of a node, and it does not
 * publish the processor. The processor of a node is therefore declared by the
 * operator, and the platform never assumes that the whole capacity of the
 * machine is available for the customers: a node sells a number of shared
 * processors that is the number of its cores multiplied by the factor of the
 * oversubscription.
 *
 *   sellable vCPU of a node = declared cores × oversubscription
 *
 * When the operator has not declared the cores of a node, the platform uses a
 * small number of cores, so a node that was never declared cannot be filled
 * to the brim by accident.
 */
import { prisma } from '../db.js';

/** The setting where the operator declares the cores of the nodes. */
export const NODE_CORES_KEY = 'capacity.node_cores';

/** The setting where the operator declares the factor of the oversubscription. */
export const CPU_OVERSUBLICATION_KEY = 'capacity.cpu_oversubscription';

/**
 * The number of cores of a node that the operator did not declare.
 *
 * It is a small number on purpose: a node whose capacity is unknown sells
 * little, and the operator raises it when he declares the real one.
 */
export const DEFAULT_NODE_CORES = 4;

/**
 * The factor of the oversubscription of the processor.
 *
 * A shared processor is a share of a processor, so a node with eight cores
 * can hold more customers than eight. The factor says how many more.
 */
export const DEFAULT_CPU_OVERSUBLICATION = 4;

/** The cores of the nodes, as the operator declared them. */
export async function declaredNodeCores(): Promise<Map<number, number>> {
  const cores = new Map<number, number>();
  try {
    const setting = await prisma.setting.findUnique({ where: { key: NODE_CORES_KEY } });
    const value = setting?.value as Record<string, unknown> | undefined;
    if (value && typeof value === 'object') {
      for (const [id, count] of Object.entries(value)) {
        const number = Number(id);
        if (Number.isInteger(number) && typeof count === 'number' && Number.isFinite(count) && count > 0) {
          cores.set(number, count);
        }
      }
    }
  } catch {
    // A setting that cannot be read is a node that was never declared.
  }
  return cores;
}

/** The factor of the oversubscription of the processor. */
export async function cpuOversubscription(): Promise<number> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: CPU_OVERSUBLICATION_KEY } });
    const value = setting?.value as Record<string, unknown> | undefined;
    const raw = value?.value;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
    if (typeof raw === 'string' && Number.isFinite(Number(raw)) && Number(raw) > 0) return Number(raw);
  } catch {
    // The default is used when the setting cannot be read.
  }
  return DEFAULT_CPU_OVERSUBLICATION;
}

/** The capacity of the processor of a node. */
export interface NodeCpuCapacity {
  /** The node the capacity is about. */
  nodeId: number;
  /** The cores the operator declared, or the default when he declared none. */
  cores: number;
  /** True when the operator declared the cores of this node. */
  declared: boolean;
  /** The number of shared processors the node may sell. */
  sellableVcpu: number;
  /** The number of shared processors that are sold already. */
  allocatedVcpu: number;
  /** The number of shared processors that are left. */
  freeVcpu: number;
}

/**
 * The capacity of the processor of a node.
 *
 * Count all instances whose allocation still names this node. A cancelled
 * subscription does not automatically stop or remove a running container;
 * ignoring it before deprovisioning would sell the same CPU twice. Retaining
 * a stale node allocation errs conservatively until cleanup reconciles it.
 */
export async function nodeCpuCapacity(nodeId: number): Promise<NodeCpuCapacity> {
  const cores = (await declaredNodeCores()).get(nodeId) ?? DEFAULT_NODE_CORES;
  const oversubscription = await cpuOversubscription();
  const sellableVcpu = cores * oversubscription;

  const allocated = await prisma.instance.aggregate({
    where: { pterodactylNodeId: nodeId },
    _sum: { cpu: true },
  });

  const allocatedVcpu = allocated._sum.cpu ?? 0;
  return {
    nodeId,
    cores,
    declared: (await declaredNodeCores()).has(nodeId),
    sellableVcpu,
    allocatedVcpu,
    freeVcpu: Math.max(0, sellableVcpu - allocatedVcpu),
  };
}

/**
 * Whether a node can hold one more instance.
 *
 * The processors of the node are the ones it sells: the cores the operator
 * declared, multiplied by the factor of the oversubscription. An instance that
 * asks for more processors than what is left is refused, so a node is never
 * sold beyond what it can hold.
 */
export function canHoldProcessor(capacity: NodeCpuCapacity, askedVcpu: number): boolean {
  return capacity.allocatedVcpu + askedVcpu <= capacity.sellableVcpu;
}

/**
 * Why a node cannot hold an instance, in words an operator can act on.
 *
 * The node that was never declared is named as such, because the number of
 * its cores is the default and not a measurement.
 */
export function processorRefusal(capacity: NodeCpuCapacity, askedVcpu: number): string {
  return `Node ${capacity.nodeId} cannot hold this instance: ${capacity.allocatedVcpu} shared processors are sold and the node sells ${capacity.sellableVcpu} (${capacity.cores} cores${
    capacity.declared ? '' : ', the default, because the operator declared none'
  }), and this instance asks for ${askedVcpu}.`;
}

/** The setting where the operator declares the monthly cost of the nodes. */
export const NODE_COSTS_KEY = 'capacity.node_costs';

/**
 * The monthly cost of the nodes, as the operator declared it.
 *
 * The cost of a node is the price the operator pays for the machine. The
 * platform does not know it, so it is never invented: a node that was not
 * declared has no cost, and the margin of the platform is then unknown too.
 */
export async function declaredNodeCosts(): Promise<Map<number, number>> {
  const costs = new Map<number, number>();
  try {
    const setting = await prisma.setting.findUnique({ where: { key: NODE_COSTS_KEY } });
    const value = setting?.value as Record<string, unknown> | undefined;
    if (value && typeof value === 'object') {
      for (const [id, cost] of Object.entries(value)) {
        const nodeId = Number(id);
        if (Number.isInteger(nodeId) && typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
          costs.set(nodeId, cost);
        }
      }
    }
  } catch {
    // A setting that cannot be read is a cost that was never declared.
  }
  return costs;
}

/** The statuses of an instance that still holds the resources of a node. */
const LIVE_INSTANCE_STATUSES = ['PENDING', 'PROVISIONING', 'ONLINE', 'RESTARTING', 'STOPPED', 'DEGRADED', 'SUSPENDED'] as const;

/**
 * The revenue of the platform and the capacity it sells.
 *
 * The revenue is the price of the instances that are running. It is the price
 * the customer pays, not the price the resources cost, so the margin is the
 * difference between the two and it is only known when the operator declared
 * what the nodes cost.
 */
export interface RevenueSummary {
  /** The number of the instances that hold resources. */
  instances: number;
  /** The recurring revenue of a month, in the currency of the platform. */
  mrr: number;
  /** The recurring revenue of a year, at twelve months of the card. */
  yearly: number;
  currency: string;
  /** The memory that is sold, in megabytes. */
  ramMb: number;
  /** The processors that are sold. */
  cpu: number;
  /** The storage that is sold, in gigabytes. */
  diskGb: number;
  /** The revenue of every product, the biggest first. */
  byProduct: { productId: string; name: string; slug: string; count: number; amount: number }[];
}

export async function revenueSummary(): Promise<RevenueSummary> {
  const instances = await prisma.instance.findMany({
    where: { status: { in: [...LIVE_INSTANCE_STATUSES] } },
    select: {
      ram: true,
      cpu: true,
      disk: true,
      price: true,
      currency: true,
      product: { select: { id: true, name: true, slug: true } },
    },
  });

  const byProduct = new Map<string, { productId: string; name: string; slug: string; count: number; amount: number }>();
  let mrr = 0;
  let ramMb = 0;
  let cpu = 0;
  let diskGb = 0;

  for (const instance of instances) {
    mrr += instance.price;
    ramMb += instance.ram;
    cpu += instance.cpu;
    diskGb += instance.disk;
    const row = byProduct.get(instance.product.id) ?? {
      productId: instance.product.id,
      name: instance.product.name,
      slug: instance.product.slug,
      count: 0,
      amount: 0,
    };
    row.count += 1;
    row.amount += instance.price;
    byProduct.set(instance.product.id, row);
  }

  return {
    instances: instances.length,
    mrr,
    yearly: mrr * 12,
    currency: instances[0]?.currency ?? 'EUR',
    ramMb,
    cpu,
    diskGb,
    byProduct: [...byProduct.values()].sort((left, right) => right.amount - left.amount),
  };
}
