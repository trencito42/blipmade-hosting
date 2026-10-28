import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  api,
  get,
  post,
  type CatalogProduct,
  type Instance,
  type MailPlanOrder,
  type MailPlanView,
  type Order,
  type Quote,
} from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { cn } from '../lib';
import { Icon } from '../icons';
import { Link, useParams, useRouter } from '../router';
import { catalogPath, formatPrice, memLabel, periodSuffix, productPath } from '../lib/pricing';
import {
  configurationFromQuery,
  cpuOptions,
  deployPathFor,
  diskOptions,
  isOrderable,
  optionCodesFromQuery,
  orderBlockers,
  ramOptions,
  recommendedPreset,
  recommendedPrice,
  sameConfiguration,
  startingConfiguration,
  startingPrice,
  type ResourceConfiguration,
} from '../lib/pricing-contract';
import { rangeInput } from '../ui';
import {
  EmptyState,
  ErrorState,
  ListRow,
  LoadingBlock,
  Money,
  Panel,
  PrimaryButton,
  ScrollRow,
  Select,
  SoftButton,
  StatusPill,
  TextInput,
} from '../ui-app';
import { mailPlanOptionLabel, onSaleMailPlans, validateMailDomainName } from './Mail';

/**
 * Deploy flow. Every number that looks like a price comes from
 * POST /catalog/quote. Nothing is priced on the client.
 */

/** The line of a server in an order. */
export interface DeployServerOrderItem {
  productSlug: string;
  name: string;
  ram: number;
  cpu: number;
  disk: number;
  optionCodes: string[];
  /**
   * The values of the variables the product asks the customer for, such as the
   * licence of a game. They are secrets of the customer: they never travel in
   * the address of the page, only in the order.
   */
  variables?: Record<string, string>;
}

/**
 * The lines of an order of a server.
 *
 * The server is one line. The hosted mail, when the customer chose it, is
 * another line of its own: it names the plan and the domain it brings, and no
 * resources, because the plan of the line is the whole configuration.
 */
export function buildDeployOrderItems(
  server: DeployServerOrderItem,
  mail: MailPlanOrder | null,
): (DeployServerOrderItem | MailPlanOrder)[] {
  const items: (DeployServerOrderItem | MailPlanOrder)[] = [
    {
      productSlug: server.productSlug,
      name: server.name,
      ram: server.ram,
      cpu: server.cpu,
      disk: server.disk,
      optionCodes: server.optionCodes,
      ...(server.variables && Object.keys(server.variables).length > 0 ? { variables: server.variables } : {}),
    },
  ];
  if (mail) {
    items.push({ productSlug: mail.productSlug, mailDomain: mail.mailDomain });
  }
  return items;
}

/**
 * The line of the hosted mail in the summary of an order.
 *
 * It is a line of its own, under the line of the server, with the price the
 * platform asks for it.
 */
export function DeployMailLine({
  plan,
  amount,
  currency,
  period,
  hostname,
}: {
  plan: MailPlanView | null;
  /** The price of the line, as the server priced it. */
  amount: number | null;
  currency: string | null;
  /** The period of the price, as the platform named it. */
  period: string;
  /** The hostname the mail will live on. */
  hostname: string;
}) {
  if (!plan) return null;
  return (
    <>
      <Row label={`Hosted mail · ${plan.name}`}>
        {amount !== null && currency ? (
          <span className="inline-flex items-baseline gap-1.5">
            <Money amount={amount} currency={currency} />
            {period && <span className="text-[12.5px] font-normal text-ink3">{periodSuffix(period)}</span>}
          </span>
        ) : (
          'Not available yet'
        )}
      </Row>
      <Row label="Mail domain">{hostname || 'The hostname is missing.'}</Row>
    </>
  );
}

type DeployStep = 1 | 2 | 3 | 4;

const STEP_LABELS = ['Configure', 'Review', 'Payment', 'Provisioning'] as const;

/**
 * The step of the flow, read from the address. An order in the address means
 * the customer comes back from the payment page.
 */
function stepFromQuery(query: Record<string, string>, orderId: string | null): DeployStep {
  if (orderId) return 4;
  const raw = Number(query.step);
  if (raw === 2 || raw === 3 || raw === 4) return raw;
  return 1;
}

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
 * The catalogue stores memory in MB (the Pterodactyl convention) and the
 * server prices it that way, so every memory size of the interface is written
 * with the same helper: memLabel().
 */

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
      <dd className="w-0 min-w-0 flex-1 truncate text-right text-[14.5px] font-bold text-ink">{children}</dd>
    </div>
  );
}

/**
 * A configuration the customer can take in one click, with its price.
 *
 * The price is the price of that configuration, calculated by the server. It
 * is never the price of another one, so a shortcut can never surprise the
 * customer with a different amount later.
 */
function Preset({
  label,
  detail,
  price,
  active,
  onClick,
}: {
  label: string;
  detail: string;
  price: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
        active ? 'bg-ink text-bg' : 'bg-s2 text-ink hover:bg-s3',
      )}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-bold">{label}</span>
        <span className={cn('block text-[12.5px]', active ? 'opacity-75' : 'text-ink3')}>{detail}</span>
      </span>
      <span className="shrink-0 font-mono text-[13.5px] font-semibold">{price}</span>
    </button>
  );
}

export default function Deploy() {
  const { slug = '' } = useParams();
  const { query, navigate } = useRouter();

  const [name, setName] = useState('');
  const [promotionCode, setPromotionCode] = useState('');
  const [checkoutIssue, setCheckoutIssue] = useState<string | null>(null);
  // The values of the variables the product asks the customer for. They are
  // the secrets of the customer, so they live in the page and never in the
  // address of it.
  const [variables, setVariables] = useState<Record<string, string>>({});

  // The add-on of hosted mail. It is never preselected: the customer chooses
  // the plan and the domain, and the order carries them as a line of its own.
  const [mailPlanSlug, setMailPlanSlug] = useState('');
  const [mailDomain, setMailDomain] = useState('');

  const seeded = useRef<string | null>(null);

  // --- hosted mail add-on --------------------------------------------------

  // The plans of hosted mail. The sale of hosted mail can be closed by the
  // operator, and a plan that is not on sale is never offered.
  const mailPlansState = useAsync<{ plans: MailPlanView[] }>(
    (signal) => get<{ plans: MailPlanView[] }>('/mail/plans', undefined, signal),
    [],
  );
  const mailPlans = useMemo(() => onSaleMailPlans(mailPlansState.data?.plans ?? []), [mailPlansState.data]);
  const mailPlan = useMemo(
    () => mailPlans.find((plan) => plan.slug === mailPlanSlug) ?? null,
    [mailPlans, mailPlanSlug],
  );

  // The line of mail of the order. It is only there when the customer chose a
  // plan and wrote a hostname that is one.
  const mailHostname = mailDomain.trim().toLowerCase();
  const mailDomainProblem = mailPlan ? validateMailDomainName(mailHostname) : null;
  // An empty field is not a mistake: the customer may still be typing. A name
  // that is written and is not a hostname is.
  const mailDomainError = mailHostname === '' ? null : mailDomainProblem;
  const mailLine = useMemo<MailPlanOrder | null>(() => {
    if (!mailPlan || mailDomainProblem || !mailHostname) return null;
    return { productSlug: mailPlan.slug, mailDomain: mailHostname };
  }, [mailPlan, mailDomainProblem, mailHostname]);
  const mailLineKey = mailLine ? `${mailLine.productSlug}:${mailLine.mailDomain}` : '';

  // --- product ------------------------------------------------------------

  const productState = useAsync<{ product: CatalogProduct }>(
    (signal) => get<{ product: CatalogProduct }>(`/catalog/products/${encodeURIComponent(slug)}`, undefined, signal),
    [slug],
  );
  const product = productState.data?.product;

  // The configuration, the step and the order live in the address. A refresh,
  // a link and the back button bring the customer back to the same
  // deployment, and the page never holds a state the server cannot see.
  const config = useMemo<ResourceConfiguration | null>(
    () => (product ? configurationFromQuery(query, product) : null),
    [product, query],
  );
  const optionCodes = useMemo(() => (product ? optionCodesFromQuery(query, product) : []), [product, query]);
  const orderId = query.order ?? null;
  const step = useMemo(() => stepFromQuery(query, orderId), [query.step, orderId]);

  const ram = config?.ram ?? 0;
  const cpu = config?.cpu ?? 0;
  const disk = config?.disk ?? 0;

  useEffect(() => {
    if (!product || seeded.current === product.id) return;
    seeded.current = product.id;
    setName(product.slug);
  }, [product]);

  /**
   * The address of the deploy page with a configuration, a step and an order.
   * Everything the customer chose travels in it, so the flow can be shared,
   * reloaded and walked through with the back button.
   */
  const address = (overrides: {
    config?: ResourceConfiguration;
    options?: string[];
    step?: DeployStep;
    order?: string | null;
  } = {}): string => {
    const target = overrides.config ?? config ?? { ram: 0, cpu: 0, disk: 0 };
    const options = overrides.options ?? optionCodes;
    const extra: Record<string, string> = {};
    const targetStep = overrides.step ?? step;
    if (targetStep > 1) extra.step = String(targetStep);
    const order = overrides.order === undefined ? orderId : overrides.order;
    if (order) extra.order = order;
    return deployPathFor(slug, target, options, extra);
  };

  /** A change of resources keeps the customer on the page. */
  const applyConfig = (next: Partial<ResourceConfiguration>) => {
    if (!config) return;
    navigate(address({ config: { ...config, ...next } }), { replace: true, scroll: false });
  };

  /** A change of add-ons keeps the customer on the page too. */
  const applyOptions = (next: string[]) => {
    navigate(address({ options: next }), { replace: true, scroll: false });
  };

  /** A step of the flow is a page of its own, so the back button walks back. */
  const goToStep = (next: DeployStep) => {
    navigate(address({ step: next }));
  };

  // The options of the control come from the contract, the same place the
  // estimate and the price book get their configuration from. The smallest
  // configuration, the recommended one and the largest one are always among
  // them, so the control can always show what the server prices.
  const ramChoices = useMemo(() => (product ? ramOptions(product) : []), [product]);
  const cpuChoices = useMemo(() => (product ? cpuOptions(product) : []), [product]);
  const diskChoices = useMemo(() => (product ? diskOptions(product) : []), [product]);

  /** The position of a size in the grid of the control. */
  const diskPosition = Math.max(0, diskChoices.indexOf(disk));

  const onDisk = (position: number) => {
    const value = diskChoices[position];
    if (value === undefined) return;
    applyConfig({ disk: value });
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
        items: [
          { productSlug: product.slug, ram, cpu, disk, optionCodes },
          // The hosted mail is a line of its own in the estimate too, so the
          // sum that is shown is the sum that is charged.
          ...(mailLine ? [mailLine] : []),
        ],
        ...(trimmedPromo ? { promotionCode: trimmedPromo } : {}),
      },
      signal,
    });
  }, [product?.slug, ram, cpu, disk, optionKey, trimmedPromo, mailLineKey]);

  const quote = quoteState.data ?? null;

  /** The price of the line of mail, as the server priced it. */
  const mailQuoteItem = mailPlan ? quote?.items.find((item) => item.productSlug === mailPlan.slug) : undefined;
  const mailAmount = mailQuoteItem?.total ?? mailPlan?.price?.amount ?? null;
  const mailCurrency = mailQuoteItem?.currency ?? mailPlan?.price?.currency ?? null;
  const mailPeriod = mailPlan?.price?.period ?? quote?.period ?? '';

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

  // The order of a payment that came back is in the address, so the page
  // picks it up on its own.

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
      // The server is one line and the hosted mail is another, when the
      // customer chose one. Nothing is priced here: the server prices the
      // order.
      items: buildDeployOrderItems(
        {
          productSlug: product.slug,
          name: name.trim() || product.slug,
          ram,
          cpu,
          disk,
          optionCodes,
          variables,
        },
        mailLine,
      ),
      ...(trimmedPromo ? { promotionCode: trimmedPromo } : {}),
      // The order is placed with the period of the quote, so the sum that was
      // shown to the customer is the sum that is charged.
      ...(quote ? { period: quote.period } : {}),
    });
    const createdOrder = created.order;
    setCheckoutIssue(null);
    // The configuration stays in the address, so the customer comes back to
    // the same deployment after the payment.
    navigate(address({ order: createdOrder.id, step: 4 }), { replace: true });

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

  if (!isOrderable(product) || !product.visible) {
    const reasons: string[] = [];
    if (!product.visible) reasons.push('It is not listed in the public catalog.');
    const blockers = orderBlockers(product);
    if (blockers.length) reasons.push(...blockers);
    if (!reasons.length) reasons.push('It is not validated for deployment yet.');
    return (
      <div className="grid gap-4">
        <Panel title="Not available to deploy">
          <EmptyState
            title={`${product.name} cannot be ordered`}
            description={`${reasons.join(' ')} Ordering is blocked until the catalog team enables it.`}
            action={
              <div className="grid w-full gap-2 sm:flex sm:flex-wrap sm:justify-center">
                <Link to="/app" className={cn(linkButton, 'w-full sm:w-auto')}>
                  Back to your dashboard
                </Link>
                <Link to={catalogPath()} className={cn(linkButton, 'bg-s3 text-ink hover:bg-line', 'w-full sm:w-auto')}>
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

  // The two configurations the catalog talks about, with their prices. The
  // starting price is the price of the smallest configuration; the
  // recommended configuration is a bigger one and has its own price.
  const startConfiguration = startingConfiguration(product);
  const startAmount = startingPrice(product);
  const recommendation = recommendedPreset(product);
  const recommendationAmount = recommendedPrice(product);
  const atRecommendation = config ? sameConfiguration(config, recommendation) : false;

  const primaryLabel =
    step === 1 ? 'Review order' : step === 2 ? 'Continue to payment' : step === 3 ? 'Pay and deploy' : orderFinished ? 'Open instance' : 'Deploying…';

  // The variables the product asks the customer for. A product that asks for
  // nothing has none, and the order is free to go.
  const customerVariables = product.customerVariables ?? {};
  const missingVariables = Object.entries(customerVariables)
    .filter(([name, spec]) => spec.required && !(variables[name] ?? '').trim())
    .map(([name]) => name);

  const primaryDisabled =
    (step === 3 && (!quote || placeOrder.pending)) ||
    (step === 4 && !orderFinished) ||
    // The order is never sent with a hosted mail add-on that has no hostname.
    (mailPlan !== null && mailDomainProblem !== null) ||
    // The order is never sent without the values the product asks for.
    missingVariables.length > 0;

  const onPrimary = () => {
    if (step === 1) goToStep(2);
    else if (step === 2) goToStep(3);
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
    <div className="grid gap-4">
      {/* Stepper */}
      <nav aria-label="Deploy steps">
        {/* The steps stay in one row and scroll sideways on a phone. The strip
            fades at the right edge, so it is clear that there is more to the
            side, and the step under the finger is always named below. */}
        <ScrollRow className="-mx-4 sm:mx-0" innerClassName="items-center gap-1 px-4 sm:px-0">
        <ol className="flex w-max shrink-0 items-center gap-1">
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
        </ScrollRow>
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

              {/* The recommended configuration is one click away, and it
                  carries its own price. The price of the smallest
                  configuration is in the estimate on the right. */}
              {recommendationAmount !== null && (
                <Preset
                  label="Recommended configuration"
                  detail={`${memLabel(recommendation.ram)} · ${recommendation.cpu} vCPU · ${recommendation.disk} GB disk`}
                  price={`${formatPrice(recommendationAmount, currency)}${periodSuffix(product.price?.period ?? 'MONTHLY')}`}
                  active={atRecommendation}
                  onClick={() => applyConfig(recommendation)}
                />
              )}

              <div>
                <p className="mb-2 px-1 text-[13.5px] font-bold text-ink">Memory</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Memory">
                  {ramChoices.map((value) => (
                    <button key={value} type="button" aria-pressed={ram === value} onClick={() => applyConfig({ ram: value })} className={pill(ram === value)}>
                      {memLabel(value)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 px-1 text-[13.5px] font-bold text-ink">
                  CPU <span className="font-mono font-normal text-ink3">vCPU</span>
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="vCPU cores">
                  {cpuChoices.map((value) => (
                    <button key={value} type="button" aria-pressed={cpu === value} onClick={() => applyConfig({ cpu: value })} className={pill(cpu === value)}>
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
                {/* The control walks over the sizes of the contract, so every
                    size it offers is one the server accepts and prices. The
                    control is 44px tall, so the finger has room to drag it,
                    and the track is drawn inside that height. */}
                <input
                  id="deploy-disk"
                  type="range"
                  min={0}
                  max={Math.max(0, diskChoices.length - 1)}
                  step={1}
                  value={diskPosition}
                  aria-valuetext={`${disk} GB`}
                  onChange={(e) => onDisk(Number(e.target.value))}
                  className={rangeInput}
                />
                <p className="mt-2 px-1 text-[12.5px] text-ink3">
                  Between {diskChoices[0] ?? product.minDisk} GB and {diskChoices[diskChoices.length - 1] ?? product.maxDisk} GB.
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
                              applyOptions(
                                optionCodes.includes(option.code)
                                  ? optionCodes.filter((code) => code !== option.code)
                                  : [...optionCodes, option.code],
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

              {Object.keys(customerVariables).length > 0 && (
                <div>
                  <p className="mb-2 px-1 text-[13.5px] font-bold text-ink">
                    What this service needs from you
                  </p>
                  <p className="mb-3 px-1 text-[12.5px] leading-relaxed text-ink3">
                    These values are the secret of your account and they are kept
                    encrypted. They are put in the container of your service and
                    nobody else reads them.
                  </p>
                  <div className="grid gap-3">
                    {Object.entries(customerVariables).map(([name, spec]) => (
                      <TextInput
                        key={name}
                        id={`deploy-variable-${name}`}
                        label={spec.label}
                        hint={spec.description}
                        type={spec.type === 'password' ? 'password' : 'text'}
                        autoComplete="off"
                        value={variables[name] ?? ''}
                        onChange={(event) =>
                          setVariables((current) => ({ ...current, [name]: event.target.value }))
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* The hosted mail is an add-on of its own. It is never chosen
                  for the customer: the first choice of the list is the one
                  without it, and the add-on becomes a line of its own in the
                  order. */}
              <div className="rounded-2xl bg-s2 p-3.5">
                <p className="text-[13.5px] font-bold text-ink">Add hosted mail</p>
                {mailPlansState.error ? (
                  <p className="mt-2 text-[13px] leading-relaxed text-ink2">
                    The plans of hosted mail could not be loaded, so they cannot be added to this order.
                  </p>
                ) : mailPlans.length === 0 ? (
                  <p className="mt-2 text-[13px] leading-relaxed text-ink2">
                    Hosted mail is not on sale at the moment, so it cannot be added to this order.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-3">
                    <Select
                      label="Plan of hosted mail"
                      value={mailPlanSlug}
                      onChange={(event) => setMailPlanSlug(event.target.value)}
                      hint="Optional. The first choice is the one without hosted mail."
                    >
                      <option value="">No email hosting</option>
                      {mailPlans.map((plan) => (
                        <option key={plan.slug} value={plan.slug}>
                          {mailPlanOptionLabel(plan)}
                        </option>
                      ))}
                    </Select>

                    {mailPlan && (
                      <>
                        <TextInput
                          label="Mail domain"
                          value={mailDomain}
                          onChange={(event) => setMailDomain(event.target.value)}
                          error={mailDomainError ?? undefined}
                          hint="The hostname that will carry the mail."
                          placeholder="acme.ro"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <p className="text-[12.5px] leading-relaxed text-ink3">
                          {mailPlan.name} costs{' '}
                          {mailPlan.price && (
                            <span className="font-mono text-ink2">
                              <Money amount={mailPlan.price.amount} currency={mailPlan.price.currency} />
                              {periodSuffix(mailPlan.price.period)}
                            </span>
                          )}{' '}
                          and it is a line of its own in the order.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
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
              {/* The starting price and the recommended price are two prices
                  of two configurations. They are never mixed up. */}
              {startAmount !== null && (
                <p className="text-[12.5px] leading-relaxed text-ink3">
                  Starting price{' '}
                  <span className="font-mono text-ink2">
                    {formatPrice(startAmount, currency)}
                    {periodSuffix(product.price?.period ?? 'MONTHLY')}
                  </span>{' '}
                  for the smallest configuration: {memLabel(startConfiguration.ram)} · {startConfiguration.cpu} vCPU ·{' '}
                  {startConfiguration.disk} GB disk.
                </p>
              )}
              {recommendationAmount !== null && !atRecommendation && (
                <p className="text-[12.5px] leading-relaxed text-ink3">
                  Recommended configuration ({memLabel(recommendation.ram)} · {recommendation.cpu} vCPU · {recommendation.disk} GB
                  disk):{' '}
                  <span className="font-mono text-ink2">
                    {formatPrice(recommendationAmount, currency)}
                    {periodSuffix(product.price?.period ?? 'MONTHLY')}
                  </span>
                  .
                </p>
              )}
              <p className="text-[12.5px] text-ink3">
                The amount above is the price of the configuration you chose. Priced by the server on every change.
              </p>
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
              <Row label="Memory">{memLabel(ram)}</Row>
              <Row label="vCPU">{cpu}</Row>
              <Row label="Storage">{disk} GB</Row>
              {configuredOptions.map((option) => (
                <Row key={option.code} label={option.name}>
                  <Money amount={option.amount} currency={option.currency} />
                </Row>
              ))}
              {/* The hosted mail is a line of its own, under the line of the
                  server, with the price the platform asks for it. */}
              <DeployMailLine
                plan={mailPlan}
                amount={mailAmount}
                currency={mailCurrency}
                period={mailPeriod}
                hostname={mailHostname}
              />
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
                <Row label="Memory">{memLabel(ram)}</Row>
                <Row label="vCPU">{cpu}</Row>
                <Row label="Storage">{disk} GB</Row>
                {/* The hosted mail is a line of its own, under the line of the
                    server, with the price the platform asks for it. */}
                <DeployMailLine
                  plan={mailPlan}
                  amount={mailAmount}
                  currency={mailCurrency}
                  period={mailPeriod}
                  hostname={mailHostname}
                />
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
          <SoftButton onClick={() => goToStep(Math.max(1, step - 1) as DeployStep)}>Back</SoftButton>
        ) : (
          <span />
        )}
        {primary()}
      </div>

      {/* Phone action row. It is part of the page and not pinned to the bottom
          of the screen: a pinned bar is covered by the software keyboard and
          can hide the field that is being typed into. The price sits right
          above the action, so the number is always next to the button. */}
      <div className="grid gap-2 lg:hidden">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-s3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Per month</p>
            <p className="font-mono text-[20px] font-semibold leading-tight tracking-[-0.04em] tabular-nums text-ink">
              {totalBlock}
            </p>
          </div>
          {step > 1 && step < 4 && (
            <SoftButton onClick={() => goToStep(Math.max(1, step - 1) as DeployStep)} className="shrink-0">
              Back
            </SoftButton>
          )}
        </div>
        <div className="[&>*]:w-full">{primary()}</div>
      </div>
    </div>
  );
}
