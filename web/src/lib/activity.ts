/**
 * The events of a service, in the words a customer reads.
 *
 * The API records an event with a type and a message written for the operator.
 * A page shows `describeEvent`: a short sentence about what happened, and the
 * original message is kept for the place that wants the detail.
 */

export interface ServiceEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export interface EventDescription {
  /** What happened, as a sentence. */
  title: string;
  /** The line under it, when there is one. */
  detail: string | null;
}

/** The state the node reported, taken from the sentence the platform writes about it. */
function nodeStateOf(message: string): string | null {
  const match = /state "([^"]+)"/.exec(message);
  return match ? match[1]! : null;
}

const NODE_STATES: Record<string, string> = {
  running: 'is running',
  starting: 'is starting',
  stopping: 'is stopping',
  offline: 'is stopped',
  stopped: 'is stopped',
};

/** A sentence from a message that is already written for the customer: the first letter is kept as it is. */
function plain(message: string): string {
  const text = message.trim();
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

export function describeEvent(event: Pick<ServiceEvent, 'type' | 'message'>, name: string): EventDescription {
  const type = event.type.toLowerCase();

  if (type === 'runtime_state') {
    const state = nodeStateOf(event.message);
    const phrase = state ? (NODE_STATES[state.toLowerCase()] ?? `reported the state ${state}`) : 'changed state';
    const warns = /does not confirm|does not pass/i.test(event.message);
    return {
      title: `${name} ${phrase}`,
      detail: warns ? 'The health check of the application does not pass yet.' : 'The status was updated by the node.',
    };
  }
  if (type === 'power') return { title: plain(event.message) || `${name} changed power state`, detail: null };
  if (type === 'cancelled') return { title: `${name} was cancelled`, detail: plain(event.message) || null };
  if (type === 'provisioning' || type === 'provision') return { title: plain(event.message) || `${name} is being set up`, detail: null };

  // Every other event was written for the customer already: a file saved, a backup made, a domain added.
  return { title: plain(event.message) || `${name} was updated`, detail: null };
}

/** True when the event is a raw note of the platform that a customer does not need in a short list. */
export function isTechnicalNote(event: Pick<ServiceEvent, 'type'>): boolean {
  return event.type.toLowerCase() === 'runtime_state';
}
