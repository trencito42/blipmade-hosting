import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { del, get, post, relativeTime } from '../lib/api';
import { useAction, useAsync, type AsyncState } from '../lib/useAsync';
import {
  CardList,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  LoadingBlock,
  Panel,
  StatTile,
  StatusPill,
  useToast,
} from '../ui-app';
import {
  ConfirmWithReason,
  DASH,
  LiveRegion,
  can,
  denseDanger,
  denseGhost,
  denseInput,
  densePrimary,
  denseSoft,
  fmtDateTime,
  useAdminSession,
} from './Overview';

/**
 * Operations health — GET /api/ops/health, GET /api/ops/alerts,
 * GET /api/ops/channels, POST /api/ops/checks/:id/ack,
 * POST /api/ops/incident, DELETE /api/ops/incident.
 *
 * The page answers one question: is the platform itself healthy? It reads the
 * sweep of the host, the alerts the sweep sent and the channels those alerts
 * can leave the host by, and it lets the operator say that a check is known
 * and that an incident is open.
 *
 * The API of the operations is written in parallel with this page, so the page
 * is written to survive its absence: a missing endpoint is a readable error
 * and not a blank screen.
 *
 * Every number on the page comes from the API. The page never decides that a
 * check is fine: it only paints what the sweep says.
 */

/** The state of a check, of the whole sweep or of a channel. */
export type OpsState = 'ok' | 'warning' | 'critical';

/** The state of a channel: a channel can also be switched off. */
export type OpsChannelState = OpsState | 'off';

/** One check of the sweep. */
export interface OpsCheck {
  id: string;
  title: string;
  state: OpsState;
  /** One short sentence for the operator. */
  summary: string;
  /** The numbers behind the sentence. It may be empty. */
  detail: string;
  checkedAt: string;
  durationMs: number;
  /** The moment the check entered this state. Null when it is not known. */
  since: string | null;
  /** How many alerts this check has sent. */
  alerts: number;
}

/** The health of the platform, as the API sends it. */
export interface OpsHealth {
  overall: OpsState;
  checkedAt: string;
  summary: { total: number; ok: number; warning: number; critical: number };
  checks: OpsCheck[];
}

/** One alert the sweep sent. */
export interface OpsAlert {
  at: string;
  check: string;
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
  channels: { journal: boolean; webhook: 'sent' | 'skipped' | 'failed'; discord: 'sent' | 'skipped' | 'failed' };
}

/** The state of the alerts of one check. */
export interface OpsAlertState {
  check: string;
  status: 'ok' | 'firing';
  since: string;
  lastSentAt: string;
  sends: number;
  acknowledgedAt: string | null;
}

/** The alerts of the sweep and the state of every check that can fire. */
export interface OpsAlerts {
  alerts: OpsAlert[];
  states: OpsAlertState[];
}

/** A place an alert can leave the host by. */
export interface OpsChannel {
  id: 'journal' | 'webhook' | 'email';
  name: string;
  state: OpsChannelState;
  detail: string;
}

/** The channels the API reports. */
export interface OpsChannels {
  channels: OpsChannel[];
}

/** The page asks for at most this many alerts at a time. */
const ALERT_LIMIT = 50;

/**
 * The page watches the platform, but a watch that asks for nothing while
 * nobody looks at it. A minute is the shortest gap that keeps the numbers of
 * the operator fresh without asking the host for the same thing over and over.
 */
const REFRESH_MS = 60_000;

/** The textarea of the incident, in the dense mode of the admin area. */
const denseArea =
  'w-full scroll-mt-24 rounded-2xl bg-s2 px-4 py-3 text-[16px] leading-relaxed text-ink outline-none transition-colors duration-[180ms] placeholder:text-ink3 focus:bg-s3 lg:text-[14px]';

/**
 * The tone of the design system that carries a state of the sweep.
 *
 * The design system knows three tones: good, warning and bad. The states of
 * the sweep are named with the words of the operator, and the pill of the
 * interface paints them with the tone that belongs to them.
 */
function stateTone(state: OpsState | OpsChannelState): { status: string; label: string } {
  if (state === 'critical') return { status: 'failed', label: 'Critical' };
  if (state === 'warning') return { status: 'degraded', label: 'Warning' };
  if (state === 'off') return { status: 'stopped', label: 'Off' };
  // The pill of the interface capitalises what it shows, so the word is
  // written the way it is read and not the way the API writes it.
  return { status: 'active', label: 'Ok' };
}

/**
 * The words of a failure of the API.
 *
 * The operations API is written in parallel with this page, so an endpoint
 * that is not there yet is an expected answer and not a broken screen: the
 * operator is told what is missing instead of being shown a bare status code.
 */
export function opsFailureText(error: Error & { status?: number }): string {
  if (error.status === 404) {
    return 'The operations API is not there yet. This page is ready for it and fills itself as soon as it answers.';
  }
  return error.message;
}

/** A moment in the past, or the words that say that it is not known. */
function sinceText(value: string | null | undefined): string {
  if (!value) return DASH;
  return relativeTime(value);
}

/** The moment a check entered its state, in full. */
function sinceMoment(value: string | null | undefined): string {
  if (!value) return DASH;
  return fmtDateTime(value);
}

/** The channels that carried an alert, in words. */
function channelText(channels: OpsAlert['channels'] | undefined): string {
  const journal = channels?.journal ? 'written' : 'not written';
  const webhook = channels?.webhook ?? 'skipped';
  const discord = channels?.discord ?? 'skipped';
  return `Journal: ${journal} · Webhook: ${webhook} · Discord: ${discord}`;
}

/** The numbers behind the sentence of a check. */
function detailText(check: OpsCheck): string {
  const parts: string[] = [];
  if (check.detail) parts.push(check.detail);
  if (Number.isFinite(check.durationMs)) parts.push(`checked in ${check.durationMs} ms`);
  return parts.join(' · ');
}

/**
 * The four states of a region of the page.
 *
 * The skeleton is only drawn when there is nothing to show yet: the refresh
 * of every minute must not make the numbers of the operator blink.
 */
export function OpsRegion<T>({
  state,
  loadingLabel,
  errorTitle,
  children,
}: {
  state: AsyncState<T>;
  loadingLabel: string;
  errorTitle: string;
  children: (data: T) => ReactNode;
}) {
  if (state.loading && state.data === undefined) return <LoadingBlock rows={3} label={loadingLabel} />;
  if (state.error) {
    return <ErrorState title={errorTitle} message={opsFailureText(state.error)} onRetry={state.reload} />;
  }
  if (state.data === undefined) {
    return <EmptyState title="Nothing to show yet." description="The API has not answered yet." />;
  }
  return <>{children(state.data)}</>;
}

/** The headline: the state of the platform, when the sweep ran and the counts. */
export function OpsHeadline({ health }: { health: OpsHealth }) {
  const tone = stateTone(health.overall);
  const summary = health.summary;

  return (
    <div className="grid gap-3">
      <section aria-label="The state of the platform" className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-s2 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Overall</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusPill status={tone.status} label={tone.label} />
            <span className="text-[13.5px] text-ink2">
              {health.overall === 'ok'
                ? 'Every check of the sweep passes.'
                : health.overall === 'warning'
                  ? 'Some checks of the sweep need a look.'
                  : 'Some checks of the sweep are broken.'}
            </span>
          </p>
          <p className="mt-1 text-[12.5px] text-ink3">{summary.total} checks in the sweep.</p>
        </div>
        <div className="rounded-2xl bg-s2 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Last sweep</p>
          <p className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-ink">{sinceMoment(health.checkedAt)}</p>
          <p className="mt-0.5 text-[12.5px] text-ink3">{sinceText(health.checkedAt)}</p>
        </div>
      </section>

      <section aria-label="The counts of the sweep" className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Ok" value={summary.ok} hint="checks that pass." />
        <StatTile label="Warning" value={summary.warning} hint="checks that need a look." />
        <StatTile label="Critical" value={summary.critical} hint="checks that are broken." />
      </section>
    </div>
  );
}

/** The checks of the sweep, with the state of each one and its sentence. */
export function OpsChecks({
  checks,
  states,
  mayAcknowledge,
  onAcknowledge,
}: {
  checks: OpsCheck[];
  states: OpsAlertState[];
  mayAcknowledge: boolean;
  onAcknowledge: (check: OpsCheck) => void;
}) {
  if (!checks.length) {
    return <EmptyState title="No checks." description="The sweep did not report a single check." />;
  }

  /** The alert state of a check, when the API knows one. */
  const stateOf = (check: OpsCheck) => states.find((entry) => entry.check === check.id) ?? null;

  return (
    <div className="grid gap-3">
      <DataTable<OpsCheck>
        rows={checks}
        rowKey={(check) => check.id}
        minWidth="820px"
        columns={[
          {
            key: 'check',
            header: 'Check',
            truncate: true,
            render: (check: OpsCheck) => (
              <span className="block min-w-0">
                <span className="block truncate font-bold tracking-[-0.02em] text-ink" title={check.title}>
                  {check.title}
                </span>
                <span className="block truncate font-mono text-[12.5px] text-ink3" title={check.id}>
                  {check.id}
                </span>
              </span>
            ),
          },
          {
            key: 'state',
            header: 'State',
            nowrap: true,
            render: (check: OpsCheck) => {
              const tone = stateTone(check.state);
              return (
                <span className="block">
                  <StatusPill status={tone.status} label={tone.label} />
                  {check.alerts > 0 && (
                    <span className="mt-1 block font-mono text-[12px] text-ink3">
                      {check.alerts} alert{check.alerts === 1 ? '' : 's'}
                    </span>
                  )}
                </span>
              );
            },
          },
          {
            key: 'summary',
            header: 'What the sweep says',
            render: (check: OpsCheck) => (
              <span className="block min-w-0">
                <span className="block break-words text-[14px] text-ink">{check.summary}</span>
                {detailText(check) && (
                  <span className="mt-0.5 block break-words font-mono text-[12.5px] text-ink3">{detailText(check)}</span>
                )}
              </span>
            ),
          },
          {
            key: 'since',
            header: 'In this state since',
            nowrap: true,
            render: (check: OpsCheck) => (
              <span className="block font-mono text-[12.5px] text-ink2">
                {sinceMoment(check.since)}
                <span className="block text-ink3">{sinceText(check.since)}</span>
              </span>
            ),
          },
          {
            key: 'action',
            header: 'Action',
            render: (check: OpsCheck) => {
              const firing = stateOf(check);
              if (!firing || firing.status !== 'firing') return <span className="text-[12.5px] text-ink3">{DASH}</span>;
              if (firing.acknowledgedAt) {
                return (
                  <span className="block text-[12.5px] text-ink3">
                    Acknowledged
                    <span className="mt-0.5 block font-mono">{sinceMoment(firing.acknowledgedAt)}</span>
                  </span>
                );
              }
              if (!mayAcknowledge) return <span className="text-[12.5px] text-ink3">{DASH}</span>;
              return (
                <button type="button" onClick={() => onAcknowledge(check)} className={denseSoft}>
                  Acknowledge
                </button>
              );
            },
          },
        ]}
      />

      <CardList<OpsCheck> rows={checks} rowKey={(check) => check.id}>
        {(check) => {
          const firing = stateOf(check);
          const tone = stateTone(check.state);
          return (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink" title={check.title}>
                    {check.title}
                  </p>
                  <p className="truncate font-mono text-[12.5px] text-ink3" title={check.id}>
                    {check.id}
                  </p>
                </div>
                <StatusPill status={tone.status} label={tone.label} />
              </div>
              <p className="mt-2 break-words text-[14px] text-ink">{check.summary}</p>
              {detailText(check) && <p className="mt-1 break-words font-mono text-[12.5px] text-ink3">{detailText(check)}</p>}
              <p className="mt-1.5 font-mono text-[12.5px] text-ink3">
                In this state since {sinceMoment(check.since)} · {sinceText(check.since)}
              </p>
              {firing?.status === 'firing' && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {firing.acknowledgedAt ? (
                    <span className="text-[12.5px] text-ink3">Acknowledged {sinceMoment(firing.acknowledgedAt)}</span>
                  ) : mayAcknowledge ? (
                    <button type="button" onClick={() => onAcknowledge(check)} className={denseSoft}>
                      Acknowledge
                    </button>
                  ) : null}
                  <span className="font-mono text-[12px] text-ink3">
                    {firing.sends} sent · last {sinceText(firing.lastSentAt)}
                  </span>
                </div>
              )}
            </div>
          );
        }}
      </CardList>
    </div>
  );
}

/** The alerts the sweep sent, with the channels that carried them. */
export function OpsAlertsList({ alerts }: { alerts: OpsAlert[] }) {
  if (!alerts.length) {
    return <EmptyState title="No alerts." description="Nothing has fired since the last sweep." />;
  }
  return (
    <div className="grid gap-2.5">
      {alerts.map((alert, index) => {
        const tone = stateTone(alert.severity);
        return (
          <div key={`${alert.check}-${alert.at}-${index}`} className="rounded-2xl bg-s2 p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words text-[15px] font-semibold tracking-[-0.02em] text-ink">{alert.title}</p>
                <p className="mt-0.5 font-mono text-[12.5px] text-ink3">
                  {alert.check} · {fmtDateTime(alert.at)}
                </p>
              </div>
              <StatusPill status={tone.status} label={tone.label} />
            </div>
            {alert.detail && <p className="mt-2 break-words text-[13.5px] leading-relaxed text-ink2">{alert.detail}</p>}
            <p className="mt-2 text-[12.5px] text-ink3">{channelText(alert.channels)}</p>
          </div>
        );
      })}
    </div>
  );
}

/** The channels an alert can leave the host by. */
export function OpsChannelsList({ channels }: { channels: OpsChannel[] }) {
  if (!channels.length) {
    return <EmptyState title="No channels." description="The API reported no channel that an alert can leave the host by." />;
  }
  return (
    <div className="grid gap-2.5">
      {channels.map((channel) => {
        const tone = stateTone(channel.state);
        return (
          <div key={channel.id} className="flex min-w-0 items-start justify-between gap-3 rounded-2xl bg-s2 p-3.5">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink" title={channel.name}>
                {channel.name}
              </p>
              <p className="mt-0.5 break-words text-[13px] text-ink3">{channel.detail}</p>
            </div>
            <StatusPill status={tone.status} label={tone.label} />
          </div>
        );
      })}
    </div>
  );
}


/** The events of the payment provider that failed, with a button to run each one again. */
function FailedWebhooks({ mayWrite }: { mayWrite: boolean }) {
  const toast = useToast();
  const state = useAsync<{ failed: { id: string; eventId: string; type: string; attempts: number; error: string; lastAttemptAt: string | null; createdAt: string }[] }>(
    (signal) => get('/admin/webhooks/failed', undefined, signal),
    [],
  );
  const replay = useAction(async (eventId?: string) => {
    const result = await post<{ replayed: { eventId: string; ok: boolean }[] }>('/admin/webhooks/replay', eventId ? { eventId } : {});
    const ok = result.replayed.filter((entry) => entry.ok).length;
    toast.push(`${ok} of ${result.replayed.length} event${result.replayed.length === 1 ? '' : 's'} processed.`, ok === result.replayed.length ? 'ok' : 'error');
    state.reload();
  });
  const rows = state.data?.failed ?? [];
  return (
    <Panel
      title="Payment webhooks that failed"
      description="Events of the payment provider that could not be processed. Run one again after the cause is fixed."
      action={mayWrite && rows.length > 1 ? <button type="button" className={densePrimary} disabled={replay.pending} onClick={() => void replay.run()}>Replay all</button> : undefined}
    >
      {state.loading && !state.data ? (
        <LoadingBlock rows={1} label="Loading the failed events" />
      ) : state.error ? (
        <ErrorState title="The failed events could not be loaded" message={state.error.message} onRetry={state.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing failed." description="Every event of the payment provider was processed." />
      ) : (
        <ul className="grid gap-2">
          {rows.map((event) => (
            <li key={event.id} className="grid gap-1.5 rounded-2xl bg-s2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-[14px] font-semibold text-ink">{event.type} <span className="font-mono text-[12px] font-normal text-ink3">{event.eventId}</span></p>
                <span className="text-[12.5px] text-ink3">{fmtDateTime(event.createdAt)} · {event.attempts} attempt{event.attempts === 1 ? '' : 's'}</span>
              </div>
              <p className="break-words font-mono text-[12.5px] text-bad">{event.error || 'No reason was recorded.'}</p>
              {mayWrite && (
                <div>
                  <button type="button" className={denseSoft} disabled={replay.pending} onClick={() => void replay.run(event.eventId)}>Replay</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function Ops() {
  const session = useAdminSession();
  const staff = session.staff;
  const toast = useToast();
  const mayWrite = can(staff, 'infrastructure.write');

  const health = useAsync((signal) => opsHealth(signal), []);
  const alerts = useAsync((signal) => opsAlerts(signal), []);
  const channels = useAsync((signal) => opsChannels(signal), []);

  const [acking, setAcking] = useState<OpsCheck | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [until, setUntil] = useState('');
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(() => {
    health.reload();
    alerts.reload();
    channels.reload();
  }, [health.reload, alerts.reload, channels.reload]);

  // The page watches the platform, but only while it is open: the timer stops
  // with the page, and a tab that is in the background asks for nothing.
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const ack = useAction(async (id: string, body: { note: string }) => {
    return ackOpsCheck(id, body.note);
  });

  const declare = useAction(async (body: { message: string; until: string | null }) => {
    return declareOpsIncident(body.message, body.until);
  });

  const clear = useAction(async () => {
    return clearOpsIncident();
  });

  const checks = health.data?.checks ?? [];
  const alertStates = alerts.data?.states ?? [];
  const incidentCheck = checks.find((check) => check.id === 'incident') ?? null;

  const runAck = async () => {
    if (!acking) return;
    const result = await ack.run(acking.id, { note: note.trim() });
    if (!result) return;
    toast.push(`${acking.title} acknowledged`, 'ok');
    setAcking(null);
    setNote('');
    refresh();
  };

  const runDeclare = async () => {
    const result = await declare.run({ message: message.trim(), until: toIso(until) });
    if (!result) return;
    toast.push('The incident is declared', 'ok');
    setMessage('');
    setUntil('');
    refresh();
  };

  const runClear = async () => {
    const result = await clear.run();
    if (!result) return;
    toast.push('The incident is cleared', 'ok');
    setClearing(false);
    refresh();
  };

  if (session.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={3} label="Loading your permissions" />
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="grid gap-4">
        <ErrorState title="The session could not be read" message={session.error} onRetry={session.reload} />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${checks.length} checks, ${alerts.data?.alerts.length ?? 0} alerts`} />

      <Panel
        title="Operations"
        description="The state of the platform itself: the mail server, the backups, the delivery, the webhooks and the certificates. The sweep runs on the host and this page reads what it found."
        actionBelow
        action={
          <button type="button" onClick={refresh} className={denseGhost}>
            Refresh
          </button>
        }
      >
        <OpsRegion state={health} loadingLabel="Loading the state of the platform" errorTitle="The state of the platform could not be loaded">
          {(data) => <OpsHeadline health={data} />}
        </OpsRegion>
      </Panel>

      <FailedWebhooks mayWrite={mayWrite} />

      <Panel title="Checks" description="Every check of the sweep, with its state, its sentence and the numbers behind it.">
        <OpsRegion state={health} loadingLabel="Loading the checks" errorTitle="The checks could not be loaded">
          {(data) => (
            <OpsChecks
              checks={data.checks}
              states={alertStates}
              mayAcknowledge={mayWrite}
              onAcknowledge={(check) => {
                setNote('');
                // The error of the last acknowledgement is not the error of
                // this one: the dialog opens empty.
                ack.clearError();
                setAcking(check);
              }}
            />
          )}
        </OpsRegion>
      </Panel>

      <Panel
        title="Alerts"
        description="The alerts the sweep sent, and the channels that carried them. An alert that could not leave the host is said so."
      >
        <OpsRegion state={alerts} loadingLabel="Loading the alerts" errorTitle="The alerts could not be loaded">
          {(data) => <OpsAlertsList alerts={data.alerts} />}
        </OpsRegion>
      </Panel>

      <Panel
        title="Channels"
        description="The ways an alert can leave the host. A channel that is off means the operator is not told by it."
      >
        <OpsRegion state={channels} loadingLabel="Loading the channels" errorTitle="The channels could not be loaded">
          {(data) => <OpsChannelsList channels={data.channels} />}
        </OpsRegion>
      </Panel>

      <Panel
        title="Incident"
        description="An incident says that the platform is not in its normal state. It is written down so that everybody reads the same words."
      >
        <div className="grid gap-3">
          {incidentCheck && (
            <div className="rounded-2xl bg-s2 p-3.5">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">The sweep reports</p>
              <p className="mt-1 text-[14px] text-ink">{incidentCheck.summary}</p>
              {incidentCheck.detail && <p className="mt-1 font-mono text-[12.5px] text-ink3">{incidentCheck.detail}</p>}
            </div>
          )}

          {!incidentCheck && (
            <p className="px-1 text-[13px] text-ink3">
              The sweep does not report an incident check, so the state of the incident is not known here.
            </p>
          )}

          {mayWrite ? (
            <div className="grid gap-3">
              <Field label="What is happening" htmlFor="ops-incident-message" hint="Written in the words of the operator.">
                <textarea
                  id="ops-incident-message"
                  rows={3}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="The mail server does not answer and the customers of the hosted mail cannot receive."
                  className={denseArea}
                />
              </Field>

              <Field label="Until" htmlFor="ops-incident-until" hint="Optional. Local time, sent as UTC. Empty means it has no end yet.">
                <input
                  id="ops-incident-until"
                  type="datetime-local"
                  value={until}
                  onChange={(event) => setUntil(event.target.value)}
                  className={denseInput}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={runDeclare}
                  disabled={declare.pending || message.trim() === ''}
                  className={densePrimary}
                >
                  {declare.pending ? 'Declaring…' : 'Declare an incident'}
                </button>
                <button type="button" onClick={() => setClearing(true)} disabled={clear.pending} className={denseDanger}>
                  {clear.pending ? 'Clearing…' : 'Clear the incident'}
                </button>
              </div>

              {declare.error && (
                <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
                  {declare.error}
                </p>
              )}
              {clear.error && (
                <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
                  {clear.error}
                </p>
              )}
            </div>
          ) : (
            <p className="px-1 text-[13px] text-ink3">
              Your role does not hold &quot;infrastructure.write&quot;, so an incident cannot be declared or cleared from here.
            </p>
          )}
        </div>
      </Panel>

      <ConfirmWithReason
        open={acking !== null}
        title={`Acknowledge ${acking?.title ?? ''}`}
        description={
          acking
            ? `The alert of "${acking.title}" stops being sent. The check itself stays on the screen and stays what it is.`
            : undefined
        }
        confirmLabel="Acknowledge"
        reasonLabel="Note"
        reason={note}
        onReasonChange={setNote}
        onConfirm={runAck}
        onCancel={() => setAcking(null)}
        busy={ack.pending}
        error={ack.error}
        destructive={false}
      />

      <ConfirmDialog
        open={clearing}
        title="Clear the incident"
        description="The incident is closed. The state of the platform is what the sweep says from now on."
        confirmLabel="Clear the incident"
        onConfirm={runClear}
        onCancel={() => setClearing(false)}
        busy={clear.pending}
      />

      <p className="px-1 text-[12.5px] leading-relaxed text-ink3">
        The API asks for &quot;infrastructure.read&quot; to answer this page and for &quot;infrastructure.write&quot; to acknowledge a
        check and to declare an incident. The page is read again every minute, and only while it is open.
      </p>
    </div>
  );
}

/** A local moment of the browser, as the API takes it. */
function toIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/* -------------------------------------------------------------------------- */
/* the calls of the page                                                       */
/* -------------------------------------------------------------------------- */

/** The state of the platform, as the sweep left it. */
export function opsHealth(signal?: AbortSignal) {
  return get<OpsHealth>('/ops/health', undefined, signal);
}

/** The alerts of the sweep, with the state of every check that can fire. */
export function opsAlerts(signal?: AbortSignal) {
  return get<OpsAlerts>('/ops/alerts', { limit: ALERT_LIMIT }, signal);
}

/** The channels an alert can leave the host by. */
export function opsChannels(signal?: AbortSignal) {
  return get<OpsChannels>('/ops/channels', undefined, signal);
}

/** Acknowledges a check that fires, so that the alert stops being sent. */
export function ackOpsCheck(id: string, note: string) {
  return post<{ ok: true }>(`/ops/checks/${encodeURIComponent(id)}/ack`, { note });
}

/** Declares an incident, with the words of the operator. */
export function declareOpsIncident(message: string, until: string | null) {
  return post<{ ok: true }>('/ops/incident', { message, until });
}

/** Closes the incident that is open. */
export function clearOpsIncident() {
  return del<{ ok: true }>('/ops/incident');
}
