import { useEffect, useRef, useState } from 'react';
import { get, post } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Link, useParams, useRouter } from '../../router';
import {
  DangerButton,
  ErrorState,
  Field,
  LoadingBlock,
  Panel,
  PrimaryButton,
  SoftButton,
  StatusPill,
  TextArea,
  useToast,
} from '../../ui-app';
import { ConfirmWithReason, DASH, LiveRegion, can, fmtDate, fmtDateTime, useAdminSession } from '../Overview';
import { ABUSE_ACTION_LABELS, ABUSE_STATE_TONES } from './types';
import type { AbuseAction, AbuseDetail, AbuseReport } from './types';

/**
 * One report of abuse — GET /api/admin/abuse/:id
 *
 * The page shows what the case is: the evidence that came in, what the staff
 * wrote about it, what was done with it, and the service it is about. The
 * buttons are the ones the state of the case allows: the server sends them
 * with the report, so a closed case never offers a suspension.
 *
 * The reporter is a person who wrote to the platform. Their name, their
 * address and the address they wrote from are shown here, in the staff area,
 * and nowhere else.
 */

/** What the staff is told when an action worked. */
const SUCCESS: Record<AbuseAction, string> = {
  investigating: 'The investigation has started.',
  resolve: 'Report resolved.',
  dismiss: 'Report dismissed.',
  reopen: 'Investigation reopened.',
  suspend: 'Service suspended.',
};

/** The name of each entry of the trail. */
const ACTIVITY_LABELS: Record<string, string> = {
  'abuse.reported': 'Report received',
  'admin.abuse.investigating': 'Investigation started',
  'admin.abuse.resolved': 'Report resolved',
  'admin.abuse.dismissed': 'Report dismissed',
  'admin.abuse.reopened': 'Investigation reopened',
  'admin.abuse.service_suspended': 'Service suspended',
  'admin.abuse.note_added': 'Note added',
};

/** The reason of an entry of the trail, when it carries one. */
function reasonOf(meta: Record<string, unknown> | null): string | null {
  const reason = meta?.reason;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}

/**
 * The head of the case: what was reported, where the case is, and the actions
 * the state allows.
 */
export function AbuseCaseHeader({
  report,
  onAction,
  busy = false,
}: {
  report: AbuseReport;
  onAction: (action: AbuseAction) => void;
  busy?: boolean;
}) {
  const actions = report.allowedActions ?? [];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink3">{report.category}</p>
          <h2 className="break-words text-[19px] font-semibold tracking-[-0.03em] text-ink">{report.target}</h2>
        </div>
        <StatusPill status={ABUSE_STATE_TONES[report.status]} label={report.statusLabel} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] lg:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-ink3">Reported</dt>
          <dd className="break-words text-ink">{fmtDateTime(report.createdAt)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink3">Closed</dt>
          <dd className="break-words text-ink">{report.resolvedAt ? fmtDateTime(report.resolvedAt) : DASH}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink3">Reopened</dt>
          <dd className="break-words text-ink">{report.reopenedAt ? fmtDateTime(report.reopenedAt) : DASH}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink3">Last activity</dt>
          <dd className="break-words text-ink">{fmtDateTime(report.lastActivityAt ?? report.createdAt)}</dd>
        </div>
      </dl>

      {actions.length ? (
        <div className="flex flex-wrap gap-2">
          {actions.includes('investigating') && (
            <PrimaryButton type="button" disabled={busy} onClick={() => onAction('investigating')}>
              {ABUSE_ACTION_LABELS.investigating}
            </PrimaryButton>
          )}
          {actions.includes('resolve') && (
            <SoftButton type="button" disabled={busy} onClick={() => onAction('resolve')}>
              {ABUSE_ACTION_LABELS.resolve}
            </SoftButton>
          )}
          {actions.includes('dismiss') && (
            <SoftButton type="button" disabled={busy} onClick={() => onAction('dismiss')}>
              {ABUSE_ACTION_LABELS.dismiss}
            </SoftButton>
          )}
          {actions.includes('reopen') && (
            <PrimaryButton type="button" disabled={busy} onClick={() => onAction('reopen')}>
              {ABUSE_ACTION_LABELS.reopen}
            </PrimaryButton>
          )}
          {actions.includes('suspend') && (
            <DangerButton type="button" disabled={busy} onClick={() => onAction('suspend')}>
              {ABUSE_ACTION_LABELS.suspend}
            </DangerButton>
          )}
        </div>
      ) : (
        <p className="text-[13px] text-ink3">This report is read-only. It carries no action left to take.</p>
      )}
    </div>
  );
}

/** The evidence that came in with the report. */
export function AbuseEvidence({ report }: { report: AbuseReport }) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="px-1 text-[12.5px] font-medium text-ink3">What was reported</p>
        <p className="mt-1 whitespace-pre-line break-words text-[14.5px] leading-relaxed text-ink">{report.details}</p>
      </div>

      <div>
        <p className="px-1 text-[12.5px] font-medium text-ink3">Evidence</p>
        {report.evidenceUrl ? (
          <a
            href={report.evidenceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 block break-all text-[14px] text-acc underline"
          >
            {report.evidenceUrl}
          </a>
        ) : (
          <p className="mt-1 text-[14px] text-ink2">No evidence was sent with this report.</p>
        )}
      </div>

      <div>
        <p className="px-1 text-[12.5px] font-medium text-ink3">Linked service</p>
        {report.service ? (
          <p className="mt-1 text-[14px] text-ink">
            <Link to={`/admin/services/${report.service.id}`} className="text-acc underline">
              {report.service.name}
            </Link>{' '}
            <StatusPill status={report.service.status} />
          </p>
        ) : (
          <p className="mt-1 text-[14px] text-ink2">Not linked to a service of this platform.</p>
        )}
      </div>

      <div>
        <p className="px-1 text-[12.5px] font-medium text-ink3">Reporter</p>
        <p className="mt-1 break-words text-[14px] text-ink">
          {report.reporterName}
          <span className="text-ink3"> · </span>
          <a href={`mailto:${report.reporterEmail}`} className="text-acc underline">
            {report.reporterEmail}
          </a>
        </p>
        {report.reporterIp && <p className="mt-0.5 font-mono text-[12.5px] text-ink3">Address {report.reporterIp}</p>}
        <p className="mt-1 text-[12.5px] text-ink3">The reporter only gets the reference of their report.</p>
      </div>
    </div>
  );
}

/** The trail of the case: everything that was done with it. */
export function AbuseActivityTrail({ detail }: { detail: AbuseDetail }) {
  if (!detail.activity.length) {
    return <p className="text-[13.5px] text-ink3">Nothing has been done with this report yet.</p>;
  }
  return (
    <ol className="grid gap-2">
      {detail.activity.map((entry) => {
        const reason = reasonOf(entry.meta);
        return (
          <li key={entry.id} className="rounded-xl bg-s2 px-3 py-2">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] text-ink">
              <span className="font-medium">{ACTIVITY_LABELS[entry.action] ?? entry.action}</span>
              <span className="text-ink3">{fmtDateTime(entry.createdAt)}</span>
              {entry.actorEmail && <span className="font-mono text-[12px] text-ink3">{entry.actorEmail}</span>}
            </p>
            {reason && <p className="mt-1 whitespace-pre-line break-words text-[13px] text-ink2">{reason}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/** The notes of the staff on the case. */
export function AbuseNoteList({ notes }: { notes: AbuseDetail['notes'] }) {
  if (!notes.length) {
    return <p className="text-[13.5px] text-ink3">No note yet. The notes stay in the staff area.</p>;
  }
  return (
    <ol className="grid gap-2">
      {notes.map((note) => (
        <li key={note.id} className="rounded-xl bg-s2 px-3 py-2">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-ink3">
            <span className="font-mono">{note.authorEmail ?? 'The staff'}</span>
            <span>{fmtDateTime(note.createdAt)}</span>
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-[13.5px] text-ink">{note.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** The service of the case, the customer that owns it and the reports beside it. */
export function AbuseSidebar({ detail }: { detail: AbuseDetail }) {
  const service = detail.service ?? detail.report.service;
  return (
    <div className="grid gap-4">
      <Panel title="Service">
        {service ? (
          <div className="grid gap-2 text-[13.5px]">
            <p className="flex flex-wrap items-center gap-2">
              <Link to={`/admin/services/${service.id}`} className="font-medium text-acc underline">
                {service.name}
              </Link>
              <StatusPill status={service.status} />
            </p>
            {service.product && <p className="text-ink2">{service.product.name}</p>}
            <p className="text-ink3">Since {fmtDate(service.createdAt)}</p>
            {service.suspendedAt && <p className="text-warn">Suspended on {fmtDateTime(service.suspendedAt)}</p>}
            {!service.suspendedAt && service.status !== 'SUSPENDED' && (
              <p className="text-ink3">The service is not suspended.</p>
            )}
          </div>
        ) : (
          <p className="text-[13.5px] text-ink3">This report is not linked to a service of this platform.</p>
        )}
      </Panel>

      <Panel title="Customer">
        {service ? (
          <div className="grid gap-2 text-[13.5px]">
            <p className="break-words">
              <Link to={`/admin/customers/${service.customer.id}`} className="font-medium text-acc underline">
                {service.customer.name || service.customer.email}
              </Link>
            </p>
            <p className="break-all font-mono text-[12.5px] text-ink3">{service.customer.email}</p>
            {service.customer.suspendedAt && <p className="text-warn">The account is suspended.</p>}
          </div>
        ) : (
          <p className="text-[13.5px] text-ink3">There is no customer with this report.</p>
        )}
      </Panel>

      <Panel title="Related reports">
        {detail.related.length ? (
          <ul className="grid gap-1.5">
            {detail.related.map((related) => (
              <li key={related.id}>
                <Link
                  to={`/admin/abuse/${related.id}`}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-s2 px-3 py-2 transition-colors duration-[180ms] hover:bg-s3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                >
                  <span className="min-w-0 truncate text-[13.5px] text-ink">{related.target}</span>
                  <StatusPill status={ABUSE_STATE_TONES[related.status]} label={related.statusLabel} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-ink3">No other report is about this target or this service.</p>
        )}
      </Panel>
    </div>
  );
}

/**
 * The dialog that suspends a service.
 *
 * The suspension is the heaviest thing the staff desk does from a report, so
 * the dialog says what happens, asks for the reason and asks for the name of
 * the service. The name that is typed is the one the server is given, so the
 * server can refuse a name that is not the service of the report.
 */
export function AbuseSuspendDialog({
  open,
  serviceName,
  reason,
  onReasonChange,
  confirmation,
  onConfirmationChange,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  serviceName: string;
  reason: string;
  onReasonChange: (value: string) => void;
  confirmation: string;
  onConfirmationChange: (value: string) => void;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelRef.current();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const ready = confirmation.trim() === serviceName && reason.trim().length >= 5;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Suspend the service"
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[440px] flex-col rounded-2xl bg-s1 p-5">
        <h2 className="shrink-0 text-[18px] font-semibold tracking-[-0.03em] text-ink">Suspend {serviceName}</h2>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <p className="text-[14.5px] leading-relaxed text-ink2">
            The server is stopped and the customer cannot start it. The case stays open: the enforcement and the state of
            the case are two facts. The service is suspended once, never twice through the same report.
          </p>
          <div className="mt-4 grid gap-3">
            <TextArea
              label="Why is the service suspended?"
              hint="Recorded in the audit log of the case."
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              rows={3}
            />
            <Field label={`Type ${serviceName} to confirm`} htmlFor="abuse-confirm-service">
              <input
                id="abuse-confirm-service"
                value={confirmation}
                onChange={(event) => onConfirmationChange(event.target.value)}
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-line bg-card px-4 text-[16px] text-ink outline-none transition-colors duration-[180ms] placeholder:text-ink3 focus:border-acc lg:h-[38px] lg:text-[14px]"
              />
            </Field>
          </div>
          {error && (
            <p role="alert" className="mt-2 px-1 text-[12.5px] font-medium text-bad">
              {error}
            </p>
          )}
        </div>
        <div className="mt-5 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SoftButton onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
            Cancel
          </SoftButton>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !ready}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-bad px-5 text-[14.5px] font-semibold text-white transition-colors duration-[180ms] hover:bg-bad/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {busy ? 'Working…' : 'Suspend the service'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The page of one report of abuse. */
export default function AbuseDetail() {
  const params = useParams();
  const { path, navigate } = useRouter();
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'services.write');
  const toast = useToast();

  // The route of the page gives the id of the report. The path is the second
  // way to find it, so the page also works when it is opened on its own.
  const id = params.id ?? path.split('/').filter(Boolean).pop() ?? '';

  const state = useAsync((signal) => get<AbuseDetail>(`/admin/abuse/${id}`, undefined, signal), [id]);

  const [dialog, setDialog] = useState<AbuseAction | null>(null);
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const report = state.data?.report;

  const closeDialog = () => {
    setDialog(null);
    setReason('');
    setConfirmName('');
    setError(null);
  };

  const runAction = async (action: AbuseAction, text: string, confirmation?: string) => {
    setBusy(true);
    setError(null);
    try {
      await post(`/admin/abuse/${id}/action`, {
        action,
        reason: text.trim() || undefined,
        ...(confirmation ? { confirmService: confirmation } : {}),
      });
      toast.push(SUCCESS[action], 'ok');
      closeDialog();
      state.reload();
    } catch (failure) {
      // The dialog stays open with what was written, so nothing is lost.
      const message = failure instanceof Error ? failure.message : 'That did not work.';
      setError(message);
      toast.push(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const startInvestigation = async () => {
    setBusy(true);
    try {
      await post(`/admin/abuse/${id}/action`, { action: 'investigating' });
      toast.push(SUCCESS.investigating, 'ok');
      state.reload();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'That did not work.';
      toast.push(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setNoteBusy(true);
    setNoteError(null);
    try {
      await post(`/admin/abuse/${id}/notes`, { body: note.trim() });
      toast.push('Note added.', 'ok');
      setNote('');
      state.reload();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'The note was not saved.';
      setNoteError(message);
      toast.push(message, 'error');
    } finally {
      setNoteBusy(false);
    }
  };

  if (state.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={3} label="Loading the report" />
      </div>
    );
  }

  if (state.error || !report || !state.data) {
    return (
      <div className="grid gap-4">
        <ErrorState
          title="The report could not be loaded"
          message={state.error?.message ?? 'The report did not come back.'}
          onRetry={state.reload}
        />
        <Link to="/admin/abuse" className="text-[13.5px] text-acc underline">
          Back to the reports
        </Link>
      </div>
    );
  }

  const detail = state.data;
  const service = detail.service ?? detail.report.service;

  return (
    <div className="grid gap-4">
      <LiveRegion message={`Report ${report.target}, ${report.statusLabel}`} />

      <div>
        <Link to="/admin/abuse" className="text-[13.5px] text-acc underline">
          Back to the reports
        </Link>
      </div>

      <Panel>
        <AbuseCaseHeader
          report={report}
          busy={busy}
          onAction={(action) => {
            setError(null);
            if (action === 'investigating') {
              void startInvestigation();
              return;
            }
            if (action === 'suspend' || action === 'reopen') {
              navigate(`/admin/abuse/${encodeURIComponent(id)}/${action === 'suspend' ? 'enforcement' : 'reopen'}`);
              return;
            }
            setDialog(action);
          }}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-4">
          <Panel title="Evidence" description="What came in with the report.">
            <AbuseEvidence report={report} />
          </Panel>

          <Panel title="Investigation" description="What the staff wrote, and what was done.">
            <div className="grid gap-4">
              {report.resolution && (
                <div className="rounded-xl bg-s2 px-3 py-2">
                  <p className="text-[12.5px] font-medium text-ink3">
                    {report.status === 'investigating' ? 'Last resolution, before the reopen' : 'Resolution'}
                  </p>
                  <p className="mt-1 whitespace-pre-line break-words text-[13.5px] text-ink">{report.resolution}</p>
                </div>
              )}

              {report.enforcement && (
                <div className="rounded-xl bg-warn/10 px-3 py-2">
                  <p className="text-[12.5px] font-medium text-warn">Enforcement</p>
                  <p className="mt-1 text-[13.5px] text-ink">
                    {report.enforcementLabel}
                    {report.enforcementAt ? ` on ${fmtDateTime(report.enforcementAt)}` : ''}
                    {report.enforcedBy ? ` by ${report.enforcedBy}` : ''}.
                  </p>
                </div>
              )}

              <div>
                <p className="px-1 text-[13.5px] font-medium text-ink">Notes</p>
                <div className="mt-2 grid gap-2">
                  <AbuseNoteList notes={detail.notes} />
                </div>
                {mayWrite && (
                  <div className="mt-3 grid gap-2">
                    <TextArea
                      label="Add a note"
                      hint="The note stays in the staff area. It is never shown to a customer."
                      value={note}
                      error={noteError ?? undefined}
                      onChange={(event) => setNote(event.target.value)}
                      rows={3}
                      placeholder="What did you find out?"
                    />
                    <div>
                      <SoftButton type="button" disabled={noteBusy || !note.trim()} onClick={() => void addNote()}>
                        {noteBusy ? 'Saving…' : 'Add note'}
                      </SoftButton>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <p className="px-1 text-[13.5px] font-medium text-ink">Activity</p>
                <div className="mt-2">
                  <AbuseActivityTrail detail={detail} />
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <AbuseSidebar detail={detail} />
      </div>

      {!mayWrite && (
        <p className="px-1 text-[13px] text-ink3">
          Your role does not hold &quot;services.write&quot;, so this report is read-only for you.
        </p>
      )}

      <ConfirmWithReason
        open={dialog === 'resolve' || dialog === 'dismiss' || dialog === 'reopen'}
        title={
          dialog === 'resolve'
            ? 'Resolve the report'
            : dialog === 'dismiss'
              ? 'Dismiss the report'
              : 'Reopen the investigation'
        }
        description={
          dialog === 'resolve'
            ? 'The case is closed. It can only be reopened, with a reason.'
            : dialog === 'dismiss'
              ? 'The report is closed for good. The details, the evidence and the notes are kept.'
              : 'The case comes back into the queue as an investigation.'
        }
        confirmLabel={
          dialog === 'resolve' ? 'Resolve the report' : dialog === 'dismiss' ? 'Dismiss the report' : 'Reopen the investigation'
        }
        reasonLabel={dialog === 'resolve' ? 'What was the outcome?' : 'Why?'}
        reason={reason}
        onReasonChange={setReason}
        onCancel={closeDialog}
        busy={busy}
        error={error}
        destructive={false}
        onConfirm={() => {
          if (!dialog) return;
          if (reason.trim().length < 5) {
            setError('Write a reason of at least 5 characters. It is written into the journal of the case.');
            return;
          }
          void runAction(dialog, reason);
        }}
      />
    </div>
  );
}
