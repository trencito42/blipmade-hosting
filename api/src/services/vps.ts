import type { VpsService } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { badRequest, notFound } from '../lib/errors.js';
import * as pve from './proxmox.js';

/**
 * Virtual private servers.
 *
 * A VPS is a machine on Proxmox, cloned from a template. Everything that the
 * machine needs follows from its slot, a small number that is never reused: the
 * id on Proxmox, the private address and the public SSH port. The firewall of the
 * hypervisor is not touched from here: the machine is tagged, and a script of the
 * hypervisor turns the tags into rules.
 */

/** The id on Proxmox of the machine of a slot. */
export const vmidOfSlot = (slot: number): number => 1000 + slot;
/** The address of the machine on the private network of the VPS. */
export const privateIpOfSlot = (slot: number): string => `10.78.0.${100 + slot}`;
/** The public port that reaches the SSH of the machine, when the address is shared. */
export const sshPortOfSlot = (slot: number): number => 22100 + slot;
/** How many machines the private network holds. */
export const MAX_SLOT = 150;

const KEY_PATTERN =
  /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)|sk-ssh-ed25519@openssh\.com) [A-Za-z0-9+/=]{20,}(?: [^\r\n]{0,100})?$/;

/** The public key of the customer, in the form that OpenSSH writes it, on one line. */
export function validSshKey(raw: string | undefined | null): string {
  const key = (raw ?? '').trim();
  if (!key) throw badRequest('Paste the public SSH key you will log in with.', { sshPublicKey: 'Paste a public key.' });
  if (key.length > 900 || !KEY_PATTERN.test(key)) {
    throw badRequest('That is not a public SSH key. It starts with ssh-ed25519 or ssh-rsa.', {
      sshPublicKey: 'Paste the public key, the line of the file that ends in .pub.',
    });
  }
  return key;
}

/** The name of a VPS: lowercase letters, numbers and dashes, because it is also its hostname. */
export function validVpsName(raw: string | undefined | null, fallback: string): string {
  const name = (raw ?? '').trim().toLowerCase() || fallback;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(name)) {
    throw badRequest('Use lowercase letters, numbers and dashes for the name of the server.', {
      vpsName: 'Letters, numbers and dashes only.',
    });
  }
  return name;
}

export function dedicatedAddresses(): string[] {
  return env.VPS_DEDICATED_IPS.split(',').map((entry) => entry.trim()).filter(Boolean);
}

/** An address that the customer can buy and nobody holds, or nothing when they are all taken. */
export async function freeDedicatedAddress(): Promise<string | null> {
  const taken = await prisma.vpsService.findMany({
    where: { dedicatedIp: true, status: { not: 'CANCELLED' }, publicIp: { not: null } },
    select: { publicIp: true },
  });
  const used = new Set(taken.map((row) => row.publicIp));
  return dedicatedAddresses().find((address) => !used.has(address)) ?? null;
}

/** Makes the row of a VPS and gives it the next slot. */
export async function createVpsService(input: {
  userId: string;
  productId: string;
  orderItemId: string;
  subscriptionId: string | null;
  name: string;
  ram: number;
  cpu: number;
  disk: number;
  sshPublicKey: string;
  dedicatedIp: boolean;
}): Promise<VpsService> {
  const existing = await prisma.vpsService.findUnique({ where: { orderItemId: input.orderItemId } });
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const last = await prisma.vpsService.aggregate({ _max: { slot: true } });
    const slot = (last._max.slot ?? 0) + 1;
    if (slot > MAX_SLOT) throw new Error('The private network of the VPS is full.');
    try {
      return await prisma.vpsService.create({
        data: { ...input, slot, vmid: vmidOfSlot(slot), privateIp: privateIpOfSlot(slot), status: 'PENDING' },
      });
    } catch (error) {
      // Two orders asked for the same slot at the same moment: the next attempt takes the next one.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
      throw error;
    }
  }
  throw new Error('A slot for the VPS could not be taken.');
}

const dashed = (address: string) => address.replace(/\./g, '-');

/** The tags that tell the script of the hypervisor what to publish. */
function tagsOf(service: { sshPort: number | null; publicIp: string; privateIp: string; dedicatedIp: boolean }): string {
  const tags = ['bmvps', `pub${dashed(service.publicIp)}`, `ip${dashed(service.privateIp)}`];
  if (service.dedicatedIp) tags.push('ded');
  else if (service.sshPort) tags.push(`ssh${service.sshPort}`);
  return tags.join(';');
}

/**
 * Builds the machine. Safe to run again: a step that is done is not done twice, so a
 * job that was interrupted continues where it stopped.
 */
export async function provisionVps(serviceId: string): Promise<void> {
  const service = await prisma.vpsService.findUnique({ where: { id: serviceId } });
  if (!service) throw new Error('The VPS no longer exists.');
  if (service.status === 'ACTIVE' || service.status === 'CANCELLED') return;
  if (!pve.proxmoxConfigured()) throw new Error('The VPS service is not set up on this platform.');

  await prisma.vpsService.update({ where: { id: serviceId }, data: { status: 'PROVISIONING', lastError: null } });

  try {
    const vmid = service.vmid ?? vmidOfSlot(service.slot);
    const privateIp = service.privateIp ?? privateIpOfSlot(service.slot);

    // The address is decided once and written down before the machine is tagged with it.
    let publicIp = service.publicIp;
    if (!publicIp) {
      publicIp = service.dedicatedIp ? await freeDedicatedAddress() : env.VPS_SHARED_IP || null;
      if (!publicIp) {
        throw new Error(service.dedicatedIp ? 'No dedicated address is free.' : 'The shared address of the VPS is not set.');
      }
    }
    const sshPort = service.dedicatedIp ? 22 : sshPortOfSlot(service.slot);
    await prisma.vpsService.update({ where: { id: serviceId }, data: { vmid, privateIp, publicIp, sshPort } });

    if (!(await pve.vmExists(vmid))) {
      await pve.cloneTemplate(vmid, `vps-${service.slot}-${service.name}`);
    }

    await pve.configureVm(vmid, {
      cores: service.cpu,
      memory: service.ram,
      ipconfig0: `ip=${privateIp}/24,gw=10.78.0.1`,
      nameserver: '1.1.1.1',
      ciuser: 'debian',
      // Proxmox wants the key encoded, and one key per line.
      sshkeys: encodeURIComponent(`${service.sshPublicKey}\n`),
      agent: 'enabled=1',
      tags: tagsOf({ sshPort: service.dedicatedIp ? null : sshPort, publicIp, privateIp, dedicatedIp: service.dedicatedIp }),
      description: `Blipmade VPS ${service.id}`,
    });

    try {
      await pve.resizeDisk(vmid, service.disk);
    } catch (error) {
      // A disk that already has the size is not an error: the job is a repeat.
      if (!/shrink|same size|smaller/i.test((error as Error).message)) throw error;
    }

    const live = await pve.vmStatus(vmid);
    if (live.status !== 'running') await pve.power(vmid, 'start');

    await prisma.vpsService.update({ where: { id: serviceId }, data: { status: 'ACTIVE', lastError: null } });
  } catch (error) {
    await prisma.vpsService.update({ where: { id: serviceId }, data: { status: 'FAILED', lastError: (error as Error).message.slice(0, 500) } });
    throw error;
  }
}

export interface VpsView {
  id: string;
  name: string;
  status: string;
  /** What the machine says it is doing: running, stopped, or unknown when Proxmox cannot be asked. */
  power: 'running' | 'stopped' | 'unknown';
  plan: { slug: string; name: string };
  ram: number;
  cpu: number;
  disk: number;
  publicIp: string | null;
  sshPort: number | null;
  dedicatedIp: boolean;
  /** The line to type to log in. */
  sshCommand: string | null;
  lastError: string | null;
  createdAt: Date;
}

export async function vpsView(
  service: VpsService & { product: { slug: string; name: string } },
  live = true,
): Promise<VpsView> {
  let powerState: VpsView['power'] = 'unknown';
  if (live && service.vmid && (service.status === 'ACTIVE' || service.status === 'SUSPENDED') && pve.proxmoxConfigured()) {
    try {
      powerState = (await pve.vmStatus(service.vmid)).status === 'running' ? 'running' : 'stopped';
    } catch {
      powerState = 'unknown';
    }
  }
  const ssh =
    service.publicIp && service.sshPort
      ? service.sshPort === 22
        ? `ssh debian@${service.publicIp}`
        : `ssh -p ${service.sshPort} debian@${service.publicIp}`
      : null;
  return {
    id: service.id,
    name: service.name,
    status: service.status.toLowerCase(),
    power: powerState,
    plan: { slug: service.product.slug, name: service.product.name },
    ram: service.ram,
    cpu: service.cpu,
    disk: service.disk,
    publicIp: service.publicIp,
    sshPort: service.sshPort,
    dedicatedIp: service.dedicatedIp,
    sshCommand: ssh,
    lastError: service.lastError,
    createdAt: service.createdAt,
  };
}

export async function ownedVps(userId: string, id: string) {
  const service = await prisma.vpsService.findFirst({ where: { id, userId }, include: { product: { select: { slug: true, name: true } } } });
  if (!service) throw notFound('That server was not found.');
  return service;
}

export async function setVpsPower(userId: string, id: string, action: pve.PowerAction): Promise<void> {
  const service = await ownedVps(userId, id);
  if (service.status !== 'ACTIVE' || !service.vmid) throw badRequest('This server cannot be controlled right now.');
  await pve.power(service.vmid, action);
}

export interface VpsUsage {
  power: 'running' | 'stopped';
  uptimeSeconds: number;
  cpuPercent: number;
  cpus: number;
  memoryUsed: number;
  memoryTotal: number;
  networkIn: number;
  networkOut: number;
  diskRead: number;
  diskWritten: number;
}

/** What the machine uses right now, as Proxmox reports it. Nothing is made up when it cannot be asked. */
export async function vpsUsage(userId: string, id: string): Promise<VpsUsage> {
  const service = await ownedVps(userId, id);
  if (!service.vmid || service.status !== 'ACTIVE') throw badRequest('This server is not running yet.');
  const m = await pve.vmMetrics(service.vmid);
  return {
    power: m.status === 'running' ? 'running' : 'stopped',
    uptimeSeconds: Math.round(m.uptime ?? 0),
    cpuPercent: Math.round((m.cpu ?? 0) * 1000) / 10,
    cpus: m.cpus ?? service.cpu,
    memoryUsed: m.mem ?? 0,
    memoryTotal: m.maxmem ?? service.ram * 1024 * 1024,
    networkIn: m.netin ?? 0,
    networkOut: m.netout ?? 0,
    diskRead: m.diskread ?? 0,
    diskWritten: m.diskwrite ?? 0,
  };
}

export async function renameVps(userId: string, id: string, rawName: string): Promise<void> {
  const service = await ownedVps(userId, id);
  const name = validVpsName(rawName, service.name);
  await prisma.vpsService.update({ where: { id: service.id }, data: { name } });
  if (service.vmid && service.status === 'ACTIVE' && pve.proxmoxConfigured()) {
    // The label on Proxmox is a convenience for the operator. A failure here does not undo the rename.
    await pve.configureVm(service.vmid, { name: `vps-${service.slot}-${name}` }).catch(() => undefined);
  }
}

/**
 * Replaces the key that opens the server. The key is written to the cloud-init drive and the
 * machine is restarted so that it is read. The data of the server is not touched.
 */
export async function changeVpsSshKey(userId: string, id: string, rawKey: string): Promise<void> {
  const service = await ownedVps(userId, id);
  if (service.status !== 'ACTIVE' || !service.vmid) throw badRequest('This server cannot be changed right now.');
  const key = validSshKey(rawKey);
  await pve.configureVm(service.vmid, { sshkeys: encodeURIComponent(`${key}\n`) });
  await pve.regenerateCloudInit(service.vmid);
  await prisma.vpsService.update({ where: { id: service.id }, data: { sshPublicKey: key } });
  await pve.power(service.vmid, 'reboot');
}

/**
 * Builds the server again from the image. Everything on its disk is lost; the address, the
 * plan and the subscription stay. The new machine is made by the worker.
 */
export async function reinstallVps(userId: string, id: string, rawKey?: string): Promise<void> {
  const service = await ownedVps(userId, id);
  if (service.status !== 'ACTIVE' || !service.vmid) throw badRequest('This server cannot be reinstalled right now.');
  const key = rawKey?.trim() ? validSshKey(rawKey) : service.sshPublicKey;
  if (await pve.vmExists(service.vmid)) {
    const live = await pve.vmStatus(service.vmid);
    if (live.status === 'running') await pve.power(service.vmid, 'stop');
    await pve.deleteVm(service.vmid);
  }
  await prisma.vpsService.update({ where: { id: service.id }, data: { status: 'PENDING', sshPublicKey: key, lastError: null } });
}

/** How many snapshots a server may keep. Each one holds the changes of the disk since it was taken. */
export const MAX_SNAPSHOTS = 2;
const SNAPSHOT_NAME = /^[a-z][a-z0-9-]{0,31}$/;

async function activeMachine(userId: string, id: string) {
  const service = await ownedVps(userId, id);
  if (service.status !== 'ACTIVE' || !service.vmid) throw badRequest('This server cannot be changed right now.');
  return { service, vmid: service.vmid };
}

export async function vpsSnapshots(userId: string, id: string) {
  const { vmid } = await activeMachine(userId, id);
  const rows = await pve.listSnapshots(vmid);
  return {
    max: MAX_SNAPSHOTS,
    snapshots: rows.map((row) => ({ name: row.name, description: row.description ?? '', createdAt: row.snaptime ? new Date(row.snaptime * 1000).toISOString() : null })),
  };
}

export async function takeVpsSnapshot(userId: string, id: string, name: string, description: string) {
  const { vmid } = await activeMachine(userId, id);
  if (!SNAPSHOT_NAME.test(name)) throw badRequest('Use lowercase letters, numbers and dashes, starting with a letter.', { name: 'Letters, numbers and dashes.' });
  const existing = await pve.listSnapshots(vmid);
  if (existing.length >= MAX_SNAPSHOTS) throw badRequest(`A server keeps ${MAX_SNAPSHOTS} snapshots. Delete one to take another.`);
  if (existing.some((row) => row.name === name)) throw badRequest('A snapshot with that name exists.');
  await pve.createSnapshot(vmid, name, description.slice(0, 120));
}

export async function restoreVpsSnapshot(userId: string, id: string, name: string) {
  const { vmid } = await activeMachine(userId, id);
  if (!(await pve.listSnapshots(vmid)).some((row) => row.name === name)) throw notFound('That snapshot was not found.');
  await pve.rollbackSnapshot(vmid, name);
  await pve.power(vmid, 'start').catch(() => undefined);
}

export async function removeVpsSnapshot(userId: string, id: string, name: string) {
  const { vmid } = await activeMachine(userId, id);
  if (!(await pve.listSnapshots(vmid)).some((row) => row.name === name)) throw notFound('That snapshot was not found.');
  await pve.deleteSnapshot(vmid, name);
}

/** The ISO files the customer may start the server from, and the one that is mounted now. */
export async function vpsIsos(userId: string, id: string) {
  const { vmid } = await activeMachine(userId, id);
  const [isos, config] = await Promise.all([pve.listIsos(), pve.vmConfig(vmid)]);
  const mounted = typeof config.ide0 === 'string' ? (/^local:iso\/([^,]+)/.exec(config.ide0)?.[1] ?? null) : null;
  return { isos, mounted };
}

/**
 * Puts an ISO in the virtual drive and starts the next boot from it. The graphical display is
 * switched on, because an installer is not read through a serial line.
 */
export async function mountVpsIso(userId: string, id: string, file: string) {
  const { vmid } = await activeMachine(userId, id);
  if (!(await pve.listIsos()).some((row) => row.file === file)) throw notFound('That image is not on the list.');
  await pve.configureVm(vmid, { ide0: `local:iso/${file},media=cdrom`, boot: 'order=ide0;scsi0', vga: 'std' });
}

/** Takes the ISO out and boots from the disk again. */
export async function ejectVpsIso(userId: string, id: string) {
  const { vmid } = await activeMachine(userId, id);
  await pve.configureVm(vmid, { boot: 'order=scsi0' });
  await pve.unsetConfig(vmid, ['ide0']);
}

/** Removes the machine and gives its address back. */
export async function destroyVps(serviceId: string): Promise<void> {
  const service = await prisma.vpsService.findUnique({ where: { id: serviceId } });
  if (!service) return;
  if (service.vmid && (await pve.vmExists(service.vmid))) {
    const live = await pve.vmStatus(service.vmid);
    if (live.status === 'running') await pve.power(service.vmid, 'stop');
    await pve.deleteVm(service.vmid);
  }
  await prisma.vpsService.update({ where: { id: serviceId }, data: { status: 'CANCELLED' } });
}

/** How long a machine whose subscription ended is kept before it is deleted. */
const RETENTION_DAYS = 14;
/** How long a payment that failed is waited for before the machine is stopped. */
const PAST_DUE_GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Keeps the machines in step with the subscriptions that pay for them.
 *
 * - A machine whose subscription was cancelled, or whose payment has failed for
 *   longer than the grace, is stopped. Its disk is kept.
 * - A machine that was stopped for that reason starts again when the subscription is
 *   paid again.
 * - A machine that has been stopped for longer than the retention is deleted.
 *
 * It runs on a timer, so a call that fails once is made again on the next run.
 */
export async function sweepVps(): Promise<{ suspended: number; resumed: number; deleted: number }> {
  const now = new Date();
  let suspended = 0;
  let resumed = 0;
  let deleted = 0;
  if (!pve.proxmoxConfigured()) return { suspended, resumed, deleted };

  const live = await prisma.vpsService.findMany({
    where: { status: 'ACTIVE', subscriptionId: { not: null } },
    include: { subscription: { select: { status: true, currentPeriodEnd: true } } },
    take: 100,
  });
  for (const service of live) {
    const subscription = service.subscription;
    if (!subscription || !service.vmid) continue;
    const graceEnd = subscription.currentPeriodEnd ? subscription.currentPeriodEnd.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS : 0;
    const unpaid =
      subscription.status === 'CANCELLED' ||
      subscription.status === 'INCOMPLETE_EXPIRED' ||
      (subscription.status === 'PAST_DUE' && graceEnd < now.getTime());
    if (!unpaid) continue;
    try {
      if (await pve.vmExists(service.vmid)) {
        const status = await pve.vmStatus(service.vmid);
        if (status.status === 'running') await pve.power(service.vmid, 'stop');
      }
      await prisma.vpsService.update({ where: { id: service.id }, data: { status: 'SUSPENDED', suspendedAt: now } });
      suspended += 1;
    } catch (error) {
      console.error(`[vps] could not stop ${service.id}: ${(error as Error).message}`);
    }
  }

  const stopped = await prisma.vpsService.findMany({
    where: { status: 'SUSPENDED' },
    include: { subscription: { select: { status: true } } },
    take: 100,
  });
  for (const service of stopped) {
    const paid = service.subscription?.status === 'ACTIVE' || service.subscription?.status === 'TRIALING';
    try {
      if (paid && service.vmid) {
        await pve.power(service.vmid, 'start');
        await prisma.vpsService.update({ where: { id: service.id }, data: { status: 'ACTIVE', suspendedAt: null } });
        resumed += 1;
      } else if (!paid && service.suspendedAt && now.getTime() - service.suspendedAt.getTime() > RETENTION_DAYS * DAY_MS) {
        await destroyVps(service.id);
        deleted += 1;
      }
    } catch (error) {
      console.error(`[vps] could not bring ${service.id} to its state: ${(error as Error).message}`);
    }
  }

  return { suspended, resumed, deleted };
}
