import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import * as pteroClient from './pterodactyl/client.js';
import { withCustomerKey } from './provisioning.js';
import { judgeContainer } from './pterodactyl/types.js';

/**
 * The state of the containers of the customers, compared with what the platform
 * believes.
 *
 * The platform marks an instance as online when the provisioning finished. That
 * is what the platform saw at the moment of the provisioning, and it is not
 * the state of the container afterwards: a container that dies stays online in
 * the platform until somebody looks at the node. Nothing asked the node about
 * an instance that was already online, so the truth about a broken container
 * was never recorded.
 *
 * This module asks the node about the instances the platform believes are
 * running and writes down what the node says. It never changes an instance: a
 * customer instance is not suspended, withdrawn or deleted because of a check
 * of the node. The decision to act on a broken container belongs to the
 * operator, and this module gives that operator the truth to decide with.
 */

/** What the node says about the container of one instance. */
export interface RuntimeStateObservation {
  instanceId: string;
  /** The state the node reports for the server of this instance. */
  nodeState: string;
  /** True when the node says the container is running. */
  running: boolean;
  /**
   * True when the container serves.
   *
   * The node only says "running" when the health check of the egg passes. An
   * egg without a health check is never confirmed, but the container of it
   * still serves, and that is what the customer paid for.
   */
  serving: boolean;
  /**
   * True when the container is alive but the node does not confirm it.
   *
   * The node only says "running" when the health check of the egg passes. A
   * node whose eggs do not have a health check that matches the application
   * keeps every container in "starting" for as long as it is up, so a
   * container in that state is alive even though the node does not say so.
   */
  unconfirmed: boolean;
  /** True when the node could not be asked at all. */
  unreachable: boolean;
}

/** The type of the event that records what the node says about an instance. */
const RUNTIME_STATE_EVENT = 'runtime_state';

/** The action of the audit journal that records what the node says. */
const RUNTIME_STATE_AUDIT = 'instance.runtime_state';

/**
 * How many instances one run looks at.
 *
 * The run asks the node about every instance it looks at, so the number is
 * kept small: a run must not hold the worker for a long time, and the next
 * run looks at the instances that were not looked at yet.
 */
const DEFAULT_LIMIT = 25;

/**
 * Asks the node about the container of an instance.
 *
 * The node is asked through the panel, with the client key of the customer that
 * owns the instance, the same way the provisioning asks. The key is the one
 * that is already stored: this module only looks, so it never mints a key and
 * never replaces a key that the panel refuses. A customer whose key is gone
 * is reported as unreachable instead of being given a new one.
 *
 * An instance that does not exist answers null. An instance without a server
 * on the panel, and a node that does not answer, are both unreachable: the
 * state of the container of such an instance is simply not known.
 */
export async function observeRuntimeState(instanceId: string): Promise<RuntimeStateObservation | null> {
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    select: { id: true, userId: true, pterodactylUuid: true },
  });
  if (!instance) return null;

  const uuid = instance.pterodactylUuid;
  if (!uuid) {
    // The platform shows the instance as online, but there is no server on the
    // panel to ask the node about.
    return { instanceId, nodeState: '', running: false, serving: false, unconfirmed: false, unreachable: true };
  }

  try {
    const resources = await withCustomerKey(
      instance.userId,
      (token) => pteroClient.getResources(token, uuid),
      // Only the key that is already stored may be used. A run that looks at
      // the panel must never mint a credential of its own.
      { mint: false, renew: false },
    );
    const nodeState = (resources.state ?? '').trim();
    const verdict = judgeContainer({
      state: nodeState,
      memoryBytes: resources.memory_bytes,
      suspended: resources.is_suspended,
    });
    return {
      instanceId,
      nodeState,
      running: verdict.serving && verdict.confirmed,
      serving: verdict.serving,
      unconfirmed: verdict.serving && !verdict.confirmed,
      unreachable: false,
    };
  } catch {
    // The panel or the node did not answer. That is not a reason to fail the
    // run: the truth is not known right now, and the run goes on with the
    // next instance.
    return { instanceId, nodeState: '', running: false, serving: false, unconfirmed: false, unreachable: true };
  }
}

/**
 * The part of a message that says what was found.
 *
 * The moment is not part of it: the run repeats every minute, and the same
 * finding is only written once, so the journal of an instance does not fill
 * up with the same line.
 */
function findingKey(message: string): string {
  const state = /the state "([^"]*)"/.exec(message);
  if (state) return `state:${state[1]}`;
  if (message.includes('could not be asked')) return 'unreachable';
  return 'unknown';
}

/**
 * Writes down what the node says about an instance that is not running.
 *
 * The message names the state and the moment, so an operator sees what the
 * node said and when it said it. The audit journal keeps the same finding.
 *
 * The instance itself is not touched: its status stays what it is, because the
 * decision to act on a customer instance belongs to the operator.
 */
async function recordRuntimeState(observation: RuntimeStateObservation): Promise<void> {
  const moment = new Date().toISOString();
  const message = observation.unreachable
    ? `The node could not be asked about this instance at ${moment}. The platform still shows it as online.`
    : observation.unconfirmed
      ? `The node reported the state "${observation.nodeState}" for this instance at ${moment}, and the container is alive, but the node does not confirm the running state: the health check of the egg does not pass. The platform still shows it as online.`
      : `The node reported the state "${observation.nodeState}" for this instance at ${moment}. The platform still shows it as online.`;

  // The run repeats every minute, so the same finding is only written once.
  const last = await prisma.instanceEvent.findFirst({
    where: { instanceId: observation.instanceId, type: RUNTIME_STATE_EVENT },
    orderBy: { createdAt: 'desc' },
    select: { message: true },
  });
  if (last && findingKey(last.message) === findingKey(message)) return;

  await prisma.instanceEvent.create({
    data: { instanceId: observation.instanceId, type: RUNTIME_STATE_EVENT, message },
  });
  await audit({
    action: RUNTIME_STATE_AUDIT,
    targetType: 'instance',
    targetId: observation.instanceId,
    meta: {
      state: observation.unreachable ? null : observation.nodeState,
      running: false,
      unconfirmed: observation.unconfirmed,
      unreachable: observation.unreachable,
      observedAt: moment,
    },
  });
}

/**
 * Asks the node about the instances the platform believes are running, and
 * writes down what the node says.
 *
 * The instances that are online are the ones the platform promised to the
 * customers, so they are the ones that have to be true. Every instance that is
 * looked at is counted, and every instance the node does not report as running
 * is written down in the journal of the instance and in the audit journal.
 *
 * The status of an instance is never changed here. A node that cannot be
 * reached is counted and reported, never fatal: a run that gave up because one
 * node is down would leave every other instance unchecked.
 *
 * The numbers that are returned say what the run saw:
 *
 *   - `observed` is the number of instances the run looked at,
 *   - `notRunning` is the number of those the node answered about with a state
 *     in which the container does not serve,
 *   - `unconfirmed` is the number of those whose container is alive but that
 *     the node does not confirm, because the health check of the egg does not
 *     pass,
 *   - `unreachable` is the number of those the node could not be asked about.
 */
export async function reconcileRuntimeState(
  options: { limit?: number } = {},
): Promise<{
  observed: number;
  notRunning: number;
  unconfirmed: number;
  unreachable: number;
  reconciled: number;
}> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const instances = await prisma.instance.findMany({
    // The instances the platform promised to the customers are the ones that
    // have to be true. An instance that the platform shows as restarting or
    // as degraded is one of them: the state is transitional, and nothing else
    // in the platform moves it, so it has to be resolved by what the node
    // says.
    where: { status: { in: ['ONLINE', 'RESTARTING', 'DEGRADED'] } },
    select: { id: true, status: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let observed = 0;
  let notRunning = 0;
  let unconfirmed = 0;
  let unreachable = 0;
  let reconciled = 0;

  for (const instance of instances) {
    const observation = await observeRuntimeState(instance.id);
    if (!observation) continue;

    observed += 1;
    if (observation.unreachable) unreachable += 1;
    else if (observation.unconfirmed) unconfirmed += 1;
    else if (!observation.running) notRunning += 1;

    // A container that runs is what the platform promised, so there is nothing
    // to write down.
    if (observation.running) continue;

    // A state that is transitional is resolved by what the node says: an
    // instance the platform shows as restarting, whose container serves, is
    // online again. Before, the state stayed "restarting" for good when the
    // egg of the product has no health check, and the customer saw a service
    // that was up and running as broken.
    if (observation.serving && instance.status === 'RESTARTING') {
      await resolveRestartingInstance(instance.id, observation);
      reconciled += 1;
      continue;
    }

    await recordRuntimeState(observation);
  }

  return { observed, notRunning, unconfirmed, unreachable, reconciled };
}

/**
 * Shows an instance as online again, and says why.
 *
 * The change is written in the journal of the instance and in the audit
 * journal, so an operator sees that the state was moved and what the node
 * said about it. The instance is only moved when it is still in the state it
 * was observed in, so a change that happened in the meantime is not undone.
 */
async function resolveRestartingInstance(
  instanceId: string,
  observation: RuntimeStateObservation,
): Promise<void> {
  const moment = new Date().toISOString();
  const changed = await prisma.instance.updateMany({
    where: { id: instanceId, status: 'RESTARTING' },
    data: { status: 'ONLINE' },
  });
  if (changed.count === 0) return;

  await prisma.instanceEvent.create({
    data: {
      instanceId,
      type: RUNTIME_STATE_EVENT,
      message:
        `The node reported the state "${observation.nodeState}" for this instance at ${moment}, ` +
        'and the container serves. The platform shows it as online again.',
    },
  });
  await audit({
    action: RUNTIME_STATE_AUDIT,
    targetType: 'instance',
    targetId: instanceId,
    meta: {
      state: observation.nodeState,
      running: true,
      unconfirmed: observation.unconfirmed,
      unreachable: false,
      observedAt: moment,
      reconciled: true,
    },
  });
}
