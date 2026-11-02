/**
 * The shapes the API answers with for the reports of abuse.
 *
 * The rules of the case live on the server: the state of the case and the
 * actions it allows are in the answer, so the interface never has to know
 * which action a closed case may still take.
 */

/** The state of a case. */
export type AbuseState = 'open' | 'investigating' | 'resolved' | 'dismissed';

/** What the staff can do with a case. */
export type AbuseAction = 'investigating' | 'resolve' | 'dismiss' | 'reopen' | 'suspend';

/** The name of an action, as the staff reads it. */
export const ABUSE_ACTION_LABELS: Record<AbuseAction, string> = {
  investigating: 'Start the investigation',
  resolve: 'Resolve the report',
  dismiss: 'Dismiss the report',
  reopen: 'Reopen the investigation',
  suspend: 'Suspend the service',
};

/**
 * The colour of a state.
 *
 * The pill of the interface takes the state and the name of the state: the
 * state decides the colour and the name is what the staff reads. An open
 * report waits, an investigation is with the staff, a closed case is settled
 * and a dismissed report is set aside.
 */
export const ABUSE_STATE_TONES: Record<AbuseState, string> = {
  open: 'open',
  investigating: 'awaiting_staff',
  resolved: 'resolved',
  dismissed: 'cancelled',
};

/** The service a report is about. */
export interface AbuseService {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  suspendedAt: string | null;
  customer: {
    id: string;
    email: string;
    name: string;
    role: string;
    suspendedAt: string | null;
  };
  product: { name: string; slug: string } | null;
}

/** A report of abuse, as the staff desk reads it. */
export interface AbuseReport {
  id: string;
  category: string;
  target: string;
  details: string;
  evidenceUrl: string | null;
  reporterName: string;
  reporterEmail: string;
  reporterIp?: string | null;
  /** The state of the case: open, investigating, resolved or dismissed. */
  status: AbuseState;
  statusLabel: string;
  resolution: string | null;
  instanceId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reopenedAt: string | null;
  /** The enforcement that was made on the service: a fact of its own. */
  enforcement: string | null;
  enforcementLabel: string;
  enforcementAt: string | null;
  enforcedBy: string | null;
  service: AbuseService | null;
  /** The actions the state of the case allows. */
  allowedActions: AbuseAction[];
  /** When something was last done with the report. */
  lastActivityAt?: string;
}

/** The list of reports, with the page and the number of reports there are. */
export interface AbuseList {
  reports: AbuseReport[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

/** A note of the staff on a report. */
export interface AbuseNote {
  id: string;
  body: string;
  authorId: string | null;
  authorEmail: string | null;
  createdAt: string;
}

/** One entry of the trail of a report. */
export interface AbuseActivity {
  id: string;
  action: string;
  actorEmail: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

/** Another report about the same target or the same service. */
export interface AbuseRelated {
  id: string;
  category: string;
  target: string;
  status: AbuseState;
  statusLabel: string;
  createdAt: string;
}

/** One report with everything the staff needs to work on it. */
export interface AbuseDetail {
  report: AbuseReport;
  service: AbuseService | null;
  notes: AbuseNote[];
  activity: AbuseActivity[];
  related: AbuseRelated[];
}
