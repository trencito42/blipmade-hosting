/**
 * Retires a cancelled service, on the explicit decision of the operator.
 *
 * The platform deletes the server of a service by itself when the retention
 * term of the service is over and the operator has allowed the deletion. This
 * probe does the same work, but for a service that is retired before its
 * term: the operator said so, and the reasons are written down.
 *
 * The order of the work matters:
 *
 *   1. the data of the customer is exported and the retention is written
 *      down, so nothing of the service is lost;
 *   2. the server of the panel is deleted, and the panel gives the address
 *      back to the pool;
 *   3. the record of the service stays, with the state it has, so the
 *      customer still sees the history of the service in the panel;
 *   4. the customer is told, and the audit keeps the trace.
 *
 * The script refuses to touch a service that is not cancelled: a live
 * service of a customer is not retired by a script.
 *
 *   npx tsx probe/retire-cancelled-instance.ts --instance-id <id> --confirm
 */
import { prisma } from '../src/db.js';
import { audit } from '../src/lib/audit.js';
import { scheduleInstanceDeletion, instanceRetentions, writeRetentionRecords } from '../src/services/billing.js';
import { notifyInstanceDeleted } from '../src/services/notifications.js';
import { deleteServer } from '../src/services/pterodactyl/application.js';

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const instanceId = argument('--instance-id');
  const confirmed = argument('--confirm');
  const reason = argument('--reason') ?? 'the operator decided to retire the service';

  if (!instanceId) {
    console.error('The service to retire is missing. Give its id with --instance-id.');
    process.exit(2);
  }
  if (confirmed !== 'yes') {
    console.error('The retirement has to be confirmed with --confirm yes.');
    process.exit(2);
  }

  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    select: {
      id: true,
      name: true,
      status: true,
      userId: true,
      pterodactylServerId: true,
      pterodactylUuid: true,
      cancelledAt: true,
    },
  });
  if (!instance) {
    console.error('There is no service with that id.');
    process.exit(1);
  }
  if (instance.status !== 'CANCELLED') {
    console.error(`The service is "${instance.status}" and not cancelled, so it is not retired.`);
    process.exit(1);
  }

  console.log(`service        : ${instance.name} (${instance.id})`);
  console.log(`state          : ${instance.status}`);
  console.log(`panel server   : ${instance.pterodactylServerId ?? 'none'}`);
  console.log(`cancelled at   : ${instance.cancelledAt?.toISOString() ?? 'unknown'}`);

  // 1. the export of the data and the record of the retention.
  const retention = await scheduleInstanceDeletion(instance.id, {
    actorEmail: 'operator@blipmade.com',
  });
  console.log(`export written : ${retention.exportCreatedAt}`);
  console.log(`scheduled for  : ${retention.scheduledFor}`);

  // 2. the server of the panel, and with it the address of the service.
  let serverDeleted = false;
  if (instance.pterodactylServerId) {
    await deleteServer(instance.pterodactylServerId);
    serverDeleted = true;
    console.log(`server deleted : ${instance.pterodactylServerId}`);
  }

  // 3. the record of the service stays; the retention is marked as done, so
  //    the sweep does not look at it again.
  const records = await instanceRetentions();
  const record = records[instance.id];
  if (record) {
    record.deletedAt = new Date().toISOString();
    await writeRetentionRecords(records);
  }

  await prisma.instanceEvent.create({
    data: {
      instanceId: instance.id,
      type: 'deleted',
      message: `The server of the service was deleted on the decision of the operator. The export of the data is still available. Reason: ${reason}.`,
    },
  });
  await audit({
    actorEmail: 'operator@blipmade.com',
    action: 'instance.deleted',
    targetType: 'instance',
    targetId: instance.id,
    meta: { reason, serverDeleted, retentionDays: retention.retentionDays },
  });

  // 4. the customer is told.
  await notifyInstanceDeleted({
    userId: instance.userId,
    instanceName: instance.name,
    occurrence: new Date().toISOString(),
  });

  console.log('The service is retired. The record of the service and its export are still there.');
}

main()
  .catch((error) => {
    console.error('The retirement failed:', (error as Error).message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
