import type { Instance } from '@prisma/client';
import { healthKind, interpretHttpStatus, interpretProcessState, type ApplicationHealth } from './import-lifecycle.js';
import * as operations from './panel/operations.js';
import * as panelClient from './pterodactyl/client.js';
import { BLIPMADE_DIR } from './git-deploy.js';
import { resolveTarget } from './domain-routing.js';

async function probeViaPanel(instance: Instance): Promise<ApplicationHealth> {
  if (!instance.pterodactylUuid) return 'unknown';
  try {
    const owned = await operations.loadOwnedInstance(instance.userId, instance.id);
    const token = await operations.customerToken(owned);
    const resources = await panelClient.getResources(token, instance.pterodactylUuid);
    if (resources.state !== 'running') return interpretProcessState(resources.state);
    const file = await panelClient.readFile(token, instance.pterodactylUuid, `${BLIPMADE_DIR}/status.json`);
    const status = JSON.parse(file.content) as { state?: string };
    if (status.state === 'built' || status.state === 'succeeded') return 'ready';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Probes whether the application inside an online instance is actually serving traffic. */
export async function probeApplicationHealth(instance: Instance, productSlug: string): Promise<ApplicationHealth> {
  if (!instance.pterodactylUuid || !instance.pterodactylServerId) return 'unknown';
  if (healthKind(productSlug) === 'process') {
    try {
      const owned = await operations.loadOwnedInstance(instance.userId, instance.id);
      const token = await operations.customerToken(owned);
      const resources = await panelClient.getResources(token, instance.pterodactylUuid);
      return interpretProcessState(resources.state);
    } catch {
      return 'unknown';
    }
  }
  try {
    const target = await resolveTarget(instance);
    const response = await fetch(`http://${target.host}:${target.port}/`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    return interpretHttpStatus(response.status, true);
  } catch {
    return probeViaPanel(instance);
  }
}

/** Waits until the app passes its health check or the deadline passes. */
export async function waitForApplicationHealth(
  instance: Instance,
  productSlug: string,
  deadlineMs = 180_000,
  intervalMs = 5_000,
): Promise<ApplicationHealth> {
  const deadline = Date.now() + deadlineMs;
  let last: ApplicationHealth = 'unknown';
  while (Date.now() < deadline) {
    last = await probeApplicationHealth(instance, productSlug);
    if (last === 'ready') return 'ready';
    if (last === 'unhealthy') return 'unhealthy';
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return last;
}
