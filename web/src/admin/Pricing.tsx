import { useState } from 'react';
import { get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { EmptyState, ErrorState, Field, LoadingBlock, Money, Panel, StatusPill, useToast } from '../ui-app';
import { DASH, LiveRegion, denseInput, densePrimary, denseSoft } from './Overview';

/**
 * Staff pricing — GET /api/admin/pricing, PUT /api/admin/pricing/:id
 *
 * Every field stays in integer minor units. The preview repeats the rate card
 * the server uses: base price for the minimum configuration, plus the extra
 * gigabytes of memory, vCPUs and disk above the minimum.
 */

interface AdminPrice {
  id: string;
  productId: string;
  product: { id: string; name: string; slug: string; minRam: number; minCpu: number; minDisk: number };
  period: string;
  baseAmount: number;
  ramPerGb: number;
  cpuPerUnit: number;
  diskPerGb: number;
  currency: string;
  active: boolean;
}

/** Only whole minor units are accepted. */
function parseMinor(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export default function Pricing() {
  const state = useAsync((signal) => get<{ prices: AdminPrice[] }>('/admin/pricing', undefined, signal), []);
  const prices = state.data?.prices ?? [];

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${prices.length} price${prices.length === 1 ? '' : 's'}`} />
      <Panel
        title="Pricing"
        description="Base price for the minimum configuration plus the rate for every extra gigabyte of memory, vCPU and disk."
      >
        {state.loading ? (
          <LoadingBlock rows={3} label="Loading prices" />
        ) : state.error ? (
          <ErrorState title="The price list could not be loaded" message={state.error.message} onRetry={state.reload} />
        ) : !prices.length ? (
          <EmptyState title="No prices yet." description="A price is created with every product." />
        ) : (
          <div className="grid gap-3">
            {prices.map((price) => (
              <PriceEditor key={price.id} price={price} onSaved={state.reload} />
            ))}
          </div>
        )}
      </Panel>

      <p className="px-1 text-[12.5px] text-ink3">
        Amounts are integer minor units (cents). The preview mirrors the server rate card; every quote is priced by the server, never
        by this page.
      </p>
    </div>
  );
}

function PriceEditor({ price, onSaved }: { price: AdminPrice; onSaved: () => void }) {
  const toast = useToast();
  const [base, setBase] = useState(String(price.baseAmount));
  const [ram, setRam] = useState(String(price.ramPerGb));
  const [cpu, setCpu] = useState(String(price.cpuPerUnit));
  const [disk, setDisk] = useState(String(price.diskPerGb));
  const [touched, setTouched] = useState(false);

  const save = useAction(async () => {
    return put<{ price: AdminPrice }>(`/admin/pricing/${price.id}`, {
      baseAmount: parseMinor(base),
      ramPerGb: parseMinor(ram),
      cpuPerUnit: parseMinor(cpu),
      diskPerGb: parseMinor(disk),
    });
  });

  const baseAmount = parseMinor(base);
  const ramPerGb = parseMinor(ram);
  const cpuPerUnit = parseMinor(cpu);
  const diskPerGb = parseMinor(disk);
  const valid = baseAmount !== null && ramPerGb !== null && cpuPerUnit !== null && diskPerGb !== null;

  const numberError = touched && !valid ? 'Use whole cents only. 0 is allowed.' : undefined;

  // The server prices the minimum configuration at the base amount and adds the
  // extra resources above the product minimum. The minimum configuration has
  // no extra resources, so the preview is the base amount.
  const preview = baseAmount === null ? null : baseAmount;

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    const result = await save.run();
    if (!result) return;
    toast.push(`${price.product.name} price saved`, 'ok');
    onSaved();
  };

  return (
    <div className="rounded-2xl bg-s2 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="w-0 min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={price.product.name}>
            {price.product.name}
          </p>
          {/* The full specification is longer than a phone line, so it wraps
              instead of being cut off. */}
          <p
            className="break-words font-mono text-[12.5px] text-ink3"
            title={`${price.product.slug} · ${price.period} · min ${price.product.minRam} MB / ${price.product.minCpu} vCPU / ${price.product.minDisk} GB`}
          >
            {price.product.slug} · {price.period} · min {price.product.minRam} MB / {price.product.minCpu} vCPU /{' '}
            {price.product.minDisk} GB
          </p>
        </div>
        <StatusPill status={price.active ? 'active' : 'draft'} label={price.active ? 'Active' : 'Inactive'} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Base price (cents)" htmlFor={`base-${price.id}`}>
          <input
            id={`base-${price.id}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={base}
            onChange={(event) => setBase(event.target.value)}
            className={denseInput}
          />
        </Field>
        <Field label="Per GB memory (cents)" htmlFor={`ram-${price.id}`}>
          <input
            id={`ram-${price.id}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={ram}
            onChange={(event) => setRam(event.target.value)}
            className={denseInput}
          />
        </Field>
        <Field label="Per vCPU (cents)" htmlFor={`cpu-${price.id}`}>
          <input
            id={`cpu-${price.id}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={cpu}
            onChange={(event) => setCpu(event.target.value)}
            className={denseInput}
          />
        </Field>
        <Field label="Per GB disk (cents)" htmlFor={`disk-${price.id}`}>
          <input
            id={`disk-${price.id}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={disk}
            onChange={(event) => setDisk(event.target.value)}
            className={denseInput}
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-2 rounded-2xl bg-s3 p-3 sm:grid-cols-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Preview · minimum configuration</p>
          <p className="mt-1 text-[14px] text-ink">
            {preview === null ? DASH : <Money amount={preview} currency={price.currency} period="month" />}
          </p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Extra GB memory</p>
          <p className="mt-1 text-[14px] text-ink">
            {ramPerGb === null ? DASH : <Money amount={ramPerGb} currency={price.currency} period="month" />}
          </p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Extra vCPU</p>
          <p className="mt-1 text-[14px] text-ink">
            {cpuPerUnit === null ? DASH : <Money amount={cpuPerUnit} currency={price.currency} period="month" />}
          </p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Extra GB disk</p>
          <p className="mt-1 text-[14px] text-ink">
            {diskPerGb === null ? DASH : <Money amount={diskPerGb} currency={price.currency} period="month" />}
          </p>
        </div>
      </div>

      {numberError && (
        <p role="alert" className="mt-3 px-1 text-[12.5px] font-medium text-bad">
          {numberError}
        </p>
      )}
      {save.error && (
        <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
          {save.error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={submit} disabled={save.pending} className={densePrimary}>
          {save.pending ? 'Saving…' : 'Save price'}
        </button>
        <button
          type="button"
          onClick={() => {
            setBase(String(price.baseAmount));
            setRam(String(price.ramPerGb));
            setCpu(String(price.cpuPerUnit));
            setDisk(String(price.diskPerGb));
            setTouched(false);
          }}
          className={denseSoft}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
