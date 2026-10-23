import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, get, post, type CatalogProduct, type Instance, type Order, type Quote } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { cn } from '../lib';
import { Icon } from '../icons';
import { Link, useParams, useRouter } from '../router';
import { catalogPath, productPath } from '../lib/pricing';
import {
  EmptyState,
  ErrorState,
  ListRow,
  LoadingBlock,
  Money,
  Panel,
  PrimaryButton,
  SoftButton,
  StatusPill,
  TextInput,
} from '../ui-app';

/**
 * Deploy flow. Every number that looks like a price comes from
 * POST /catalog/quote. Nothing is priced on the client.
 */

type DeployStep = 1 | 2 | 3 | 4;

const STEP_LABELS = ['Configure', 'Review', 'Payment', 'Provisioning'] as const;

const RAM_STEPS_GB = [0.5, 1, 2, 4, 8, 16, 32, 64, 128];
const CPU_STEPS = [1, 2, 4, 8, 16];

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  AWAITING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  FULFILLED: 'Fulfilled',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

const TERMINAL_ORDER_STATUSES = ['FULFILLED', 'FAILED', 'CANCELLED', 'REFUNDED'];

interface InstanceEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

/** Waits, but gives up as soon as the caller replaces the request. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * The catalogue stores memory in MB (the Pterodactyl convention). A catalogue
 * that already uses GB is detected from its own range, so the pills always
 * show GB while the numbers sent to the API stay in the server's unit.
 */
function ramScale(maxRam: number): number {
  return maxRam >= 1024 ? 1024 : 1;
}

function formatGb(value: number, scale: number): string {
  const gb = value / scale;
  return Number.isInteger(gb) ? String(gb) : gb.toFixed(1);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

const pill = (on: boolean) =>
  cn(
    'h-11 whitespace-nowrap rounded-full px-3 text-[13.5px] font-bold transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc lg:h-10',
    on ? 'bg-ink text-bg' : 'bg-s2 text-ink2 hover:bg-s3 hover:text-ink',
  );

const linkButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-acc px-5 text-[14.5px] font-bold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-s2 px-3.5 py-3">
      <dt className="text-[13.5px] text-ink2">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[14.5px] font-bold text-ink">{children}</dd>
    </div>
  );
}

export default function Deploy() {
  const { slug = '' } = useParams();
  const { query, navigate } = useRouter();

  const [step, setStep] = useState<DeployStep>(1);
  const [name, setName] = useState('');
  const [ram, setRam] = useState(0);
  const [cpu, setCpu] = useState(0);
  const [disk, setDisk] = useState(0);
  const [optionCodes, setOptionCodes] = useState<string[]>([]);
  const [promotionCode, setPromotionCode] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [checkoutIssue, setCheckoutIssue] = useState<string | null>(null);

  const seeded = useRef<string | null>(null);

  // --- product ------------------------------------------------------------

  const productState = useAsync<{ product: CatalogProduct }>(
    (signal) => get<{ product: CatalogProduct }>(`/catalog/products/${encodeURIComponent(slug)}`, undefined, signal),
    [slug],
  );
  const product = productState.data?.product;

  useEffect(() => {
    if (!product || seeded.current === product.id) return;
    seeded.current = product.id;
    setName(product.slug);
    setRam(Math.min(product.maxRam, Math.max(product.minRam, product.defaultRam)));
    setCpu(Math.min(product.maxCpu, Math.max(product.minCpu, product.defaultCpu)));
    setDisk(Math.min(product.maxDisk, Math.max(product.minDisk, product.defaultDisk)));
  }, [product]);

  const scale = product ? ramScale(product.maxRam) : 1;

  const ramOptions = useMemo(() => {
    if (!product) return [] as number[];
    const values = new Set<number>();
    for (const stepGb of RAM_STEPS_GB) {
      const value = stepGb * scale;
      if (value >= product.minRam && value <= product.maxRam) values.add(value);
    }
    values.add(product.minRam);
    values.add(product.maxRam);
    values.add(product.defaultRam);
    return [...values].filter((v) => v >= product.minRam && v <= product.maxRam).sort((a, b) => a - b);
  }, [product, scale]);

  const cpuOptions = useMemo(() => {
    if (!product) return [] as number[];
    const values = new Set<number>();
    for (const step of CPU_STEPS) {
      if (step >= product.minCpu && step <= product.maxCpu) values.add(step);
    }
    values.add(product.minCpu);
    values.add(product.maxCpu);
    values.add(product.defaultCpu);
    return [...values].filter((v) => v >= product.minCpu && v <= product.maxCpu).sort((a, b) => a - b);
  }, [product]);

  const diskStep = product ? Math.max(1, Math.ceil((product.maxDisk - product.minDisk) / 20)) : 1;

  const onDisk = (raw: number) => {
    if (!product) return;
    const snapped = product.minDisk + Math.round((raw - product.minDisk) / diskStep) * diskStep;
    setDisk(Math.min(product.maxDisk, Math.max(product.minDisk, snapped)));
  };

  // --- quote --------------------------------------------------------------

  const optionKey = optionCodes.join(',');
  const trimmedPromo = promotionCode.trim();

  const quoteState = useAsync<Quote | null>(async (signal) => {
    if (!product) return null;
    await delay(180, signal);
    return api<Quote>('/catalog/quote', {
      method: 'POST',
      body: {
        items: [{ productSlug: product.slug, ram, cpu, disk, optionCodes }],
        ...(trimmedPromo ? { promotionCode: trimmedPromo } : {}),
      },
      signal,
    });
  }, [product?.slug, ram, cpu, disk, optionKey, trimmedPromo]);

  const quote = quoteState.data ?? null;

  // The server sends no promotion when the field is empty. A code is only a
  // mistake when the customer actually typed one, so an empty field is never
  // an error.
  const promotion = quote?.promotion ?? null;
  const promotionTyped = promotion?.code.trim() ?? '';

  // --- order and provisioning --------------------------------------------

  const orderState = useAsync<{ order: Order } | null>(
    async (signal) => (orderId ? get<{ order: Order }>(`/orders/${orderId}`, undefined, signal) : null),
    [orderId],
  );

  const instancesState = useAsync<{ instances: Instance[] }>(
    async (signal) => (orderId ? get<{ instances: Instance[] }>('/instances', undefined, signal) : { instances: [] }),
    [orderId],
  );

  const order = orderState.data?.order ?? null;
  const orderStatus = (order?.status ?? '').toUpperCase();
  const orderFinished = TERMINAL_ORDER_STATUSES.includes(orderStatus);

  const instance = useMemo(() => {
    const list = instancesState.data?.instances ?? [];
    if (!list.length) return undefined;
    const byName = list.find((i) => name && i.name === name);
    if (byName) return byName;
    return list
      .filter((i) => i.product.slug === slug)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }, [instancesState.data, name, slug]);

  const instanceFailed = instance?.status === 'failed' || orderStatus === 'FAILED';

  const eventsState = useAsync<{ events: InstanceEvent[] }>(
    async (signal) =>
      instanceFailed && instance ? get<{ events: InstanceEvent[] }>(`/instances/${instance.id}/events`, undefined, signal) : { events: [] },
    [instanceFailed, instance?.id],
  );

  const events = eventsState.data?.events ?? [];

  // Resume an order that was created before a redirect to the payment page.
  useEffect(() => {
    const existing = query.order;
    if (!existing) return;
    setOrderId(existing);
    setStep(4);
  }, [query.order]);

  useEffect(() => {
    if (!orderId || orderFinished) return;
    const timer = window.setInterval(() => {
      orderState.reload();
      instancesState.reload();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [orderId, orderFinished, orderState.reload, instancesState.reload]);

  // --- actions ------------------------------------------------------------

  const placeOrder = useAction(async () => {
    if (!product) return;
    const created = await post<{ order: Order }>('/orders', {
      items: [{ productSlug: product.slug, name: name.trim() || product.slug, ram, cpu, disk, optionCodes }],
      ...(trimmedPromo ? { promotionCode: trimmedPromo } : {}),
    });
    const createdOrder = created.order;
    setOrderId(createdOrder.id);
    setCheckoutIssue(null);
    navigate(`/app/deploy/${slug}?order=${createdOrder.id}`, { replace: true });
    setStep(4);

    const checkout = await post<{ url: string | null; message?: string }>(`/orders/${createdOrder.id}/checkout`);
    if (checkout.url) {
      // The redirect is not proof of payment. The order status is the only
      // source of truth and it is polled on the provisioning step.
      location.assign(checkout.url);
      return;
    }
    setCheckoutIssue(checkout.message ?? 'Payment processing is not configured on this environment.');
  });

  // --- render -------------------------------------------------------------

  if (productState.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={3} label="Loading the product" />
      </div>
    );
  }

  if (productState.error || !product) {
    return (
      <div className="grid gap-4">
        <ErrorState
          title="Could not load this product"
          message={productState.error?.message ?? 'This product does not exist in the catalog.'}
          onRetry={productState.reload}
        />
        <Link to="/app" className={cn(linkButton, 'w-fit')}>
          Back to your dashboard
        </Link>
      </div>
    );
  }

  if (!product.deployable || !product.visible) {
    const reasons: string[] = [];
    if (!product.visible) reasons.push('It is not listed in the public catalog.');
    if (!product.deployable) reasons.push('It has not been validated for deployment yet.');
    return (
      <div className="grid gap-4">
        <Panel title="Not available to deploy">
          <EmptyState
            title={`${product.name} cannot be ordered`}
            description={`${reasons.join(' ')} Ordering is blocked until the catalog team enables it.`}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/app" className={linkButton}>
                  Back to your dashboard
                </Link>
                <Link to={catalogPath()} className={cn(linkButton, 'bg-s3 text-ink hover:bg-line')}>
                  Browse the catalog
                </Link>
              </div>
            }
          />
        </Panel>
      </div>
    );
  }

  const configuredOptions = product.options.filter((o) => optionCodes.includes(o.code));
  const total = quote?.total;
  const currency = quote?.currency ?? product.price?.currency ?? 'EUR';

  const primaryLabel =
    step === 1 ? 'Review order' : step === 2 ? 'Continue to payment' : step === 3 ? 'Pay and deploy' : orderFinished ? 'Open instance' : 'Deploying…';

  const primaryDisabled =
    (step === 3 && (!quote || placeOrder.pending)) || (step === 4 && !orderFinished);

  const onPrimary = () => {
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
    else if (step === 3) void placeOrder.run();
  };

  const primary = () => {
    if (step === 4) {
      if (instance) {
        return (
          <Link to={`/app/instances/${instance.id}`} className={linkButton}>
            Open instance
          </Link>
        );
      }
      return (
        <PrimaryButton disabled>
          {orderFinished ? 'No instance listed yet' : 'Deploying…'}
        </PrimaryButton>
      );
    }
    return (
      <PrimaryButton onClick={onPrimary} disabled={primaryDisabled}>
        {step === 3 && placeOrder.pending ? 'Working…' : primaryLabel}
      </PrimaryButton>
    );
  };

  const totalBlock = total === undefined ? (
    <span className="text-[13.5px] text-ink3">{quoteState.loading ? 'Pricing…' : 'Not available yet'}</span>
  ) : (
    <Money amount={total} currency={currency} />
  );

  return (
    <div className="grid gap-4 pb-16 lg:pb-0">
      {/* Stepper */}
      <nav aria-label="Deploy steps">
        <ol className="flex items-center gap-1 overflow-x-auto bm-hide-scroll">
          {STEP_LABELS.map((label, index) => {
            const number = index + 1;
            const done = number < step;
            const current = number === step;
            return (
              <li key={label} className="flex shrink-0 items-center gap-1.5" aria-current={current ? 'step' : undefined}>
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full text-[11.5px] font-bold',
                    done || current ? 'bg-acc text-on-acc' : 'bg-s2 text-ink3',
                  )}
                >
                  {done ? <Icon name="check" size={12} /> : number}
                </span>
                <span className={cn('text-[13px] font-bold', current ? 'text-ink' : 'text-ink3', current ? 'inline' : 'hidden sm:inline')}>
                  {label}
                </span>
                {number < STEP_LABELS.length && <span className="mx-1 h-px w-4 shrink-0 bg-s3" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
        <p className="mt-2 px-1 text-[12.5px] text-ink3 sm:hidden">
          Step {step} of {STEP_LABELS.length} · {STEP_LABELS[step - 1]}
        </p>
      </nav>

      {/* 1. Configure */}
      {step === 1 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <Panel title="Configure">
            <div className="grid gap-5">
              <TextInput
                label="Instance name"
                hint="Shown in your dashboard."
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={product.name}
                autoComplete="off"
                spellCheck={false}
              />

              <div>
                <p className="mb-2 px-1 text-[13.5px] font-bold text-ink">Memory</p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" role="group" aria-label="Memory in gigabytes">
                  {ramOptions.map((value) => (
                    <button key={value} type="button" aria-pressed={ram === value} onClick={() => setRam(value)} className={pill(ram === value)}>
                      {formatGb(value, scale)} GB
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 px-1 text-[13.5px] font-bold text-ink">
                  CPU <span className="font-mono font-normal text-ink3">vCPU</span>
                </p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" role="group" aria-label="vCPU cores">
                  {cpuOptions.map((value) => (
                    <button key={value} type="button" aria-pressed={cpu === value} onClick={() => setCpu(value)} className={pill(cpu === value)}>
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="deploy-disk" className="mb-3 flex items-center justify-between px-1 text-[13.5px] font-bold text-ink">
                  Storage
                  <span className="font-mono font-medium text-acc">{disk} GB</span>
                </label>
                <input
                  id="deploy-disk"
                  type="range"
                  min={product.minDisk}
                  max={product.maxDisk}
                  step={diskStep}
                  value={disk}
                  onChange={(e) => onDisk(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-s3 accent-acc [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-s1 [&::-webkit-slider-thumb]:bg-acc [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-s1 [&::-moz-range-thumb]:bg-acc"
                />
                <p className="mt-2 px-1 text-[12.5px] text-ink3">
                  Between {product.minDisk} GB and {product.maxDisk} GB.
                </p>
              </div>

              {product.options.length > 0 && (
                <div>
                  <p className="mb-2 px-1 text-[13.5px] font-bold text-ink">Add-ons</p>
                  <div className="grid gap-1.5">
                    {product.options.map((option) => {
                      const checked = optionCodes.includes(option.code);
                      return (
                        <label key={option.code} className="flex items-start gap-3 rounded-2xl bg-s2 p-3.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setOptionCodes((current) =>
                                current.includes(option.code)
                                  ? current.filter((code) => code !== option.code)
                                  : [...current, option.code],
                              )
                            }
                            className="mt-0.5 size-5 shrink-0 accent-acc"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-bold text-ink">{option.name}</span>
                            {option.description && <span className="mt-0.5 block text-[13px] text-ink3">{option.description}</span>}
                          </span>
                          <span className="shrink-0 font-mono text-[13.5px] text-ink2">
                            <Money amount={option.amount} currency={option.currency} />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Estimate">
            <div aria-live="polite" className="grid gap-2.5">
              <p className="text-[13px] uppercase tracking-[0.08em] text-ink3">Per month</p>
              {quoteState.loading && !quote ? (
                <LoadingBlock rows={1} label="Getting your price" />
              ) : quoteState.error && !quote ? (
                <ErrorState
                  title="Could not price this configuration"
                  message={quoteState.error.message}
                  onRetry={quoteState.reload}
                />
              ) : quote ? (
                <div className="font-mono text-[30px] font-semibold leading-none tracking-[-0.045em] text-ink">
                  <Money amount={quote.total} currency={quote.currency} />
                </div>
              ) : (
                <p className="text-[14px] text-ink3">Not available yet</p>
              )}
              <p className="text-[12.5px] text-ink3">Priced by the server on every change.</p>
            </div>
          </Panel>
        </div>
      )}

      {/* 2. Review */}
      {step === 2 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <Panel title="Review">
            <dl className="grid gap-2">
              <Row label="Product">
                <Link
                  to={productPath(product.slug)}
                  className="text-acc transition-colors duration-[180ms] hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                >
                  {product.name}
                </Link>
              </Row>
              <Row label="Name">{name || product.slug}</Row>
              <Row label="Memory">{formatGb(ram, scale)} GB</Row>
              <Row label="vCPU">{cpu}</Row>
              <Row label="Storage">{disk} GB</Row>
              {configuredOptions.map((option) => (
                <Row key={option.code} label={option.name}>
                  <Money amount={option.amount} currency={option.currency} />
                </Row>
              ))}
            </dl>
          </Panel>

          <div className="grid gap-4">
            <Panel title="Promotion">
              <TextInput
                label="Promotion code"
                hint="Optional. The server confirms whether it applies."
                value={promotionCode}
                onChange={(e) => setPromotionCode(e.target.value)}
                placeholder="Enter a code"
                autoComplete="off"
                spellCheck={false}
              />
              <div aria-live="polite" className="mt-3">
                {!promotion || !promotionTyped ? (
                  <p className="text-[12.5px] text-ink3">No promotion code applied.</p>
                ) : promotion.valid ? (
                  <p className="rounded-2xl bg-acc-bg px-3.5 py-3 text-[13.5px] font-bold text-acc">
                    {promotion.code} applied.
                  </p>
                ) : (
                  <p role="alert" className="rounded-2xl bg-bad/12 px-3.5 py-3 text-[13.5px] font-bold text-bad">
                    {promotion.reason || `${promotion.code} is not valid.`}
                  </p>
                )}
              </div>
            </Panel>

            <Panel title="Price">
              <div aria-live="polite" className="grid gap-2">
                {quoteState.loading && !quote ? (
                  <LoadingBlock rows={2} label="Getting your price" />
                ) : quoteState.error && !quote ? (
                  <ErrorState
                    title="Could not price this configuration"
                    message={quoteState.error.message}
                    onRetry={quoteState.reload}
                  />
                ) : quote ? (
                  <>
                    <div className="flex items-center justify-between rounded-2xl bg-s2 px-3.5 py-3">
                      <span className="text-[13.5px] text-ink2">Subtotal</span>
                      <span className="text-[14.5px] font-bold text-ink">
                        <Money amount={quote.subtotal} currency={quote.currency} />
                      </span>
                    </div>
                    {quote.discount > 0 && (
                      <div className="flex items-center justify-between rounded-2xl bg-acc-bg px-3.5 py-3">
                        <span className="text-[13.5px] text-ink2">Discount</span>
                        <span className="text-[14.5px] font-bold text-acc">
                          -<Money amount={quote.discount} currency={quote.currency} />
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between rounded-2xl bg-s3 px-3.5 py-3.5">
                      <span className="text-[14px] font-bold text-ink">Total per month</span>
                      <span className="font-mono text-[20px] font-semibold tracking-[-0.03em] text-ink">
                        <Money amount={quote.total} currency={quote.currency} />
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-[14px] text-ink3">Not available yet</p>
                )}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* 3. Payment */}
      {step === 3 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <Panel title="Payment">
            <div className="grid gap-3">
              <p className="text-[14.5px] text-ink2">
                We create the order and open a secure checkout page. The order is only marked as paid by the server.
              </p>
              <dl className="grid gap-2">
                <Row label="Product">{product.name}</Row>
                <Row label="Name">{name || product.slug}</Row>
                <Row label="Memory">{formatGb(ram, scale)} GB</Row>
                <Row label="vCPU">{cpu}</Row>
                <Row label="Storage">{disk} GB</Row>
                <Row label="Total per month">
                  {quote ? <Money amount={quote.total} currency={quote.currency} /> : 'Not available yet'}
                </Row>
              </dl>
              {placeOrder.error && (
                <div role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-bold text-bad">
                  {placeOrder.error}
                </div>
              )}
              {checkoutIssue && (
                <div role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] text-ink2">
                  <p className="font-bold text-bad">Checkout is not available</p>
                  <p className="mt-1">{checkoutIssue}</p>
                  <p className="mt-2">
                    The order was created and stays unpaid.{' '}
                    <Link to="/app/tickets" className="font-bold text-acc hover:underline">
                      Open a support ticket
                    </Link>{' '}
                    to finish the payment.
                  </p>
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* 4. Provisioning */}
      {step === 4 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <Panel title="Provisioning">
            <div aria-live="polite" className="grid gap-3">
              {orderState.loading && !order ? (
                <LoadingBlock rows={2} label="Checking the order" />
              ) : orderState.error ? (
                <ErrorState
                  title="Could not read the order"
                  message={orderState.error.message}
                  onRetry={orderState.reload}
                />
              ) : order ? (
                <>
                  <ListRow
                    title={`Order ${order.number}`}
                    meta={`Created ${formatDateTime(order.createdAt)}`}
                    right={<StatusPill status={order.status} label={ORDER_STATUS_LABELS[orderStatus] ?? order.status} />}
                  />
                  {orderStatus === 'PAID' && (
                    <p className="rounded-2xl bg-acc-bg px-4 py-3 text-[14px] text-ink2">
                      The server confirmed the payment. Your instance is being created.
                    </p>
                  )}
                  {orderStatus === 'AWAITING_PAYMENT' && (
                    <p className="rounded-2xl bg-s3 px-4 py-3 text-[14px] text-ink2">
                      The order is waiting for payment. Finish it in the checkout page you were sent to.
                    </p>
                  )}
                  {instancesState.loading && !instance ? (
                    <LoadingBlock rows={1} label="Looking for the instance" />
                  ) : instance ? (
                    <ListRow
                      title={instance.name}
                      meta={`${instance.product.name} · ${instance.ram} RAM · ${instance.cpu} vCPU · ${instance.disk} GB disk`}
                      right={<StatusPill status={instance.status} />}
                      to={`/app/instances/${instance.id}`}
                    />
                  ) : (
                    <p className="rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink2">
                      The instance has not appeared yet. This page refreshes every few seconds.
                    </p>
                  )}
                </>
              ) : (
                <p className="rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink2">No order was created yet.</p>
              )}

              {instanceFailed && (
                <div role="alert" className="rounded-2xl bg-bad/12 px-4 py-3">
                  <p className="text-[15px] font-extrabold text-bad">Provisioning failed</p>
                  {eventsState.loading ? (
                    <LoadingBlock rows={1} label="Reading the failure" />
                  ) : eventsState.error ? (
                    <p className="mt-1 text-[14px] text-ink2">{eventsState.error.message}</p>
                  ) : events.length ? (
                    <ul className="mt-2 grid gap-1.5">
                      {events.slice(-3).map((event) => (
                        <li key={event.id} className="font-mono text-[12.5px] text-ink2">
                          {event.message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[14px] text-ink2">The server did not return an error message for this failure.</p>
                  )}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Next">
            <div className="grid gap-2 text-[14px] text-ink2">
              {orderFinished ? (
                <p>Your instance is ready. Open it to see the console, files and metrics.</p>
              ) : (
                <p>
                  This page polls the order every few seconds. Nothing here is simulated: the status comes from the
                  server.
                </p>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* Desktop action row */}
      <div className="hidden items-center justify-between gap-3 lg:flex">
        {step > 1 && step < 4 ? (
          <SoftButton onClick={() => setStep(Math.max(1, step - 1) as DeployStep)}>Back</SoftButton>
        ) : (
          <span />
        )}
        {primary()}
      </div>

      {/* Phone sticky action bar */}
      <div className="fixed inset-x-0 bottom-[76px] z-20 flex items-center justify-between gap-3 bg-s3 px-4 py-3 lg:hidden">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Per month</p>
          <p className="font-mono text-[20px] font-semibold leading-tight tracking-[-0.04em] tabular-nums text-ink">
            {totalBlock}
          </p>
        </div>
        {primary()}
      </div>
    </div>
  );
}
