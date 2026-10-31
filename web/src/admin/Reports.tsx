import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { LineChart } from '../app/LineChart';
import { EmptyState, ErrorState, LoadingBlock, Money, Panel, StatTile } from '../ui-app';

interface Report {
  generatedAt: string;
  months: string[];
  mrr: Record<string, number>;
  customers: number;
  activeSubscriptions: number;
  pastDue: number;
  revenue: { currency: string; series: number[] }[];
  signups: number[];
  cancellations: number[];
  byProduct: { name: string; currency: string; total: number; orders: number }[];
  topCustomers: { email: string; currency: string; total: number }[];
}

/** Reports from the tables of the platform: recurring revenue, income, customers, cancellations and what sells. Currencies are never added together. */
export default function Reports() {
  const state = useAsync<Report>((signal) => get<Report>('/admin/reports', { months: 12 }, signal), []);
  if (state.loading && !state.data) return <LoadingBlock rows={4} label="Loading the reports" />;
  if (state.error || !state.data) return <ErrorState title="The reports could not be loaded" message={state.error?.message ?? 'Try again.'} onRetry={state.reload} />;
  const r = state.data;
  const at = (month: string) => Math.floor(new Date(`${month}-01T00:00:00Z`).getTime() / 1000);
  const mrrEntries = Object.entries(r.mrr);
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon="card" label="Monthly recurring revenue" value={mrrEntries.length === 0 ? '—' : <span className="grid gap-1 text-[20px]">{mrrEntries.map(([currency, amount]) => <Money key={currency} amount={amount} currency={currency} />)}</span>} hint="Renewing subscriptions, per month" />
        <StatTile icon="box" label="Active subscriptions" value={r.activeSubscriptions} hint={r.pastDue ? `${r.pastDue} past due` : 'None past due'} />
        <StatTile icon="user" label="Customers" value={r.customers} />
        <StatTile icon="doc" label="Cancellations, 12 months" value={r.cancellations.reduce((sum, n) => sum + n, 0)} hint="Subscriptions ended" />
      </section>

      <Panel title="Income" description="What was paid, by month (paid invoices).">
        {r.revenue.length === 0 ? (
          <EmptyState title="No payment yet" description="Paid invoices appear here by month." />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {r.revenue.map((entry) => (
              <div key={entry.currency}>
                <p className="mb-1 text-[13px] font-medium text-ink">{entry.currency}</p>
                <LineChart label={`Income in ${entry.currency} by month`} points={entry.series.map((v, i) => ({ t: at(r.months[i]!), v }))} format={(v) => `${(v / 100).toFixed(0)}`} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="New customers" description="Accounts made, by month.">
          <LineChart label="New customers by month" points={r.signups.map((v, i) => ({ t: at(r.months[i]!), v }))} format={(v) => String(Math.round(v))} />
        </Panel>
        <Panel title="Cancellations" description="Subscriptions that ended, by month.">
          <LineChart label="Cancellations by month" points={r.cancellations.map((v, i) => ({ t: at(r.months[i]!), v }))} format={(v) => String(Math.round(v))} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="What sells" description="Income by product over 12 months (paid and delivered orders).">
          {r.byProduct.length === 0 ? <p className="text-[14px] text-ink2">No order yet.</p> : (
            <ul className="grid gap-1.5">
              {r.byProduct.map((row) => (
                <li key={`${row.name}-${row.currency}`} className="flex items-center justify-between gap-3 rounded-2xl bg-s2 px-4 py-2.5">
                  <span className="min-w-0 truncate text-[14px] text-ink">{row.name} <span className="text-ink3">· {row.orders} order{row.orders === 1 ? '' : 's'}</span></span>
                  <span className="font-mono text-[13.5px] font-semibold text-ink"><Money amount={row.total} currency={row.currency} /></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Top customers" description="By amount paid over 12 months.">
          {r.topCustomers.length === 0 ? <p className="text-[14px] text-ink2">No payment yet.</p> : (
            <ul className="grid gap-1.5">
              {r.topCustomers.map((row) => (
                <li key={`${row.email}-${row.currency}`} className="flex items-center justify-between gap-3 rounded-2xl bg-s2 px-4 py-2.5">
                  <span className="min-w-0 truncate font-mono text-[13px] text-ink">{row.email}</span>
                  <span className="font-mono text-[13.5px] font-semibold text-ink"><Money amount={row.total} currency={row.currency} /></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <p className="text-[12.5px] text-ink3">Calculated {new Date(r.generatedAt).toLocaleString()} from the invoices, subscriptions, orders and accounts of the platform.</p>
    </div>
  );
}
