import { useAsync } from '../../lib/useAsync';
import { listActivity, listEvents } from '../../lib/instance-api';
import { EmptyState, ListRow, LoadingBlock, Panel } from '../../ui-app';
import { ApiErrorState, fmtDateTime, type TabProps } from './common';

/**
 * The activity of the instance.
 *
 * Two lists are shown side by side: the events Blipmade wrote about the
 * instance and the activity the panel recorded on the server. Both are read
 * from the API of Blipmade, which uses the key of the customer.
 */

export default function ActivityTab({ instance }: TabProps) {
  const activity = useAsync((signal) => listActivity(instance.id, signal), [instance.id]);
  const events = useAsync((signal) => listEvents(instance.id, signal), [instance.id]);

  const panelRows = activity.data?.activity ?? [];
  const blipmadeRows = events.data?.events ?? [];

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="The instance in Blipmade" description="What the platform did with this instance.">
        {events.loading ? (
          <LoadingBlock rows={3} label="Loading the events" />
        ) : events.error ? (
          <ApiErrorState error={events.error} onRetry={events.reload} title="We could not load the events" />
        ) : blipmadeRows.length === 0 ? (
          <EmptyState title="Nothing happened yet." description="Every step of the instance is written here." />
        ) : (
          <div className="grid gap-1.5">
            {blipmadeRows.map((event) => (
              <ListRow
                key={event.id}
                title={<span className="break-words">{event.type}</span>}
                meta={<span className="break-words">{event.message}</span>}
                right={
                  <span className="whitespace-nowrap font-mono text-[12px] text-ink3">{fmtDateTime(event.createdAt)}</span>
                }
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="The server on the panel" description="What the panel recorded on the server of the instance.">
        {activity.loading ? (
          <LoadingBlock rows={3} label="Loading the activity" />
        ) : activity.error ? (
          <ApiErrorState error={activity.error} onRetry={activity.reload} title="We could not load the activity" />
        ) : panelRows.length === 0 ? (
          <EmptyState
            title="No activity recorded."
            description="The panel writes here every time somebody changes the server or the files of it."
          />
        ) : (
          <div className="grid gap-1.5">
            {panelRows.map((row, index) => (
              <ListRow
                key={`${row.action}-${row.createdAt}-${index}`}
                title={<span className="break-words">{row.action}</span>}
                meta={<span className="break-words">{row.user ?? 'the panel'}</span>}
                right={
                  <span className="whitespace-nowrap font-mono text-[12px] text-ink3">{fmtDateTime(row.createdAt)}</span>
                }
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
