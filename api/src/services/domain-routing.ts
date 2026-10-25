import { prisma } from '../db.js';
import * as gateway from './gateway.js';
import * as ptero from './pterodactyl/application.js';

/**
 * The routes of the customer domains, and the way back when they are lost.
 *
 * The routes live in the configuration of the gateway, and the configuration of
 * the gateway is not a file of the platform: the platform writes the routes
 * through the administrative API of Caddy, and Caddy keeps them until its own
 * configuration is replaced. A restart of the gateway, a reload of its file or
 * a change made by the operator on the edge takes the routes of the customers
 * away, and nothing in the platform would bring them back.
 *
 * The worker comes back to them every minute: every hostname that was proven
 * is looked up, and its route is written again when it is missing or when it
 * points at another address.
 */

/** The address of the node that serves the instances, when the panel cannot say. */
const FALLBACK_TARGET_HOST = '10.77.0.11';

/** The states of an instance in which the container is served. */
const SERVED_STATES = ['ONLINE', 'RESTARTING', 'DEGRADED'];

/** The result of the repair of one hostname. */
export interface DomainRouteOutcome {
  hostname: string;
  applied: boolean;
  reason: string | null;
}

/**
 * The address of the container of an instance, as the panel knows it.
 *
 * The panel is the one that knows which node serves an instance and which port
 * that node published for it. When the panel cannot say, the address of the
 * node of the platform is used, so the route points at the network of the
 * platform and never at an address of the internet.
 *
 * The allocations of a node are read once for a whole run: a platform with
 * many customers would ask the panel for the same list of allocations once
 * per customer.
 */
export async function resolveTarget(
  instance: { pterodactylServerId: number | null },
  allocationsByNode?: Map<number, Awaited<ReturnType<typeof ptero.listAllocations>>>,
): Promise<{ host: string; port: number }> {
  if (!instance.pterodactylServerId) {
    return { host: FALLBACK_TARGET_HOST, port: gateway.TARGET_PORT_MIN };
  }
  try {
    const server = await ptero.getServer(instance.pterodactylServerId);
    let allocations = allocationsByNode?.get(server.node);
    if (!allocations) {
      allocations = await ptero.listAllocations(server.node);
      allocationsByNode?.set(server.node, allocations);
    }
    const allocation = allocations.find((candidate) => candidate.id === server.allocation);
    return {
      host: allocation?.ip ?? FALLBACK_TARGET_HOST,
      port: allocation?.port ?? gateway.TARGET_PORT_MIN,
    };
  } catch {
    return { host: FALLBACK_TARGET_HOST, port: gateway.TARGET_PORT_MIN };
  }
}

/**
 * Puts back the routes of the hostnames that were proven.
 *
 * A hostname that was never proven is never routed: the proof of ownership is
 * what tells two customers apart, and a route for a hostname nobody proved
 * would let anybody point a domain of the platform at their own container.
 */
export async function reconcileDomainRoutes(): Promise<DomainRouteOutcome[]> {
  if (!gateway.gatewayConfigured()) return [];
  // The gateway is asked once. A gateway that is down would otherwise cost
  // one call that waits for the timeout, for every hostname.
  if (!(await gateway.gatewayReachable())) return [];

  const domains = await prisma.instanceDomain.findMany({
    where: { verifiedAt: { not: null } },
    include: { instance: { select: { pterodactylServerId: true, status: true } } },
    take: 500,
    orderBy: { updatedAt: 'asc' },
  });

  const outcomes: DomainRouteOutcome[] = [];
  const allocationsByNode = new Map<number, Awaited<ReturnType<typeof ptero.listAllocations>>>();

  for (const domain of domains) {
    // A route to an instance that is not served any more is a route to
    // nothing, and it would keep a port of the node busy for a container that
    // is gone.
    if (!SERVED_STATES.includes(domain.instance.status)) continue;

    const target = await resolveTarget(domain.instance, allocationsByNode);
    try {
      const result = await gateway.applyCaddyRoute({
        hostname: domain.hostname,
        target: target.host,
        targetPort: target.port,
        verifiedAt: domain.verifiedAt,
      });
      outcomes.push({ hostname: domain.hostname, applied: result.applied, reason: result.reason });

      // The state that the customer sees follows the state of the gateway.
      const status = result.applied ? 'ACTIVE' : 'PENDING_DNS';
      if (
        domain.status !== status ||
        domain.lastError !== result.reason ||
        domain.caddyRouteId !== result.routeId
      ) {
        await prisma.instanceDomain.update({
          where: { id: domain.id },
          data: { status, lastError: result.reason, caddyRouteId: result.routeId },
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The gateway could not be reached.';
      outcomes.push({ hostname: domain.hostname, applied: false, reason });
      await prisma.instanceDomain
        .update({
          where: { id: domain.id },
          data: { status: 'PENDING_DNS', lastError: reason },
        })
        .catch(() => undefined);
    }
  }

  return outcomes;
}
