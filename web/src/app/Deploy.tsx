import { BillingAddressFields, emptyBillingAddress, type BillingAddressValue } from './BillingAddressFields';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
  type QuoteTax,
  type ResourceBreakdown,
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
import { ProductTile } from '../ui';
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
import { mailCheckoutPath } from './EmailHosting';
import { PLATFORM_BASE } from './Domains';
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

/**
 * The steps a customer sees. The review of the order sits beside the choices,
 * so there is no page of its own for it: the third step of the address is the
 * second one on the screen. An address that still says `step=2` opens the
 * first one.
 */
const VISIBLE_STEPS: { step: DeployStep; label: string }[] = [
  { step: 1, label: 'Configure' },
  { step: 3, label: 'Payment' },
  { step: 4, label: 'Deploy' },
];

/** The step before another one, as the customer sees them. */
const previousStep = (step: DeployStep): DeployStep => (step === 3 ? 1 : (Math.max(1, step - 1) as DeployStep));

/**
 * The step of the flow, read from the address. An order in the address means
 * the customer comes back from the payment page.
 */
function stepFromQuery(query: Record<string, string>, orderId: string | null): DeployStep {
  if (orderId) return 4;
  const raw = Number(query.step);
  if (raw === 3 || raw === 4) return raw;
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
    'h-11 whitespace-nowrap rounded-full border px-3 text-[13.5px] font-medium transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc lg:h-10',
    on ? 'border-acc bg-acc text-on-acc' : 'border-line bg-card text-ink2 hover:bg-s3 hover:text-ink',
  );

const linkButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-acc px-5 text-[14.5px] font-semibold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3.5 py-3">
      <dt className="text-[13.5px] text-ink2">{label}</dt>
      <dd className="w-0 min-w-0 flex-1 truncate text-right text-[14.5px] font-medium text-ink">{children}</dd>
    </div>
  );
}

/**
 * The parts of the price of a line of server.
 *
 * The price of a server is the price of what it holds, plus the fee of the
 * instance itself. The parts come from the server, and they add up to the
 * price that was quoted: the page never derives an amount of its own.
 */
function Breakdown({
  breakdown,
  currency,
}: {
  breakdown: ResourceBreakdown;
  currency: string;
}) {
  return (
    <dl className="grid gap-2">
      <Row label="Memory">
        <Money amount={breakdown.ram} currency={currency} />
      </Row>
      <Row label="Processor">
        <Money amount={breakdown.cpu} currency={currency} />
      </Row>
      <Row label="Storage">
        <Money amount={breakdown.disk} currency={currency} />
      </Row>
      <Row label="Instance fee">
        <Money amount={breakdown.base} currency={currency} />
      </Row>
      {breakdown.options > 0 && (
        <Row label="Add-ons">
          <Money amount={breakdown.options} currency={currency} />
        </Row>
      )}
    </dl>
  );
}

/**
 * The period of a quote, in words.
 *
 * The card of the resources is the price of a month, and a year is twelve
 * months of it, so the label of a total follows the period that was quoted.
 */
function periodWord(period: string | undefined): string {
  return period === 'YEARLY' ? 'year' : 'month';
}

/**
 * The tax of the invoice.
 *
 * The platform adds the tax to the invoices it writes itself, and only when
 * the operator wrote a rate and a tax identifier. The note says why the line
 * is zero, so the customer is never left guessing.
 */
function TaxLine({ tax, currency }: { tax: QuoteTax | undefined; currency: string }) {
  if (!tax) return null;
  if (!tax.applies) {
    return (
      <div className="rounded-xl border border-line bg-card px-3.5 py-3">
        <p className="text-[12.5px] leading-relaxed text-ink3">
          {tax.note ?? 'No tax is added to this invoice.'}
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between rounded-xl border border-line bg-card px-3.5 py-3">
        <span className="text-[13.5px] text-ink2">VAT ({tax.rate}%)</span>
        <span className="text-[14.5px] font-medium text-ink">
          <Money amount={tax.amount} currency={currency} />
        </span>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-line bg-card px-3.5 py-3">
        <span className="text-[13.5px] text-ink2">Total on the invoice</span>
        <span className="text-[14.5px] font-medium text-ink">
          <Money amount={tax.total} currency={currency} />
        </span>
      </div>
    </>
  );
}

/**
 * A configuration the customer can take in one click, with its price.
 *
 * The price is the price of that configuration, calculated by the server. It
 * is never the price of another one, so a shortcut can never surprise the
 * customer with a different amount later.
 */
/**
 * A slider over the sizes of the contract.
 *
 * The control walks over the sizes the server accepts and prices, like the
 * sliders of the home page, so every size it offers is one that can be
 * ordered. The value and the two ends are written beside it.
 */
function ChoiceSlider({
  label,
  choices,
  value,
  format,
  onChange,
}: {
  label: string;
  choices: number[];
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  if (choices.length === 0) return null;
  const found = choices.indexOf(value);
  const position = found === -1 ? 0 : found;
  return (
    <div>
      <label htmlFor={id} className="mb-3 flex items-baseline justify-between px-1 font-display text-[17px] font-semibold text-ink">
        {label}
        <span className="font-mono text-[16px] font-medium text-acc">{format(value)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={choices.length - 1}
        step={1}
        value={position}
        aria-valuetext={format(value)}
        onChange={(event) => onChange(choices[Number(event.target.value)] ?? value)}
        style={{ '--p': `${choices.length > 1 ? (position / (choices.length - 1)) * 100 : 100}%` } as CSSProperties}
      />
      <p className="mt-2 flex justify-between px-1 font-mono text-[12.5px] text-ink3">
        <span>{format(choices[0]!)}</span>
        <span>{format(choices[choices.length - 1]!)}</span>
      </p>
    </div>
  );
}

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
        'flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
        active ? 'border-acc bg-acc text-on-acc' : 'border-line bg-card text-ink hover:bg-s3',
      )}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">{label}</span>
        <span className={cn('block text-[12.5px]', active ? 'opacity-75' : 'text-ink3')}>{detail}</span>
      </span>
      <span className="shrink-0 font-mono text-[13.5px] font-semibold">{price}</span>
    </button>
  );
}

/** The name of an instance as the label of its address, like the server writes it. */
function addressLabel(name: string): string {
  const label = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return label.length >= 3 ? label : `${label || 'name'}-xxxxx`;
}

export default function Deploy() {
  const { slug = '' } = useParams();
  const { query, navigate } = useRouter();

  const [name, setName] = useState('');
  const [promotionCode, setPromotionCode] = useState('');
  const [billingAddress, setBillingAddress] = useState<BillingAddressValue>(emptyBillingAddress);
  const [billingTouched, setBillingTouched] = useState(false);
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
  useEffect(() => {
    if (step !== 3 || billingTouched) return;
    void get<{ billingAddress: BillingAddressValue | null }>('/settings').then((answer) => {
      if (answer.billingAddress) setBillingAddress(answer.billingAddress);
    }).catch(() => {});
  }, [step, billingTouched]);


  // A plan of hosted mail has no memory, vCPU or disk to choose: it is ordered
  // on the checkout of the mail, which asks for the domain first.
  useEffect(() => {
    if (product?.category === 'EMAIL_HOSTING') navigate(mailCheckoutPath(product.slug), { replace: true });
    if (product?.category === 'VPS') navigate(`/app/vps/new?plan=${encodeURIComponent(product.slug)}`, { replace: true });
  }, [product?.category, product?.slug, navigate]);

  const ram = config?.ram ?? 0;
  const cpu = config?.cpu ?? 0;
  const disk = config?.disk ?? 0;

  useEffect(() => {
    if (!product || seeded.current === product.id) return;
    seeded.current = product.id;
    setName(product.slug);
    // The values of the variables of the previous product are the secrets of
    // another product, and they are not kept when the customer chooses
    // another one.
    setVariables({});
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
      ...(billingAddress.line1.trim() ? { billingAddress } : {}),
      },
      signal,
    });
  }, [product?.slug, ram, cpu, disk, optionKey, trimmedPromo, mailLineKey]);

  const quote = quoteState.data ?? null;

  /**
   * The parts of the price of the line of the server.
   *
   * They come from the server, with the rest of the quote, so the customer
   * sees the price of the memory, of the processor, of the storage and of the
   * instance itself, and they add up to the amount that is charged.
   */
  const serverBreakdown = useMemo(() => {
    const line = quote?.items.find((item) => item.fulfilment === 'SERVER') ?? quote?.items[0];
    return line?.breakdown ?? null;
  }, [quote]);

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
    step <= 2 ? 'Continue to payment' : step === 3 ? 'Pay and deploy' : orderFinished ? 'Open instance' : 'Deploying…';

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
    if (step <= 2) goToStep(3);
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
          {VISIBLE_STEPS.map(({ step: number, label }, index) => {
            const done = number < step;
            const current = number === step;
            return (
              <li key={label} className="flex shrink-0 items-center gap-1.5" aria-current={current ? 'step' : undefined}>
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold',
                    done || current ? 'bg-acc text-on-acc' : 'border border-line bg-card text-ink3',
                  )}
                >
                  {done ? <Icon name="check" size={12} /> : index + 1}
                </span>
                <span className={cn('text-[13px] font-medium', current ? 'text-ink' : 'text-ink3', current ? 'inline' : 'hidden sm:inline')}>
                  {label}
                </span>
                {index < VISIBLE_STEPS.length - 1 && <span className="mx-1 h-px w-4 shrink-0 bg-s3" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
        </ScrollRow>
        <p className="mt-2 px-1 text-[12.5px] text-ink3 sm:hidden">
          Step {Math.max(1, VISIBLE_STEPS.findIndex((entry) => entry.step === step) + 1)} of {VISIBLE_STEPS.length} · {VISIBLE_STEPS.find((entry) => entry.step === step)?.label}
        </p>
      </nav>

      {/* 1. Configure */}
      {step === 1 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <Panel title="Configure">
            <div className="grid gap-5">
              <TextInput
                label="Instance name"
                hint={`Shown in your dashboard. It is also your address: ${addressLabel(name || product.name)}.${PLATFORM_BASE} when the name is free.`}
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

              <ChoiceSlider label="Memory" choices={ramChoices} value={ram} format={memLabel} onChange={(value) => applyConfig({ ram: value })} />
              <ChoiceSlider label="vCPU" choices={cpuChoices} value={cpu} format={(value) => String(value)} onChange={(value) => applyConfig({ cpu: value })} />

              <div>
                <label htmlFor="deploy-disk" className="mb-3 flex items-baseline justify-between px-1 font-display text-[17px] font-semibold text-ink">
                  Storage
                  <span className="font-mono text-[16px] font-medium text-acc">{disk} GB</span>
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
                  style={{ '--p': `${diskChoices.length > 1 ? (diskPosition / (diskChoices.length - 1)) * 100 : 100}%` } as CSSProperties}
                />
                <p className="mt-2 px-1 text-[12.5px] text-ink3">
                  Between {diskChoices[0] ?? product.minDisk} GB and {diskChoices[diskChoices.length - 1] ?? product.maxDisk} GB.
                </p>
              </div>

              {product.options.length > 0 && (
                <div>
                  <p className="mb-2 px-1 text-[13.5px] font-medium text-ink">Add-ons</p>
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
                            <span className="block text-[15px] font-semibold text-ink">{option.name}</span>
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
                  <p className="mb-2 px-1 text-[13.5px] font-medium text-ink">
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
                        label={spec.required ? spec.label : `${spec.label} (optional)`}
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
                <p className="text-[13.5px] font-medium text-ink">Add hosted mail</p>
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

          <div className="grid gap-4 lg:sticky lg:top-4">
            <div className="rounded-[28px] border border-line bg-night p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <ProductTile slug={product.slug} icon={product.icon} size={48} />
                <div className="min-w-0">
                  <p className="truncate font-display text-[22px] leading-tight font-semibold tracking-[-0.03em] text-ink">{product.name}</p>
                  <p className="truncate font-mono text-[12.5px] text-ink3">
                    {memLabel(ram)} · {cpu} vCPU · {disk} GB
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
            <div className="grid gap-2">
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
                  <p className="rounded-2xl bg-acc-bg px-3.5 py-3 text-[13.5px] font-medium text-acc">
                    {promotion.code} applied.
                  </p>
                ) : (
                  <p role="alert" className="rounded-2xl bg-bad/12 px-3.5 py-3 text-[13.5px] font-medium text-bad">
                    {promotion.reason || `${promotion.code} is not valid.`}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-2">
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
                    {/* The parts of the price of the line of the server, so
                        the customer sees what the amount is made of. */}
                    {serverBreakdown && <Breakdown breakdown={serverBreakdown} currency={quote.currency} />}
                    <div className="flex items-center justify-between rounded-2xl bg-s2 px-3.5 py-3">
                      <span className="text-[13.5px] text-ink2">Subtotal</span>
                      <span className="text-[14.5px] font-medium text-ink">
                        <Money amount={quote.subtotal} currency={quote.currency} />
                      </span>
                    </div>
                    {quote.discount > 0 && (
                      <div className="flex items-center justify-between rounded-2xl bg-acc-bg px-3.5 py-3">
                        <span className="text-[13.5px] text-ink2">Discount</span>
                        <span className="text-[14.5px] font-medium text-acc">
                          -<Money amount={quote.discount} currency={quote.currency} />
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between rounded-2xl bg-s3 px-3.5 py-3.5">
                      <span className="text-[14px] font-medium text-ink">Total per {periodWord(quote.period)}</span>
                      <span className="font-mono text-[20px] font-semibold tracking-[-0.03em] text-ink">
                        <Money amount={quote.total} currency={quote.currency} />
                      </span>
                    </div>
                    {/* The tax of the invoice. It is added by the platform to
                        the invoices it writes itself. */}
                    <TaxLine tax={quote.tax} currency={quote.currency} />
                  </>
                ) : (
                  <p className="text-[14px] text-ink3">Not available yet</p>
                )}
              </div>
            </div>
              </div>
              <div className="mt-5 hidden lg:block [&>*]:w-full">{primary()}</div>
            </div>
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
                <Row label={`Total per ${periodWord(quote?.period)}`}>
                  {quote ? <Money amount={quote.total} currency={quote.currency} /> : 'Not available yet'}
                </Row>
              </dl>
              <div className="grid gap-3 border-t border-line pt-4">
                <h3 className="font-display text-[18px] font-semibold">Billing address</h3>
                <p className="text-[13px] text-ink3">Optional for now. If you enter it, we save it to your account and use it on new invoices.</p>
                <BillingAddressFields value={billingAddress} onChange={(value) => { setBillingAddress(value); setBillingTouched(true); }} errors={placeOrder.fieldErrors} />
              </div>
              {placeOrder.error && (
                <div role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-medium text-bad">
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
                  <p className="text-[15px] font-semibold text-bad">Provisioning failed</p>
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

      {/* Desktop action row. The first step has its button in the summary. */}
      <div className={cn('hidden items-center justify-between gap-3', step === 1 ? '' : 'lg:flex')}>
        {step === 3 ? (
          <SoftButton onClick={() => goToStep(previousStep(step))}>Back</SoftButton>
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
          {step === 3 && (
            <SoftButton onClick={() => goToStep(previousStep(step))} className="shrink-0">
              Back
            </SoftButton>
          )}
        </div>
        <div className="[&>*]:w-full">{primary()}</div>
      </div>
    </div>
  );
}
