import { useState } from 'react';
import { del, get, patch, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import type { TableColumn } from '../lib/table';
import {
  ButtonLink,
  CardList,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  LoadingBlock,
  Money,
  Panel,
  Segmented,
  StatusPill,
  useToast,
} from '../ui-app';
import { DASH, LiveRegion, can, denseDanger, denseGhost, denseInput, densePrimary, denseSoft, useAdminSession } from './Overview';

/**
 * The plans of the hosted mail in the back office.
 *
 * The back office writes the prices: the operator owns the commercial terms
 * and the platform never invents one. So no amount, no currency and no period
 * is written in this file. Every price that is shown comes from the API, and
 * every period, every currency and every window the form offers comes from
 * what the API already holds.
 *
 * A plan that a customer bought cannot be deleted. The server refuses it and
 * the words of that refusal are shown as they come.
 */

/* -------------------------------------------------------------------------- */
/* the shapes the API sends                                                   */
/* -------------------------------------------------------------------------- */

/** The limits of a plan of hosted mail. */
export interface MailPlanLimits {
  /** How many domains the plan includes. */
  maxDomains: number;
  /** How many mailboxes a domain of the plan may hold. */
  maxMailboxes: number;
  /** How many aliases a domain of the plan may hold. */
  maxAliases: number;
  /** How many forwarding rules a domain of the plan may hold. */
  maxForwarding: number;
  /** How much space the plan includes, in megabytes. */
  totalStorageMb: number;
  /** How much space one mailbox may hold, in megabytes. */
  mailboxQuotaMb: number;
  /** How many messages may be sent in the window of the interval. */
  sendLimit: number;
  /** The window in which the limit of sending is counted. */
  sendInterval: string;
}

/** The price of one period of a plan. */
export interface MailPlanPrice {
  id: string;
  /** The period the price is for, as the API names it. */
  period: string;
  /** The amount of the price, in minor units. */
  amount: number;
  /** The code of the currency, as the API names it. */
  currency: string;
  /** Whether the price can be bought. */
  active: boolean;
}

/** A plan of hosted mail, as the API sends it. */
export interface MailPlan {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  /** Whether the plan is shown in the catalog of the customers. */
  visible: boolean;
  /** Whether the plan is on sale. */
  deployable: boolean;
  /** The limits that are applied to the services of this plan. */
  limits: MailPlanLimits;
  /** The limits the catalog says, next to the limits that are applied. */
  writtenLimits: MailPlanLimits;
  prices: MailPlanPrice[];
  /** How many customers bought the plan. */
  customers: number;
  /** How many services run on the plan. */
  services: number;
}

/* -------------------------------------------------------------------------- */
/* the limits                                                                  */
/* -------------------------------------------------------------------------- */

/** The limits of a plan that are counted in whole numbers. */
type MailPlanLimitKey =
  | 'maxDomains'
  | 'maxMailboxes'
  | 'maxAliases'
  | 'maxForwarding'
  | 'totalStorageMb'
  | 'mailboxQuotaMb'
  | 'sendLimit';

/** The limits a plan carries, in the order the operator reads them. */
const LIMIT_FIELDS: { key: MailPlanLimitKey; label: string; unit: string }[] = [
  { key: 'maxDomains', label: 'Domains', unit: 'domains' },
  { key: 'maxMailboxes', label: 'Mailboxes of a domain', unit: 'mailboxes' },
  { key: 'maxAliases', label: 'Aliases of a domain', unit: 'aliases' },
  { key: 'maxForwarding', label: 'Forwarding rules of a domain', unit: 'rules' },
  { key: 'totalStorageMb', label: 'Space of the plan', unit: 'MB' },
  { key: 'mailboxQuotaMb', label: 'Space of a mailbox', unit: 'MB' },
  { key: 'sendLimit', label: 'Messages sent', unit: 'messages' },
];

/* -------------------------------------------------------------------------- */
/* the catalog the API holds                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What the API already knows about the catalog of the plans.
 *
 * The periods, the currencies and the windows are not written in this file:
 * they are taken from the plans the API sent, so the form never offers a
 * period or a currency the platform does not use.
 */
export interface MailPlanCatalog {
  /** The periods the API prices, in the order it shows them. */
  periods: string[];
  /** The currencies the API prices, in the order it shows them. */
  currencies: string[];
  /** The windows the API counts the sending in. */
  intervals: string[];
}

/** The catalog of the plans, as the API sent it. */
export function mailPlanCatalog(plans: MailPlan[]): MailPlanCatalog {
  const periods: string[] = [];
  const currencies: string[] = [];
  const intervals: string[] = [];

  const add = (list: string[], value: string | null | undefined) => {
    if (typeof value === 'string' && value.trim() !== '' && !list.includes(value)) list.push(value);
  };

  for (const plan of plans) {
    for (const price of plan.prices ?? []) {
      add(periods, price.period);
      add(currencies, price.currency);
    }
    add(intervals, plan.limits?.sendInterval);
    add(intervals, plan.writtenLimits?.sendInterval);
  }

  return { periods, currencies, intervals };
}

/* -------------------------------------------------------------------------- */
/* the form                                                                   */
/* -------------------------------------------------------------------------- */

/** A price row of the form. */
export interface MailPlanPriceRow {
  /** The period the price is for, as the API names it. */
  period: string;
  /** The amount of the price, in minor units, as the operator typed it. */
  amount: string;
  /** The code of the currency, as the operator typed it. */
  currency: string;
  /** True when the operator changed the row. */
  changed: boolean;
}

/** The state of the form of a plan. */
export interface MailPlanFormState {
  /** Whether the form makes a plan or changes one. */
  mode: 'new' | 'edit';
  name: string;
  slug: string;
  description: string;
  icon: string;
  maxDomains: string;
  maxMailboxes: string;
  maxAliases: string;
  maxForwarding: string;
  totalStorageMb: string;
  mailboxQuotaMb: string;
  sendLimit: string;
  sendInterval: string;
  prices: MailPlanPriceRow[];
  visible: boolean;
  deployable: boolean;
}

/** Only whole minor units are accepted. */
function parseMinor(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * The limit the operator wrote, or the one that is applied when the catalog
 * says nothing about it.
 */
function limitToEdit(plan: MailPlan, key: keyof MailPlanLimits): string {
  const written = plan.writtenLimits?.[key];
  if (typeof written === 'string' && written.trim() !== '') return written;
  if (typeof written === 'number' && Number.isFinite(written)) return String(written);
  const applied = plan.limits?.[key];
  if (typeof applied === 'string' && applied.trim() !== '') return applied;
  if (typeof applied === 'number' && Number.isFinite(applied)) return String(applied);
  return '';
}

/**
 * The state of the form of a plan.
 *
 * A plan that does not exist yet starts from the catalog the API holds: one
 * price row for every period the API prices, with the amount left to the
 * operator. A plan that exists starts from what the API sent.
 */
export function mailPlanFormState(plan: MailPlan | null, catalog: MailPlanCatalog): MailPlanFormState {
  const rows: MailPlanPriceRow[] = plan
    ? [
        ...(plan.prices ?? []).map((price) => ({
          period: price.period,
          amount: String(price.amount ?? ''),
          currency: price.currency ?? '',
          changed: false,
        })),
        ...catalog.periods
          .filter((period) => !(plan.prices ?? []).some((price) => price.period === period))
          .map((period) => ({
            period,
            amount: '',
            currency: catalog.currencies[0] ?? '',
            changed: false,
          })),
      ]
    : catalog.periods.map((period) => ({
        period,
        amount: '',
        currency: catalog.currencies[0] ?? '',
        changed: false,
      }));

  return {
    mode: plan ? 'edit' : 'new',
    name: plan?.name ?? '',
    slug: plan?.slug ?? '',
    description: plan?.description ?? '',
    icon: plan?.icon ?? '',
    maxDomains: plan ? limitToEdit(plan, 'maxDomains') : '',
    maxMailboxes: plan ? limitToEdit(plan, 'maxMailboxes') : '',
    maxAliases: plan ? limitToEdit(plan, 'maxAliases') : '',
    maxForwarding: plan ? limitToEdit(plan, 'maxForwarding') : '',
    totalStorageMb: plan ? limitToEdit(plan, 'totalStorageMb') : '',
    mailboxQuotaMb: plan ? limitToEdit(plan, 'mailboxQuotaMb') : '',
    sendLimit: plan ? limitToEdit(plan, 'sendLimit') : '',
    sendInterval: plan ? limitToEdit(plan, 'sendInterval') : catalog.intervals[0] ?? '',
    prices: rows,
    visible: plan?.visible ?? true,
    deployable: plan?.deployable ?? false,
  };
}

/**
 * True when the row is part of what the API is asked for.
 *
 * A plan that is made sends every period of the catalog. A plan that is
 * changed sends only the periods the operator changed.
 */
export function mailPlanPriceIsSent(state: MailPlanFormState, row: MailPlanPriceRow): boolean {
  return state.mode === 'new' ? true : row.changed;
}

/** What is wrong with the form, in the words of the field that is wrong. */
export function mailPlanFormErrors(state: MailPlanFormState): Record<string, string> {
  const errors: Record<string, string> = {};

  if (state.name.trim().length < 2) errors.name = 'Give the plan a name.';
  if (!/^[a-z0-9-]{2,60}$/.test(state.slug.trim())) {
    errors.slug = 'Use 2 to 60 lowercase letters, numbers or dashes.';
  }

  for (const field of LIMIT_FIELDS) {
    if (!/^\d+$/.test(state[field.key].trim())) {
      errors[field.key] = `Use whole numbers only for ${field.label.toLowerCase()}.`;
    }
  }

  if (state.sendInterval.trim() === '') {
    errors.sendInterval = 'Give the window in which the limit of sending is counted.';
  }

  state.prices.forEach((row, index) => {
    if (!mailPlanPriceIsSent(state, row)) return;
    if (parseMinor(row.amount) === null) {
      errors[`price-${index}`] = 'Use whole minor units only.';
    }
    if (row.currency.trim() === '') {
      errors[`price-currency-${index}`] = 'Give the currency of the price.';
    }
  });

  return errors;
}

/** The body the API is asked for. */
export interface MailPlanPayload {
  slug: string;
  name: string;
  description: string;
  icon?: string;
  maxDomains: number;
  maxMailboxes: number;
  maxAliases: number;
  maxForwarding: number;
  totalStorageMb: number;
  mailboxQuotaMb: number;
  sendLimit: number;
  sendInterval: string;
  prices: { period: string; amount: number; currency: string }[];
  visible?: boolean;
  deployable?: boolean;
}

/**
 * The body the API is asked for.
 *
 * The prices of a plan that is changed are only the periods the operator
 * changed. The other periods keep what the API already holds.
 */
export function mailPlanPayload(state: MailPlanFormState): MailPlanPayload {
  return {
    slug: state.slug.trim(),
    name: state.name.trim(),
    description: state.description.trim(),
    ...(state.icon.trim() === '' ? {} : { icon: state.icon.trim() }),
    maxDomains: Number(state.maxDomains),
    maxMailboxes: Number(state.maxMailboxes),
    maxAliases: Number(state.maxAliases),
    maxForwarding: Number(state.maxForwarding),
    totalStorageMb: Number(state.totalStorageMb),
    mailboxQuotaMb: Number(state.mailboxQuotaMb),
    sendLimit: Number(state.sendLimit),
    sendInterval: state.sendInterval.trim(),
    prices: state.prices
      .filter((row) => mailPlanPriceIsSent(state, row))
      .map((row) => ({
        period: row.period,
        // The state is checked before the body is built, so the amount is a
        // whole number of minor units here.
        amount: parseMinor(row.amount) ?? Number.NaN,
        currency: row.currency.trim(),
      })),
    visible: state.visible,
    deployable: state.deployable,
  };
}

/**
 * The body the API is asked for, or null when the form still holds a value
 * the server would refuse.
 */
export function mailPlanBody(state: MailPlanFormState): MailPlanPayload | null {
  if (Object.keys(mailPlanFormErrors(state)).length > 0) return null;
  return mailPlanPayload(state);
}

/* -------------------------------------------------------------------------- */
/* the calls the API answers                                                 */
/* -------------------------------------------------------------------------- */

/** Every plan of hosted mail. */
export const listMailPlans = (signal?: AbortSignal) =>
  get<{ plans: MailPlan[] }>('/admin/mail/plans', undefined, signal);

/** Adds a plan to the catalog. */
export const createMailPlan = (body: MailPlanPayload) => post<{ plan: MailPlan }>('/admin/mail/plans', body);

/** Changes a plan of the catalog. */
export const saveMailPlan = (id: string, body: MailPlanPayload) =>
  patch<{ plan: MailPlan }>(`/admin/mail/plans/${encodeURIComponent(id)}`, body);

/**
 * Removes a plan from the catalog.
 *
 * The server refuses the plans that a customer bought, with a 409 and the
 * words of the refusal.
 */
export const deleteMailPlan = (id: string) => del<{ ok: boolean }>(`/admin/mail/plans/${encodeURIComponent(id)}`);

/**
 * Takes a plan off sale, or puts it back on sale.
 *
 * A plan that is off sale stays in the list: the customers who bought it keep
 * the service they pay for.
 */
export const setMailPlanOnSale = (id: string, onSale: boolean) =>
  patch<{ plan: MailPlan }>(`/admin/mail/plans/${encodeURIComponent(id)}`, { deployable: onSale });

/** The action the operator asked for. Nothing is sent until it is confirmed. */
export type MailPlanPending = { kind: 'delete'; plan: MailPlan } | null;

/**
 * Removes a plan from the catalog.
 *
 * Without a plan to remove nothing is sent to the server: a removal always
 * needs a confirmation.
 */
export async function runMailPlanDelete(pending: MailPlanPending): Promise<boolean> {
  if (!pending) return false;
  await deleteMailPlan(pending.plan.id);
  return true;
}

/* -------------------------------------------------------------------------- */
/* the list                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * An amount of money, in the currency the API named.
 *
 * The currency comes from the API, so the money is only drawn when the API
 * named a currency that can be drawn. Otherwise the amount is shown as it is.
 */
function MailAmount({ amount, currency }: { amount: number; currency: string }) {
  if (!currency || !/^[A-Za-z]{3}$/.test(currency)) {
    return (
      <span className="font-mono tabular-nums">
        {amount} <span className="text-ink3">{currency || DASH}</span>
      </span>
    );
  }
  return <Money amount={amount} currency={currency} />;
}

/**
 * The limits of a plan, and the difference between what the catalog says and
 * what the platform applies.
 *
 * A limit the platform lowers is a limit the customer does not get, so the
 * difference is written out instead of being hidden.
 */
export function mailPlanLimitDifferences(plan: MailPlan): { key: string; written: number; applied: number }[] {
  const differences: { key: string; written: number; applied: number }[] = [];
  const written = plan.writtenLimits;
  const applied = plan.limits;
  if (!written || !applied) return differences;
  for (const field of LIMIT_FIELDS) {
    const said = written[field.key];
    const holds = applied[field.key];
    if (typeof said === 'number' && typeof holds === 'number' && said !== holds) {
      differences.push({ key: field.key, written: said, applied: holds });
    }
  }
  return differences;
}

/** The prices of a plan, as the API sends them. */
function PlanPrices({ prices }: { prices: MailPlanPrice[] }) {
  if (!prices?.length) return <span className="text-ink3">{DASH}</span>;
  return (
    <span className="block min-w-0">
      {prices.map((price) => (
        <span key={price.id || price.period} className="block font-mono text-[12.5px] text-ink2">
          <MailAmount amount={price.amount} currency={price.currency} />
          <span className="text-ink3"> / {price.period}</span>
          <span className="text-ink3"> · {price.currency || DASH}</span>
          {/* The amount is shown in the unit the platform counts in, so the
              operator reads the same number the form asks for. */}
          <span className="text-ink3"> · {price.amount} minor units</span>
          {!price.active && <span className="text-ink3"> · not sold</span>}
        </span>
      ))}
    </span>
  );
}

/** The limits of a plan, in one line. */
function PlanLimits({ plan }: { plan: MailPlan }) {
  const differences = mailPlanLimitDifferences(plan);
  return (
    <span className="block min-w-0">
      <span className="block font-mono text-[12.5px] text-ink2">
        {LIMIT_FIELDS.map((field) => `${field.label}: ${plan.limits?.[field.key] ?? DASH}`).join(' · ')}
      </span>
      <span className="block font-mono text-[12.5px] text-ink2">
        Window of the sending: {plan.limits?.sendInterval ?? DASH}
      </span>
      {differences.length > 0 && (
        <span className="block text-[12px] leading-relaxed text-warn">
          The catalog says {differences.map((d) => `${d.key} ${d.written}`).join(', ')} and the platform applies{' '}
          {differences.map((d) => `${d.key} ${d.applied}`).join(', ')}.
        </span>
      )}
    </span>
  );
}

/**
 * Every plan of hosted mail, with its limits, its prices and the customers
 * that bought it.
 */
export function AdminMailPlansTable({
  plans,
  mayWrite,
  onEdit,
  onDelete,
  onToggleSale,
}: {
  plans: MailPlan[];
  mayWrite: boolean;
  onEdit: (plan: MailPlan) => void;
  onDelete: (plan: MailPlan) => void;
  onToggleSale: (plan: MailPlan) => void;
}) {
  const columns: TableColumn<MailPlan>[] = [
    {
      key: 'plan',
      header: 'Plan',
      truncate: true,
      render: (plan: MailPlan) => (
        <span className="block min-w-0">
          <span className="block truncate font-bold tracking-[-0.02em] text-ink" title={plan.name}>
            {plan.name}
          </span>
          <span className="block truncate font-mono text-[12.5px] text-ink3" title={plan.slug}>
            {plan.slug}
          </span>
        </span>
      ),
    },
    {
      key: 'limits',
      header: 'Limits',
      className: 'max-w-[320px]',
      render: (plan: MailPlan) => <PlanLimits plan={plan} />,
    },
    {
      key: 'prices',
      header: 'Prices',
      className: 'max-w-[240px]',
      render: (plan: MailPlan) => <PlanPrices prices={plan.prices} />,
    },
    {
      key: 'visible',
      header: 'Visible',
      nowrap: true,
      render: (plan: MailPlan) => (
        <StatusPill status={plan.visible ? 'active' : 'draft'} label={plan.visible ? 'Visible' : 'Hidden'} />
      ),
    },
    {
      key: 'sale',
      header: 'On sale',
      nowrap: true,
      render: (plan: MailPlan) => (
        <span className="flex flex-col items-start gap-1">
          <StatusPill status={plan.deployable ? 'active' : 'draft'} label={plan.deployable ? 'On sale' : 'Not on sale'} />
          {mayWrite && (
            <button type="button" onClick={() => onToggleSale(plan)} className={denseGhost}>
              {plan.deployable ? 'Take off sale' : 'Put on sale'}
            </button>
          )}
        </span>
      ),
    },
    {
      key: 'customers',
      header: 'Customers',
      align: 'right',
      nowrap: true,
      render: (plan: MailPlan) => (
        <span className="font-mono text-[12.5px] text-ink2">
          {plan.customers ?? 0} · {plan.services ?? 0} services
        </span>
      ),
    },
    ...(mayWrite
      ? ([
          {
            key: 'actions',
            header: 'Action',
            align: 'right',
            render: (plan: MailPlan) => (
              <span className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => onEdit(plan)} className={denseSoft}>
                  Edit
                </button>
                <button type="button" onClick={() => onDelete(plan)} className={denseDanger}>
                  Delete
                </button>
              </span>
            ),
          },
        ] satisfies TableColumn<MailPlan>[])
      : []),
  ];

  return (
    <>
      <DataTable<MailPlan> rows={plans} rowKey={(plan) => plan.id} minWidth="1080px" columns={columns} />
      <CardList<MailPlan> rows={plans} rowKey={(plan) => plan.id}>
        {(plan) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="w-0 min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink" title={plan.name}>
                  {plan.name}
                </p>
                <p className="truncate font-mono text-[12.5px] text-ink3" title={plan.slug}>
                  {plan.slug}
                </p>
              </div>
              <StatusPill status={plan.deployable ? 'active' : 'draft'} label={plan.deployable ? 'On sale' : 'Not on sale'} />
            </div>
            <dl className="mt-3 grid gap-2 text-[13px]">
              <div className="min-w-0">
                <dt className="text-ink3">Limits</dt>
                <dd className="min-w-0">
                  <PlanLimits plan={plan} />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink3">Prices</dt>
                <dd className="min-w-0">
                  <PlanPrices prices={plan.prices} />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink3">Visibility</dt>
                <dd className="text-ink">{plan.visible ? 'Visible' : 'Hidden'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink3">Customers</dt>
                <dd className="font-mono text-ink">
                  {plan.customers ?? 0} · {plan.services ?? 0} services
                </dd>
              </div>
            </dl>
            {mayWrite && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => onToggleSale(plan)} className={denseGhost}>
                  {plan.deployable ? 'Take off sale' : 'Put on sale'}
                </button>
                <button type="button" onClick={() => onEdit(plan)} className={denseSoft}>
                  Edit
                </button>
                <button type="button" onClick={() => onDelete(plan)} className={denseDanger}>
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </CardList>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* the form of a plan                                                         */
/* -------------------------------------------------------------------------- */

const VISIBLE_OPTIONS: { value: 'yes' | 'no'; label: string }[] = [
  { value: 'yes', label: 'Visible' },
  { value: 'no', label: 'Hidden' },
];

const SALE_OPTIONS: { value: 'yes' | 'no'; label: string }[] = [
  { value: 'yes', label: 'On sale' },
  { value: 'no', label: 'Not on sale' },
];

/**
 * The form of a plan.
 *
 * Every limit is asked for, and the price of every period of the catalog is
 * asked for in the unit the platform works in: the minor units. The amount is
 * shown to the operator as it is, because the platform counts in minor units
 * and the operator owns the price.
 */
export function AdminMailPlanForm({
  plan,
  catalog,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  /** The plan that is changed. Null when a plan is made. */
  plan: MailPlan | null;
  /** What the API already knows about the catalog. */
  catalog: MailPlanCatalog;
  busy?: boolean;
  /** The words of a refusal of the server. */
  error?: string | null;
  onSubmit: (body: MailPlanPayload) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<MailPlanFormState>(() => mailPlanFormState(plan, catalog));
  const [touched, setTouched] = useState(false);
  const errors = mailPlanFormErrors(state);
  const scope = plan?.id ?? 'new';

  const setLimit = (key: MailPlanLimitKey, value: string) =>
    setState((current) => ({ ...current, [key]: value }));

  const setPrice = (index: number, patch: Partial<MailPlanPriceRow>) =>
    setState((current) => ({
      ...current,
      prices: current.prices.map((row, at) => (at === index ? { ...row, ...patch, changed: true } : row)),
    }));

  const submit = () => {
    setTouched(true);
    // A form that still holds a value the server refuses is not sent.
    const body = mailPlanBody(state);
    if (!body) return;
    onSubmit(body);
  };

  return (
    <div className="grid gap-3 rounded-2xl bg-s2 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor={`mail-plan-${scope}-name`} error={touched ? errors.name : undefined}>
          <input
            id={`mail-plan-${scope}-name`}
            type="text"
            autoComplete="off"
            required
            value={state.name}
            onChange={(event) => setState((current) => ({ ...current, name: event.target.value }))}
            className={denseInput}
          />
        </Field>
        <Field
          label="Slug"
          htmlFor={`mail-plan-${scope}-slug`}
          error={touched ? errors.slug : undefined}
          hint="Lowercase, numbers and dashes. It is the name the catalog knows the plan by."
        >
          <input
            id={`mail-plan-${scope}-slug`}
            type="text"
            autoComplete="off"
            required
            value={state.slug}
            onChange={(event) => setState((current) => ({ ...current, slug: event.target.value }))}
            className={denseInput}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor={`mail-plan-${scope}-description`}>
        <textarea
          id={`mail-plan-${scope}-description`}
          rows={3}
          value={state.description}
          onChange={(event) => setState((current) => ({ ...current, description: event.target.value }))}
          className="w-full scroll-mt-24 rounded-2xl bg-s3 p-3 text-[16px] leading-relaxed text-ink outline-none transition-colors duration-[180ms] focus:bg-line lg:text-[14px]"
        />
      </Field>

      <Field label="Icon" htmlFor={`mail-plan-${scope}-icon`} hint="Optional. The name of the icon of the plan.">
        <input
          id={`mail-plan-${scope}-icon`}
          type="text"
          autoComplete="off"
          value={state.icon}
          onChange={(event) => setState((current) => ({ ...current, icon: event.target.value }))}
          className={denseInput}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LIMIT_FIELDS.map((field) => (
          <Field
            key={field.key}
            label={`${field.label} (${field.unit})`}
            htmlFor={`mail-plan-${scope}-${field.key}`}
            error={touched ? errors[field.key] : undefined}
          >
            <input
              id={`mail-plan-${scope}-${field.key}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={state[field.key]}
              onChange={(event) => setLimit(field.key, event.target.value)}
              className={denseInput}
            />
          </Field>
        ))}
        <Field
          label="Window of the sending"
          htmlFor={`mail-plan-${scope}-sendInterval`}
          error={touched ? errors.sendInterval : undefined}
          hint="The window in which the messages are counted, as the API names it."
        >
          <input
            id={`mail-plan-${scope}-sendInterval`}
            type="text"
            autoComplete="off"
            list={`mail-plan-${scope}-intervals`}
            value={state.sendInterval}
            onChange={(event) => setState((current) => ({ ...current, sendInterval: event.target.value }))}
            className={denseInput}
          />
        </Field>
        <datalist id={`mail-plan-${scope}-intervals`}>
          {catalog.intervals.map((interval) => (
            <option key={interval} value={interval} />
          ))}
        </datalist>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <p className="px-1 text-[13.5px] font-medium text-ink">In the catalog</p>
          <Segmented
            ariaLabel="Visible in the catalog"
            role="group"
            options={[...VISIBLE_OPTIONS]}
            value={state.visible ? 'yes' : 'no'}
            onChange={(value) => setState((current) => ({ ...current, visible: value === 'yes' }))}
          />
        </div>
        <div className="grid gap-1.5">
          <p className="px-1 text-[13.5px] font-medium text-ink">On sale</p>
          <Segmented
            ariaLabel="On sale"
            role="group"
            options={[...SALE_OPTIONS]}
            value={state.deployable ? 'yes' : 'no'}
            onChange={(value) => setState((current) => ({ ...current, deployable: value === 'yes' }))}
          />
        </div>
      </div>

      <div className="grid gap-3">
        <p className="px-1 text-[13.5px] font-medium text-ink">Prices</p>
        {state.prices.length === 0 ? (
          <p className="px-1 text-[13px] leading-relaxed text-ink3">
            The catalog holds no price yet, so the API names no period. The periods and the currencies of the prices come
            from the API, so they cannot be written here.
          </p>
        ) : (
          state.prices.map((row, index) => (
            <div key={row.period} className="grid gap-3 rounded-2xl bg-s3 p-3 sm:grid-cols-2">
              <Field
                label={`Price of the ${row.period} period (minor units)`}
                htmlFor={`mail-plan-${scope}-price-${row.period}`}
                error={touched ? errors[`price-${index}`] : undefined}
                hint="The amount is entered in minor units, the unit the platform counts in. It is shown to you as it is."
              >
                <input
                  id={`mail-plan-${scope}-price-${row.period}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={row.amount}
                  onChange={(event) => setPrice(index, { amount: event.target.value })}
                  className={denseInput}
                />
              </Field>
              <Field
                label={`Currency of the ${row.period} period`}
                htmlFor={`mail-plan-${scope}-currency-${row.period}`}
                error={touched ? errors[`price-currency-${index}`] : undefined}
                hint="The code of the currency, in letters. The currencies come from the prices of the API."
              >
                <input
                  id={`mail-plan-${scope}-currency-${row.period}`}
                  type="text"
                  autoComplete="off"
                  value={row.currency}
                  onChange={(event) => setPrice(index, { currency: event.target.value })}
                  className={denseInput}
                />
              </Field>
            </div>
          ))
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={submit} disabled={busy} className={densePrimary}>
          {busy ? 'Saving…' : plan ? 'Save the plan' : 'Add the plan'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={denseSoft}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* the confirmation of a removal                                               */
/* -------------------------------------------------------------------------- */

/**
 * The confirmation of the removal of a plan.
 *
 * The operator is told what happens to the plan, and that a plan a customer
 * bought cannot be removed: the server refuses it and its words are shown.
 */
export function AdminMailPlanDeleteDialog({
  plan,
  busy,
  onConfirm,
  onCancel,
}: {
  plan: MailPlan | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!plan) return null;
  return (
    <ConfirmDialog
      open
      title={`Delete ${plan.name}`}
      description={`This removes ${plan.name} from the catalog of the hosted mail. A plan that a customer bought cannot be deleted: the server refuses it, and the refusal is shown as it comes. Take the plan off sale instead when the customers keep it.`}
      confirmLabel="Delete the plan"
      requireText={plan.slug}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* the page                                                                   */
/* -------------------------------------------------------------------------- */

export default function MailProducts() {
  const session = useAdminSession();
  const toast = useToast();

  // The catalog is read for everyone who reaches the page: the server refuses
  // the ones who may not read it, and its words are shown. Only the writes
  // are hidden from a role that may not make them.
  const mayWrite = can(session.staff, 'mail.write');

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MailPlan | null>(null);
  const [removing, setRemoving] = useState<MailPlan | null>(null);

  const state = useAsync((signal) => listMailPlans(signal), []);
  const plans = state.data?.plans ?? [];
  const catalog = mailPlanCatalog(plans);

  const save = useAction(async (body: MailPlanPayload) => {
    if (editing) return saveMailPlan(editing.id, body);
    return createMailPlan(body);
  });

  const sale = useAction(async (plan: MailPlan) => {
    return setMailPlanOnSale(plan.id, !plan.deployable);
  });

  const remove = useAction(async (pending: MailPlanPending) => runMailPlanDelete(pending));

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

  const formOpen = creating || editing !== null;

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${plans.length} plan${plans.length === 1 ? '' : 's'} of hosted mail`} />

      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink to="/admin/mail" variant="soft">
          The services of the mail
        </ButtonLink>
        <span className="text-sm text-slate-500">
          The services of the customers, the health of the mail system and the use of the platform live on the
          other page.
        </span>
      </div>

      <Panel
        title="Plans of hosted mail"
        description="What each plan gives to a customer, and what it costs. The prices are written here, by the operator, in the unit the platform counts in: the minor units."
        actionBelow
        action={
          mayWrite ? (
            <button
              type="button"
              onClick={() => {
                setCreating((value) => !value);
                setEditing(null);
              }}
              aria-expanded={creating}
              className={densePrimary}
            >
              {creating ? 'Close the form' : 'New plan'}
            </button>
          ) : undefined
        }
      >
        <div className="grid gap-3">
          {formOpen && mayWrite && (
            <AdminMailPlanForm
              key={editing?.id ?? 'new'}
              plan={editing}
              catalog={catalog}
              busy={save.pending}
              error={save.error}
              onCancel={() => {
                setCreating(false);
                setEditing(null);
              }}
              onSubmit={(body) => {
                void save.run(body).then((result) => {
                  if (!result) return;
                  toast.push(`${body.name} saved`, 'ok');
                  setCreating(false);
                  setEditing(null);
                  state.reload();
                });
              }}
            />
          )}

          {state.loading ? (
            <LoadingBlock rows={3} label="Loading the plans" />
          ) : state.error ? (
            <ErrorState title="The plans could not be loaded" message={state.error.message} onRetry={state.reload} />
          ) : !plans.length ? (
            <EmptyState title="No plan yet." description="Add the first plan of hosted mail to the catalog." />
          ) : (
            <AdminMailPlansTable
              plans={plans}
              mayWrite={mayWrite}
              onEdit={(plan) => {
                setEditing(plan);
                setCreating(false);
              }}
              onDelete={(plan) => setRemoving(plan)}
              onToggleSale={(plan) => {
                void sale.run(plan).then((result) => {
                  if (!result) return;
                  toast.push(`${plan.name} is now ${plan.deployable ? 'not on sale' : 'on sale'}`, 'ok');
                  state.reload();
                });
              }}
            />
          )}

          {sale.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
              {sale.error}
            </p>
          )}

          {!mayWrite && (
            <p className="px-1 text-[13px] text-ink3">
              Your role does not hold &quot;mail.write&quot;, so the plans are read-only for you.
            </p>
          )}
        </div>
      </Panel>

      <p className="px-1 text-[12.5px] leading-relaxed text-ink3">
        No amount, no currency and no period is written in the back office. The prices, the periods and the currencies come
        from the API, and the operator writes them here.
      </p>

      <AdminMailPlanDeleteDialog
        plan={removing}
        busy={remove.pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          void remove.run(removing ? { kind: 'delete', plan: removing } : null).then((result) => {
            // The dialog closes when the plan was removed and when the server
            // refused it, so the words of the refusal are read outside of it.
            setRemoving(null);
            if (!result) return;
            toast.push(`${removing?.name ?? 'The plan'} deleted`, 'ok');
            state.reload();
          });
        }}
      />

      {remove.error && (
        <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
          {remove.error}
        </p>
      )}
    </div>
  );
}
