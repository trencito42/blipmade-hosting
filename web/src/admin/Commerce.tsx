import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ButtonLink, EmptyState, ErrorState, LoadingBlock, Money, Panel } from '../ui-app';

/**
 * The add-ons of the catalogue and the history of the prices.
 *
 * An add-on is priced when it is picked: a change of its amount reaches new orders, and the orders
 * and subscriptions that exist keep the amount they were sold at. An add-on is retired, never deleted.
 */

interface Option { id: string; code: string; name: string; description: string | null; amount: number; currency: string; recurring: boolean; active: boolean; product: { slug: string; name: string } | null }
interface Entry { id: string; action: string; actorEmail: string | null; targetType: string | null; meta: any; createdAt: string }

export function AddonsPanel({ mayWrite }: { mayWrite: boolean }) {
  const state = useAsync<{ options: Option[]; note: string }>((signal) => get('/admin/options', undefined, signal), []);
  return (
    <Panel title="Add-ons" description={state.data?.note ?? 'Extras a customer picks at the order, such as a dedicated IPv4 address.'} action={mayWrite ? <ButtonLink to="/admin/pricing/addons/new" variant="soft">New add-on</ButtonLink> : undefined}>
      {state.loading ? <LoadingBlock rows={2} label="Loading the add-ons" /> : state.error ? <ErrorState title="The add-ons could not be loaded" message={state.error.message} onRetry={state.reload} /> : !state.data || state.data.options.length === 0 ? <EmptyState title="No add-on yet." description="Create one to offer an extra at the order." /> : (
        <ul className="divide-y divide-line">
          {state.data.options.map((option) => (
            <li key={option.id} className="flex flex-wrap items-center gap-3 py-3 text-[13px]">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{option.name} {!option.active && <span className="font-normal text-ink3">(retired)</span>}</span>
                <span className="block font-mono text-[12px] text-ink3">{option.code}{option.product ? ` · ${option.product.slug}` : ' · all products'}{option.recurring ? ' · every month' : ' · once'}</span>
              </span>
              <Money amount={option.amount} currency={option.currency} />
              <ButtonLink to={`/admin/pricing/addons/${encodeURIComponent(option.id)}/edit`} variant="soft">{mayWrite ? 'Edit' : 'View'}</ButtonLink>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const show = (value: unknown) => (value === null || value === undefined ? 'none' : typeof value === 'object' ? JSON.stringify(value) : String(value));

export function PriceHistoryPanel() {
  const state = useAsync<{ history: Entry[] }>((signal) => get('/admin/pricing/history', undefined, signal), []);
  return (
    <Panel title="History of the prices" description="Every change of a price, an add-on or the rate card, with the values before and after.">
      {state.loading ? <LoadingBlock rows={2} label="Loading the history" /> : state.error ? <ErrorState title="The history could not be loaded" message={state.error.message} onRetry={state.reload} /> : !state.data?.history.length ? <EmptyState title="No change was recorded." description="The first change will appear here." /> : (
        <ul className="grid gap-1.5 text-[12.5px] text-ink2">
          {state.data.history.map((entry) => (
            <li key={entry.id} className="break-words">
              <span className="text-ink3">{new Date(entry.createdAt).toLocaleString()}</span> · {entry.actorEmail ?? 'the platform'} · <span className="font-mono">{entry.action}</span>
              {entry.meta?.before && entry.meta?.after && <> · {show(entry.meta.before)} → {show(entry.meta.after)}</>}
              {Array.isArray(entry.meta?.changes) && <> · {entry.meta.changes.map((change: any) => `${change.field}: ${show(change.from)} → ${show(change.to)}`).join(', ')}</>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * The reduction of a yearly term. Zero means none. It applies to the resources of a game server and
 * not to the add-ons, to a monthly term or to a plan of mail, and it reaches new orders: a service
 * that exists keeps its price until the prices are reconciled on the tools page, which has a dry run.
 */
export function YearlyDiscountPanel({ mayWrite }: { mayWrite: boolean }) {
  const state = useAsync<{ settings: Record<string, { value?: number } | undefined> }>((signal) => get('/admin/settings', undefined, signal), []);
  const current = state.data?.settings['pricing.yearly_discount_percent']?.value ?? 0;
  return (
    <Panel title="Yearly discount" description="Percent off the resources of a game server when a customer pays for a year. 0 means no discount. New orders only." action={<ButtonLink to="/admin/pricing/discounts/edit" variant="soft">{mayWrite ? 'Edit' : 'View'}</ButtonLink>}>
      {state.loading ? <LoadingBlock rows={1} label="Loading the discount" /> : state.error ? <ErrorState title="The discount could not be read" message={state.error.message} onRetry={state.reload} /> : (
        <p className="text-[14px] text-ink">{current === 0 ? 'No discount.' : `${current}% off the resources of a yearly term.`}</p>
      )}
    </Panel>
  );
}
