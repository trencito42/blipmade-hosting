import { prisma } from '../../db.js';
import { notFound, unavailable } from '../../lib/errors.js';
import * as client from '../pterodactyl/client.js';
import { renewCustomerCredential, resolveCustomerCredential } from './credentials.js';

/**
 * The operations a customer can run on their own server.
 *
 * Every operation goes through this module, and every operation needs three
 * things:
 *
 *   1. the instance belongs to the customer that asks for it,
 *   2. the customer has a credential on the panel that is scoped to their own
 *      account, and
 *   3. the action itself is allowed.
 *
 * The credential is the client key of the customer. The panel checks the
 * ownership of the server again on its side, so a bug here cannot leak a
 * server of somebody else: the panel would answer 404 for it.
 */

export interface OwnedInstance {
  id: string;
  userId: string;
  pterodactylUuid: string | null;
  pterodactylServerId: number | null;
  status: string;
  /** The variables the platform made for this instance, encrypted. */
  generatedVariables: string | null;
  /** The variables the product of the instance asks for. */
  productVariables: unknown;
}

/**
 * Loads an instance and enforces the ownership.
 *
 * An instance of somebody else answers 404, exactly like an instance that does
 * not exist, so an identifier cannot be probed.
 */
export async function loadOwnedInstance(
  userId: string,
  id: string,
  /** The method of the request. Given, it lets a member of a shared server in: a viewer reads, a manager also writes. */
  method?: string,
): Promise<OwnedInstance> {
  const read = method === 'GET' || method === 'HEAD';
  const instance = await prisma.instance.findFirst({
    where: method
      ? {
          id,
          OR: [
            { userId },
            {
              shares: {
                some: {
                  userId,
                  revokedAt: null,
                  ...(read ? {} : { role: 'manager' }),
                },
              },
            },
          ],
        }
      : { id, userId },
    select: {
      id: true,
      userId: true,
      pterodactylUuid: true,
      pterodactylServerId: true,
      status: true,
      generatedVariables: true,
      product: { select: { generatedVariables: true } },
    },
  });
  if (!instance) throw notFound('Instance not found.');
  return {
    id: instance.id,
    userId: instance.userId,
    pterodactylUuid: instance.pterodactylUuid,
    pterodactylServerId: instance.pterodactylServerId,
    status: instance.status,
    generatedVariables: instance.generatedVariables,
    productVariables: instance.product.generatedVariables,
  };
}

/**
 * The client key of the customer that owns the instance.
 *
 * The key is fetched from the store, and the panel issues a new one when the
 * customer does not have one yet. It never reaches the browser.
 */
export async function customerToken(instance: OwnedInstance): Promise<string> {
  if (!instance.pterodactylUuid) {
    throw unavailable('This instance is not deployed yet.');
  }
  const credential = await resolveCustomerCredential(instance.userId);
  return client.clientToken(credential.token);
}

/** True when the panel refused the key of the customer. */
function isUnauthenticated(error: unknown): boolean {
  return error instanceof client.ClientApiError && error.status === 401;
}

/**
 * Runs an operation on the panel with the key of the customer.
 *
 * A key that the panel does not know any more answers 401. That happens when
 * the key was revoked on the panel, for instance because another one was
 * issued for the same account. A new key is asked for and the operation runs a
 * second time, so a customer is never stuck because a key was revoked.
 */
async function call<T>(instance: OwnedInstance, token: string, run: (token: string) => Promise<T>): Promise<T> {
  try {
    return await run(token);
  } catch (error) {
    if (!isUnauthenticated(error)) throw error;

    const fresh = await renewCustomerCredential(instance.userId);
    try {
      return await run(fresh);
    } catch (retryError) {
      if (isUnauthenticated(retryError)) {
        throw unavailable('The panel refused this operation for this server.');
      }
      throw retryError;
    }
  }
}

/** The identifier of the server on the panel. */
function serverUuid(instance: OwnedInstance): string {
  if (!instance.pterodactylUuid) throw unavailable('This instance is not deployed yet.');
  return instance.pterodactylUuid;
}

// --- state and metrics ----------------------------------------------------

export async function serverInfo(token: string, instance: OwnedInstance) {
  return call(instance, token, (t) => client.getServer(t, serverUuid(instance)));
}

export async function resources(token: string, instance: OwnedInstance) {
  return call(instance, token, (t) => client.getResources(t, serverUuid(instance)));
}

export async function activity(token: string, instance: OwnedInstance, page = 1, perPage = 50) {
  return call(instance, token, (t) => client.listActivity(t, serverUuid(instance), page, perPage));
}

// --- power and console ----------------------------------------------------

export async function power(token: string, instance: OwnedInstance, signal: 'start' | 'stop' | 'restart' | 'kill') {
  return call(instance, token, (t) => client.sendPower(t, serverUuid(instance), signal));
}

export async function command(token: string, instance: OwnedInstance, value: string) {
  return call(instance, token, (t) => client.sendCommand(t, serverUuid(instance), value));
}

export async function consoleCredentials(token: string, instance: OwnedInstance) {
  return call(instance, token, (t) => client.consoleWebsocket(t, serverUuid(instance)));
}

// --- files ----------------------------------------------------------------

export async function listFiles(token: string, instance: OwnedInstance, path: string) {
  return call(instance, token, (t) => client.listFiles(t, serverUuid(instance), path));
}

export async function readFile(token: string, instance: OwnedInstance, path: string) {
  return call(instance, token, (t) => client.readFile(t, serverUuid(instance), path));
}

export async function writeFile(token: string, instance: OwnedInstance, path: string, content: string) {
  return call(instance, token, (t) => client.writeFile(t, serverUuid(instance), path, content));
}

export async function deleteFile(token: string, instance: OwnedInstance, path: string) {
  return call(instance, token, (t) => client.deleteFile(t, serverUuid(instance), path));
}

export async function createFolder(token: string, instance: OwnedInstance, path: string) {
  return call(instance, token, (t) => client.createFolder(t, serverUuid(instance), path));
}

export async function renameFile(token: string, instance: OwnedInstance, path: string, to: string) {
  return call(instance, token, (t) => client.renameFile(t, serverUuid(instance), path, to));
}

export async function moveFile(token: string, instance: OwnedInstance, path: string, to: string) {
  return call(instance, token, (t) => client.moveFile(t, serverUuid(instance), path, to));
}

export async function copyFile(token: string, instance: OwnedInstance, path: string, to: string) {
  return call(instance, token, (t) => client.copyFile(t, serverUuid(instance), path, to));
}

export async function uploadFile(
  token: string,
  instance: OwnedInstance,
  directory: string,
  filename: string,
  content: Buffer,
) {
  return call(instance, token, (t) => client.uploadFile(t, serverUuid(instance), directory, filename, content));
}

export async function downloadFile(token: string, instance: OwnedInstance, path: string) {
  return call(instance, token, (t) => client.downloadFile(t, serverUuid(instance), path));
}

export async function compressFiles(token: string, instance: OwnedInstance, paths: string[]) {
  return call(instance, token, (t) => client.compressFiles(t, serverUuid(instance), paths));
}

export async function decompressArchive(token: string, instance: OwnedInstance, path: string) {
  return call(instance, token, (t) => client.decompressArchive(t, serverUuid(instance), path));
}

export async function chmodFile(token: string, instance: OwnedInstance, path: string, mode: number) {
  return call(instance, token, (t) => client.chmodFile(t, serverUuid(instance), path, mode));
}

// --- databases ------------------------------------------------------------

export async function databases(token: string, instance: OwnedInstance) {
  return call(instance, token, (t) => client.listDatabases(t, serverUuid(instance)));
}

export async function createDatabase(
  token: string,
  instance: OwnedInstance,
  payload: { database: string; username: string; password: string; remote: string },
) {
  return call(instance, token, (t) => client.createDatabase(t, serverUuid(instance), payload));
}

/**
 * Changes the password of a database.
 *
 * The panel offers one change for a database: a new password. The name and
 * the list of hosts that may connect are kept by the panel and cannot be
 * changed by the customer.
 */
export async function updateDatabase(
  token: string,
  instance: OwnedInstance,
  id: string,
  payload: { password?: string },
) {
  return call(instance, token, (t) => client.rotateDatabasePassword(t, serverUuid(instance), id));
}

export async function deleteDatabase(token: string, instance: OwnedInstance, id: string) {
  return call(instance, token, (t) => client.deleteDatabase(t, serverUuid(instance), id));
}

export async function databaseCredentials(token: string, instance: OwnedInstance, id: string) {
  return call(instance, token, (t) => client.databaseCredentials(t, serverUuid(instance), id));
}

// --- backups --------------------------------------------------------------

export async function backups(token: string, instance: OwnedInstance) {
  return call(instance, token, (t) => client.listBackups(t, serverUuid(instance)));
}

export async function createBackup(token: string, instance: OwnedInstance, payload: { name: string; locked: boolean }) {
  return call(instance, token, (t) => client.createBackup(t, serverUuid(instance), payload));
}

export async function downloadBackup(token: string, instance: OwnedInstance, id: string) {
  return call(instance, token, (t) => client.downloadBackup(t, serverUuid(instance), id));
}

export async function restoreBackup(token: string, instance: OwnedInstance, id: string) {
  return call(instance, token, (t) => client.restoreBackup(t, serverUuid(instance), id));
}

export async function deleteBackup(token: string, instance: OwnedInstance, id: string) {
  return call(instance, token, (t) => client.deleteBackup(t, serverUuid(instance), id));
}

// --- network --------------------------------------------------------------

export async function allocations(token: string, instance: OwnedInstance) {
  return call(instance, token, (t) => client.listAllocations(t, serverUuid(instance)));
}

export async function setPrimaryAllocation(token: string, instance: OwnedInstance, id: number) {
  return call(instance, token, (t) => client.setPrimaryAllocation(t, serverUuid(instance), id));
}

/**
 * Adds an address to the server. The panel picks the address itself, so the
 * customer does not choose an address and a port.
 */
export async function createAllocation(token: string, instance: OwnedInstance) {
  return call(instance, token, (t) => client.createAllocation(t, serverUuid(instance)));
}

/** Changes the label of an address. */
export async function updateAllocation(token: string, instance: OwnedInstance, id: number, notes: string) {
  return call(instance, token, (t) => client.updateAllocation(t, serverUuid(instance), id, { notes }));
}

export async function deleteAllocation(token: string, instance: OwnedInstance, id: number) {
  return call(instance, token, (t) => client.deleteAllocation(t, serverUuid(instance), id));
}

// --- settings -------------------------------------------------------------

export async function renameServer(token: string, instance: OwnedInstance, payload: { name: string; description?: string }) {
  return call(instance, token, (t) => client.renameServer(t, serverUuid(instance), payload));
}

export async function reinstallServer(token: string, instance: OwnedInstance) {
  return call(instance, token, (t) => client.reinstallServer(t, serverUuid(instance)));
}

// --- schedules ------------------------------------------------------------

export async function schedules(token: string, instance: OwnedInstance) {
  return call(instance, token, (t) => client.listSchedules(t, serverUuid(instance)));
}

export async function createSchedule(
  token: string,
  instance: OwnedInstance,
  payload: { name: string; cron: string; action: string; active: boolean; payload: Record<string, unknown> },
) {
  return call(instance, token, (t) => client.createSchedule(t, serverUuid(instance), payload));
}

export async function updateSchedule(
  token: string,
  instance: OwnedInstance,
  id: number,
  payload: { name?: string; cron?: string; active?: boolean; payload?: Record<string, unknown> },
) {
  return call(instance, token, (t) => client.updateSchedule(t, serverUuid(instance), id, payload));
}

export async function deleteSchedule(token: string, instance: OwnedInstance, id: number) {
  return call(instance, token, (t) => client.deleteSchedule(t, serverUuid(instance), id));
}

export async function runSchedule(token: string, instance: OwnedInstance, id: number) {
  return call(instance, token, (t) => client.runSchedule(t, serverUuid(instance), id));
}
