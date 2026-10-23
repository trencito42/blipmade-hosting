import { useAsync } from '../../lib/useAsync';
import { getResources, listEvents } from '../../lib/instance-api';
import {
  EmptyState,
  ListRow,
  LoadingBlock,
  Panel,
  StatTile,
} from '../../ui-app';
import {
  ApiErrorState,
  ButtonRow,
  Detail,
  fmtBytes,
  fmtDateTime,
  fmtRam,
  fmtUptime,
  type TabProps,
} from './common';

/**
 * Overview. The state of the instance, the live numbers of the panel and
 * the limits the customer bought, next to each other.
 */

export default function OverviewTab({ instance, onGoTo }: TabProps) {
  const resources = useAsync((signal) => getResources(instance.id, signal), [instance.id]);
  const events = useAsync((signal) => listEvents(instance.id, signal), [instance.id]);

  const sample = resources.data;
  const recent = events.data?.events ?? [];

  const memoryLimitBytes = instance.ram * 1024 * 1024;
  const diskLimitBytes = instance.disk * 1024 * 1024 * 1024;

  const memoryRatio =
    sample?.memoryBytes === null || sample?.memoryBytes === undefined
      ? null
      : Math.min(100, Math.max(0, (sample.memoryBytes / memoryLimitBytes) * 100));
  const diskRatio =
    sample?.diskBytes === null || sample?.diskBytes === undefined
      ? null
      : Math.min(100, Math.max(0, (sample.diskBytes / diskLimitBytes) * 100));

  return (
    <div className="grid gap-3">
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Memory"
          value={sample ? fmtBytes(sample.memoryBytes) : '—'}
          hint={sample ? `of ${fmtRam(instance.ram)}` : 'Waiting for the panel'}
        />
        <StatTile
          label="Disk"
          value={sample ? fmtBytes(sample.diskBytes) : '—'}
          hint={sample ? `of ${instance.disk} GB` : 'Waiting for the panel'}
        />
        <StatTile
          label="Processor"
          value={sample && sample.cpuPercent !== null ? `${Math.round(sample.cpuPercent)}%` : '—'}
          hint={sample ? `of ${instance.cpu} vCPU` : 'Waiting for the panel'}
        />
        <StatTile
          label="Uptime"
          value={sample ? fmtUptime(sample.uptimeMs) : '—'}
          hint={sample?.state ? `Container: ${sample.state}` : 'Waiting for the panel'}
        />
      </div>

      <Panel title="Allocated resources" description="What the instance may use, against what it uses right now.">
        {resources.loading ? (
          <LoadingBlock rows={2} label="Loading the resources" />
        ) : resources.error ? (
          <ApiErrorState error={resources.error} onRetry={resources.reload} title="We could not read the resources" />
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-bold text-ink">Memory</span>
                <span className="font-mono text-[13px] tabular-nums text-ink2">
                  {sample?.memoryBytes === null || sample?.memoryBytes === undefined
                    ? '—'
                    : fmtBytes(sample.memoryBytes)}{' '}
                  <span className="text-ink3">of {fmtRam(instance.ram)}</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-s3">
                <div className="h-full rounded-full bg-acc" style={{ width: `${memoryRatio ?? 0}%` }} />
              </div>
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-bold text-ink">Disk</span>
                <span className="font-mono text-[13px] tabular-nums text-ink2">
                  {sample?.diskBytes === null || sample?.diskBytes === undefined ? '—' : fmtBytes(sample.diskBytes)}{' '}
                  <span className="text-ink3">of {instance.disk} GB</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-s3">
                <div className="h-full rounded-full bg-acc" style={{ width: `${diskRatio ?? 0}%` }} />
              </div>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="Processor" mono>
                {instance.cpu} vCPU
              </Detail>
              <Detail label="Container state" mono>
                {sample?.state || 'unknown'}
              </Detail>
            </dl>
          </div>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Network" description="Traffic counted by the panel since the instance started.">
          {resources.loading ? (
            <LoadingBlock rows={2} label="Loading the network" />
          ) : resources.error ? (
            <ApiErrorState error={resources.error} onRetry={resources.reload} title="We could not read the network" />
          ) : sample ? (
            <dl className="grid gap-3">
              <Detail label="Received" mono>
                {fmtBytes(sample.networkRx)}
              </Detail>
              <Detail label="Sent" mono>
                {fmtBytes(sample.networkTx)}
              </Detail>
              <Detail label="Container state" mono>
                {sample.state || 'unknown'}
              </Detail>
            </dl>
          ) : (
            <EmptyState title="No traffic yet." description="The panel has not reported any traffic for this instance." />
          )}
        </Panel>

        <Panel title="Recent activity" description="The last events of this instance.">
          {events.loading ? (
            <LoadingBlock rows={3} label="Loading the events" />
          ) : events.error ? (
            <ApiErrorState error={events.error} onRetry={events.reload} title="We could not load the activity" />
          ) : recent.length === 0 ? (
            <EmptyState title="Nothing happened yet." description="Events appear here as soon as the instance does something." />
          ) : (
            <div className="grid gap-1.5">
              {recent.slice(0, 6).map((event, index) => (
                <ListRow
                  key={`${event.type}-${event.createdAt}-${index}`}
                  title={<span className="break-words" title={event.type}>{event.type}</span>}
                  meta={<span className="break-words" title={event.message}>{event.message}</span>}
                  right={<span className="whitespace-nowrap font-mono text-[12px] text-ink3">{fmtDateTime(event.createdAt)}</span>}
                />
              ))}
              <div className="pt-1">
                <ButtonRow>
                  <button
                    type="button"
                    onClick={() => onGoTo?.('activity')}
                    className="h-11 rounded-full bg-s3 px-4 text-[13.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    See the full activity
                  </button>
                </ButtonRow>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
