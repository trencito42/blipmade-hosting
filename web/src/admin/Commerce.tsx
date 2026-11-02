import { useState } from 'react';
import { api, get, post, put } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorState, Field, LoadingBlock, Money, Panel, useToast } from '../ui-app';
import { denseGhost, denseInput, densePrimary } from './Overview';

/**
 * The add-ons of the catalogue and the history of the prices.
 *
 * An add-on is priced when it is picked: a change of its amount reaches new orders, and the orders
 * and subscriptions that exist keep the amount they were sold at. An add-on is retired, never deleted.
 */

interface Option { id: string; code: string; name: string; description: string | null; amount: number; currency: string; recurring: boolean; active: boolean; product: { slug: string; name: string } | null }
interface Entry { id: string; action: string; actorEmail: string | null; targetType: string | null; meta: any; createdAt: string }

export function AddonsPanel({ mayWrite }: { mayWrite: boolean }) {
  const toast = useToast();
  const state = useAsync<{ options: Option[]; note: string }>((signal) => get('/admin/options', undefined, signal), []);
  const [draft, setDraft] = useState({ code: '', name: '', amount: '' });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await work();
      toast.push(message, 'ok');
      state.reload();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Add-ons" description={state.data?.note ?? 'Extras a customer picks at the order, such as a dedicated IPv4 address.'}>
      <div className="grid gap-3">
        {state.loading ? <LoadingBlock rows={2} label="Loading the add-ons" /> : state.error ? <ErrorState title="The add-ons could not be loaded" message={state.error.message} onRetry={state.reload} /> : !state.data?.options.length ? <EmptyState title="No add-ons yet." description="Create the first one below." /> : (
          <ul className="grid gap-2">
            {state.data.options.map((option) => {
              const typed = edits[option.id];
              const changed = typed !== undefined && Number(typed) !== option.amount;
              return (
                <li key={option.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-s2 p-3 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{option.name} {!option.active && <span className="font-normal text-ink3">(retired)</span>}</span>
                    <span className="block font-mono text-[12px] text-ink3">{option.code}{option.product ? ` · ${option.product.slug}` : ' · all products'}{option.recurring ? ' · every month' : ' · once'}</span>
                  </span>
                  <Money amount={option.amount} currency={option.currency} />
                  {mayWrite && (
                    <>
                      <input aria-label={`New amount of ${option.name} in cents`} type="number" min={0} value={typed ?? ''} placeholder="cents" onChange={(event) => setEdits((current) => ({ ...current, [option.id]: event.target.value }))} className={`${denseInput} w-24`} />
                      <button type="button" className={denseGhost} disabled={busy || !changed} onClick={() => void run(() => api(`/admin/options/${option.id}`, { method: 'PATCH', body: { amount: Number(typed) } }), 'The amount was changed for new orders.')}>Change amount</button>
                      <button type="button" className={denseGhost} disabled={busy} onClick={() => void run(() => api(`/admin/options/${option.id}`, { method: 'PATCH', body: { active: !option.active } }), option.active ? 'The add-on is retired.' : 'The add-on is on sale.')}>{option.active ? 'Retire' : 'Put on sale'}</button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {mayWrite && (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void run(async () => { await post('/admin/options', { code: draft.code, name: draft.name, amount: Number(draft.amount) }); setDraft({ code: '', name: '', amount: '' }); }, 'The add-on was created.'); }}>
            <Field label="Code" htmlFor="addon-code" hint="Lowercase, dashes. It never changes."><input id="addon-code" className={denseInput} value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} required /></Field>
            <Field label="Name" htmlFor="addon-name"><input id="addon-name" className={denseInput} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></Field>
            <Field label="Amount (cents)" htmlFor="addon-amount"><input id="addon-amount" className={`${denseInput} w-28`} type="number" min={0} value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} required /></Field>
            <button type="submit" className={densePrimary} disabled={busy}>Create the add-on</button>
          </form>
        )}
      </div>
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
  const toast = useToast();
  const state = useAsync<{ settings: Record<string, { value?: number } | undefined> }>((signal) => get('/admin/settings', undefined, signal), []);
  const current = state.data?.settings['pricing.yearly_discount_percent']?.value ?? 0;
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = typed ?? String(current);
  const parsed = /^\d{1,2}$/.test(shown.trim()) ? Number(shown.trim()) : null;
  const valid = parsed !== null && parsed >= 0 && parsed <= 50;
  const changed = valid && parsed !== current;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await put('/admin/settings', { 'pricing.yearly_discount_percent': { value: parsed } });
      toast.push(parsed === 0 ? 'The yearly discount is off.' : `Yearly terms now get ${parsed}% off the resources.`, 'ok');
      setTyped(null);
      state.reload();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Yearly discount" description="Percent off the resources of a game server when a customer pays for a year. 0 means no discount. New orders only.">
      {state.loading ? <LoadingBlock rows={1} label="Loading the discount" /> : state.error ? <ErrorState title="The discount could not be read" message={state.error.message} onRetry={state.reload} /> : (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Percent (0 to 50)" htmlFor="yearly-discount" error={valid ? undefined : 'Use a whole number from 0 to 50.'}>
            <input id="yearly-discount" className={denseInput} inputMode="numeric" value={shown} disabled={!mayWrite || busy} onChange={(event) => setTyped(event.target.value)} />
          </Field>
          {mayWrite && <button type="button" className={densePrimary} disabled={!changed || busy} onClick={save}>Save</button>}
          {!mayWrite && <span className="text-[13px] text-muted">Your role can read this but not change it.</span>}
        </div>
      )}
    </Panel>
  );
}
