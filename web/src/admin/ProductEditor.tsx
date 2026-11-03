import { useEffect, useMemo, useState } from 'react';
import { api, get, post } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ErrorState, Field, LoadingBlock, Panel, useToast } from '../ui-app';
import { denseGhost, denseInput, densePrimary, denseSelect } from './Overview';

/**
 * The editor of one product: every field the operator owns, a review of the change before it is written,
 * the readiness of the product, its history and how a customer sees it. A change reaches new orders;
 * the services that exist keep the configuration they were built with.
 */

type Lifecycle = 'DRAFT' | 'PUBLISHED' | 'UNAVAILABLE' | 'RETIRED';

interface Detail {
  product: Record<string, any> & { id: string; slug: string; lifecycle: Lifecycle; updatedAt: string; fulfilment: string };
  usage: { instances: number; orderItems: number; vpsServices: number };
  readiness: Check[];
}
interface Check { id: string; level: 'blocker' | 'warning' | 'info'; ok: boolean; message: string }
interface Plan {
  changes: { field: string; from: unknown; to: unknown; risk: 'safe' | 'risky'; note: string }[];
  errors: string[];
  readiness: Check[];
  usage: Detail['usage'];
  requiresConfirmation: boolean;
}

const CATEGORIES = ['WEB_CMS', 'DEVELOPER_TOOLS', 'MONITORING', 'AUTOMATION', 'BOTS', 'DATABASES', 'GAMES'];
const STATES: [Lifecycle, string][] = [
  ['DRAFT', 'Draft: hidden, not orderable'],
  ['UNAVAILABLE', 'Unavailable: listed, not orderable'],
  ['PUBLISHED', 'Published: listed and orderable'],
  ['RETIRED', 'Retired: hidden, existing services keep running'],
];
const NUMBERS = ['minRam', 'defaultRam', 'maxRam', 'minCpu', 'defaultCpu', 'maxCpu', 'minDisk', 'defaultDisk', 'maxDisk', 'sortOrder', 'eggId'] as const;
const TEXTS = ['name', 'slug', 'category', 'icon', 'description', 'eggName', 'dockerImage', 'startupCommand', 'docsUrl', 'installGuide'] as const;
const JSONS = ['startup', 'generatedVariables', 'customerVariables', 'healthProbe'] as const;

const show = (value: unknown) => (value === null || value === undefined ? 'none' : typeof value === 'string' ? value : JSON.stringify(value));

/** The form values as the strings the inputs hold. */
function toForm(product: Detail['product']): Record<string, string> {
  const form: Record<string, string> = { lifecycle: product.lifecycle };
  for (const key of TEXTS) form[key] = product[key] ?? '';
  for (const key of NUMBERS) form[key] = product[key] === null || product[key] === undefined ? '' : String(product[key]);
  for (const key of JSONS) form[key] = product[key] ? JSON.stringify(product[key], null, 2) : '';
  return form;
}

/** The fields that differ from the product, in the shape the API takes. A JSON field that does not parse is reported. */
function toPatch(product: Detail['product'], form: Record<string, string>): { patch: Record<string, unknown>; problems: string[] } {
  const original = toForm(product);
  const patch: Record<string, unknown> = {};
  const problems: string[] = [];
  const nullable = new Set(['eggName', 'dockerImage', 'startupCommand', 'docsUrl', 'installGuide']);
  for (const key of Object.keys(form)) {
    if (form[key] === original[key]) continue;
    if (key === 'lifecycle') patch.lifecycle = form[key];
    else if ((NUMBERS as readonly string[]).includes(key)) {
      if (form[key].trim() === '') {
        if (key === 'eggId') patch.eggId = null;
        else problems.push(`${key} needs a number.`);
      } else patch[key] = Number(form[key]);
    } else if ((JSONS as readonly string[]).includes(key)) {
      if (form[key].trim() === '') patch[key] = null;
      else {
        try {
          patch[key] = JSON.parse(form[key]);
        } catch {
          problems.push(`${key} is not valid JSON.`);
        }
      }
    } else patch[key] = nullable.has(key) && form[key] === '' ? null : form[key];
  }
  return { patch, problems };
}

export default function ProductEditor({ id, mayWrite, onClose, onSaved }: { id: string; mayWrite: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const detail = useAsync<Detail>((signal) => get<Detail>(`/admin/products/${id}`, undefined, signal), [id]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<Plan | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState<{ history?: any[]; preview?: any } | null>(null);

  const product = detail.data?.product;
  useEffect(() => {
    if (product) {
      setForm(toForm(product));
      setPlan(null);
      setUnderstood(false);
    }
  }, [product]);

  const change = useMemo(() => (product ? toPatch(product, form) : { patch: {}, problems: [] }), [product, form]);
  const set = (key: string, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setPlan(null);
    setUnderstood(false);
  };

  if (detail.loading) return <LoadingBlock rows={4} label="Loading the product" />;
  if (detail.error || !detail.data || !product) return <ErrorState title="The product could not be loaded" message={detail.error?.message ?? 'Not found.'} onRetry={detail.reload} />;

  const server = product.fulfilment === 'SERVER';
  const vps = product.fulfilment === 'VPS';
  const readOnly = !mayWrite;
  const input = (key: string, label: string, props: { type?: string; hint?: string; disabled?: boolean; area?: number } = {}) => (
    <Field label={label} htmlFor={`pe-${key}`} hint={props.hint}>
      {props.area ? (
        <textarea id={`pe-${key}`} rows={props.area} value={form[key] ?? ''} disabled={readOnly || props.disabled} onChange={(event) => set(key, event.target.value)} className={`${denseInput} h-auto py-2 font-mono text-[12.5px]`} />
      ) : (
        <input id={`pe-${key}`} type={props.type ?? 'text'} value={form[key] ?? ''} disabled={readOnly || props.disabled} onChange={(event) => set(key, event.target.value)} className={denseInput} />
      )}
    </Field>
  );

  const review = async () => {
    setBusy(true);
    setError(null);
    try {
      setPlan((await post<{ plan: Plan }>(`/admin/products/${id}/change-preview`, change.patch)).plan);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The change could not be reviewed.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/products/${id}`, { method: 'PATCH', body: { ...change.patch, confirmRisky: understood, expectedUpdatedAt: product.updatedAt } });
      toast.push('The product was saved. New orders use it; services that exist are unchanged.', 'ok');
      setPlan(null);
      detail.reload();
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The product could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const loadExtra = async () => {
    const [history, preview] = await Promise.all([get<{ history: any[] }>(`/admin/products/${id}/history`), get<{ preview: any }>(`/admin/products/${id}/preview`)]);
    setExtra({ history: history.history, preview: preview.preview });
  };

  const usage = detail.data.usage;
  const sold = usage.instances + usage.orderItems + usage.vpsServices;
  const nothing = Object.keys(change.patch).length === 0;
  const canSave = !readOnly && !nothing && plan !== null && plan.errors.length === 0 && (!plan.requiresConfirmation || understood);

  return (
    <Panel
      title={`Edit ${product.name}`}
      description={`${product.slug} · ${sold ? `${usage.instances} services, ${usage.orderItems} order lines. They keep the configuration they were built with.` : 'Never sold.'}`}
      action={<button type="button" onClick={onClose} className={denseGhost}>Close</button>}
    >
      <div className="grid gap-5">
        <section aria-label="Readiness" className="grid gap-1.5 rounded-2xl bg-s2 p-3 text-[13px]">
          {detail.data.readiness.map((check) => (
            <p key={check.id} className={check.ok ? 'text-ink2' : check.level === 'blocker' ? 'font-medium text-bad' : 'text-ink3'}>
              {check.ok ? '✓' : check.level === 'blocker' ? '✗' : '•'} {check.message}
            </p>
          ))}
          <p className="text-ink3">This checks the setup. It does not deploy anything: only the probe of the eggs on the node proves a real deployment.</p>
        </section>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-[13px] font-semibold text-ink">Identity</legend>
          {input('name', 'Name')}
          {input('slug', 'Slug', { hint: sold ? 'Fixed: the product was sold.' : 'Changes the address of its pages.', disabled: sold > 0 })}
          <Field label="Category" htmlFor="pe-category">
            <select id="pe-category" value={form.category} disabled={readOnly || sold > 0 || !server} onChange={(event) => set('category', event.target.value)} className={denseSelect}>
              {[...new Set([form.category, ...CATEGORIES])].filter((value): value is string => Boolean(value)).map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          {input('icon', 'Icon', { hint: 'The name of an icon, such as box or bot.' })}
          {input('sortOrder', 'Order in the catalogue', { type: 'number' })}
          <Field label="State" htmlFor="pe-lifecycle">
            <select id="pe-lifecycle" value={form.lifecycle} disabled={readOnly} onChange={(event) => set('lifecycle', event.target.value)} className={denseSelect}>
              {STATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">{input('description', 'Description', { area: 3 })}</div>
        </fieldset>

        {!vps && (
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-[13px] font-semibold text-ink">Resources of new orders</legend>
            {['Ram', 'Cpu', 'Disk'].flatMap((unit) => ['min', 'default', 'max'].map((kind) => input(`${kind}${unit}`, `${kind[0].toUpperCase()}${kind.slice(1)} ${unit === 'Ram' ? 'memory (MB)' : unit === 'Cpu' ? 'vCPU' : 'disk (GB)'}`, { type: 'number' })))}
          </fieldset>
        )}

        {server && (
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-[13px] font-semibold text-ink">How it is built</legend>
            {input('eggId', 'Egg of the panel (number)', { type: 'number' })}
            {input('eggName', 'Egg of the panel (name)', { hint: 'Used when there is no number.' })}
            {input('dockerImage', 'Docker image')}
            {input('startupCommand', 'Startup command')}
            {input('startup', 'Startup variables (JSON)', { area: 4, hint: '{"SERVER_PORT": "25565"}' })}
            {input('generatedVariables', 'Secrets the platform makes (JSON)', { area: 4, hint: '{"DB_PASSWORD": {"length": 20}}' })}
            {input('customerVariables', 'Asked of the customer at the order (JSON)', { area: 5, hint: '{"STEAM_USER": {"label": "Steam account", "required": true}}' })}
            {input('healthProbe', 'Health check (JSON)', { area: 5, hint: '{"kind": "http", "path": "/", "expectStatus": [200]}' })}
          </fieldset>
        )}

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-[13px] font-semibold text-ink">Documentation</legend>
          {input('docsUrl', 'Documentation link', { hint: 'An https address or a path that starts with /.' })}
          {input('installGuide', 'Installation guidance (plain text)', { area: 6 })}
        </fieldset>

        {change.problems.length > 0 && <p role="alert" className="text-[13px] font-medium text-bad">{change.problems.join(' ')}</p>}

        {plan && (
          <section aria-label="Review of the change" className="grid gap-2 rounded-2xl bg-s2 p-3 text-[13px]">
            <p className="font-semibold text-ink">{plan.changes.length} change{plan.changes.length === 1 ? '' : 's'}</p>
            {plan.changes.map((entry) => (
              <p key={entry.field} className="break-words">
                <span className="font-mono">{entry.field}</span>: {show(entry.from)} → {show(entry.to)} <span className={entry.risk === 'risky' ? 'font-medium text-bad' : 'text-ink3'}>({entry.note})</span>
              </p>
            ))}
            {plan.errors.map((message) => <p key={message} role="alert" className="font-medium text-bad">{message}</p>)}
            {plan.requiresConfirmation && plan.errors.length === 0 && (
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} className="mt-0.5" />
                <span>This product is {product.lifecycle === 'PUBLISHED' ? 'published' : 'sold'}. I understand that new orders will use these values and that the services that exist keep theirs.</span>
              </label>
            )}
          </section>
        )}
        {error && <p role="alert" className="text-[13px] font-medium text-bad">{error}</p>}

        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={denseGhost} disabled={busy || nothing || change.problems.length > 0} onClick={() => void review()}>Review the changes</button>
            <button type="button" className={densePrimary} disabled={busy || !canSave} onClick={() => void save()}>Save the product</button>
            <button type="button" className={denseGhost} disabled={busy || nothing} onClick={() => { setForm(toForm(product)); setPlan(null); }}>Discard</button>
          </div>
        )}

        <details onToggle={(event) => { if ((event.target as HTMLDetailsElement).open && !extra) void loadExtra(); }}>
          <summary className="cursor-pointer text-[13px] font-semibold text-ink">Preview and history</summary>
          {extra?.preview && (
            <div className="mt-3 grid gap-1 text-[13px] text-ink2">
              <p className="font-semibold text-ink">{extra.preview.card.name} · {extra.preview.lifecycle}</p>
              <p>{extra.preview.card.description}</p>
              <p>{extra.preview.orderable ? 'Customers can order it.' : `Customers cannot order it: ${extra.preview.blockers.join(' ') || 'it is not published.'}`}</p>
              <p>Memory {extra.preview.sizes.ram.join(' / ')} MB · vCPU {extra.preview.sizes.cpu.join(' / ')} · disk {extra.preview.sizes.disk.join(' / ')} GB</p>
              {extra.preview.askedAtOrder.length > 0 && <p>Asked at the order: {extra.preview.askedAtOrder.map((field: any) => `${field.label}${field.required ? ' *' : ''}`).join(', ')}</p>}
              {extra.preview.installGuide && <pre className="whitespace-pre-wrap rounded-xl bg-s2 p-2 font-sans">{extra.preview.installGuide}</pre>}
            </div>
          )}
          {extra?.history && (
            <ul className="mt-3 grid gap-1.5 text-[12.5px] text-ink2">
              {extra.history.length === 0 && <li>No change was recorded.</li>}
              {extra.history.map((entry) => (
                <li key={entry.id}>
                  {new Date(entry.createdAt).toLocaleString()} · {entry.actorEmail ?? 'the platform'} · {entry.action}
                  {Array.isArray(entry.meta?.changes) && `: ${entry.meta.changes.map((item: any) => item.field).join(', ')}`}
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>
    </Panel>
  );
}
