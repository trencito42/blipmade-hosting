import { useState } from 'react';
import { get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { ConfirmDialog, EmptyState, ErrorState, Field, LoadingBlock, Money, Panel, StatusPill, useToast } from '../ui-app';
import { DASH, LiveRegion, denseGhost, denseInput, densePrimary, denseSoft, useAdminSession } from './Overview';
import { pricingGate } from './permissions';
import Capacity from './Capacity';

/**
 * Staff pricing — GET /api/admin/pricing, PUT /api/admin/pricing/:id
 *
 * Every field stays in integer minor units. The preview repeats the rate card
 * the server uses: base price for the minimum configuration, plus the extra
 * gigabytes of memory, vCPUs and disk above the minimum.
 *
 * The screen is gated on the permissions of the account: "pricing.read" opens
 * it, "pricing.write" makes it editable. The server refuses a write without
 * "pricing.write", so the interface says the same before the operator tries.
 */

interface AdminPrice {
  id: string;
  productId: string;
  product: {
    id: string;
    name: string;
    slug: string;
    minRam: number;
    minCpu: number;
    minDisk: number;
    fulfilment: string;
  };
  period: string;
  baseAmount: number;
  ramPerGb: number;
  cpuPerUnit: number;
  diskPerGb: number;
  currency: string;
  active: boolean;
}

/**
 * The card of the platform.
 *
 * One card for every product of a server: the price of a gigabyte of memory,
 * the price of a processor, the price of a gigabyte of disk and the fee of the
 * instance itself. The same resources cost the same in every product, in
 * every category and for every egg.
 */
interface ResourceRates {
  ramPerGb: number;
  cpuPerUnit: number;
  diskPerGb: number;
  baseFee: number;
}

/** Only whole minor units are accepted. */
function parseMinor(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export default function Pricing() {
  const session = useAdminSession();
  const { mayRead, mayWrite } = pricingGate(session.staff);

  const state = useAsync(
    (signal) =>
      mayRead
        ? get<{ rates: ResourceRates; prices: AdminPrice[] }>('/admin/pricing', undefined, signal)
        : Promise.resolve({ rates: null as ResourceRates | null, prices: [] as AdminPrice[] }),
    [mayRead],
  );
  const prices = state.data?.prices ?? [];
  const rates = state.data?.rates ?? null;

  if (session.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={3} label="Loading your permissions" />
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="grid gap-4">
        <ErrorState title="The session could not be read" message={session.error} onRetry={session.reload} />
      </div>
    );
  }

  if (!mayRead) {
    return (
      <div className="grid gap-4">
        <ErrorState
          title="The prices are not available for your role"
          message='Your role does not hold "pricing.read", so the price list cannot be shown.'
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${prices.length} price${prices.length === 1 ? '' : 's'}`} />
      {rates && <RateCard rates={rates} mayWrite={mayWrite} onSaved={state.reload} />}
      {mayRead && <Capacity />}
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
              <PriceEditor key={price.id} price={price} mayWrite={mayWrite} onSaved={state.reload} />
            ))}
          </div>
        )}

        {!mayWrite && (
          <p className="px-1 text-[13px] text-ink3">
            Your role does not hold &quot;pricing.write&quot;, so the prices are read-only for you.
          </p>
        )}
      </Panel>

      <p className="px-1 text-[12.5px] text-ink3">
        Amounts are integer minor units (cents). The preview mirrors the server rate card; every quote is priced by the server, never
        by this page.
      </p>
    </div>
  );
}

/**
 * The card of the platform.
 *
 * The card is one card for every product of a server, and it is written in
 * the settings of the platform and in every row of a server, so that no two
 * products can drift apart.
 *
 * The prices the customers already have are not touched: a running instance
 * keeps the price it was sold at, until an operator reconciles them on
 * purpose.
 */
function RateCard({
  rates,
  mayWrite,
  onSaved,
}: {
  rates: ResourceRates;
  mayWrite: boolean;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [ram, setRam] = useState(String(rates.ramPerGb));
  const [cpu, setCpu] = useState(String(rates.cpuPerUnit));
  const [disk, setDisk] = useState(String(rates.diskPerGb));
  const [fee, setFee] = useState(String(rates.baseFee));
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const save = useAction(async () =>
    put<{ rates: ResourceRates }>('/admin/pricing/rates', {
      ramPerGb: parseMinor(ram),
      cpuPerUnit: parseMinor(cpu),
      diskPerGb: parseMinor(disk),
      baseFee: parseMinor(fee),
    }),
  );

  const ramPerGb = parseMinor(ram);
  const cpuPerUnit = parseMinor(cpu);
  const diskPerGb = parseMinor(disk);
  const baseFee = parseMinor(fee);
  const valid = ramPerGb !== null && cpuPerUnit !== null && diskPerGb !== null && baseFee !== null;
  const numberError = touched && !valid ? 'Use whole cents only. 0 is allowed.' : undefined;

  const changes: string[] = [];
  if (ramPerGb !== null && ramPerGb !== rates.ramPerGb) {
    changes.push(`The price of a gigabyte of memory goes from ${rates.ramPerGb} to ${ramPerGb} cents.`);
  }
  if (cpuPerUnit !== null && cpuPerUnit !== rates.cpuPerUnit) {
    changes.push(`The price of a processor goes from ${rates.cpuPerUnit} to ${cpuPerUnit} cents.`);
  }
  if (diskPerGb !== null && diskPerGb !== rates.diskPerGb) {
    changes.push(`The price of a gigabyte of disk goes from ${rates.diskPerGb} to ${diskPerGb} cents.`);
  }
  if (baseFee !== null && baseFee !== rates.baseFee) {
    changes.push(`The fee of the instance goes from ${rates.baseFee} to ${baseFee} cents.`);
  }
  const changed = changes.length > 0;

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    const result = await save.run();
    if (!result) return;
    toast.push('The rate card of the platform is saved', 'ok');
    setConfirming(false);
    onSaved();
  };

  return (
    <Panel
      title="Rate card of the platform"
      description="One card for every server. The price of a server is its resources plus the fee of the instance."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Per GB memory (cents)" htmlFor="card-ram">
          <input
            id="card-ram"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={ram}
            onChange={(event) => setRam(event.target.value)}
            disabled={!mayWrite}
            className={denseInput}
          />
        </Field>
        <Field label="Per vCPU (cents)" htmlFor="card-cpu">
          <input
            id="card-cpu"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={cpu}
            onChange={(event) => setCpu(event.target.value)}
            disabled={!mayWrite}
            className={denseInput}
          />
        </Field>
        <Field label="Per GB disk (cents)" htmlFor="card-disk">
          <input
            id="card-disk"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={disk}
            onChange={(event) => setDisk(event.target.value)}
            disabled={!mayWrite}
            className={denseInput}
          />
        </Field>
        <Field label="Instance fee (cents)" htmlFor="card-fee">
          <input
            id="card-fee"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={fee}
            onChange={(event) => setFee(event.target.value)}
            disabled={!mayWrite}
            className={denseInput}
          />
        </Field>
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink3">
        The price of a server is <span className="font-mono">fee + GB memory × rate + vCPU × rate + GB disk × rate</span>, for a
        month. A year is twelve months of that card. The same resources cost the same in every product of the platform.
      </p>

      {numberError && (
        <p role="alert" className="mt-3 px-1 text-[12.5px] font-medium text-bad">
          {numberError}
        </p>
      )}
      {save.error && (
        <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
          {save.error}
        </p>
      )}

      {mayWrite && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setConfirming(true)} disabled={!changed || save.pending} className={densePrimary}>
            {save.pending ? 'Saving…' : 'Save the card'}
          </button>
          <button
            type="button"
            onClick={() => {
              setRam(String(rates.ramPerGb));
              setCpu(String(rates.cpuPerUnit));
              setDisk(String(rates.diskPerGb));
              setFee(String(rates.baseFee));
              setTouched(false);
            }}
            className={denseSoft}
          >
            Reset
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Save the rate card of the platform"
        description={`${changes.join(' ')} The prices the running instances already carry are not changed: they keep the price they were sold at until you reconcile them on purpose.`}
        confirmLabel="Save the card"
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
        busy={save.pending}
      />
    </Panel>
  );
}

function PriceEditor({
  price,
  mayWrite,
  onSaved,
}: {
  price: AdminPrice;
  mayWrite: boolean;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [base, setBase] = useState(String(price.baseAmount));
  const [ram, setRam] = useState(String(price.ramPerGb));
  const [cpu, setCpu] = useState(String(price.cpuPerUnit));
  const [disk, setDisk] = useState(String(price.diskPerGb));
  // The price can be taken out of the catalog without changing the amounts.
  const [active, setActive] = useState(price.active);
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const save = useAction(async () => {
    return put<{ price: AdminPrice }>(`/admin/pricing/${price.id}`, {
      baseAmount: parseMinor(base),
      ramPerGb: parseMinor(ram),
      cpuPerUnit: parseMinor(cpu),
      diskPerGb: parseMinor(disk),
      active,
    });
  });

  const baseAmount = parseMinor(base);
  const ramPerGb = parseMinor(ram);
  const cpuPerUnit = parseMinor(cpu);
  const diskPerGb = parseMinor(disk);
  // A server is priced by what it uses: the same resources cost the same in
  // every product, and the card of the rates is one card for the platform. A
  // plan of mail is a subscription of a service, and it keeps its own base.
  const byResources = price.product.fulfilment === 'SERVER';
  const valid =
    (byResources || baseAmount !== null) && ramPerGb !== null && cpuPerUnit !== null && diskPerGb !== null;

  const numberError = touched && !valid ? 'Use whole cents only. 0 is allowed.' : undefined;

  // The preview is the price of the smallest configuration of the product: the
  // base for a plan of mail, the resources themselves for a server.
  const preview =
    byResources && ramPerGb !== null && cpuPerUnit !== null && diskPerGb !== null
      ? Math.round((price.product.minRam / 1024) * ramPerGb) +
        price.product.minCpu * cpuPerUnit +
        price.product.minDisk * diskPerGb
      : baseAmount;

  /** The changes the confirmation states, one line for every amount that moves. */
  const changes: string[] = [];
  if (!byResources && baseAmount !== null && baseAmount !== price.baseAmount) {
    changes.push(`The base price goes from ${price.baseAmount} to ${baseAmount} cents.`);
  }
  if (ramPerGb !== null && ramPerGb !== price.ramPerGb) {
    changes.push(
      byResources
        ? `The price of a gigabyte of memory goes from ${price.ramPerGb} to ${ramPerGb} cents, for every product.`
        : `The price of an extra gigabyte of memory goes from ${price.ramPerGb} to ${ramPerGb} cents.`,
    );
  }
  if (cpuPerUnit !== null && cpuPerUnit !== price.cpuPerUnit) {
    changes.push(
      byResources
        ? `The price of a processor goes from ${price.cpuPerUnit} to ${cpuPerUnit} cents, for every product.`
        : `The price of an extra vCPU goes from ${price.cpuPerUnit} to ${cpuPerUnit} cents.`,
    );
  }
  if (diskPerGb !== null && diskPerGb !== price.diskPerGb) {
    changes.push(
      byResources
        ? `The price of a gigabyte of disk goes from ${price.diskPerGb} to ${diskPerGb} cents, for every product.`
        : `The price of an extra gigabyte of disk goes from ${price.diskPerGb} to ${diskPerGb} cents.`,
    );
  }
  if (active !== price.active) {
    changes.push(
      active
        ? 'The price becomes active again and can be bought.'
        : 'The price becomes inactive and cannot be bought any more. The running instances keep running.',
    );
  }
  const changed = changes.length > 0;

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    const result = await save.run();
    if (!result) return;
    toast.push(`${price.product.name} price saved`, 'ok');
    setConfirming(false);
    onSaved();
  };

  return (
    <div className="rounded-2xl bg-s2 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="w-0 min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink" title={price.product.name}>
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
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={price.active ? 'active' : 'draft'} label={price.active ? 'Active' : 'Inactive'} />
          {mayWrite && (
            <button
              type="button"
              aria-pressed={active}
              onClick={() => setActive((value) => !value)}
              className={active ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}
            >
              {active ? 'Active' : 'Inactive'}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label={byResources ? 'Priced by the resources' : 'Base price (cents)'}
          htmlFor={`base-${price.id}`}
        >
          <input
            id={`base-${price.id}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={byResources ? '0' : base}
            onChange={(event) => setBase(event.target.value)}
            disabled={!mayWrite || byResources}
            title={
              byResources
                ? 'The price of a server is the price of its resources: the same resources cost the same in every product.'
                : undefined
            }
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
            disabled={!mayWrite}
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
            disabled={!mayWrite}
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
            disabled={!mayWrite}
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
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">
            {byResources ? 'Per GB memory' : 'Extra GB memory'}
          </p>
          <p className="mt-1 text-[14px] text-ink">
            {ramPerGb === null ? DASH : <Money amount={ramPerGb} currency={price.currency} period="month" />}
          </p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">
            {byResources ? 'Per vCPU' : 'Extra vCPU'}
          </p>
          <p className="mt-1 text-[14px] text-ink">
            {cpuPerUnit === null ? DASH : <Money amount={cpuPerUnit} currency={price.currency} period="month" />}
          </p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">
            {byResources ? 'Per GB disk' : 'Extra GB disk'}
          </p>
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
        <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
          {save.error}
        </p>
      )}

      {mayWrite && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setConfirming(true)} disabled={!changed || save.pending} className={densePrimary}>
            {save.pending ? 'Saving…' : 'Save price'}
          </button>
          <button
            type="button"
            onClick={() => {
              setBase(String(price.baseAmount));
              setRam(String(price.ramPerGb));
              setCpu(String(price.cpuPerUnit));
              setDisk(String(price.diskPerGb));
              setActive(price.active);
              setTouched(false);
            }}
            className={denseSoft}
          >
            Reset
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={`Save the price of ${price.product.name}`}
        description={changes.join(' ')}
        confirmLabel="Save price"
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
        busy={save.pending}
      />
    </div>
  );
}
