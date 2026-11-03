import { useState } from 'react';
import { api, get, post, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { EmptyState, ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, useAdminSession } from './Overview';

const BACK_TO = '/admin/pricing';
interface Option { id: string; code: string; name: string; amount: number; currency: string; recurring: boolean; active: boolean }

function useDone(dirtyNow: boolean, question: string) {
  const { navigate } = useRouter();
  const [done, setDone] = useState(false);
  const dirty = !done && dirtyNow;
  useUnsavedChangesGuard(dirty, question);
  return {
    dirty,
    discard: () => { if (!dirty || window.confirm(question)) navigate(BACK_TO); },
    finish: () => { setDone(true); navigate(BACK_TO, { replace: true }); },
  };
}

const Err = ({ message }: { message: string | null | undefined }) => (message ? <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{message}</p> : null);

/** A new add-on. The code never changes after this. */
export function AddonNew() {
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'pricing.write');
  const [draft, setDraft] = useState({ code: '', name: '', amount: '' });
  const { dirty, discard, finish } = useDone(draft.code !== '' || draft.name !== '' || draft.amount !== '', 'Discard this add-on?');
  const send = useAction(async () => post('/admin/options', { code: draft.code.trim(), name: draft.name.trim(), amount: Number(draft.amount) }));
  const ok = mayWrite && /^[a-z0-9-]{2,}$/.test(draft.code.trim()) && draft.name.trim().length >= 2 && /^\d+$/.test(draft.amount.trim()) && !send.pending;
  const submit = async () => {
    if (!(await send.run())) return;
    toast.push('The add-on was created.', 'ok');
    finish();
  };
  return (
    <PageEditorShell eyebrow="Pricing" title="New add-on" description="Extras a customer picks at the order, such as a dedicated IPv4 address." backTo={BACK_TO} backLabel="Back to pricing" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!ok}>{send.pending ? 'Creating…' : 'Create the add-on'}</PrimaryButton></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextInput label="Code" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} hint="Lowercase and dashes. It never changes." disabled={!mayWrite} autoComplete="off" />
        <TextInput label="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={!mayWrite} />
        <TextInput label="Amount (cents)" type="number" min={0} value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} disabled={!mayWrite} />
        <div className="sm:col-span-3"><Err message={send.error} /></div>
      </div>
    </PageEditorShell>
  );
}

/** The amount of an add-on, and whether it is on sale. A change reaches new orders; existing orders keep the amount they were sold at. */
export function AddonEdit() {
  const { id = '' } = useParams();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'pricing.write');
  const state = useAsync<{ options: Option[] }>((signal) => get('/admin/options', undefined, signal), []);
  const option = state.data?.options.find((entry) => entry.id === id);
  const [amount, setAmount] = useState<string | null>(null);
  const [active, setActive] = useState<boolean | null>(null);
  const shownAmount = amount ?? String(option?.amount ?? '');
  const shownActive = active ?? option?.active ?? true;
  const changed = Boolean(option) && (Number(shownAmount) !== option!.amount || shownActive !== option!.active);
  const { dirty, discard, finish } = useDone(changed, 'Discard the changes to this add-on?');
  const send = useAction(async () => api(`/admin/options/${encodeURIComponent(id)}`, { method: 'PATCH', body: { ...(Number(shownAmount) !== option!.amount ? { amount: Number(shownAmount) } : {}), ...(shownActive !== option!.active ? { active: shownActive } : {}) } }));
  const ok = mayWrite && changed && /^\d+$/.test(shownAmount.trim()) && !send.pending;
  const submit = async () => {
    if (!(await send.run())) return;
    toast.push('The add-on was saved.', 'ok');
    finish();
  };
  return (
    <PageEditorShell eyebrow="Pricing" title={option ? option.name : 'Add-on'} description="A change reaches new orders. The orders and subscriptions that exist keep the amount they were sold at. An add-on is retired, never deleted." backTo={BACK_TO} backLabel="Back to pricing" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!ok}>{send.pending ? 'Saving…' : 'Save the add-on'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={2} label="Loading the add-on" />
        : state.error ? <ErrorState title="The add-ons could not be loaded" message={state.error.message} onRetry={state.reload} />
        : !option ? <EmptyState title="Add-on not found." description="It may have been removed." />
        : (
          <div className="grid gap-3">
            <p className="font-mono text-[12.5px] text-ink3">{option.code} · {option.recurring ? 'every month' : 'once'}</p>
            <TextInput label="Amount (cents)" type="number" min={0} value={shownAmount} onChange={(event) => setAmount(event.target.value)} disabled={!mayWrite} />
            <label className="flex items-center gap-2 text-[14px] text-ink"><input type="checkbox" checked={shownActive} disabled={!mayWrite} onChange={(event) => setActive(event.target.checked)} className="size-5" />On sale</label>
            <Err message={send.error} />
          </div>
        )}
    </PageEditorShell>
  );
}

/** The reduction of a yearly term. Zero means none. It reaches new orders only. */
export function YearlyDiscountEdit() {
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'pricing.write');
  const state = useAsync<{ settings: Record<string, { value?: number } | undefined> }>((signal) => get('/admin/settings', undefined, signal), []);
  const current = state.data?.settings['pricing.yearly_discount_percent']?.value ?? 0;
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? String(current);
  const parsed = /^\d{1,2}$/.test(shown.trim()) ? Number(shown.trim()) : null;
  const valid = parsed !== null && parsed >= 0 && parsed <= 50;
  const changed = valid && parsed !== current;
  const { dirty, discard, finish } = useDone(typed !== null && typed !== String(current), 'Discard the new discount?');
  const send = useAction(async () => put('/admin/settings', { 'pricing.yearly_discount_percent': { value: parsed } }));
  const submit = async () => {
    if (!(await send.run())) return;
    toast.push(parsed === 0 ? 'The yearly discount is off.' : `Yearly terms now get ${parsed}% off the resources.`, 'ok');
    finish();
  };
  return (
    <PageEditorShell eyebrow="Pricing" title="Yearly discount" description="Percent off the resources of a game server when a customer pays for a year. 0 means no discount. It does not apply to add-ons, monthly terms or mail plans, and it reaches new orders only." backTo={BACK_TO} backLabel="Back to pricing" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!mayWrite || !changed || send.pending}>{send.pending ? 'Saving…' : 'Save'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={1} label="Loading the discount" />
        : state.error ? <ErrorState title="The discount could not be read" message={state.error.message} onRetry={state.reload} />
        : (
          <div className="grid max-w-xs gap-3">
            <TextInput label="Percent (0 to 50)" inputMode="numeric" value={shown} onChange={(event) => setTyped(event.target.value)} disabled={!mayWrite} error={valid ? undefined : 'Use a whole number from 0 to 50.'} />
            <Err message={send.error} />
          </div>
        )}
    </PageEditorShell>
  );
}
