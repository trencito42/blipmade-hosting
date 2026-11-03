import { prisma } from '../db.js';
import { conflict } from '../lib/errors.js';
import { ClientApiError } from './pterodactyl/client.js';
import { PterodactylError } from './pterodactyl/application.js';

/**
 * Whether the panel answered that the server itself does not exist. A 404 on
 * the path of a server means the server is gone from the panel, whatever the
 * database still says about it.
 */
export function isPanelServerMissing(error: unknown): boolean {
  return (error instanceof PterodactylError || error instanceof ClientApiError) && error.status === 404;
}

/**
 * Tells the caller that the server is gone from the panel, and leaves a note
 * in the events of the instance (once a day) so that staff can find it.
 */
export async function failPanelServerMissing(instanceId: string): Promise<never> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const known = await prisma.instanceEvent.findFirst({ where: { instanceId, type: 'panel_missing', createdAt: { gte: since } } });
  if (!known) {
    await prisma.instanceEvent.create({
      data: { instanceId, type: 'panel_missing', message: 'The panel no longer has this server. Staff must check it before anything else is done.' },
    });
  }
  throw conflict('This server could not be found on the game panel. Support has been told. Open a ticket if it does not come back soon.');
}
