import { resolve4, resolveSrv } from 'node:dns/promises';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { deleteZoneRecordById, hostnameInZone, upsertZoneRecord } from './cloudflare-dns.js';
import * as operations from './panel/operations.js';
import * as panelClient from './pterodactyl/client.js';

/**
 * Smart Connect: a clean hostname for a game server, without a proxy, a NAT change or an address of its own.
 *
 * Blipmade writes two records in its own zone: an A record for the hostname and an SRV record that carries the real
 * port of the Pterodactyl allocation. The client looks the SRV record up and connects to that port, so the player types
 * a name and no port. SRV is a thing the client has to ask for, so it works only for the games below.
 */

export type ConnectState = 'PENDING_DNS' | 'DNS_VERIFIED' | 'CLIENT_VERIFIED' | 'DEGRADED' | 'UNSUPPORTED';

/** One game the capability registry knows. It is keyed by what the server runs, never by the name of a product. */
export interface GameProfile {
  id: 'minecraft-java' | 'factorio' | 'fivem';
  label: string;
  /** The service and the transport of the SRV record: `_minecraft._tcp`. */
  service: string;
  transport: 'tcp' | 'udp';
  productSlugs: string[];
  /** The platform writes the records only for an enabled profile. */
  enabled: boolean;
  /** A real client was seen to join with the name alone. Nothing here is verified on a real client yet. */
  clientVerified: boolean;
  supportedClients: string;
  limitations: string[];
  lastTested: string | null;
}

export const GAME_PROFILES: readonly GameProfile[] = [
  {
    id: 'minecraft-java',
    label: 'Minecraft Java Edition',
    service: 'minecraft',
    transport: 'tcp',
    productSlugs: ['minecraft-paper', 'minecraft-folia', 'minecraft-forge'],
    enabled: true,
    clientVerified: false,
    supportedClients: 'Java Edition. The server list and Direct Connect both read the SRV record.',
    limitations: ['Bedrock Edition does not read SRV records. Players on Bedrock use the address and the port.'],
    lastTested: null,
  },
  {
    id: 'factorio',
    label: 'Factorio',
    service: 'factorio',
    transport: 'udp',
    productSlugs: ['factorio'],
    enabled: true,
    clientVerified: false,
    supportedClients: 'Desktop clients only. Factorio on Switch does not use it.',
    limitations: ['Experimental: SRV in Factorio was reported to work with caveats, and no client was tested by Blipmade yet.'],
    lastTested: null,
  },
  {
    id: 'fivem',
    label: 'FiveM',
    service: 'cfx',
    transport: 'udp',
    productSlugs: ['fivem'],
    // Not enabled: Direct Connect, `connect` in F8 and the server browser behave differently and none was tested.
    enabled: false,
    clientVerified: false,
    supportedClients: 'Not decided: Direct Connect, F8 connect and the server browser have to be tested one by one.',
    limitations: ['Off until a real client flow is verified. The address and the port keep working.'],
    lastTested: null,
  },
];

export function profileForProduct(slug: string | null | undefined): GameProfile | null {
  return GAME_PROFILES.find((profile) => slug && profile.productSlugs.includes(slug)) ?? null;
}

/** The label of the SRV record: `_minecraft._tcp`. Bedrock is not in the registry, so it never gets one. */
export const srvServiceOf = (profile: GameProfile) => `${profile.service}._${profile.transport}`;

const RESERVED_LABELS = new Set(['www', 'ingress', 'api', 'mail', 'admin', 'app', 'status', 'ns', 'ns1', 'ns2', 'smtp', 'imap', 'ftp', 'play']);

/** A label from the name of the instance, with a short random tail so two servers of the same name never collide. */
export function labelFor(name: string, random: () => number = Math.random): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/g, '');
  const tail = Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0');
  const label = base ? `${base}-${tail}` : `server-${tail}`;
  return RESERVED_LABELS.has(label) ? `server-${tail}` : label;
}

export const hostnameOf = (label: string) => `${label}.${env.GAME_JOIN_DOMAIN}`;

const PRIVATE = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./];
export const isPublicIpv4 = (value: string | null | undefined): value is string => Boolean(value && /^\d{1,3}(\.\d{1,3}){3}$/.test(value) && !PRIVATE.some((rule) => rule.test(value)));

/** The public address and the real port of a game server, read from its allocation. The private address is never published. */
export async function gamePlacement(instanceId: string): Promise<{ address: string | null; port: number }> {
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    select: {
      id: true, userId: true, status: true, pterodactylUuid: true, pterodactylServerId: true, generatedVariables: true,
      product: { select: { slug: true, generatedVariables: true } },
    },
  });
  if (!instance?.pterodactylUuid || !instance.pterodactylServerId) return { address: null, port: 0 };
  const token = await operations.customerToken({
    id: instance.id,
    userId: instance.userId,
    status: instance.status,
    pterodactylUuid: instance.pterodactylUuid,
    pterodactylServerId: instance.pterodactylServerId,
    generatedVariables: instance.generatedVariables,
    productVariables: instance.product.generatedVariables,
  });
  const allocations = await panelClient.listAllocations(token, instance.pterodactylUuid);
  const primary = allocations.find((item) => item.is_default) ?? allocations[0];
  if (!primary) return { address: null, port: 0 };
  const candidates = [primary.ip, primary.alias, env.GAME_PUBLIC_ADDRESS];
  return { address: candidates.find(isPublicIpv4) ?? null, port: primary.port };
}

export interface Resolver {
  srv: (name: string) => Promise<{ port: number; name: string }[]>;
  a: (name: string) => Promise<string[]>;
}
const systemResolver: Resolver = { srv: (name) => resolveSrv(name), a: (name) => resolve4(name) };

/** Does the DNS answer with what was written? It says nothing about a join: `dig` finding an SRV record is not a game connecting. */
export async function verifyRecords(input: { label: string; profile: GameProfile; address: string; port: number }, resolver: Resolver = systemResolver): Promise<boolean> {
  const host = hostnameOf(input.label);
  try {
    const [srv, a] = await Promise.all([resolver.srv(`_${srvServiceOf(input.profile)}.${host}`), resolver.a(host)]);
    return srv.some((row) => row.port === input.port && row.name.replace(/\.$/, '').toLowerCase() === host) && a.includes(input.address);
  } catch {
    return false;
  }
}

export interface SyncDeps {
  placement?: (instanceId: string) => Promise<{ address: string | null; port: number }>;
  resolver?: Resolver;
}

export interface SyncResult {
  state: ConnectState | 'DISABLED';
  wrote: boolean;
  reason: string | null;
}

async function uniqueLabel(name: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const label = labelFor(name);
    if (!(await prisma.gameConnect.findUnique({ where: { label }, select: { id: true } }))) return label;
  }
  throw new Error('A free hostname could not be found.');
}

/**
 * Brings the hostname of one server in line with its allocation. Running it again with nothing changed writes nothing;
 * a change of port or address writes the records again; a record is never written for a game that is not enabled.
 */
export async function syncGameConnect(instanceId: string, deps: SyncDeps = {}): Promise<SyncResult> {
  if (!env.gameConnectEnabled) return { state: 'DISABLED', wrote: false, reason: 'Smart Connect is off on this environment.' };
  const instance = await prisma.instance.findUnique({ where: { id: instanceId }, select: { id: true, name: true, status: true, userId: true, product: { select: { slug: true } } } });
  if (!instance) return { state: 'UNSUPPORTED', wrote: false, reason: 'The server does not exist.' };
  const profile = profileForProduct(instance.product.slug);
  if (!profile || !profile.enabled) return { state: 'UNSUPPORTED', wrote: false, reason: profile ? 'This game is not enabled yet.' : 'This game has no clean address.' };
  if (!hostnameInZone(hostnameOf('x'))) return { state: 'PENDING_DNS', wrote: false, reason: 'The join domain is not inside the platform zone.' };

  const existing = await prisma.gameConnect.findUnique({ where: { instanceId } });
  const placement = await (deps.placement ?? gamePlacement)(instanceId);
  if (!placement.address || !placement.port) {
    if (existing) await prisma.gameConnect.update({ where: { id: existing.id }, data: { lastError: 'The server has no public address yet.' } });
    return { state: (existing?.state as ConnectState | undefined) ?? 'PENDING_DNS', wrote: false, reason: 'The server has no public address yet.' };
  }
  const row = existing ?? await prisma.gameConnect.create({ data: { instanceId, profile: profile.id, label: await uniqueLabel(instance.name) } });
  const host = hostnameOf(row.label);

  let wrote = false;
  let error: string | null = null;
  let aRecordId = row.aRecordId;
  let srvRecordId = row.srvRecordId;
  const current = row.publicAddress === placement.address && row.port === placement.port && row.aRecordId && row.srvRecordId;
  if (!current) {
    const a = await upsertZoneRecord({ type: 'A', name: host, content: placement.address });
    const srv = a.published
      ? await upsertZoneRecord({ type: 'SRV', name: `_${srvServiceOf(profile)}.${host}`, content: `0 5 ${placement.port} ${host}`, data: { priority: 0, weight: 5, port: placement.port, target: host } })
      : { published: false, reason: a.reason, id: undefined };
    if (a.published && srv.published) {
      wrote = true;
      aRecordId = a.id ?? aRecordId;
      srvRecordId = srv.id ?? srvRecordId;
    } else {
      error = (!a.published ? a.reason : srv.reason) ?? 'The records could not be written.';
    }
  }

  const written = !error && Boolean(aRecordId && srvRecordId);
  const resolver = deps.resolver ?? systemResolver;
  const verified = written ? await verifyRecords({ label: row.label, profile, address: placement.address, port: placement.port }, resolver) : false;
  let state: ConnectState;
  if (error || !written) state = row.state === 'CLIENT_VERIFIED' || row.state === 'DNS_VERIFIED' ? 'DEGRADED' : 'PENDING_DNS';
  else if (verified) state = row.clientVerifiedAt && row.port === placement.port && row.publicAddress === placement.address ? 'CLIENT_VERIFIED' : 'DNS_VERIFIED';
  else state = row.state === 'DNS_VERIFIED' || row.state === 'CLIENT_VERIFIED' ? 'DEGRADED' : 'PENDING_DNS';

  await prisma.gameConnect.update({
    where: { id: row.id },
    data: {
      profile: profile.id,
      state,
      lastError: error ?? (written && !verified ? 'The records are written. The DNS does not answer with them yet.' : null),
      lastSyncedAt: new Date(),
      ...(written ? { publicAddress: placement.address, port: placement.port, aRecordId, srvRecordId } : {}),
      ...(wrote && row.port !== placement.port ? { clientVerifiedAt: null } : {}),
    },
  });
  if (wrote) {
    await audit({ actorId: instance.userId, action: existing ? 'game_connect.updated' : 'game_connect.created', targetType: 'instance', targetId: instanceId, meta: { host, port: placement.port } });
  }
  return { state, wrote, reason: error };
}

/** Removes the records the platform wrote, by their ids, and then the row. A record that is not ours is never touched. */
export async function removeGameConnect(rowId: string): Promise<boolean> {
  const row = await prisma.gameConnect.findUnique({ where: { id: rowId } });
  if (!row) return true;
  for (const id of [row.srvRecordId, row.aRecordId]) {
    if (!id) continue;
    const removed = await deleteZoneRecordById(id);
    if (!removed.published) {
      await prisma.gameConnect.update({ where: { id: row.id }, data: { lastError: removed.reason ?? 'The records could not be removed yet.', removeRequestedAt: row.removeRequestedAt ?? new Date() } });
      return false;
    }
  }
  await prisma.gameConnect.delete({ where: { id: row.id } });
  await audit({ action: 'game_connect.removed', targetType: 'instance', targetId: row.instanceId ?? row.id, meta: { host: hostnameOf(row.label) } });
  return true;
}

/**
 * The repair that runs in the worker: servers of an enabled game get their hostname, the hostnames of a server that
 * was cancelled or deleted are removed, and the rest are checked again. A small batch at a time.
 */
export async function reconcileGameConnects(deps: SyncDeps = {}): Promise<{ synced: number; removed: number }> {
  if (!env.gameConnectEnabled) return { synced: 0, removed: 0 };
  let removed = 0;
  const stale = await prisma.gameConnect.findMany({
    where: { OR: [{ instanceId: null }, { instance: { status: { in: ['CANCELLED', 'FAILED'] } } }, { removeRequestedAt: { not: null } }] },
    take: 20,
  });
  for (const row of stale) if (await removeGameConnect(row.id)) removed += 1;

  const slugs = GAME_PROFILES.filter((profile) => profile.enabled).flatMap((profile) => profile.productSlugs);
  const due = await prisma.instance.findMany({
    where: { status: { in: ['ONLINE', 'RESTARTING', 'DEGRADED', 'STOPPED'] }, product: { slug: { in: slugs } } },
    orderBy: [{ gameConnect: { lastSyncedAt: 'asc' } }, { createdAt: 'asc' }],
    take: 20,
    select: { id: true },
  });
  let synced = 0;
  for (const instance of due) {
    try {
      await syncGameConnect(instance.id, deps);
      synced += 1;
    } catch (error) {
      console.error('[worker] smart connect failed for one server', error instanceof Error ? error.message : error);
    }
  }
  return { synced, removed };
}

/** What the dashboard shows. Everything is read on the server: the browser is never asked for an address, a port or a game. */
export async function connectInfo(instanceId: string): Promise<{
  enabled: boolean;
  supported: boolean;
  profile: { id: string; label: string; supportedClients: string; limitations: string[]; experimental: boolean } | null;
  state: ConnectState | null;
  address: string | null;
  fallback: string | null;
  note: string | null;
}> {
  const instance = await prisma.instance.findUnique({ where: { id: instanceId }, select: { product: { select: { slug: true } }, gameConnect: true } });
  const profile = profileForProduct(instance?.product.slug);
  const row = instance?.gameConnect ?? null;
  const placement = row?.publicAddress && row.port ? `${row.publicAddress}:${row.port}` : null;
  const supported = Boolean(profile?.enabled);
  const shown = row && (row.state === 'DNS_VERIFIED' || row.state === 'CLIENT_VERIFIED');
  return {
    enabled: env.gameConnectEnabled,
    supported,
    profile: profile ? { id: profile.id, label: profile.label, supportedClients: profile.supportedClients, limitations: profile.limitations, experimental: !profile.clientVerified } : null,
    state: supported ? (row?.state as ConnectState | undefined) ?? 'PENDING_DNS' : 'UNSUPPORTED',
    // The clean name is offered once the DNS answers with it. Until then, and when it fails, the address and the port stay the way in.
    address: shown && row ? hostnameOf(row.label) : null,
    fallback: placement,
    note: !env.gameConnectEnabled ? 'Clean addresses are not on for this environment.' : !supported ? 'This game uses the address and the port.' : row?.lastError ?? null,
  };
}
