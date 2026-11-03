import { useEffect, useState } from 'react';
import { get, put, type CatalogProduct, type Instance } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, useToast } from '../../ui-app';
import { PageEditorShell, QuoteSummary, UnitStepper, useUnsavedChangesGuard } from '../components/premium';

interface Quote {
  priceDelta: number;
  newPrice: number;
  currency: string;
  requiresPayment: boolean;
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
  const { navigate } = useRouter();
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

  const [draft, setDraft] = useState<{ ram: number; cpu: number; disk: number } | null>(null);
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
  const quote = useAsync<{ quote: Quote }>(
    (signal) => (instance && settled ? get<{ quote: Quote }>(`/instances/${encodeURIComponent(id)}/resources/quote`, settled, signal) : Promise.resolve({ quote: undefined as unknown as Quote })),
    [id, instance?.id, settled?.ram, settled?.cpu, settled?.disk],
  );
  const priced = quote.data?.quote;

  const save = useAction(async () => put<SaveResult>(`/instances/${encodeURIComponent(id)}/resources`, current));
  const submit = async () => {
    if (!instance || !current || !dirty) return;
    const result = await save.run();
    if (!result) return;
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
  const lines = instance && priced ? [{ label: 'Current price', amount: instance.price }, { label: 'Difference', amount: priced.priceDelta }] : [];

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
            period="month"
            note={priced.requiresPayment ? 'This change is paid for before it is applied.' : priced.priceDelta < 0 ? 'The lower price applies from the next period.' : undefined}
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
            <PrimaryButton type="button" onClick={() => void submit()} disabled={save.pending || loading || !product || !dirty || quote.loading}>
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
          <UnitStepper label="Memory" unit="MB" value={current.ram} min={product.minRam} max={product.maxRam} step={256} disabled={save.pending} onChange={(ram) => setDraft({ ...current, ram })} />
          <UnitStepper label="vCPU" unit="vCPU" value={current.cpu} min={product.minCpu} max={product.maxCpu} step={1} disabled={save.pending} onChange={(cpu) => setDraft({ ...current, cpu })} />
          <UnitStepper label="Storage" unit="GB" value={current.disk} min={product.minDisk} max={product.maxDisk} step={5} disabled={save.pending} onChange={(disk) => setDraft({ ...current, disk })} />
          {quote.error && <p role="alert" className="text-[13.5px] text-bad">{quote.error.message}</p>}
          {save.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{save.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}
