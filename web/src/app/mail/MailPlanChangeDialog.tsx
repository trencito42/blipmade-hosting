/**
 * The change of the plan of a mail service.
 *
 * The prices are never written in the interface: they are the ones of the
 * platform, read from the catalog of the plans. Choosing a plan does
 * nothing at all: the order is created only when the customer confirms,
 * and the plan of the service changes only when the payment is confirmed.
 */

import { useEffect, useMemo, useState } from 'react';
import { post, type MailPlanPrice, type MailPlanView, type MailServiceView } from '../../lib/api';
import { useAction } from '../../lib/useAsync';
import { formatPrice, memLabel, periodLabel, periodSuffix } from '../../lib/pricing';
import { PrimaryButton, SoftButton, useToast } from '../../ui-app';
import { MailDialog } from './MailDialog';
import { onSaleMailPlans } from './shared';

/** The price of a plan for one interval, when the platform publishes it. */
export function priceOf(plan: MailPlanView | null, period?: string): MailPlanPrice | null {
  if (!plan) return null;
  if (period) {
    const found = plan.prices.find((price) => price.period === period);
    if (found) return found;
  }
  return plan.price ?? plan.prices[0] ?? null;
}

/** The price of a plan, in one line of words. */
function priceLine(price: MailPlanPrice | null): string {
  if (!price) return 'The price is not published.';
  return `${formatPrice(price.amount, price.currency)} ${periodSuffix(price.period)} — ${periodLabel(price.period)}`;
}

/** The difference between two prices, when both of them are known. */
export function priceDifference(current: MailPlanPrice | null, next: MailPlanPrice | null): string | null {
  if (!current || !next) return null;
  if (current.currency !== next.currency) return null;
  if (current.period !== next.period) return null;
  const difference = next.amount - current.amount;
  if (difference === 0) return 'The price does not change.';
  const sign = difference > 0 ? '+' : '−';
  return `${sign}${formatPrice(Math.abs(difference), next.currency)} ${
    difference > 0 ? 'more' : 'less'
  } than the current plan, ${periodLabel(next.period)}.`;
}

/** What the plan of the customer holds today, and what it would hold. */
interface LimitNote {
  kind: 'warn' | 'info';
  text: string;
}

/** The limits of a plan, in one line. */
function limitsLine(plan: MailPlanView): string {
  return `${plan.limits.maxMailboxes} mailboxes per domain · ${plan.limits.maxAliases} aliases per domain · ${memLabel(
    plan.limits.totalStorageMb,
  )} of space · ${plan.limits.maxDomains} domain(s)`;
}

export function MailPlanChangeDialog({
  open,
  service,
  plans,
  onClose,
  onChanged,
}: {
  open: boolean;
  /** The service whose plan is changed. */
  service: MailServiceView;
  /** The plans the platform sells right now. */
  plans: MailPlanView[];
  /** The customer closed the dialog. */
  onClose: () => void;
  /** The order of the new plan was created. */
  onChanged?: () => void;
}) {
  const { push } = useToast();
  const [slug, setSlug] = useState('');
  const [confirming, setConfirming] = useState(false);

  const change = useAction(async (productSlug: string) => {
    const { order } = await post<{ order: { id: string; number: string } }>(
      `/mail/services/${encodeURIComponent(service.id)}/plan`,
      { productSlug },
    );
    const checkout = await post<{ url: string | null; message?: string }>(
      `/orders/${encodeURIComponent(order.id)}/checkout`,
    );
    return { order, checkout };
  });

  useEffect(() => {
    if (!open) return;
    setSlug('');
    setConfirming(false);
  }, [open]);

  const choices = useMemo(
    () => onSaleMailPlans(plans).filter((plan) => plan.slug !== service.plan.slug),
    [plans, service.plan.slug],
  );
  const target = useMemo(() => choices.find((plan) => plan.slug === slug) ?? null, [choices, slug]);
  const current = useMemo(() => plans.find((plan) => plan.slug === service.plan.slug) ?? null, [plans, service.plan.slug]);

  const notes = useMemo<LimitNote[]>(() => {
    if (!target) return [];
    const list: LimitNote[] = [];
    if (target.limits.maxDomains < service.usage.domains) {
      list.push({
        kind: 'warn',
        text: `The new plan holds ${target.limits.maxDomains} domain(s) and the service holds ${service.usage.domains}. The extra domain has to go before the change.`,
      });
    }
    if (service.usage.storageMb > target.limits.totalStorageMb) {
      list.push({
        kind: 'warn',
        text: `The new plan holds ${memLabel(target.limits.totalStorageMb)} and the service uses ${memLabel(
          service.usage.storageMb,
        )}. The mail above the limit has to go before the change.`,
      });
    }
    for (const domain of service.domains) {
      if (domain.mailboxCount > target.limits.maxMailboxes) {
        list.push({
          kind: 'warn',
          text: `${domain.name} holds ${domain.mailboxCount} mailboxes and the new plan allows ${target.limits.maxMailboxes} per domain.`,
        });
      }
      if (domain.aliasCount > target.limits.maxAliases) {
        list.push({
          kind: 'warn',
          text: `${domain.name} holds ${domain.aliasCount} aliases and the new plan allows ${target.limits.maxAliases} per domain.`,
        });
      }
    }
    if (list.length === 0) {
      list.push({ kind: 'info', text: 'Everything the service holds today fits in the new plan.' });
    }
    return list;
  }, [target, service]);

  const currentPrice = priceOf(current);
  const targetPrice = priceOf(target);
  // The order of the platform is always the monthly one, so the difference is
  // computed on the monthly prices when both of them are known.
  const difference =
    priceDifference(currentPrice, targetPrice) ?? priceDifference(priceOf(current, 'MONTHLY'), priceOf(target, 'MONTHLY'));

  const submit = async () => {
    if (!target) return;
    const answer = await change.run(target.slug);
    if (!answer) return;
    onChanged?.();
    if (!answer.checkout.url) {
      // The order exists, but the payment could not be opened. The customer
      // can pay it from the billing page, and nothing is charged here.
      setConfirming(false);
      push(
        answer.checkout.message ?? `The order ${answer.order.number} is created, but the payment could not be opened.`,
        'error',
      );
      return;
    }
    push('Plan change checkout opened.');
    // The payment page of the platform decides the change. Until it is paid,
    // the service keeps the plan it has.
    location.assign(answer.checkout.url);
  };

  const noteList = (
    <ul className="grid gap-1.5">
      {notes.map((note) => (
        <li
          key={note.text}
          className={`rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ${
            note.kind === 'warn' ? 'bg-warn/12 text-ink2' : 'bg-s1 text-ink2'
          }`}
        >
          {note.text}
        </li>
      ))}
    </ul>
  );

  return (
    <MailDialog
      open={open}
      title={confirming ? 'Confirm the change of the plan' : 'Change the plan'}
      description={
        confirming ? undefined : (
          <>
            The plan of {service.plan.name} is changed with an order, so the price is the one of the platform. Nothing
            is charged until the payment is confirmed.
          </>
        )
      }
      onClose={onClose}
      footer={
        confirming ? (
          <>
            <SoftButton onClick={() => setConfirming(false)} disabled={change.pending} className="w-full sm:w-auto">
              Back
            </SoftButton>
            <PrimaryButton onClick={() => void submit()} disabled={change.pending} className="w-full sm:w-auto">
              {change.pending ? 'Opening the checkout…' : 'Confirm and open the checkout'}
            </PrimaryButton>
          </>
        ) : (
          <>
            <SoftButton onClick={onClose} disabled={change.pending} className="w-full sm:w-auto">
              Cancel
            </SoftButton>
            <PrimaryButton
              onClick={() => setConfirming(true)}
              disabled={!target || change.pending}
              className="w-full sm:w-auto"
            >
              Review the change
            </PrimaryButton>
          </>
        )
      }
    >
      {confirming && target ? (
        <div className="mt-4 grid gap-3">
          <div className="rounded-2xl bg-s2 p-3.5">
            <p className="text-[13px] text-ink3">The plan now</p>
            <p className="mt-0.5 text-[15px] font-semibold text-ink">{service.plan.name}</p>
            <p className="mt-0.5 text-[13px] text-ink2">{priceLine(currentPrice)}</p>
          </div>
          <div className="rounded-2xl bg-acc-bg p-3.5">
            <p className="text-[13px] text-ink3">The plan you choose</p>
            <p className="mt-0.5 text-[15px] font-semibold text-ink">{target.name}</p>
            <p className="mt-0.5 text-[13px] text-ink2">{priceLine(targetPrice)}</p>
            <p className="mt-1 text-[12.5px] text-ink3">{limitsLine(target)}</p>
            {difference && <p className="mt-1 text-[13px] text-ink2">{difference}</p>}
          </div>
          {noteList}
          <p className="text-[13px] leading-relaxed text-ink3">
            The checkout opens on the payment page of the platform. The plan of the service changes only when the
            payment is confirmed: a checkout that is cancelled changes nothing.
          </p>
          {change.error && (
            <p role="alert" className="text-[13.5px] font-medium text-bad">
              {change.error}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <div className="rounded-2xl bg-s2 p-3.5">
            <p className="text-[13px] text-ink3">The plan now</p>
            <p className="mt-0.5 text-[15px] font-semibold text-ink">{service.plan.name}</p>
            <p className="mt-0.5 text-[13px] text-ink2">{priceLine(currentPrice)}</p>
          </div>

          {choices.length === 0 ? (
            <p className="rounded-2xl bg-s2 px-3.5 py-3 text-[13.5px] text-ink2">
              The sale of hosted mail is closed at the moment, so the plan cannot be changed.
            </p>
          ) : (
            <fieldset className="grid gap-1.5">
              <legend className="px-1 text-[14px] font-medium text-ink">The plan you want</legend>
              {choices.map((plan) => {
                const price = priceOf(plan);
                const chosen = plan.slug === slug;
                return (
                  <label
                    key={plan.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors duration-[180ms] ${
                      chosen ? 'border-acc bg-acc/10' : 'border-line bg-card hover:bg-s3'
                    }`}
                  >
                    <input
                      type="radio"
                      name="mail-plan"
                      value={plan.slug}
                      checked={chosen}
                      onChange={() => setSlug(plan.slug)}
                      className="mt-1 size-4 accent-[var(--color-acc)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-ink">{plan.name}</span>
                      <span className="mt-0.5 block text-[13px] text-ink2">{priceLine(price)}</span>
                      <span className="mt-1 block text-[12.5px] text-ink3">{limitsLine(plan)}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}

          {target && (
            <div className="rounded-2xl bg-s2 p-3.5">
              <p className="text-[14px] font-semibold text-ink">The review of {target.name}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink2">{limitsLine(target)}</p>
              <p className="mt-1 text-[13px] text-ink2">{priceLine(targetPrice)}</p>
              {difference && <p className="mt-1 text-[13px] text-ink2">{difference}</p>}
              <div className="mt-2">{noteList}</div>
            </div>
          )}

          {change.error && (
            <p role="alert" className="text-[13.5px] font-medium text-bad">
              {change.error}
            </p>
          )}
        </div>
      )}
    </MailDialog>
  );
}
