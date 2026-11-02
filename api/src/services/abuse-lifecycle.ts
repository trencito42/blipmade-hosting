/**
 * The life of a report of abuse.
 *
 * The rules of the case live here, away from the database, so they can be read
 * and tested on their own. The server asks this module what a report may do
 * next, and the interface asks it the same question.
 *
 * Two facts are kept apart on purpose:
 *
 *   - the state of the case says where the case is: open, investigating,
 *     resolved or dismissed;
 *   - the enforcement says what was done to the service of the report: nothing
 *     yet, or the service was suspended.
 *
 * A case that was closed after an action was taken carries the historical state
 * "action_taken". It is read as "resolved", because the case was closed, and
 * the text of the resolution is kept.
 */

/** The state of a case. */
export type AbuseState = 'open' | 'investigating' | 'resolved' | 'dismissed';

/** What the staff can do with a case. */
export type AbuseAction = 'investigating' | 'resolve' | 'dismiss' | 'reopen' | 'suspend';

/** Every state a case may be in. */
export const ABUSE_STATES: readonly AbuseState[] = ['open', 'investigating', 'resolved', 'dismissed'];

/** Every action the staff desk knows. */
export const ABUSE_ACTIONS: readonly AbuseAction[] = ['investigating', 'resolve', 'dismiss', 'reopen', 'suspend'];

/** The state a case had before the states were named. It is read as "resolved". */
export const HISTORICAL_ACTION_TAKEN = 'action_taken';

/** The name of each state, as the staff reads it. */
export const STATE_LABELS: Record<AbuseState, string> = {
  open: 'Open',
  investigating: 'Investigating',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

/** The moves a case may make. A closed case only comes back through a reopen. */
export const ABUSE_TRANSITIONS: Record<AbuseState, readonly AbuseState[]> = {
  open: ['investigating', 'resolved', 'dismissed'],
  investigating: ['resolved', 'dismissed'],
  resolved: ['investigating'],
  dismissed: ['investigating'],
};

/** The states an action may be started from. */
export function actionAllowedFrom(action: AbuseAction): readonly AbuseState[] {
  switch (action) {
    case 'investigating':
      return ['open'];
    case 'resolve':
      return ['open', 'investigating'];
    case 'dismiss':
      return ['open', 'investigating'];
    case 'reopen':
      return ['resolved', 'dismissed'];
    case 'suspend':
      return ['open', 'investigating'];
  }
}

/**
 * Reads the state the database holds.
 *
 * The historical value is read as "resolved", and a state the platform does
 * not know is read as "open", so a case is never shown in a state nobody can
 * act on.
 */
export function normalizeState(value: string | null | undefined): AbuseState {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'investigating':
      return 'investigating';
    case 'resolved':
      return 'resolved';
    case 'dismissed':
      return 'dismissed';
    case HISTORICAL_ACTION_TAKEN:
      return 'resolved';
    default:
      return 'open';
  }
}

/** The name of a state, as the staff reads it. */
export function stateLabel(state: AbuseState): string {
  return STATE_LABELS[state];
}

/** True while the case is still being worked on. */
export function isActiveState(state: AbuseState): boolean {
  return state === 'open' || state === 'investigating';
}

/**
 * The values the database holds for a state.
 *
 * The historical value is read as "resolved", so a filter of the list finds
 * the old cases as well.
 */
export function storedStates(state: AbuseState): string[] {
  return state === 'resolved' ? ['resolved', HISTORICAL_ACTION_TAKEN] : [state];
}

/** The filters of the list of reports. */
export const STATUS_FILTERS = ['active', 'open', 'investigating', 'resolved', 'dismissed', 'all'] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** True when the value is a filter the list knows. */
export function isStatusFilter(value: string): value is StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(value);
}

/**
 * The states a filter shows. Null means every state.
 *
 * "active" is the queue that is still being worked on: open and investigating.
 */
export function filterStates(filter: string | null | undefined): AbuseState[] | null {
  const value = (filter ?? '').trim().toLowerCase();
  if (!value || value === 'all') return null;
  if (value === 'active') return ['open', 'investigating'];
  if (value === 'open' || value === 'investigating' || value === 'resolved' || value === 'dismissed') return [value];
  return null;
}

/** The state a case goes to after an action. The suspension changes no state. */
export function actionTargetState(action: AbuseAction): AbuseState | null {
  switch (action) {
    case 'investigating':
      return 'investigating';
    case 'resolve':
      return 'resolved';
    case 'dismiss':
      return 'dismissed';
    case 'reopen':
      return 'investigating';
    case 'suspend':
      return null;
  }
}

/** Whether a case may go from one state to another. */
export function canTransition(from: AbuseState, to: AbuseState): boolean {
  return ABUSE_TRANSITIONS[from].includes(to);
}

/** Whether the action may be started from the state the case is in. */
export function actionAllowed(state: AbuseState, action: AbuseAction): boolean {
  return actionAllowedFrom(action).includes(state);
}

/** Whether the action has to carry a reason. */
export function requiresReason(action: AbuseAction): boolean {
  return action !== 'investigating';
}

/** The name of the action, as the staff reads it. */
export function actionLabel(action: AbuseAction): string {
  switch (action) {
    case 'investigating':
      return 'Start the investigation';
    case 'resolve':
      return 'Resolve the report';
    case 'dismiss':
      return 'Dismiss the report';
    case 'reopen':
      return 'Reopen the investigation';
    case 'suspend':
      return 'Suspend the service';
  }
}

/**
 * The name the journal carries for the action.
 *
 * Every change of a case and every enforcement writes an entry, so the trail
 * of a report can be read back without reading the case itself.
 */
export function abuseAuditAction(action: AbuseAction): string {
  switch (action) {
    case 'investigating':
      return 'admin.abuse.investigating';
    case 'resolve':
      return 'admin.abuse.resolved';
    case 'dismiss':
      return 'admin.abuse.dismissed';
    case 'reopen':
      return 'admin.abuse.reopened';
    case 'suspend':
      return 'admin.abuse.service_suspended';
  }
}

export interface AbuseActionOptions {
  /** The staff member holds the permission to suspend a service. */
  canSuspend?: boolean;
  /** The report is linked to a service of the platform. */
  hasService?: boolean;
}

/**
 * The actions the state of the case allows.
 *
 * The list is what the interface shows, so a button that the server would
 * refuse never appears.
 */
export function allowedActions(state: AbuseState, options: AbuseActionOptions = {}): AbuseAction[] {
  const out: AbuseAction[] = [];
  for (const action of ABUSE_ACTIONS) {
    if (!actionAllowed(state, action)) continue;
    if (action === 'suspend' && !(options.canSuspend && options.hasService)) continue;
    out.push(action);
  }
  return out;
}

/**
 * Why the action is refused on a case in this state.
 *
 * The words are the ones the staff reads: they name the state of the case and
 * say what may still be done with it.
 */
export function refusal(state: AbuseState, action: AbuseAction): string {
  if (state === 'dismissed') {
    if (action === 'suspend') {
      return 'This report was dismissed, so it cannot suspend a service. Suspend the service from the services page if it has to be suspended.';
    }
    return 'This report was dismissed. It can only be reopened, with a reason.';
  }
  if (state === 'resolved') {
    if (action === 'suspend') {
      return 'This report was closed, so it cannot suspend a service. Suspend the service from the services page if it has to be suspended.';
    }
    return 'This report was closed. It can only be reopened, with a reason.';
  }
  if (action === 'investigating') {
    return 'The investigation of this report has already started.';
  }
  return 'This action is not allowed on this report.';
}

/** The enforcement that was made on the service of a report. */
export const ENFORCEMENT_SERVICE_SUSPENDED = 'service_suspended';

/** The name of an enforcement, as the staff reads it. */
export function enforcementLabel(value: string | null | undefined): string {
  switch (value) {
    case ENFORCEMENT_SERVICE_SUSPENDED:
      return 'Service suspended';
    case null:
    case undefined:
    case '':
      return '';
    default:
      return value;
  }
}
