import { recordUptimeCheck } from './uptime.js';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import * as pteroClient from './pterodactyl/client.js';
import { withCustomerKey } from './provisioning.js';
import { judgeContainer } from './pterodactyl/types.js';

/**
 * The state of the containers of the customers, compared with what the
 * platform believes.
 *
 * The platform marks an instance as online when the provisioning finished. That
 * is what the platform saw at the moment of the provisioning, and it is not
 * the state of the container afterwards: a container that dies stays online in
 * the platform until somebody looks at the node. Nothing asked the node about
 * an instance that was already online, so the truth about a broken container
 * was never recorded.
 *
 * This module asks the node about the instances the platform believes are
 * running and writes down what the node says. It never breaks a customer
 * instance: a customer instance is not suspended, withdrawn or deleted because
 * of a check of the node. The decision to act on a broken container belongs to
 * the operator, and this module gives that operator the truth to decide with.
 *
 * What the node says is written on the instance itself, and the customer zone
 * shows that state and not the state the platform believes. Before, the
 * customer zone showed a state that was frozen at the moment of the
 * provisioning, so a service whose container was running was shown as
 * restarting for ever.
 *
 * Two rules keep that state honest:
 *
 *  - a node that cannot be asked does not break anything. The last known
 *    state is kept, the instance is marked as not fresh, and the platform
 *    keeps showing what it believed before;
 *  - a state has to be seen for a while before it replaces the one that is
 *    shown, so a container that flaps between two states does not make the
 *    customer zone blink between two labels.
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
  /**
   * True when the container may still serve the customer if the check waits.
   *
   * A container that was started a moment ago is "starting" and uses no memory
   * yet: it is not serving, but it is not broken either.
   */
  pending: boolean;
  /** True when the node could not be asked at all. */
  unreachable: boolean;
}

/**
 * What the platform concludes from what the node says.
 *
 * The condition is the state the customer zone shows. It is not the state of
 * the node: a container that is alive but that the node does not confirm
 * serves the customer, and the customer paid for it.
 */
export type RuntimeCondition = 'serving' | 'starting' | 'stopped';

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
 * How long a state has to be seen before it replaces the one that is shown.
 *
 * The worker asks the node about every instance once a minute, so a hold of
 * one minute means that a state has to be seen by two questions in a row
 * before the customer sees it. A container that flaps between two states
 * never passes that hold, so the customer zone keeps the state it had and
 * does not blink between two labels.
 */
export const RUNTIME_STATE_HOLD_MS = 60_000;

/**
 * The states of the platform that the state of the node speaks for.
 *
 * A service that is suspended or cancelled does not run because the platform
 * says so, and not because the node says so, so the state of the node is not
 * shown for it. The states that are deployed are the ones the run looks at.
 */
const DEPLOYED_STATUSES = ['ONLINE', 'RESTARTING', 'DEGRADED'];

/**
 * The label of the customer zone for every condition.
 *
 * A container that serves is online for the customer, even when the node does
 * not confirm it: the doubt is written down in the journal of the instance,
 * and the customer is not shown a service that works as a broken one.
 */
const CONDITION_LABEL: Record<RuntimeCondition, string> = {
  serving: 'online',
  starting: 'starting',
  stopped: 'stopped',
};

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
    return {
      instanceId,
      nodeState: '',
      running: false,
      serving: false,
      unconfirmed: false,
      pending: false,
      unreachable: true,
    };
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
      pending: verdict.pending,
      unreachable: false,
    };
  } catch {
    // The panel or the node did not answer. That is not a reason to fail the
    // run: the truth is not known right now, and the run goes on with the
    // next instance.
    return {
      instanceId,
      nodeState: '',
      running: false,
      serving: false,
      unconfirmed: false,
      pending: false,
      unreachable: true,
    };
  }
}

/**
 * What the platform concludes from what the node says.
 *
 * The answer is null when nothing is known at all: a node that could not be
 * asked says nothing about the container, and the last known state is kept
 * instead of being replaced by a guess.
 */
export function conditionOf(observation: RuntimeStateObservation): RuntimeCondition | null {
  if (observation.unreachable) return null;
  // A container that serves is serving, whether the node confirms it or not.
  if (observation.running || observation.serving) return 'serving';
  // A container that is still coming up is not broken: it is starting.
  if (observation.pending) return 'starting';
  return 'stopped';
}

/**
 * The state the customer zone shows for an instance.
 *
 * The state of the node speaks for a service that is deployed: a service that
 * is suspended or cancelled does not run because the platform says so, and
 * not because the node says so, so the state of the node is not shown for it.
 *
 * The state of the node is the last known state, so it is kept when the node
 * cannot be asked. The answer says then that the state is not fresh any more,
 * and the customer zone shows it: a node that is quiet is not a service that
 * is broken.
 */
export function customerStatusOf(instance: {
  status: string;
  runtimeCondition: string | null;
}): string {
  const platform = instance.status.toLowerCase();
  if (!DEPLOYED_STATUSES.includes(instance.status)) return platform;
  const condition = instance.runtimeCondition as RuntimeCondition | null;
  if (!condition) return platform;
  return CONDITION_LABEL[condition] ?? platform;
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

/** What the run needs to know about an instance to hold its state steady. */
interface RuntimeRow {
  id: string;
  status: string;
  runtimeState: string | null;
  runtimeCondition: string | null;
  runtimeConditionCandidate: string | null;
  runtimeConditionCandidateSince: Date | null;
}

/**
 * Writes what the node says on the instance, and keeps the state that is
 * shown steady.
 *
 * The state the node reports is written every time, so the operator always
 * sees the last word of the node. The state the customer zone shows is held:
 * a condition that was not seen before waits for its hold, and only replaces
 * the one that is shown when it was seen for the whole hold. A container that
 * flaps between two states therefore keeps the state it had.
 *
 * A node that cannot be asked changes nothing but the freshness: the last
 * known state is kept and the instance is marked as not fresh. The status of
 * the instance is never touched here.
 */
async function applyObservation(
  row: RuntimeRow,
  observation: RuntimeStateObservation,
  holdMs: number,
  now: Date = new Date(),
): Promise<RuntimeCondition | null> {
  const condition = conditionOf(observation);

  if (!condition) {
    // The node could not be asked. The last known state is kept, the instance
    // is marked as not fresh, and a state that was waiting for its hold
    // starts its hold again when the node answers.
    await prisma.instance.update({
      where: { id: row.id },
      data: {
        runtimeStateStale: true,
        runtimeConditionCandidate: null,
        runtimeConditionCandidateSince: null,
      },
    });
    return null;
  }

  let shown = row.runtimeCondition as RuntimeCondition | null;
  let candidate = row.runtimeConditionCandidate;
  let candidateSince = row.runtimeConditionCandidateSince;

  if (condition !== shown) {
    if (condition !== candidate) {
      // A condition that was not seen before waits for its hold.
      candidate = condition;
      candidateSince = now;
    } else {
      // The same condition was seen again: it replaces the one that is shown
      // once it has been seen for the whole hold.
      const held = now.getTime() - (candidateSince ?? now).getTime();
      if (held >= holdMs) {
        shown = condition;
        candidate = null;
        candidateSince = null;
      }
    }
  } else {
    // The condition that is shown is the one the node reports: nothing waits.
    candidate = null;
    candidateSince = null;
  }

  await prisma.instance.update({
    where: { id: row.id },
    data: {
      runtimeState: observation.nodeState,
      runtimeCondition: shown,
      runtimeConditionCandidate: candidate,
      runtimeConditionCandidateSince: candidateSince,
      runtimeStateCheckedAt: now,
      runtimeStateStale: false,
    },
  });

  return shown;
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
 * The status of an instance is only moved when it is a state that is
 * transitional and the node says that the container serves: an instance that
 * the platform shows as restarting is online again when the node says that it
 * runs. A node that cannot be reached is counted and reported, never fatal: a
 * run that gave up because one node is down would leave every other instance
 * unchecked.
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
  options: { limit?: number; holdMs?: number } = {},
): Promise<{
  observed: number;
  notRunning: number;
  unconfirmed: number;
  unreachable: number;
  reconciled: number;
}> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const holdMs = options.holdMs ?? RUNTIME_STATE_HOLD_MS;
  const instances = await prisma.instance.findMany({
    // The instances the platform promised to the customers are the ones that
    // have to be true. An instance that the platform shows as restarting or
    // as degraded is one of them: the state is transitional, and nothing else
    // in the platform moves it, so it has to be resolved by what the node
    // says.
    where: { status: { in: ['ONLINE', 'RESTARTING', 'DEGRADED'] } },
    select: {
      id: true,
      name: true,
      userId: true,
      downSince: true,
      downAlertedAt: true,
      alertsEnabled: true,
      status: true,
      runtimeState: true,
      runtimeCondition: true,
      runtimeConditionCandidate: true,
      runtimeConditionCandidateSince: true,
    },
    // The instances that were looked at the longest time ago are looked at
    // first. The row of an instance is written on every run, so the moment it
    // was touched is the moment it was last asked about, and every instance
    // is asked about in turn: a run that always looked at the same instances
    // would leave the others without a fresh state for ever.
    orderBy: [{ updatedAt: 'asc' }, { createdAt: 'asc' }],
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

    // What the node says is written down first, whatever it is. The state the
    // customer zone shows is the one that was seen long enough to be trusted.
    const condition = await applyObservation(instance, observation, holdMs);

    // The check is written down for the uptime figures and the alerts. A node that could not be asked says nothing
    // about the service, and a container that is still starting is neither up nor down.
    if (!observation.unreachable) {
      const now = conditionOf(observation);
      if (now === 'serving' || now === 'stopped') {
        await recordUptimeCheck(instance, now === 'serving').catch((error) => console.error('[uptime] a check could not be recorded', error));
      }
    }

    // A state that is transitional is resolved by what the node says: an
    // instance the platform shows as restarting, whose container serves, is
    // online again. Before, the run skipped every instance whose container
    // was healthy, so an instance whose container ran stayed "restarting" for
    // good and the customer saw a service that was up and running as broken.
    if (condition === 'serving' && instance.status === 'RESTARTING') {
      await resolveRestartingInstance(instance.id, observation);
      reconciled += 1;
      continue;
    }

    // A container that runs and that the node confirms is what the platform
    // promised: there is nothing to write down. Everything else is written
    // down, so an operator sees a container that does not serve and the doubt
    // of a container that serves but is not confirmed.
    if (observation.running) continue;

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

/**
 * What the watch says about the state of the running services.
 *
 * The run answers with the numbers of the services it looked at, of the ones
 * that are not in the state the platform believes and of the ones it could not
 * ask about. The words are built here, apart from the watch, so the rule can
 * be proved without a node.
 */
export function runtimeStateWarning(result: unknown): string | null {
  const summary = (result ?? {}) as {
    observed?: unknown;
    notRunning?: unknown;
    unconfirmed?: unknown;
    unreachable?: unknown;
  };
  const notRunning = typeof summary.notRunning === 'number' ? summary.notRunning : 0;
  const unconfirmed = typeof summary.unconfirmed === 'number' ? summary.unconfirmed : 0;
  const unreachable = typeof summary.unreachable === 'number' ? summary.unreachable : 0;
  if (notRunning > 0) {
    return `[running-state] ${notRunning} service(s) were not in the state the platform believes`;
  }
  if (unconfirmed > 0) {
    return `[running-state] ${unconfirmed} service(s) are alive, but the node does not confirm the running state`;
  }
  if (unreachable > 0) {
    return `[running-state] ${unreachable} service(s) could not be asked about`;
  }
  return null;
}
