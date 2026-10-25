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

import { useMemo, useState, type ReactNode } from 'react';
import { get, post, type MailPlanLimits, type MailPlanView, type Order } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { memLabel, periodLabel, periodSuffix } from '../lib/pricing';
import { useRouter } from '../router';
import { useSession } from '../session';
import { Eyebrow, Headline, Wrap } from '../ui';
import {
  ButtonLink,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Money,
  Panel,
  PrimaryButton,
  StatusPill,
  TextInput,
} from '../ui-app';
import { Footer } from '../home/Rest';
import { Nav } from '../home/Nav';
import { validateMailDomainName } from '../lib/mail-domain';

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
      {/* The chips of the navigation belong to the catalog of the site. Here
          they only lead back to it. */}
      <Nav setCat={() => {}} />
      <main className="min-h-[100svh] pt-[84px] sm:pt-[104px]">{children}</main>
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
export function MailPlanPriceLine({ plan }: { plan: MailPlanView }) {
  if (!plan.price) {
    return <p className="text-[15px] font-bold text-ink2">This plan has no price yet.</p>;
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="font-mono text-[26px] font-semibold tracking-[-0.03em] text-ink">
        <Money amount={plan.price.amount} currency={plan.price.currency} />
      </span>
      <span className="text-[13px] text-ink3">
        {periodSuffix(plan.price.period)} · {periodLabel(plan.price.period)}
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
export function MailPlanCard({ plan, buyHref }: { plan: MailPlanView; buyHref?: string }) {
  const blockers = mailPlanBlockers(plan);
  const onSale = plan.onSale && plan.price !== null;

  return (
    <article
      data-plan={plan.slug}
      data-on-sale={onSale ? 'yes' : 'no'}
      className="flex h-full flex-col rounded-[22px] bg-s1 p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-[17px] font-extrabold tracking-[-0.02em] text-ink">{plan.name}</h3>
          <p className="mt-1 break-words text-[13.5px] leading-relaxed text-ink2">{plan.description}</p>
        </div>
        <StatusPill
          status={onSale ? 'active' : 'draft'}
          label={onSale ? 'On sale' : 'Not on sale yet'}
        />
      </div>

      <div className="mt-4">
        <MailPlanLimitList limits={plan.limits} />
      </div>

      <div className="mt-4">
        <MailPlanPriceLine plan={plan} />
      </div>

      <div className="mt-4 flex-1" />

      {onSale ? (
        buyHref ? (
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
        <div className="py-8 sm:py-12">
          <Eyebrow>Email hosting</Eyebrow>
          <Headline as="h1" lines={['Your own mail, on your own domain.']} />
          <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-ink2">
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

            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const target = mailCheckoutPath(plan.slug);
                // A visitor without a session is sent to the login with the plan
                // in the ?next= parameter, so the checkout opens on it.
                const buyHref =
                  user || sessionLoading ? target : `/login?next=${encodeURIComponent(target)}`;
                return <MailPlanCard key={plan.id} plan={plan} buyHref={buyHref} />;
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
  const { query } = useRouter();
  const slug = planProp?.slug ?? query.plan ?? '';
  const [domain, setDomain] = useState('');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const state = useAsync<{ plans: MailPlanView[] }>(
    (signal) => get<{ plans: MailPlanView[] }>('/mail/plans', undefined, signal),
    [],
  );
  const plan = planProp ?? state.data?.plans.find((entry) => entry.slug === slug) ?? null;

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
    const period = planPeriod(plan);
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

  return (
    <Panel
      title="Email hosting"
      description="The plan you chose, the domain that will carry the mail and the price the platform asks for it."
    >
      {state.loading && !plan ? (
        <LoadingBlock rows={2} label="Loading the plan" />
      ) : state.error && !plan ? (
        <ErrorState
          title="The plan could not be loaded"
          message={state.error.message}
          onRetry={state.reload}
        />
      ) : !plan ? (
        <EmptyState
          title="This plan does not exist."
          description="It is not in the catalog of hosted mail. The storefront shows every plan the platform offers."
          action={<ButtonLink to={EMAIL_STOREFRONT_PATH}>See the plans of hosted mail</ButtonLink>}
        />
      ) : (
        <div className="grid gap-4">
          <div className="rounded-2xl bg-s2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-[16px] font-extrabold tracking-[-0.02em] text-ink">{plan.name}</p>
                <p className="mt-1 break-words text-[13.5px] leading-relaxed text-ink2">{plan.description}</p>
              </div>
              <StatusPill
                status={onSale ? 'active' : 'draft'}
                label={onSale ? 'On sale' : 'Not on sale yet'}
              />
            </div>
            <div className="mt-4">
              <MailPlanLimitList limits={plan.limits} />
            </div>
            <div className="mt-4">
              <MailPlanPriceLine plan={plan} />
            </div>
          </div>

          {onSale ? (
            <>
              <TextInput
                label="Mail domain"
                value={domain}
                onChange={(event) => {
                  setDomain(event.target.value);
                  if (domainError) setDomainError(null);
                }}
                error={domainError ?? undefined}
                hint="The hostname that will carry the mail, for example acme.ro. The platform never writes the DNS of a customer: it shows the records to publish."
                placeholder="acme.ro"
                autoComplete="off"
                spellCheck={false}
              />

              {blockers.length > 0 && (
                <ul className="grid gap-1">
                  {blockers.map((blocker) => (
                    <li key={blocker} className="text-[13px] leading-relaxed text-ink2">
                      {blocker}
                    </li>
                  ))}
                </ul>
              )}

              {notice && (
                <p className="rounded-2xl bg-s2 px-4 py-3 text-[13.5px] leading-relaxed text-ink2">{notice}</p>
              )}

              {order.error && (
                <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] leading-relaxed text-bad">
                  {order.error}
                </p>
              )}

              <PrimaryButton
                className="w-full sm:w-auto"
                disabled={order.pending || domain.trim() === ''}
                onClick={() => void order.run()}
              >
                {order.pending ? 'Opening the payment…' : 'Continue to the payment'}
              </PrimaryButton>
            </>
          ) : (
            <>
              <p className="rounded-2xl bg-s2 px-4 py-3 text-[13.5px] leading-relaxed text-ink2">
                This plan is not on sale at the moment, so it cannot be bought. The storefront shows what the
                platform offers.
              </p>
              {blockers.length > 0 && (
                <ul className="grid gap-1">
                  {blockers.map((blocker) => (
                    <li key={blocker} className="text-[13px] leading-relaxed text-ink2">
                      {blocker}
                    </li>
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
