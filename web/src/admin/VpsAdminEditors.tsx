import { useState } from 'react';
import { get, post } from '../lib/api';
import { memLabel } from '../lib/pricing';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { EmptyState, ErrorState, LoadingBlock, PrimaryButton, Select, SoftButton, TextArea, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, useAdminSession } from './Overview';

interface AdminVps { id: string; name: string; status: string; plan: { slug: string; name: string }; ram: number; cpu: number; disk: number; owner: { id: string; email: string } }
interface PlanQuote {
  currency: string;
  from: { name: string; amount: number; ram: number; cpu: number; disk: number };
  to: { name: string; amount: number; ram: number; cpu: number; disk: number };
  delta: number; billedNow: number | null; blocked: string | null; takesEffect: string;
}
const money = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency}`;
const BACK_TO = '/admin/vps';

function useServer(id: string) {
  const state = useAsync<{ servers: AdminVps[] }>((signal) => get<{ servers: AdminVps[] }>('/admin/vps', undefined, signal), []);
  return { state, server: state.data?.servers.find((entry) => entry.id === id) };
}

function Summary({ server }: { server: AdminVps }) {
  return (
    <p className="rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2">
      <strong className="text-ink">{server.name}</strong> · {server.plan.name} · {server.cpu} vCPU · {memLabel(server.ram)} · {server.disk} GB · {server.owner.email}
    </p>
  );
}

/** Move a server to another plan. The price changes from the next renewal; the quote is read from the server first. */
export function VpsPlanChange() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'pricing.write');
  const { state, server } = useServer(id);
  const plans = useAsync<{ plans: { slug: string; name: string; cpu: number; ram: number; disk: number }[] }>((signal) => get('/vps/plans', undefined, signal), []);
  const [slug, setSlug] = useState('');
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const dirty = !done && slug !== '';
  useUnsavedChangesGuard(dirty, 'Discard this plan change?');
  const options = (plans.data?.plans ?? []).filter((plan) => server && plan.slug !== server.plan.slug && plan.disk >= server.disk);
  const choose = (value: string) => {
    setSlug(value);
    setQuote(null);
    setQuoteError(null);
    if (!value) return;
    get<{ quote: PlanQuote }>(`/admin/vps/${encodeURIComponent(id)}/plan-quote`, { slug: value }).then((result) => setQuote(result.quote), (failure: Error) => setQuoteError(failure.message));
  };
  const apply = useAction(async () => post(`/admin/vps/${encodeURIComponent(id)}/plan`, { slug, expectedAmount: quote!.to.amount }));
  const ready = mayWrite && Boolean(quote) && !quote!.blocked && !apply.pending;
  const submit = async () => {
    if (!(await apply.run())) return;
    setDone(true);
    toast.push('The plan and the subscription were changed. Restart the server to use the new processor and memory.', 'ok');
    navigate(BACK_TO, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this plan change?')) navigate(BACK_TO);
  };
  return (
    <PageEditorShell eyebrow="Servers" title="Change plan" description="The plan and the subscription change together, from the next renewal." backTo={BACK_TO} backLabel="Back to servers" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={apply.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!ready}>{apply.pending ? 'Changing…' : 'Change plan and price'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the server" />
        : state.error ? <ErrorState title="The server could not be loaded" message={state.error.message} onRetry={state.reload} />
        : !server ? <EmptyState title="Server not found." description="It may have been deleted." />
        : (
          <div className="grid gap-4">
            <Summary server={server} />
            <Select label="New plan" value={slug} onChange={(event) => choose(event.target.value)} disabled={!mayWrite}>
              <option value="">Pick a plan…</option>
              {options.map((plan) => <option key={plan.slug} value={plan.slug}>{plan.name} · {plan.cpu} vCPU · {memLabel(plan.ram)} · {plan.disk} GB</option>)}
            </Select>
            {quote && (
              <p role="status" className="rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink">
                {quote.blocked ?? `${money(quote.from.amount, quote.currency)} → ${money(quote.to.amount, quote.currency)} a month (${quote.delta >= 0 ? '+' : ''}${money(quote.delta, quote.currency)}), from the next renewal.`}
              </p>
            )}
            {quoteError && <p role="alert" className="text-[13.5px] font-medium text-bad">{quoteError}</p>}
            {!mayWrite && <p className="text-[13px] text-ink3">Your role does not hold &quot;pricing.write&quot;.</p>}
            {apply.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{apply.error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}

/** The administrative adjustment: resources without a change of the bill. A reason and an explicit statement that it is free. */
export function VpsResourcesEdit() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'pricing.write');
  const { state, server } = useServer(id);
  const [ram, setRam] = useState<string | null>(null);
  const [cpu, setCpu] = useState<string | null>(null);
  const [disk, setDisk] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [free, setFree] = useState(false);
  const [done, setDone] = useState(false);
  const values = { ram: ram ?? String(server?.ram ?? ''), cpu: cpu ?? String(server?.cpu ?? ''), disk: disk ?? String(server?.disk ?? '') };
  const changed = Boolean(server) && (Number(values.ram) !== server!.ram || Number(values.cpu) !== server!.cpu || Number(values.disk) !== server!.disk);
  const dirty = !done && (changed || reason !== '' || free);
  useUnsavedChangesGuard(dirty, 'Discard this adjustment?');
  const validNumbers = Number(values.ram) >= 256 && Number(values.cpu) >= 1 && Number(values.disk) >= (server?.disk ?? 1);
  const send = useAction(async () => post(`/admin/vps/${encodeURIComponent(id)}/resources`, { ram: Number(values.ram), cpu: Number(values.cpu), disk: Number(values.disk), reason, freeOverride: true }));
  const ready = mayWrite && changed && validNumbers && free && reason.trim().length >= 10 && !send.pending;
  const submit = async () => {
    if (!(await send.run())) return;
    setDone(true);
    toast.push('The resources were adjusted. The bill was not changed. Restart the server to use the new processor and memory.', 'ok');
    navigate(BACK_TO, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this adjustment?')) navigate(BACK_TO);
  };
  return (
    <PageEditorShell eyebrow="Servers" title="Adjust resources" description="This changes the size of the server and not the bill. The customer is never charged for it, and the reason is kept on the server." backTo={BACK_TO} backLabel="Back to servers" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!ready}>{send.pending ? 'Applying…' : 'Apply the adjustment'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the server" />
        : state.error ? <ErrorState title="The server could not be loaded" message={state.error.message} onRetry={state.reload} />
        : !server ? <EmptyState title="Server not found." description="It may have been deleted." />
        : (
          <div className="grid gap-4">
            <Summary server={server} />
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput label="Memory in MB" type="number" min={256} value={values.ram} onChange={(event) => setRam(event.target.value)} disabled={!mayWrite} />
              <TextInput label="vCPU" type="number" min={1} value={values.cpu} onChange={(event) => setCpu(event.target.value)} disabled={!mayWrite} />
              <TextInput label="Disk in GB" type="number" min={server.disk} value={values.disk} onChange={(event) => setDisk(event.target.value)} disabled={!mayWrite} hint="The disk cannot shrink." />
            </div>
            <TextArea label="Reason (at least 10 characters)" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} disabled={!mayWrite} />
            <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-3.5 text-[13.5px] text-ink2">
              <input type="checkbox" checked={free} onChange={(event) => setFree(event.target.checked)} disabled={!mayWrite} className="mt-0.5 size-5 accent-[var(--color-acc)]" />
              <span><strong className="block text-ink">I understand this is free</strong>The price does not change.</span>
            </label>
            {!mayWrite && <p className="text-[13px] text-ink3">Your role does not hold &quot;pricing.write&quot;.</p>}
            {send.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{send.error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}
