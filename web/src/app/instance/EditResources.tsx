import { useEffect, useState } from 'react';
import { get, put, type CatalogProduct, type Instance } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { Link, useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, useToast } from '../../ui-app';
import { PageEditorShell, QuoteSummary, UnitStepper, useUnsavedChangesGuard } from '../components/premium';

interface Quote {
  priceDelta: number;
  recurringDelta?: number;
  newPrice: number;
  currency: string;
  requiresPayment: boolean;
  period?: 'MONTHLY' | 'YEARLY';
  remainingDays?: number | null;
  changesUsed?: number;
  changesAllowed?: number;
  nextChangeAt?: string | null;
  /** Why no credit is given for a decrease (the period is not paid), or null. */
  creditWithheld?: string | null;
  /** What the price stands on, and when it was frozen: sent back when the change is paid, so a stale price is refused. */
  fingerprint?: string;
  expiresAt?: string;
}

interface SaveResult {
  status: 'applied' | 'requires_payment' | 'failed';
  priceDelta: number;
  checkoutUrl?: string;
  order?: { number: string };
  reason?: string | null;
}

const fmtRam = (mb: number) => (mb < 1024 ? `${mb} MB` : `${Math.round((mb / 1024) * 100) / 100} GB`);

/**
 * The resources of an instance. A change that costs less is applied at once; one that costs more is paid for first, and
 * the limits change only when the payment is confirmed. The price on this page is the one the server quotes.
 */
export default function EditResources() {
  const { id = '' } = useParams();
  const { navigate, query: asked } = useRouter();
  const toast = useToast();
  const backTo = `/app/instances/${encodeURIComponent(id)}/resources`;
  const instanceState = useAsync<{ instance: Instance }>((signal) => get<{ instance: Instance }>(`/instances/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const instance = instanceState.data?.instance;
  const slug = instance?.product.slug;
  const productState = useAsync<{ product: CatalogProduct }>(
    (signal) => (slug ? get<{ product: CatalogProduct }>(`/catalog/products/${encodeURIComponent(slug)}`, undefined, signal) : Promise.resolve({ product: undefined as unknown as CatalogProduct })),
    [slug],
  );
  const product = slug ? productState.data?.product : undefined;

  // A saved profile opens this page with its size already typed in: the price is quoted like any other change.
  const [draft, setDraft] = useState<{ ram: number; cpu: number; disk: number } | null>(() => {
    const ram = Number(asked.ram);
    const cpu = Number(asked.cpu);
    const disk = Number(asked.disk);
    return Number.isInteger(ram) && Number.isInteger(cpu) && Number.isInteger(disk) && ram > 0 && cpu > 0 && disk > 0 ? { ram, cpu, disk } : null;
  });
  const [settled, setSettled] = useState<{ ram: number; cpu: number; disk: number } | null>(null);
  const [payment, setPayment] = useState<{ url: string; orderNumber: string } | null>(null);
  const current = draft ?? (instance ? { ram: instance.ram, cpu: instance.cpu, disk: instance.disk } : null);
  const dirty = Boolean(instance && draft && (draft.ram !== instance.ram || draft.cpu !== instance.cpu || draft.disk !== instance.disk)) && payment === null;
  useUnsavedChangesGuard(dirty, 'Discard the new limits?');

  // The quote follows the limits after a short pause, so typing a number does not ask the server for every digit.
  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setSettled(current), 350);
    return () => window.clearTimeout(timer);
  }, [current?.ram, current?.cpu, current?.disk]);
  // The quota of changes and a change that waits for its payment: read before anything is priced.
  const status = useAsync<{ used: number; allowed: number; remaining: number; nextChangeAt: string | null; pending: { orderId: string; number: string } | null }>(
    (signal) => get(`/instances/${encodeURIComponent(id)}/resources/status`, undefined, signal),
    [id],
  );
  const locked = status.data?.remaining === 0;
  const waiting = status.data?.pending ?? null;
  const quote = useAsync<{ quote: Quote }>(
    (signal) => (instance && settled ? get<{ quote: Quote }>(`/instances/${encodeURIComponent(id)}/resources/quote`, settled, signal) : Promise.resolve({ quote: undefined as unknown as Quote })),
    [id, instance?.id, settled?.ram, settled?.cpu, settled?.disk],
  );
  const priced = quote.data?.quote;

  const save = useAction(async () =>
    put<SaveResult>(`/instances/${encodeURIComponent(id)}/resources`, {
      ...current,
      // The price the customer looked at, frozen for 15 minutes. The server refuses the change when it is not true any more.
      ...(priced?.fingerprint && priced.expiresAt ? { quote: { fingerprint: priced.fingerprint, issuedAt: new Date(Date.parse(priced.expiresAt) - 15 * 60 * 1000).toISOString() } } : {}),
    }),
  );
  const submit = async () => {
    if (!instance || !current || !dirty || locked) return;
    const result = await save.run();
    // A price that is not true any more is refused by the server: the new price is read so the customer sees it.
    if (!result) { quote.reload(); return; }
    if (result.status === 'requires_payment' && result.checkoutUrl) {
      setPayment({ url: result.checkoutUrl, orderNumber: result.order?.number ?? '' });
      toast.push('Pay for the change before it is applied.', 'ok');
      return;
    }
    if (result.status === 'applied') {
      toast.push('Resources updated.', 'ok');
      navigate(backTo, { replace: true });
      return;
    }
    toast.push(result.reason ?? 'The resources could not be changed.', 'error');
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard the new limits?')) navigate(backTo);
  };

  const loading = instanceState.loading || (Boolean(slug) && productState.loading);
  const error = instanceState.error ?? productState.error;
  const lines = instance && priced
    ? [
        { label: 'Current price', amount: instance.price },
        { label: priced.remainingDays ? `Due for ${priced.remainingDays} days left` : 'Difference', amount: priced.priceDelta },
      ]
    : [];

  return (
    <PageEditorShell
      eyebrow={instance?.name ?? 'Instance'}
      title="Change resources"
      description="Memory, vCPU and storage of this instance, within what its product allows."
      backTo={backTo}
      backLabel="Back to resources"
      dirty={dirty}
      aside={
        instance && priced ? (
          <QuoteSummary
            title="Price"
            lines={lines}
            total={priced.newPrice}
            currency={priced.currency}
            period={priced.period === 'YEARLY' ? 'year' : 'month'}
            note={priced.creditWithheld ? priced.creditWithheld : priced.requiresPayment ? 'Only the days left in this period are charged now. The new price renews afterwards.' : priced.priceDelta < 0 ? 'The unused days are credited. The lower price renews afterwards.' : undefined}
          />
        ) : undefined
      }
      actions={
        payment ? (
          <>
            <SoftButton type="button" onClick={() => navigate(backTo)}>Not now</SoftButton>
            <a
              href={payment.url}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-acc px-5 text-[14.5px] font-semibold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            >
              Pay and apply the change
            </a>
          </>
        ) : (
          <>
            <SoftButton type="button" onClick={discard} disabled={save.pending}>Discard</SoftButton>
            <PrimaryButton type="button" onClick={() => void submit()} disabled={save.pending || loading || !product || !dirty || quote.loading || locked}>
              {save.pending ? 'Saving…' : priced?.requiresPayment ? 'Continue to payment' : 'Save resources'}
            </PrimaryButton>
          </>
        )
      }
    >
      {loading ? (
        <LoadingBlock rows={4} label="Loading the instance" />
      ) : error ? (
        <ErrorState title="Could not load the resources" message={`${error.message} Resources cannot be changed without the limits of the product.`} onRetry={() => { instanceState.reload(); productState.reload(); }} />
      ) : !instance || !product || !current ? (
        <ErrorState title="Instance not found" message="It does not exist or it does not belong to this account." />
      ) : payment ? (
        <div className="grid gap-3">
          <p className="rounded-2xl bg-acc-bg px-4 py-3 text-[13.5px] text-acc" role="status">
            Order {payment.orderNumber} covers the price difference. The limits change when the payment is confirmed.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="font-mono text-[12.5px] text-ink3">
            Default for {product.name}: {fmtRam(product.defaultRam)} · {product.defaultCpu} vCPU · {product.defaultDisk} GB
          </p>
          {locked && (
            <div role="status" className="rounded-2xl bg-warn/10 px-4 py-3 text-[13.5px] text-ink">
              <p className="font-semibold">0 of {status.data!.allowed} changes remaining.</p>
              <p className="text-ink2">
                {status.data!.nextChangeAt ? `The next change is available on ${new Date(status.data!.nextChangeAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'The next change is available soon.'}{' '}
                Need an exception? <Link to="/app/tickets/new" className="font-semibold text-acc hover:underline">Ask support</Link>.
              </p>
            </div>
          )}
          {waiting && (
            <p role="status" className="rounded-2xl bg-acc-bg px-4 py-3 text-[13.5px] text-acc">
              A change is waiting for its payment: <Link to={`/app/billing/orders/${encodeURIComponent(waiting.orderId)}`} className="font-semibold underline">order #{waiting.number}</Link>. It already holds one of your changes. Credits you were given are under <Link to="/app/billing?tab=credit" className="font-semibold underline">Billing → Credit</Link>.
            </p>
          )}
          {priced && typeof priced.changesUsed === 'number' && typeof priced.changesAllowed === 'number' && (
            <p className="text-[13.5px] text-ink2">{priced.changesUsed} of {priced.changesAllowed} applied changes used in the last 30 days. A quote does not use one.{priced.nextChangeAt ? ` Next change available ${priced.nextChangeAt.slice(0, 10)}.` : ''} A downgrade becomes account credit for a later invoice, not a card refund. This wording is a draft and is not an approved legal text.</p>
          )}
          <UnitStepper label="Memory" unit="MB" value={current.ram} min={product.minRam} max={product.maxRam} step={256} disabled={save.pending || locked} onChange={(ram) => setDraft({ ...current, ram })} />
          <UnitStepper label="vCPU" unit="vCPU" value={current.cpu} min={product.minCpu} max={product.maxCpu} step={1} disabled={save.pending || locked} onChange={(cpu) => setDraft({ ...current, cpu })} />
          <UnitStepper label="Storage" unit="GB" value={current.disk} min={product.minDisk} max={product.maxDisk} step={5} disabled={save.pending || locked} onChange={(disk) => setDraft({ ...current, disk })} />
          {instance && current.disk < instance.disk && (
            <p className="rounded-2xl bg-warn/10 px-4 py-3 text-[13.5px] text-ink2" role="note">
              Reducing the disk is refused when the files already stored do not fit, with 64 MB spare. Make a backup first: the change can interrupt the server for a moment, and the unused time is credited only after the panel has accepted it.
            </p>
          )}
          {quote.error && <p role="alert" className="text-[13.5px] text-bad">{quote.error.message}</p>}
          {save.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{save.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}
