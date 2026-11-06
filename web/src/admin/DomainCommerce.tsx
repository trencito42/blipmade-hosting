import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ErrorState, LoadingBlock, Panel } from '../ui-app';

interface Order { id: string; domain: string; action: string; state: string; amount: number | null }

export default function DomainCommerce() {
  const state = useAsync<{ selling: boolean; enabled: boolean; provider: string; orders: Order[] }>(
    (signal) => get('/admin/domains/commerce', undefined, signal),
    [],
  );
  const saas = useAsync<{ enabled: boolean; adapter: string; hostnames: { hostname: string; state: string }[] }>(
    (signal) => get('/admin/domains/saas', undefined, signal),
    [],
  );
  return (
    <div className="grid gap-4">
      <Panel title="Registrar" description="Sandbox lifecycle only. No real registrations until a reseller is approved.">
        {state.loading && !state.data ? <LoadingBlock rows={2} label="Loading registrar" />
          : state.error ? <ErrorState title="Registrar status could not be loaded" message={state.error.message} onRetry={state.reload} />
          : (
            <>
              <p className="text-[13.5px] text-ink2">{state.data?.provider}. Selling: {state.data?.selling ? 'on' : 'off'}. Flag: {state.data?.enabled ? 'on' : 'off'}.</p>
              <ul className="mt-3 grid gap-1 font-mono text-[12.5px] text-ink2">
                {(state.data?.orders ?? []).map((order) => (
                  <li key={order.id}>{order.domain} · {order.action} · {order.state}</li>
                ))}
                {(state.data?.orders ?? []).length === 0 && <li className="font-sans text-ink3">No sandbox orders.</li>}
              </ul>
            </>
          )}
      </Panel>
      <Panel title="Cloudflare for SaaS" description="Caddy custom hostnames stay the production path while this flag is off.">
        {saas.loading && !saas.data ? <LoadingBlock rows={2} label="Loading SaaS" />
          : (
            <>
              <p className="text-[13.5px] text-ink2">Enabled: {saas.data?.enabled ? 'yes' : 'no'}. Adapter: {saas.data?.adapter}.</p>
              <ul className="mt-3 grid gap-1 font-mono text-[12.5px] text-ink2">
                {(saas.data?.hostnames ?? []).map((row) => <li key={row.hostname}>{row.hostname} · {row.state}</li>)}
                {(saas.data?.hostnames ?? []).length === 0 && <li className="font-sans text-ink3">No SaaS hostnames recorded.</li>}
              </ul>
            </>
          )}
      </Panel>
    </div>
  );
}
