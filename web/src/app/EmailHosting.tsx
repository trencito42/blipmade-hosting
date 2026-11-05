/**
 * The storefront of hosted mail, and the checkout of a plan.
 *
 * The storefront is public: a visitor without an account sees the plans of
 * hosted mail, their limits and their price. Every one of those numbers comes
 * from GET /mail/plans, so the page can never show a price or a limit the
 * platform does not know.
 *
 * The sale of hosted mail can be closed by the operator. When it is closed, a
 * plan is shown as not on sale yet, with the reason of the platform, and it
 * cannot be bought.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, post, type MailPlanLimits, type MailPlanView, type Order } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { memLabel, periodLabel, periodSuffix } from '../lib/pricing';
import { Link, useRouter } from '../router';
import { Icon } from '../icons';
import { toneOf } from '../site/categories';
import { useSession } from '../session';
import { Eyebrow, Footer, Nav, Wrap } from '../site/ui';
import {
  ButtonLink,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Money,
  Panel,
  PrimaryButton,
  Segmented,
  SoftButton,
  StatusPill,
  TextInput,
} from '../ui-app';
import { validateMailDomainName } from '../lib/mail-domain';
import DeployStudio from './deploy/DeployStudio';

/** The page of the storefront of hosted mail. */
export const EMAIL_STOREFRONT_PATH = '/email';

/** The page of the checkout of a plan of hosted mail. */
export const MAIL_CHECKOUT_PATH = '/app/email/checkout';

/** The address of the checkout of a plan. */
export function mailCheckoutPath(slug: string): string {
  return `${MAIL_CHECKOUT_PATH}?plan=${encodeURIComponent(slug)}`;
}

/** The shell of a public page: the navigation of the site and its footer. */
function PublicShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <main className="min-h-[100svh]">{children}</main>
      <Footer />
    </>
  );
}

/**
 * The window in which the limit of sending is counted, in words.
 *
 * The window itself is a value of the platform: the words only explain it.
 */
function sendIntervalLabel(interval: string): string {
  const value = interval.toLowerCase();
  if (value === 'minutely') return 'per minute';
  if (value === 'hourly') return 'per hour';
  if (value === 'daily') return 'per day';
  return `per ${value}`;
}

/** One limit of a plan: its name and the number the platform gave. */
function Limit({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1.5">
      <dt className="text-[12.5px] text-ink3">{label}</dt>
      <dd className="font-mono text-[13px] font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/**
 * The limits of a plan, written the way the customer reads them.
 *
 * Every number is the one of the platform.
 */
export function MailPlanLimitList({ limits }: { limits: MailPlanLimits }) {
  return (
    <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
      <Limit label="Domains" value={limits.maxDomains} />
      <Limit label="Mailboxes per domain" value={limits.maxMailboxes} />
      <Limit label="Aliases per domain" value={limits.maxAliases} />
      <Limit label="Forwarding rules per domain" value={limits.maxForwarding} />
      <Limit label="Space of the plan" value={memLabel(limits.totalStorageMb)} />
      <Limit label="Space per mailbox" value={memLabel(limits.mailboxQuotaMb)} />
      <Limit label="Sending" value={`${limits.sendLimit} messages ${sendIntervalLabel(limits.sendInterval)}`} />
    </dl>
  );
}

/**
 * The price of a plan, with its period.
 *
 * The amount and the currency are the ones of the platform: the page never
 * writes an amount of its own.
 */
export function MailPlanPriceLine({ plan, price: chosen }: { plan: MailPlanView; price?: MailPlanView['price'] }) {
  const price = chosen ?? plan.price;
  if (!price) {
    return <p className="text-[15px] font-semibold text-ink2">This plan has no price yet.</p>;
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="font-mono text-[26px] font-semibold tracking-[-0.03em] text-ink">
        <Money amount={price.amount} currency={price.currency} />
      </span>
      <span className="text-[13px] text-ink3">
        {periodSuffix(price.period)} · {periodLabel(price.period)}
      </span>
    </div>
  );
}

/**
 * Why a plan cannot be bought, in the words of the platform.
 *
 * When the platform does not say why, the page says it in its own words: a
 * plan that is not on sale is never left without a reason.
 */
export function mailPlanBlockers(plan: MailPlanView): string[] {
  const blockers = plan.availability?.blockers ?? [];
  if (blockers.length) return blockers;
  if (!plan.onSale) return ['The sale of hosted mail is closed at the moment.'];
  if (!plan.price) return ['This plan has no price yet, so it cannot be ordered.'];
  return [];
}

/**
 * One plan of hosted mail, as the storefront shows it.
 *
 * A plan that is not on sale can still be read: its name, its description, its
 * limits and its price stay on the page. Its button is disabled and the reason
 * of the platform is written under it.
 */
export function MailPlanCard({ plan, buyHref, tone }: { plan: MailPlanView; buyHref?: string; tone?: string }) {
  const blockers = mailPlanBlockers(plan);
  const onSale = plan.onSale && plan.price !== null;

  return (
    <article
      data-plan={plan.slug}
      data-on-sale={onSale ? 'yes' : 'no'}
      style={tone ? { background: tone } : undefined}
      className={tone ? 'on-tone flex h-full flex-col rounded-[26px] p-5 transition-transform duration-200 hover:-translate-y-1 hover:-rotate-[0.5deg] sm:p-6' : 'flex h-full flex-col rounded-2xl bg-s1 p-4 sm:p-5'}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={tone ? 'break-words font-display text-[28px] leading-none font-semibold tracking-[-0.04em] text-ink' : 'break-words text-[17px] font-semibold tracking-[-0.02em] text-ink'}>{plan.name}</h3>
          <p className="mt-1 break-words text-[13.5px] leading-relaxed text-ink2">{plan.description}</p>
        </div>
        {tone && onSale ? null : (
          <StatusPill
            status={onSale ? 'active' : 'draft'}
            label={onSale ? 'On sale' : 'Not on sale yet'}
          />
        )}
      </div>

      <div className="mt-4">
        <MailPlanLimitList limits={plan.limits} />
      </div>

      <div className="mt-4">
        <MailPlanPriceLine plan={plan} />
      </div>

      <div className="mt-4 flex-1" />

      {onSale ? (
        buyHref && tone ? (
          <Link to={buyHref} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-paper px-5 text-[15.5px] font-semibold text-snow transition-colors hover:bg-ink hover:text-paper">
            Choose this plan
          </Link>
        ) : buyHref ? (
          <ButtonLink to={buyHref} className="w-full">
            Choose this plan
          </ButtonLink>
        ) : (
          <PrimaryButton className="w-full" disabled>
            Choose this plan
          </PrimaryButton>
        )
      ) : (
        <>
          <PrimaryButton className="w-full" disabled>
            Not on sale yet
          </PrimaryButton>
          {blockers.length > 0 && (
            <ul className="mt-2 grid gap-1">
              {blockers.map((blocker) => (
                <li key={blocker} className="text-[13px] leading-relaxed text-ink2">
                  {blocker}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  );
}

/**
 * The storefront of hosted mail.
 *
 * The plans, their limits and their price are the ones of the platform. A
 * visitor without an account may read them all; choosing a plan sends them to
 * the login with the plan in the ?next= parameter.
 */
export default function EmailHosting() {
  const { user, loading: sessionLoading } = useSession();
  const state = useAsync<{ plans: MailPlanView[] }>(
    (signal) => get<{ plans: MailPlanView[] }>('/mail/plans', undefined, signal),
    [],
  );
  const plans = useMemo(() => state.data?.plans ?? [], [state.data]);
  // The sale of hosted mail can be closed by the operator. When every plan is
  // closed, the page says so before the plans themselves.
  const saleClosed = plans.length > 0 && plans.every((plan) => !plan.onSale);

  return (
    <PublicShell>
      <Wrap>
        <div className="py-10 sm:py-16">
          <p className="num flex items-center gap-3 text-[12px] tracking-[0.08em] text-ink3 uppercase">
            <span aria-hidden="true" className="grid size-8 rotate-3 place-items-center rounded-[10px] text-paper" style={{ background: toneOf('EMAIL_HOSTING') }}><Icon name="mail" size={15} /></span>
            Email hosting
          </p>
          <h1 className="mt-5 max-w-[12em] text-[clamp(40px,6vw,84px)] leading-[0.96] font-semibold tracking-[-0.05em]">
            Your own mail, on your own domain.
          </h1>
          <p className="mt-5 max-w-[48ch] text-[18px] leading-relaxed text-ink2">
            Hosted mail gives every domain of yours a place where mail arrives and where mail leaves. The
            plans, their limits and their price are the ones of the platform.
          </p>
        </div>

        {state.loading ? (
          <LoadingBlock rows={3} label="Loading the plans of hosted mail" />
        ) : state.error ? (
          <ErrorState
            title="The plans of hosted mail could not be loaded"
            message={state.error.message}
            onRetry={state.reload}
          />
        ) : !plans.length ? (
          <EmptyState
            title="There is no plan of hosted mail yet."
            description="The platform does not offer hosted mail at the moment. When it does, the plans appear here."
          />
        ) : (
          <>
            {saleClosed && (
              <Panel
                title="Hosted mail is not on sale at the moment"
                description="The operator closed the sale of hosted mail. The plans below can be read, but they cannot be bought until the sale opens again."
              >
                <ul className="grid gap-1">
                  {plans.flatMap((plan) => mailPlanBlockers(plan)).map((blocker) => (
                    <li key={blocker} className="text-[13.5px] leading-relaxed text-ink2">
                      {blocker}
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <div className="mt-4 mb-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan, index) => {
                const target = mailCheckoutPath(plan.slug);
                // A visitor without a session is sent to the login with the plan
                // in the ?next= parameter, so the checkout opens on it.
                const buyHref =
                  user || sessionLoading ? target : `/login?next=${encodeURIComponent(target)}`;
                return <MailPlanCard key={plan.id} plan={plan} buyHref={buyHref} tone={['#c9b8ff', '#7fd6ff', '#ffd166'][index % 3]} />;
              })}
            </div>
          </>
        )}
      </Wrap>
    </PublicShell>
  );
}

/** The period a plan is bought for, when the platform named one. */
function planPeriod(plan: MailPlanView): 'MONTHLY' | 'YEARLY' | null {
  const period = plan.price?.period;
  if (period === 'MONTHLY' || period === 'YEARLY') return period;
  return null;
}

/**
 * The checkout of a plan of hosted mail.
 *
 * The customer names the domain the mail will live on and the page creates the
 * order and sends them to the payment of the provider. The order is never sent
 * without a domain, and the page never sends an amount of its own: the server
 * prices the order.
 */
export function EmailCheckout({ plan: planProp }: { plan?: MailPlanView }) {
  return <DeployStudio initialSlug="email-hosting" />;
}

function LegacyEmailCheckout({ plan: planProp }: { plan?: MailPlanView }) {
  const { query } = useRouter();
  const slug = planProp?.slug ?? query.plan ?? '';
  const [domain, setDomain] = useState('');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [term, setTerm] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [chosen, setChosen] = useState(slug);
  // The review is a step of the address; the domain stays in the page.
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => {
    const back = () => setReviewing(false);
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);

  const state = useAsync<{ plans: MailPlanView[] }>(
    (signal) => get<{ plans: MailPlanView[] }>('/mail/plans', undefined, signal),
    [],
  );
  const plan = planProp ?? state.data?.plans.find((entry) => entry.slug === chosen) ?? null;
  const plans = (state.data?.plans ?? []).filter((entry) => entry.onSale && entry.price !== null);
  // The platform lists the terms it sells the plan for; the order is priced by the server.
  const yearlyPrice = plan?.prices.find((entry) => entry.period === 'YEARLY') ?? null;
  const chosenPrice = term === 'YEARLY' && yearlyPrice ? yearlyPrice : plan?.price ?? null;

  const order = useAction(async () => {
    if (!plan) return;
    const hostname = domain.trim().toLowerCase();
    // The hostname is checked before the order is sent: a name that is not a
    // hostname is refused by the page, not by the server.
    const problem = validateMailDomainName(hostname);
    if (problem) {
      setDomainError(problem);
      return;
    }
    setDomainError(null);
    const period = term === 'YEARLY' && yearlyPrice ? 'YEARLY' : planPeriod(plan);
    const created = await post<{ order: Order }>('/orders', {
      items: [{ productSlug: plan.slug, mailDomain: hostname }],
      ...(period ? { period } : {}),
    });
    const checkout = await post<{ url: string | null; message?: string }>(
      `/orders/${encodeURIComponent(created.order.id)}/checkout`,
    );
    if (checkout.url) {
      location.assign(checkout.url);
      return;
    }
    setNotice(checkout.message ?? 'The payment could not be opened. The order is waiting for it.');
  });

  const onSale = plan ? plan.onSale && plan.price !== null : false;
  const blockers = plan ? mailPlanBlockers(plan) : [];
  const goReview = () => {
    const problem = validateMailDomainName(domain.trim().toLowerCase());
    if (problem) {
      setDomainError(problem);
      return;
    }
    setDomainError(null);
    window.history.pushState(null, '', `${location.pathname}?plan=${encodeURIComponent(plan?.slug ?? '')}&step=review`);
    setReviewing(true);
  };
  const choose = (next: string) => {
    setChosen(next);
    window.history.replaceState(null, '', `${location.pathname}?plan=${encodeURIComponent(next)}`);
  };

  return (
    <Panel>
      {state.loading && !plan ? (
        <LoadingBlock rows={2} label="Loading the plan" />
      ) : state.error && !plan ? (
        <ErrorState title="The plan could not be loaded" message={state.error.message} onRetry={state.reload} />
      ) : !plan ? (
        <EmptyState
          title="This plan does not exist."
          description="It is not in the catalog of hosted mail."
          action={<ButtonLink to={EMAIL_STOREFRONT_PATH}>See the plans of hosted mail</ButtonLink>}
        />
      ) : reviewing && onSale ? (
        <div className="grid gap-4">
          <dl className="grid gap-2.5 text-[14px]">
            {([
              ['Plan', plan.name],
              ['Mail domain', domain.trim().toLowerCase()],
              ['Billing', term === 'YEARLY' && yearlyPrice ? 'Yearly' : 'Monthly'],
              ['Mailboxes per domain', String(plan.limits.maxMailboxes)],
              ['Space', memLabel(plan.limits.totalStorageMb)],
            ] as const).map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 border-t border-line pt-2.5 first:border-t-0 first:pt-0">
                <dt className="text-ink3">{label}</dt>
                <dd className="min-w-0 break-all text-right font-mono text-ink">{value}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2.5">
              <dt className="font-semibold text-ink">Total</dt>
              <dd><MailPlanPriceLine plan={plan} price={chosenPrice} /></dd>
            </div>
          </dl>
          {notice && <p className="rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2">{notice}</p>}
          {order.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] text-bad">{order.error}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <SoftButton onClick={() => window.history.back()} disabled={order.pending}>Back</SoftButton>
            <PrimaryButton disabled={order.pending} onClick={() => void order.run()}>{order.pending ? 'Opening the payment…' : 'Pay'}</PrimaryButton>
          </div>
        </div>
      ) : (
        <div className="grid gap-5">
          {!planProp && plans.length > 1 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[13.5px] font-medium text-ink">Plan</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map((entry) => (
                  <label
                    key={entry.slug}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3.5 transition-colors ${entry.slug === plan.slug ? 'border-acc bg-acc-bg' : 'border-line bg-card hover:bg-s2'}`}
                  >
                    <input type="radio" name="mail-plan" value={entry.slug} checked={entry.slug === plan.slug} onChange={() => choose(entry.slug)} className="sr-only" />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-ink">{entry.name}</span>
                      <span className="block font-mono text-[12.5px] text-ink3">{entry.limits.maxMailboxes} mailboxes · {memLabel(entry.limits.totalStorageMb)}</span>
                    </span>
                    {entry.price && <span className="shrink-0 font-mono text-[13.5px] text-ink2"><Money amount={entry.price.amount} currency={entry.price.currency} /></span>}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="break-words text-[16px] font-semibold tracking-[-0.02em] text-ink">{plan.name}</p>
              {!onSale && <StatusPill status="draft" label="Not on sale yet" />}
            </div>
            <MailPlanLimitList limits={plan.limits} />
          </div>

          {onSale ? (
            <>
              {yearlyPrice && (
                <Segmented
                  options={[{ value: 'MONTHLY', label: 'Monthly' }, { value: 'YEARLY', label: 'Yearly' }]}
                  value={term}
                  onChange={(value) => setTerm(value as 'MONTHLY' | 'YEARLY')}
                  ariaLabel="Billing term"
                />
              )}
              <TextInput
                label="Mail domain"
                value={domain}
                onChange={(event) => {
                  setDomain(event.target.value);
                  if (domainError) setDomainError(null);
                }}
                error={domainError ?? undefined}
                hint="The hostname that will carry the mail, for example acme.ro. The platform never writes your DNS: it shows the records to create."
                placeholder="acme.ro"
                autoComplete="off"
                spellCheck={false}
              />
              {blockers.length > 0 && (
                <ul className="grid gap-1">
                  {blockers.map((blocker) => (
                    <li key={blocker} className="text-[13px] leading-relaxed text-ink2">{blocker}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <MailPlanPriceLine plan={plan} price={chosenPrice} />
                <PrimaryButton disabled={domain.trim() === ''} onClick={goReview}>Review</PrimaryButton>
              </div>
            </>
          ) : (
            <>
              <p className="text-[13.5px] text-ink2">This plan is not on sale at the moment.</p>
              {blockers.length > 0 && (
                <ul className="grid gap-1">
                  {blockers.map((blocker) => (
                    <li key={blocker} className="text-[13px] leading-relaxed text-ink2">{blocker}</li>
                  ))}
                </ul>
              )}
              <ButtonLink to={EMAIL_STOREFRONT_PATH}>See the plans of hosted mail</ButtonLink>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

/**
 * The plans of hosted mail that the platform sells right now.
 *
 * A plan that is not on sale is not offered: the sale of hosted mail can be
 * closed by the operator.
 */
export { onSaleMailPlans } from './Mail';
