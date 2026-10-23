import { prisma } from '../../db.js';
import { notFound, unavailable } from '../../lib/errors.js';
import * as client from '../pterodactyl/client.js';
import { resolveCustomerCredential } from './credentials.js';

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
}

/**
 * Loads an instance and enforces the ownership.
 *
 * An instance of somebody else answers 404, exactly like an instance that does
 * not exist, so an identifier cannot be probed.
 */
export async function loadOwnedInstance(userId: string, id: string): Promise<OwnedInstance> {
  const instance = await prisma.instance.findFirst({
    where: { id, userId },
    select: {
      id: true,
      userId: true,
      pterodactylUuid: true,
      pterodactylServerId: true,
      status: true,
    },
  });
  if (!instance) throw notFound('Instance not found.');
  return instance;
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

/** The identifier of the server on the panel. */
function serverUuid(instance: OwnedInstance): string {
  if (!instance.pterodactylUuid) throw unavailable('This instance is not deployed yet.');
  return instance.pterodactylUuid;
}

// --- state and metrics ----------------------------------------------------

export async function serverInfo(token: string, instance: OwnedInstance) {
  return client.getServer(token, serverUuid(instance));
}

export async function resources(token: string, instance: OwnedInstance) {
  return client.getResources(token, serverUuid(instance));
}

export async function activity(token: string, instance: OwnedInstance) {
  return client.listActivity(token, serverUuid(instance));
}

// --- power and console ----------------------------------------------------

export async function power(token: string, instance: OwnedInstance, signal: 'start' | 'stop' | 'restart' | 'kill') {
  return client.sendPower(token, serverUuid(instance), signal);
}

export async function command(token: string, instance: OwnedInstance, value: string) {
  return client.sendCommand(token, serverUuid(instance), value);
}

export async function consoleCredentials(token: string, instance: OwnedInstance) {
  return client.consoleWebsocket(token, serverUuid(instance));
}

// --- files ----------------------------------------------------------------

export async function listFiles(token: string, instance: OwnedInstance, path: string) {
  return client.listFiles(token, serverUuid(instance), path);
}

export async function readFile(token: string, instance: OwnedInstance, path: string) {
  return client.readFile(token, serverUuid(instance), path);
}

export async function writeFile(token: string, instance: OwnedInstance, path: string, content: string) {
  return client.writeFile(token, serverUuid(instance), path, content);
}

export async function deleteFile(token: string, instance: OwnedInstance, path: string) {
  return client.deleteFile(token, serverUuid(instance), path);
}

export async function renameFile(token: string, instance: OwnedInstance, path: string, to: string) {
  return client.renameFile(token, serverUuid(instance), path, to);
}

export async function moveFile(token: string, instance: OwnedInstance, path: string, to: string) {
  return client.moveFile(token, serverUuid(instance), path, to);
}

export async function copyFile(token: string, instance: OwnedInstance, path: string, to: string) {
  return client.copyFile(token, serverUuid(instance), path, to);
}

export async function uploadFile(
  token: string,
  instance: OwnedInstance,
  directory: string,
  filename: string,
  content: Buffer,
) {
  return client.uploadFile(token, serverUuid(instance), directory, filename, content);
}

export async function downloadFile(token: string, instance: OwnedInstance, path: string) {
  return client.downloadFile(token, serverUuid(instance), path);
}

export async function compressFiles(token: string, instance: OwnedInstance, paths: string[], format: 'tar' | 'zip') {
  return client.compressFiles(token, serverUuid(instance), paths, format);
}

export async function decompressArchive(token: string, instance: OwnedInstance, path: string, format: 'tar' | 'zip') {
  return client.decompressArchive(token, serverUuid(instance), path, format);
}

export async function chmodFile(token: string, instance: OwnedInstance, path: string, mode: number) {
  return client.chmodFile(token, serverUuid(instance), path, mode);
}

// --- databases ------------------------------------------------------------

export async function databases(token: string, instance: OwnedInstance) {
  return client.listDatabases(token, serverUuid(instance));
}

export async function createDatabase(
  token: string,
  instance: OwnedInstance,
  payload: { database: string; username: string; password: string; remote: string },
) {
  return client.createDatabase(token, serverUuid(instance), payload);
}

export async function updateDatabase(
  token: string,
  instance: OwnedInstance,
  id: number,
  payload: { password?: string; remote?: string },
) {
  return client.updateDatabase(token, serverUuid(instance), id, payload);
}

export async function deleteDatabase(token: string, instance: OwnedInstance, id: number) {
  return client.deleteDatabase(token, serverUuid(instance), id);
}

export async function databaseCredentials(token: string, instance: OwnedInstance, id: number) {
  return client.databaseCredentials(token, serverUuid(instance), id);
}

// --- backups --------------------------------------------------------------

export async function backups(token: string, instance: OwnedInstance) {
  return client.listBackups(token, serverUuid(instance));
}

export async function createBackup(token: string, instance: OwnedInstance, payload: { name: string; locked: boolean }) {
  return client.createBackup(token, serverUuid(instance), payload);
}

export async function downloadBackup(token: string, instance: OwnedInstance, id: string) {
  return client.downloadBackup(token, serverUuid(instance), id);
}

export async function restoreBackup(token: string, instance: OwnedInstance, id: string) {
  return client.restoreBackup(token, serverUuid(instance), id);
}

export async function deleteBackup(token: string, instance: OwnedInstance, id: string) {
  return client.deleteBackup(token, serverUuid(instance), id);
}

// --- network --------------------------------------------------------------

export async function allocations(token: string, instance: OwnedInstance) {
  return client.listAllocations(token, serverUuid(instance));
}

export async function setPrimaryAllocation(token: string, instance: OwnedInstance, id: number) {
  return client.updateAllocation(token, serverUuid(instance), id, { is_default: true });
}

export async function createAllocation(
  token: string,
  instance: OwnedInstance,
  payload: { ip: string; port: number; alias?: string },
) {
  return client.createAllocation(token, serverUuid(instance), payload);
}

export async function deleteAllocation(token: string, instance: OwnedInstance, id: number) {
  return client.deleteAllocation(token, serverUuid(instance), id);
}

// --- settings -------------------------------------------------------------

export async function renameServer(token: string, instance: OwnedInstance, payload: { name: string; description?: string }) {
  return client.renameServer(token, serverUuid(instance), payload);
}

export async function reinstallServer(token: string, instance: OwnedInstance) {
  return client.reinstallServer(token, serverUuid(instance));
}

// --- schedules ------------------------------------------------------------

export async function schedules(token: string, instance: OwnedInstance) {
  return client.listSchedules(token, serverUuid(instance));
}

export async function createSchedule(token: string, instance: OwnedInstance, payload: Record<string, unknown>) {
  return client.createSchedule(token, serverUuid(instance), payload);
}

export async function updateSchedule(
  token: string,
  instance: OwnedInstance,
  id: number,
  payload: Record<string, unknown>,
) {
  return client.updateSchedule(token, serverUuid(instance), id, payload);
}

export async function deleteSchedule(token: string, instance: OwnedInstance, id: number) {
  return client.deleteSchedule(token, serverUuid(instance), id);
}

export async function runSchedule(token: string, instance: OwnedInstance, id: number) {
  return client.runSchedule(token, serverUuid(instance), id);
}
