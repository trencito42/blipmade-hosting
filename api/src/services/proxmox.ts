import https from 'node:https';
import { env } from '../env.js';

/**
 * A small client of the API of Proxmox.
 *
 * The token that it carries may only touch the pool of the VPS and clone one
 * template, so a mistake here cannot reach the machines of the platform. The
 * certificate of Proxmox is its own, so the connection does not check it: the
 * address is the private address of the hypervisor and the token is the secret.
 */

export class ProxmoxError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
    this.name = 'ProxmoxError';
  }
}

export function proxmoxConfigured(): boolean {
  return Boolean(env.VPS_PROXMOX_URL && env.VPS_PROXMOX_TOKEN);
}

const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: Record<string, unknown>): Promise<T> {
  if (!proxmoxConfigured()) throw new ProxmoxError('The VPS service is not set up on this platform.');
  const url = new URL(`/api2/json${path}`, env.VPS_PROXMOX_URL);
  const payload = body ? JSON.stringify(body) : undefined;
  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        agent,
        timeout: 30_000,
        headers: {
          Authorization: `PVEAPIToken=${env.VPS_PROXMOX_TOKEN}`,
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => {
          if ((res.statusCode ?? 0) >= 400) {
            reject(new ProxmoxError(`Proxmox ${method} ${path} answered ${res.statusCode}: ${text.slice(0, 300)}`, res.statusCode));
            return;
          }
          try {
            resolve((JSON.parse(text) as { data: T }).data);
          } catch {
            reject(new ProxmoxError(`Proxmox answered with something that is not JSON: ${text.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new ProxmoxError('Proxmox did not answer in time.')));
    req.on('error', (error) => reject(error instanceof ProxmoxError ? error : new ProxmoxError(error.message)));
    if (payload) req.write(payload);
    req.end();
  });
}

const node = () => encodeURIComponent(env.VPS_PROXMOX_NODE);

/** Waits for a task of Proxmox to finish, and fails when it did not end well. */
export async function waitForTask(upid: string, timeoutMs = 600_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await request<{ status: string; exitstatus?: string }>('GET', `/nodes/${node()}/tasks/${encodeURIComponent(upid)}/status`);
    if (status.status === 'stopped') {
      if (status.exitstatus && status.exitstatus !== 'OK') throw new ProxmoxError(`A task of Proxmox ended with "${status.exitstatus}".`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new ProxmoxError('A task of Proxmox did not finish in time.');
}

export async function cloneTemplate(newId: number, name: string): Promise<void> {
  const upid = await request<string>('POST', `/nodes/${node()}/qemu/${env.VPS_TEMPLATE_VMID}/clone`, {
    newid: newId,
    name,
    full: 1,
    format: 'qcow2',
    storage: 'local',
    pool: env.VPS_POOL,
  });
  await waitForTask(upid);
}

export async function configureVm(vmid: number, config: Record<string, string | number>): Promise<void> {
  await request('PUT', `/nodes/${node()}/qemu/${vmid}/config`, config);
}

export async function resizeDisk(vmid: number, sizeGb: number): Promise<void> {
  await request('PUT', `/nodes/${node()}/qemu/${vmid}/resize`, { disk: 'scsi0', size: `${sizeGb}G` });
}

export async function vmExists(vmid: number): Promise<boolean> {
  try {
    await request('GET', `/nodes/${node()}/qemu/${vmid}/status/current`);
    return true;
  } catch (error) {
    if (error instanceof ProxmoxError && (error.status === 500 || error.status === 404 || error.status === 403)) return false;
    throw error;
  }
}

export type PowerAction = 'start' | 'shutdown' | 'stop' | 'reboot';

export async function power(vmid: number, action: PowerAction): Promise<void> {
  const upid = await request<string>('POST', `/nodes/${node()}/qemu/${vmid}/status/${action}`, {});
  await waitForTask(upid, 120_000);
}

export async function vmStatus(vmid: number): Promise<{ status: string; uptime: number; cpu: number; mem: number; maxmem: number }> {
  return request('GET', `/nodes/${node()}/qemu/${vmid}/status/current`);
}

export async function deleteVm(vmid: number): Promise<void> {
  const upid = await request<string>('DELETE', `/nodes/${node()}/qemu/${vmid}?purge=1&destroy-unreferenced-disks=1`);
  await waitForTask(upid, 300_000);
}
