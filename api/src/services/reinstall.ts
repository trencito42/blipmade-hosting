import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { conflict, notFound, unavailable } from '../lib/errors.js';
import * as pteroApp from './pterodactyl/application.js';
import * as pteroClient from './pterodactyl/client.js';
import { withCustomerKey } from './provisioning.js';
import { enqueueProvisioning } from './queue.js';

/**
 * The reinstall of a server.
 *
 * The panel wipes the files of the container and leaves it stopped, so a
 * reinstall that stops at the panel leaves a customer with a service that
 * does not run. That is what happened to the first customer of the platform:
 * the panel wrote "the server was reinstalled" and the container stayed dark
 * until somebody noticed.
 *
 * The reinstall here is therefore the whole round trip:
 *
 *   - the panel is asked to wipe the container and to install it again;
 *   - the platform waits for the panel to report the installation as
 *     started, so the run that follows cannot write into the container
 *     while the installation is still wiping it;
 *   - the cursor of the provisioning goes back to the step before the
 *     installation, so the run that follows waits for the installation to
 *     finish, puts the application of the platform back into the container,
 *     starts it and waits for it to serve.
 *
 * The work of bringing the container back is done by the provisioning
 * worker, so the request of the customer returns at once and the container
 * comes back while the customer is told that it is being rebuilt.
 */

/** How long the panel may take to report that the installation has started. */
const INSTALL_START_TIMEOUT_MS = 30_000;

/** How long the platform waits between two readings of the panel. */
const POLL_INTERVAL_MS = 2_000;

/**
 * Waits for the panel to report the container of a server as "not
 * installed".
 *
 * The panel marks the container as not installed from the moment the
 * reinstall is accepted, and it marks it as installed again when the
 * installation of the node is over. A panel that keeps saying "installed"
 * did not take the reinstall, and the platform has to know that before it
 * hands the container over to the provisioning.
 */
export async function waitForInstallToStart(serverId: number, timeoutMs = INSTALL_START_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const server = await pteroApp.getServer(serverId).catch(() => null);
    if (server && server.container.installed === 0) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}

/** What the reinstall did. */
export interface ReinstallOutcome {
  instanceId: string;
  /**
   * How the reinstall was asked for.
   *
   * "client" is the key of the customer, so the panel writes the reinstall
   * in the journal of the account of the customer. "application" is the key
   * of the platform, and it is used when the panel did not take the
   * reinstall that was asked for with the key of the customer.
   */
  asked: 'client' | 'application';
}

/**
 * Reinstalls the server of an instance and hands it back to the worker.
 *
 * The instance must not be cancelled: the service of a customer whose paid
 * period has ended is not started again behind their back.
 */
export async function reinstallInstance(
  instanceId: string,
  options: { requestedBy?: string } = {},
): Promise<ReinstallOutcome> {
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    select: {
      id: true,
      userId: true,
      status: true,
      pterodactylServerId: true,
      pterodactylUuid: true,
    },
  });
  if (!instance) throw notFound('Instance not found.');
  if (!instance.pterodactylServerId || !instance.pterodactylUuid) {
    throw conflict('This instance is not deployed yet, so there is nothing to reinstall.');
  }
  if (instance.status === 'CANCELLED') {
    throw conflict('This service is cancelled and cannot be reinstalled.');
  }

  // The panel is asked to wipe the container and to install it again. The key
  // of the customer is used, so the panel writes the reinstall in the
  // journal of the account of the customer and nobody else's.
  await withCustomerKey(instance.userId, (token) => pteroClient.reinstallServer(token, instance.pterodactylUuid!));

  // The panel reports the container as "not installed" while the installation
  // runs. If the panel does not report it, the reinstall did not reach the
  // node, so it is asked for again with the key of the platform, which the
  // panel always takes.
  let asked: ReinstallOutcome['asked'] = 'client';
  if (!(await waitForInstallToStart(instance.pterodactylServerId))) {
    asked = 'application';
    await pteroApp.reinstallServer(instance.pterodactylServerId);
    if (!(await waitForInstallToStart(instance.pterodactylServerId, 10_000))) {
      throw unavailable('The panel did not start the installation of the container, so the server was not reinstalled.');
    }
  }

  // The cursor of the provisioning goes back to the step before the
  // installation. The run that follows waits for the installation to finish,
  // puts the application back into the container, starts it and waits for it
  // to serve. The instance is not online while that happens, because it is
  // not: the container is being rebuilt.
  await prisma.instance.update({
    where: { id: instanceId },
    data: { status: 'PROVISIONING', provisionStep: 'image_built', provisionError: null },
  });

  await enqueueProvisioning(instanceId, { reason: 'reinstall', requestedBy: options.requestedBy });

  await audit({
    actorId: options.requestedBy,
    action: 'instance.reinstall_requested',
    targetType: 'instance',
    targetId: instanceId,
    meta: { asked },
  });

  return { instanceId, asked };
}
