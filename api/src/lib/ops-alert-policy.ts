/**
 * The rule of the alarms.
 *
 * The platform watches itself, and a platform that watches itself badly is
 * worse than one that does not watch itself at all: a problem that repeats
 * every five minutes fills the mailbox of the operator with the same message
 * and teaches the operator to ignore the messages of the platform.
 *
 * The rule lives here, away from everything else, because it is the part
 * that has to be right and the part that has to be checked without a
 * database, without a cache and without a clock that lies.
 */

/** What the platform remembers about a finding. */
export interface OpsAlertState {
  check: string;
  fingerprint: string;
  status: 'ok' | 'firing';
  since: string;
  lastSentAt: string | null;
  sends: number;
  acknowledgedAt: string | null;
}

/** The decision about a finding. */
export type AlertDecision = 'notify' | 'repeat' | 'suppress' | 'recover';

/**
 * The pause between two alarms of the same finding, in minutes.
 *
 * The first alarm goes out at once. The next one waits half an hour, the one
 * after that waits two hours, then eight hours, and then a day. A problem
 * that is not fixed by a human is therefore still talked about every day,
 * without turning into a flood of mail.
 */
const BACKOFF_MINUTES = [30, 120, 480, 1440];

/**
 * The pause before a finding is reported again, in minutes.
 *
 * The pause grows with the number of alarms that were already sent, and it
 * stops growing at the last step: a problem that lasts a week is still
 * reported every day.
 */
export function backoffMinutes(sends: number): number {
  if (sends <= 0) return BACKOFF_MINUTES[0];
  const index = Math.min(sends - 1, BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[index];
}

/**
 * The decision about a finding, given what the platform remembers about it.
 *
 * The function is pure, so the rule can be checked without a platform.
 */
export function decideAlert(
  state: OpsAlertState | null,
  fingerprint: string,
  now: Date,
): { decision: AlertDecision; reason: string } {
  if (!state || state.status === 'ok') {
    return { decision: 'notify', reason: 'the finding is new' };
  }
  if (state.fingerprint !== fingerprint) {
    return { decision: 'notify', reason: 'the finding is a different one' };
  }
  if (state.acknowledgedAt) {
    return { decision: 'suppress', reason: 'an operator has taken the finding in hand' };
  }
  const lastSent = state.lastSentAt ? new Date(state.lastSentAt).getTime() : 0;
  const wait = backoffMinutes(state.sends) * 60_000;
  if (now.getTime() - lastSent >= wait) {
    return { decision: 'repeat', reason: 'the pause before the next alarm has passed' };
  }
  return { decision: 'suppress', reason: 'the finding was already reported' };
}
