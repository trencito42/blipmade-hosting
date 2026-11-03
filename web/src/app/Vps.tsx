/**
 * Virtual private servers: the storefront, the order, the list and the page of a server.
 *
 * The storefront is public. Every number on it comes from GET /vps/plans, so the page
 * never writes a price or a size of its own.
 */

import { LineChart } from './LineChart';
import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api, del, get, post, type Order, type VpsUsageView, type VpsPlanView, type VpsServerView } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useInfiniteList } from '../lib/useInfinite';
import { memLabel } from '../lib/pricing';
import { Link, useParams } from '../router';
import { ButtonGroup } from './components/premium';
import { InfoTip } from '../tooltip';
import { useSession } from '../session';
import { Icon } from '../icons';
import { Eyebrow, Footer, Nav, Wrap } from '../site/ui';
import {
  ButtonLink,
  CardList,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FadedLoadMore,
  LoadingBlock,
  Money,
  Pager,
  Segmented,
  Select,
  Panel,
  PrimaryButton,
  SoftButton,
  StatusPill,
  TextArea,
  TextInput,
  usePaged,
  useReveal,
  useToast,
} from '../ui-app';

const VpsConsole = lazy(() => import('./VpsConsole'));

export const VPS_STOREFRONT_PATH = '/vps';
export const VPS_NEW_PATH = '/app/vps/new';

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <main className="min-h-[100svh]">{children}</main>
      <Footer />
    </>
  );
}

/** One line of a plan: what it is and how much. */
function Spec({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1.5">
      <dt className="text-[12.5px] text-ink3">{label}</dt>
      <dd className="font-mono text-[13px] font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function PlanSpecs({ plan }: { plan: VpsPlanView }) {
  return (
    <dl className="grid gap-2">
      <Spec label="vCPU" value={plan.cpu} />
      <Spec label="Memory" value={memLabel(plan.ram)} />
      <Spec label="Disk" value={`${plan.disk} GB`} />
      <Spec label="System" value="Debian 13" />
      <Spec label="Access" value="root, SSH key" />
    </dl>
  );
}

/** The storefront: the plans, and a short, honest note about the address. */
export default function VpsStorefront() {
  const { user, loading: sessionLoading } = useSession();
  const state = useAsync<{ plans: VpsPlanView[] }>((signal) => get<{ plans: VpsPlanView[] }>('/vps/plans', undefined, signal), []);
  const plans = useMemo(() => state.data?.plans ?? [], [state.data]);

  return (
    <PublicShell>
      <Wrap>
        <div className="py-8 sm:py-12">
          <Eyebrow>Servers</Eyebrow>
          <h1 className="mt-3 max-w-[14em] text-[clamp(38px,5.4vw,66px)] leading-[0.98] font-semibold tracking-[-0.045em]">
            A server of your own, with root.
          </h1>
          <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-ink2">
            A virtual machine with the resources of the plan, a Debian system and the key you give us. Use it for a backend,
            a website or a tool, and keep the rest of your project on the platform.
          </p>
        </div>

        {state.loading ? (
          <LoadingBlock rows={3} label="Loading the plans" />
        ) : state.error ? (
          <ErrorState title="The plans could not be loaded" message={state.error.message} onRetry={state.reload} />
        ) : !plans.length ? (
          <EmptyState title="Servers are not on sale yet." description="When they are, the plans appear here." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const target = `${VPS_NEW_PATH}?plan=${encodeURIComponent(plan.slug)}`;
              const href = user || sessionLoading ? target : `/login?next=${encodeURIComponent(target)}`;
              return (
                <article key={plan.slug} className="flex h-full flex-col rounded-2xl bg-s1 p-4 sm:p-5">
                  <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{plan.name}</h2>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink2">{plan.description}</p>
                  <div className="mt-4">
                    <PlanSpecs plan={plan} />
                  </div>
                  <p className="mt-4 text-[26px] font-semibold tracking-[-0.03em] text-ink">
                    {plan.price ? <Money amount={plan.price.amount} currency={plan.price.currency} /> : '—'}
                    <span className="text-[13px] font-normal text-ink3"> / month</span>
                  </p>
                  <div className="mt-4 flex-1" />
                  <ButtonLink to={href} className="w-full">
                    Choose {plan.name}
                  </ButtonLink>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-8 mb-16 grid gap-3 rounded-2xl border border-line p-5 text-[14px] leading-relaxed text-ink2 sm:grid-cols-2">
          <div>
            <p className="font-semibold text-ink">The address</p>
            <p className="mt-1">
              A server shares a public address with the other servers, and its SSH is published on a port of its own. Web
              sites reach it through the platform by hostname. If you need every port on an address that is only yours,
              add a dedicated IPv4 address when you order.
            </p>
          </div>
          <div>
            <p className="font-semibold text-ink">What is not included</p>
            <p className="mt-1">
              Outgoing mail on port 25 is closed, so a server cannot send spam. For mailboxes use{' '}
              <Link to="/email" className="underline underline-offset-4">
                hosted email
              </Link>
              . Backups of the server are yours to make for now.
            </p>
          </div>
        </div>
      </Wrap>
    </PublicShell>
  );
}

/** The order of a server: the plan, the name, the key and the address. */
export function VpsCheckout() {
  const { query } = useRouterQuery();
  const state = useAsync<{ plans: VpsPlanView[] }>((signal) => get<{ plans: VpsPlanView[] }>('/vps/plans', undefined, signal), []);
  const plans = useMemo(() => state.data?.plans ?? [], [state.data]);
  const [slug, setSlug] = useState(query.plan ?? '');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [dedicated, setDedicated] = useState(false);
  const [promo, setPromo] = useState('');
  const [period, setPeriod] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  // The review is a step of the address. The key and the choices stay in the page, never in the address.
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => {
    const onBack = () => setReviewing(false);
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, []);
  const goReview = () => {
    if (!key.trim()) {
      setFieldErrs({ sshPublicKey: 'Paste the public SSH key you will log in with.' });
      return;
    }
    setFieldErrs({});
    window.history.pushState(null, '', `${location.pathname}?step=review`);
    setReviewing(true);
  };

  useEffect(() => {
    if (!slug && plans[0]) setSlug(plans[0].slug);
  }, [plans, slug]);

  const plan = plans.find((entry) => entry.slug === slug) ?? null;
  const yearly = period === 'YEARLY';
  // The list price is only a first figure: the quote of the server is what is charged.
  const shownPrice = yearly ? plan?.yearlyPrice ?? null : plan?.price ?? null;
  const addressAmount = plan?.dedicatedIp ? (yearly ? plan.dedicatedIp.yearlyAmount ?? plan.dedicatedIp.amount * 12 : plan.dedicatedIp.amount) : 0;
  const listTotal = shownPrice ? shownPrice.amount + (dedicated ? addressAmount : 0) : null;

  // The price comes from the server, with the promotion code applied, so the sum that is shown is the sum that is charged.
  const trimmedPromo = promo.trim();
  const quoteState = useAsync<{ total: number; subtotal: number; discount: number; currency: string; promotion: { code: string; valid: boolean; reason?: string } | null } | null>(
    async (signal) => {
      if (!plan || (!trimmedPromo && !yearly)) return null;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 250);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      });
      return api('/catalog/quote', {
        method: 'POST',
        body: {
          items: [{ productSlug: plan.slug, ...(dedicated && plan.dedicatedIp ? { optionCodes: [plan.dedicatedIp.code] } : {}) }],
          ...(trimmedPromo ? { promotionCode: trimmedPromo } : {}),
          period,
        },
        signal,
      });
    },
    [plan?.slug, dedicated, trimmedPromo, period],
  );
  const quote = quoteState.data ?? null;
  const promotion = quote?.promotion ?? null;
  // A year is always the price of the server; a month is the quote only when a code applies.
  const total = quote && (promotion?.valid || yearly) ? quote.total : listTotal;

  const order = useAction(async () => {
    if (!plan) return;
    setError(null);
    if (!key.trim()) {
      setFieldErrs({ sshPublicKey: 'Paste the public SSH key you will log in with.' });
      return;
    }
    setFieldErrs({});
    try {
      const created = await post<{ order: Order }>('/orders', {
        ...(trimmedPromo ? { promotionCode: trimmedPromo } : {}),
        period,
        items: [
          {
            productSlug: plan.slug,
            sshPublicKey: key.trim(),
            ...(name.trim() ? { vpsName: name.trim() } : {}),
            ...(dedicated && plan.dedicatedIp ? { optionCodes: [plan.dedicatedIp.code] } : {}),
          },
        ],
      });
      const checkout = await post<{ url: string | null; message?: string }>(`/orders/${encodeURIComponent(created.order.id)}/checkout`);
      if (checkout.url) {
        location.assign(checkout.url);
        return;
      }
      setNotice(checkout.message ?? 'The payment could not be opened. The order is waiting for it.');
    } catch (failure) {
      if (failure instanceof ApiError && failure.fields) setFieldErrs(failure.fields);
      setError(failure instanceof Error ? failure.message : 'The order could not be made.');
    }
  });

  return (
    <div className="grid gap-4">
      <Panel title="Order a server" description="Choose the size, give it a name and the public key you will log in with.">
        {state.loading && !plans.length ? (
          <LoadingBlock rows={3} label="Loading the plans" />
        ) : state.error ? (
          <ErrorState title="The plans could not be loaded" message={state.error.message} onRetry={state.reload} />
        ) : !plans.length ? (
          <EmptyState title="Servers are not on sale yet." description="When they are, you can order one here." />
        ) : reviewing && plan ? (
          <div className="grid gap-4">
            <dl className="grid gap-2.5 text-[14px]">
              {([
                ['Plan', `${plan.name} · ${plan.cpu} vCPU · ${memLabel(plan.ram)} · ${plan.disk} GB`],
                ['Name', name.trim() || 'Chosen by the platform'],
                ['Billing', yearly ? 'Yearly' : 'Monthly'],
                ['Dedicated address', dedicated ? 'Yes' : 'No'],
                ['SSH key', `${key.trim().slice(0, 28)}…`],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 border-t border-line pt-2.5 first:border-t-0 first:pt-0">
                  <dt className="text-ink3">{label}</dt>
                  <dd className="min-w-0 break-all text-right font-mono text-ink">{value}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2.5">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="text-[20px] font-semibold text-ink">{total !== null ? <Money amount={total} currency="EUR" /> : '—'}</dd>
              </div>
            </dl>
            {error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{error}</p>}
            {notice && <p className="rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink2">{notice}</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <SoftButton onClick={() => window.history.back()} disabled={order.pending}>Back</SoftButton>
              <PrimaryButton onClick={() => void order.run()} disabled={order.pending}>
                {order.pending ? (total === 0 ? 'Placing the order…' : 'Opening the payment…') : total === 0 ? 'Place the order' : 'Pay'}
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="grid gap-5">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[13.5px] font-medium text-ink">Plan</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {plans.map((entry) => (
                  <label
                    key={entry.slug}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3.5 transition-colors ${
                      entry.slug === slug ? 'border-acc bg-acc-bg' : 'border-line bg-s1 hover:bg-s2'
                    }`}
                  >
                    <input type="radio" name="vps-plan" value={entry.slug} checked={entry.slug === slug} onChange={() => setSlug(entry.slug)} className="sr-only" />
                    <span>
                      <span className="block text-[15px] font-semibold text-ink">{entry.name}</span>
                      <span className="block font-mono text-[12.5px] text-ink3">
                        {entry.cpu} vCPU · {memLabel(entry.ram)} · {entry.disk} GB
                      </span>
                    </span>
                    <span className="text-[15px] font-semibold text-ink">
                      {(yearly ? entry.yearlyPrice : entry.price) ? (
                        <>
                          <Money amount={(yearly ? entry.yearlyPrice : entry.price)!.amount} currency={(yearly ? entry.yearlyPrice : entry.price)!.currency} />
                          <span className="ml-1 text-[12px] font-normal text-ink3">{yearly ? '/ year' : '/ month'}</span>
                        </>
                      ) : '—'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-2">
              <p id="vps-term-label" className="text-[13.5px] font-medium text-ink">Billing term</p>
              <div role="radiogroup" aria-labelledby="vps-term-label" className="grid max-w-sm grid-cols-2 gap-2">
                {(['MONTHLY', 'YEARLY'] as const).map((term) => (
                  <button
                    key={term}
                    type="button"
                    role="radio"
                    aria-checked={period === term}
                    onClick={() => setPeriod(term)}
                    className={`rounded-2xl border px-3.5 py-3 text-[13.5px] font-medium transition-colors ${
                      period === term ? 'border-acc bg-acc-bg text-acc' : 'border-line bg-card text-ink hover:border-ink3'
                    }`}
                  >
                    {term === 'MONTHLY' ? 'Monthly' : 'Yearly'}
                  </button>
                ))}
              </div>
            </div>

            <TextInput
              label="Name of the server"
              hint="Lowercase letters, numbers and dashes. It is also the hostname. Leave it empty for a name we choose."
              value={name}
              onChange={(event) => { setName(event.target.value.toLowerCase()); setFieldErrs((current) => ({ ...current, vpsName: '' })); }}
              error={fieldErrs.vpsName || undefined}
              placeholder="api-prod"
              autoComplete="off"
              spellCheck={false}
            />

            <TextArea
              label="Public SSH key"
              hint="The line of the .pub file. To make one, run ssh-keygen -t ed25519, then show ~/.ssh/id_ed25519.pub. Never paste the private key."
              value={key}
              onChange={(event) => { setKey(event.target.value); setFieldErrs((current) => ({ ...current, sshPublicKey: '' })); }}
              error={fieldErrs.sshPublicKey || undefined}
              rows={3}
              placeholder="ssh-ed25519 AAAAC3Nza… you@laptop"
              spellCheck={false}
              className="font-mono"
            />

            <label className={`flex items-start gap-3 rounded-2xl bg-s2 p-3.5 ${plan?.dedicatedIp ? 'cursor-pointer' : 'opacity-60'}`}>
              <input type="checkbox" checked={dedicated} disabled={!plan?.dedicatedIp} onChange={(event) => setDedicated(event.target.checked)} className="mt-1 size-4 accent-acc" />
              <span>
                <span className="block text-[14.5px] font-medium text-ink">
                  Dedicated IPv4 address
                  {plan?.dedicatedIp ? <> · <Money amount={addressAmount} currency="EUR" /> {yearly ? '/ year' : '/ month'}</> : null}
                </span>
                <span className="block text-[13px] text-ink2">
                  {plan?.dedicatedIp
                    ? 'An address only your server uses, with every port open to it and SSH on port 22.'
                    : 'No dedicated address is free right now. The server gets the shared address, with SSH on a port of its own.'}
                </span>
              </span>
            </label>

            <div className="grid gap-2">
              <TextInput
                label="Promotion code"
                hint="Optional. The price below updates when the code applies."
                value={promo}
                onChange={(event) => setPromo(event.target.value)}
                placeholder="Enter a code"
                autoComplete="off"
                spellCheck={false}
              />
              <div aria-live="polite">
                {!promotion || !trimmedPromo ? null : promotion.valid ? (
                  <p className="rounded-2xl bg-acc-bg px-3.5 py-3 text-[13.5px] font-medium text-acc">
                    {promotion.code} applied. You save <Money amount={quote?.discount ?? 0} currency="EUR" />.
                  </p>
                ) : (
                  <p role="alert" className="rounded-2xl bg-bad/12 px-3.5 py-3 text-[13.5px] font-medium text-bad">
                    {promotion.reason || `${promotion.code} is not valid.`}
                  </p>
                )}
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-medium text-bad">
                {error}
              </p>
            )}
            {notice && <p className="rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink2">{notice}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-[14px] text-ink2">
                Total{' '}
                {promotion?.valid && listTotal !== null && total !== listTotal && (
                  <span className="mr-2 text-[14px] text-ink3 line-through"><Money amount={listTotal} currency="EUR" /></span>
                )}
                <span className="text-[20px] font-semibold text-ink">{total !== null ? <Money amount={total} currency="EUR" /> : '—'}</span> {yearly ? 'a year' : 'a month'}
              </p>
              <PrimaryButton onClick={goReview} disabled={!plan || !key.trim()}>
                Review
              </PrimaryButton>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

/** The tone of the pill that says what a server is doing. */
function statusOf(server: VpsServerView): { tone: string; label: string } {
  if (server.status === 'active') {
    if (server.power === 'running') return { tone: 'active', label: 'Running' };
    if (server.power === 'stopped') return { tone: 'stopped', label: 'Stopped' };
    return { tone: 'pending', label: 'Active' };
  }
  if (server.status === 'failed') return { tone: 'error', label: 'Failed' };
  if (server.status === 'suspended') return { tone: 'stopped', label: 'Suspended' };
  return { tone: 'provisioning', label: 'Being built' };
}

function CopyLine({ value }: { value: string }) {
  const { push } = useToast();
  return (
    <div className="flex items-center gap-2 rounded-xl bg-con px-3 py-2.5 font-mono text-[13px] text-con-ink">
      <span className="min-w-0 flex-1 break-all">{value}</span>
      <button
        type="button"
        aria-label="Copy the command"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(
            () => push('Copied.', 'ok'),
            () => push('The copy did not work. Select the text and copy it by hand.', 'error'),
          );
        }}
        className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-acc"
      >
        <Icon name="copy" size={14} />
      </button>
    </div>
  );
}

/** The servers of the customer: the same inventory as the apps, one card, rows that open the server. */
export function VpsList() {
  const state = useAsync<{ servers: VpsServerView[] }>((signal) => get<{ servers: VpsServerView[] }>('/vps', undefined, signal), []);
  const servers = state.data?.servers ?? [];
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<'newest' | 'name' | 'size'>('newest');
  // Only the states that exist in the list are offered as filters.
  const statuses = useMemo(() => [...new Set(servers.map((server) => statusOf(server).label))], [servers]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const found = servers.filter((server) =>
      (status === 'all' || statusOf(server).label === status) &&
      (!needle || [server.name, server.plan.name, server.publicIp ?? ''].some((value) => value.toLowerCase().includes(needle))),
    );
    if (sort === 'name') return [...found].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'size') return [...found].sort((a, b) => b.ram - a.ram || b.cpu - a.cpu);
    return [...found].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [servers, query, status, sort]);
  const paged = usePaged(filtered, 20, `${query}|${status}|${sort}`);
  const { push } = useToast();
  // A server that is being built is looked at again until it is done.
  useEffect(() => {
    if (!servers.some((server) => server.status === 'pending' || server.status === 'provisioning')) return;
    const timer = window.setInterval(state.reload, 6000);
    return () => window.clearInterval(timer);
  }, [servers, state.reload]);
  const copy = (value: string) =>
    void navigator.clipboard.writeText(value).then(
      () => push('Copied.', 'ok'),
      () => push('The copy did not work. Select the text and copy it by hand.', 'error'),
    );

  return (
    <Panel className="grid gap-4">
      {servers.length > 0 && (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <TextInput
              label="Search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, plan or address"
              autoComplete="off"
            />
            <label className="grid gap-1.5 text-[14px] font-medium text-ink">
              <span className="px-1">Sort by</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                className="h-12 rounded-xl border border-line bg-card px-3 text-[15px] font-normal text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              >
                <option value="newest">Newest first</option>
                <option value="name">Name</option>
                <option value="size">Size: large to small</option>
              </select>
            </label>
          </div>
          {statuses.length > 1 && (
            <Segmented
              role="group"
              ariaLabel="Filter servers by status"
              options={[{ value: 'all', label: 'All' }, ...statuses.map((value) => ({ value, label: value }))]}
              value={status}
              onChange={setStatus}
            />
          )}
        </div>
      )}
      {state.loading && !state.data ? (
        <LoadingBlock rows={2} label="Loading your servers" />
      ) : state.error ? (
        <ErrorState title="Your servers could not be loaded" message={state.error.message} onRetry={state.reload} />
      ) : servers.length === 0 ? (
        <EmptyState title="No server yet." description="A virtual server with root access, ready in a few minutes." action={<ButtonLink to={VPS_NEW_PATH}>Order a server</ButtonLink>} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No server matches." description="Clear the search or pick another status to see your servers again." />
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: 'server',
                header: 'Server',
                truncate: true,
                width: '24%',
                render: (server: VpsServerView) => (
                  <Link to={`/app/vps/${server.id}`} className="block min-w-0 rounded-lg font-bold text-ink transition-colors hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                    <span className="block truncate">{server.name}</span>
                    <span className="block truncate text-[12.5px] font-normal text-ink3">{server.plan.name}</span>
                  </Link>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                nowrap: true,
                render: (server: VpsServerView) => {
                  const status = statusOf(server);
                  return <StatusPill status={status.tone} label={status.label} />;
                },
              },
              {
                key: 'resources',
                header: 'Resources',
                nowrap: true,
                render: (server: VpsServerView) => <span className="font-mono text-[13px] text-ink2">{memLabel(server.ram)} · {server.cpu} vCPU · {server.disk} GB</span>,
              },
              {
                key: 'address',
                header: 'Address',
                truncate: true,
                render: (server: VpsServerView) =>
                  server.sshCommand ? (
                    <button
                      type="button"
                      onClick={() => copy(server.sshCommand!)}
                      data-tip="Copy the SSH command"
                      className="max-w-full truncate rounded-lg text-left font-mono text-[12.5px] text-acc hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                    >
                      {server.publicIp ?? server.sshCommand}
                    </button>
                  ) : (
                    <span className="text-[13px] text-ink3">{server.lastError ?? '—'}</span>
                  ),
              },
            ]}
            rows={paged.rows}
            rowKey={(server: VpsServerView) => server.id}
            rowTo={(server: VpsServerView) => `/app/vps/${server.id}`}
          />
          <CardList rows={paged.rows} rowKey={(server: VpsServerView) => server.id}>
            {(server: VpsServerView) => {
              const status = statusOf(server);
              return (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Link to={`/app/vps/${server.id}`} className="w-0 min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                      <span className="block truncate text-[15.5px] font-bold tracking-[-0.02em] text-ink">{server.name}</span>
                      <span className="block truncate text-[12.5px] text-ink3">{server.plan.name}</span>
                    </Link>
                    <StatusPill status={status.tone} label={status.label} />
                  </div>
                  <p className="font-mono text-[13px] text-ink2">{memLabel(server.ram)} · {server.cpu} vCPU · {server.disk} GB</p>
                  {server.sshCommand && <CopyLine value={server.sshCommand} />}
                  {server.lastError && <p className="text-[13px] text-bad">{server.lastError}</p>}
                </div>
              );
            }}
          </CardList>
          <Pager paged={paged} label="Servers pages" />
        </>
      )}
    </Panel>
  );
}

/** One server: what it is, how to log in, and the power buttons. */
export function VpsDetail() {
  const { id = '' } = useParams();
  const { push } = useToast();
  const state = useAsync<{ server: VpsServerView }>((signal) => get<{ server: VpsServerView }>(`/vps/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const server = state.data?.server ?? null;
  const { query: pageQuery } = useRouterQuery();
  // An editor page returns here with the tab it was opened from.
  const [tab, setTab] = useState<(typeof VPS_TABS)[number]['id']>(VPS_TABS.find((entry) => entry.id === pageQuery.tab)?.id ?? 'overview');
  const [diagnosing, setDiagnosing] = useState(false);

  useEffect(() => {
    if (!server || (server.status !== 'pending' && server.status !== 'provisioning')) return;
    const timer = window.setInterval(state.reload, 5000);
    return () => window.clearInterval(timer);
  }, [server, state.reload]);

  const control = useAction(async (action: 'start' | 'shutdown' | 'reboot' | 'stop') => {
    try {
      await post(`/vps/${encodeURIComponent(id)}/power`, { action });
      push(action === 'start' ? 'Starting.' : action === 'reboot' ? 'Restarting.' : 'Stopping.', 'ok');
      state.reload();
    } catch (failure) {
      push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    }
  });

  if (state.loading && !server) return <LoadingBlock rows={3} label="Loading the server" />;
  if (state.error || !server) return <ErrorState title="The server could not be loaded" message={state.error?.message ?? 'It was not found.'} onRetry={state.reload} />;

  const status = statusOf(server);
  return (
    <div className="grid gap-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-ink3">
        <Link to="/app/vps" className="rounded hover:text-ink focus-visible:outline-2 focus-visible:outline-acc">Servers</Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-ink" aria-current="page">{server.name}</span>
      </nav>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-[min(100%,14rem)] flex-1">
            <p className="truncate text-[18px] font-semibold tracking-[-0.03em] text-ink" title={server.name}>{server.name}</p>
            <p className="truncate font-mono text-[12.5px] text-ink3">{server.plan.name} · {server.image?.label ?? 'Debian 13'} · {server.cpu} vCPU · {memLabel(server.ram)} · {server.disk} GB</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <StatusPill status={status.tone} label={status.label} />
            {server.status === 'active' && (
              <ButtonGroup label="Power" className="w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
                <SoftButton onClick={() => void control.run('start')} disabled={control.pending || server.power === 'running'} title={server.power === 'running' ? 'Already running' : 'Start the server'}>Start</SoftButton>
                <SoftButton onClick={() => void control.run('reboot')} disabled={control.pending || server.power !== 'running'} title="Restart the server">Restart</SoftButton>
                <SoftButton onClick={() => void control.run('shutdown')} disabled={control.pending || server.power !== 'running'} title="Shut the server down cleanly">Shut down</SoftButton>
              </ButtonGroup>
            )}
          </div>
        </div>

        {server.status === 'failed' && (
          <p role="alert" className="mt-4 rounded-2xl bg-bad/12 px-4 py-3 text-[14px] text-bad">
            The server could not be built{server.lastError ? `: ${server.lastError}` : '.'}
          </p>
        )}
        {(server.status === 'pending' || server.status === 'provisioning') && (
          <p role="status" className="mt-4 rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink2">Being built. The page updates by itself.</p>
        )}

        {server.sshCommand && server.status === 'active' && (
          <div className="mt-4 grid gap-1.5">
            <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
              Log in
              <InfoTip text={`The user is debian and it can use sudo. Only the key you gave us opens the server. ${server.dedicatedIp ? 'The address is yours alone.' : 'The address is shared, so the port is the one of this server.'}`} />
            </p>
            <CopyLine value={server.sshCommand} />
          </div>
        )}

        {server.status === 'active' && (
          <div className="mt-3">
            <SoftButton onClick={() => setDiagnosing((open) => !open)} aria-expanded={diagnosing}>{diagnosing ? 'Hide the check' : 'Not reachable?'}</SoftButton>
            {diagnosing && <DiagnosePanel id={server.id} />}
          </div>
        )}
      </Panel>

      {server.status === 'active' && (
        <>
          <nav aria-label="Server sections" className="-mx-1 overflow-x-auto px-1 no-scrollbar">
            <ul className="flex gap-1.5">
              {VPS_TABS.map((entry) => (
                <li key={entry.id} className="shrink-0">
                  <button
                    type="button"
                    aria-current={entry.id === tab ? 'page' : undefined}
                    onClick={() => setTab(entry.id)}
                    className={`min-h-11 rounded-full border px-4 text-[14.5px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc ${
                      entry.id === tab ? 'border-acc/40 bg-acc-bg text-ink' : 'border-line text-ink2 hover:bg-s3 hover:text-ink'
                    }`}
                  >
                    {entry.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {tab === 'overview' && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <ContractCard server={server} onChanged={state.reload} />
                <NetworkCard server={server} />
              </div>
              {server.power === 'running' ? (
                <>
                  <UsagePanel id={server.id} />
                  <GraphsPanel id={server.id} ram={server.ram} />
                </>
              ) : (
                <p className="rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink2">The server is not running, so there is no usage to show. Start it above.</p>
              )}
            </>
          )}
          {tab === 'activity' && <ActivityPanel id={server.id} />}
          {tab === 'console' && (
            <Panel title="Console" description="A serial console, for when SSH does not work: a boot that fails, a firewall that locks you out.">
              {server.power === 'running' ? (
                <Suspense fallback={<LoadingBlock rows={2} label="Opening the console" />}>
                  <VpsConsole path={`/api/vps/${encodeURIComponent(server.id)}/console/stream`} name={server.name} />
                </Suspense>
              ) : (
                <p className="text-[14px] text-ink2">The server is not running. Start it to open the console.</p>
              )}
            </Panel>
          )}
          {tab === 'snapshots' && <SnapshotsPanel id={server.id} />}
          {tab === 'boot' && (
            <>
              <IsoPanel id={server.id} onChanged={state.reload} />
              <ManagePanel server={server} onChanged={state.reload} section="danger" />
            </>
          )}
          {tab === 'settings' && <ManagePanel server={server} onChanged={state.reload} section="settings" />}
        </>
      )}
    </div>
  );
}

/** Bytes in the unit a person reads. */
const rate = (n: number) => (n < 1024 ? `${Math.round(n)} B/s` : n < 1024 * 1024 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB/s` : `${(n / 1024 / 1024).toFixed(1)} MB/s`);

/** What the server uses over time: processor, memory and network, from the hypervisor. */
function GraphsPanel({ id, ram }: { id: string; ram: number }) {
  const [timeframe, setTimeframe] = useState<'hour' | 'day' | 'week' | 'month'>('hour');
  const state = useAsync<{ points: { t: number; cpu: number | null; memory: number | null; netIn: number | null; netOut: number | null }[] }>(
    (signal) => get(`/vps/${encodeURIComponent(id)}/graphs`, { timeframe }, signal),
    [id, timeframe],
  );
  const points = state.data?.points ?? [];
  const memoryTop = ram * 1024 * 1024;
  return (
    <Panel
      title="Graphs"
      description="Read from the hypervisor."
      action={
        <select aria-label="Period" value={timeframe} onChange={(event) => setTimeframe(event.target.value as typeof timeframe)} className="min-h-10 rounded-xl border border-line bg-s2 px-3 text-[13.5px] text-ink">
          <option value="hour">Last hour</option>
          <option value="day">Last day</option>
          <option value="week">Last week</option>
          <option value="month">Last month</option>
        </select>
      }
    >
      {state.loading && !state.data ? (
        <LoadingBlock rows={2} label="Loading the graphs" />
      ) : state.error ? (
        <ErrorState title="The graphs could not be loaded" message={state.error.message} onRetry={state.reload} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-[13px] font-medium text-ink">Processor</p>
            <LineChart label="Processor use in percent" points={points.map((p) => ({ t: p.t, v: p.cpu }))} format={(v) => `${Math.round(v)}%`} max={100} />
          </div>
          <div>
            <p className="mb-1 text-[13px] font-medium text-ink">Memory</p>
            <LineChart label="Memory in use" points={points.map((p) => ({ t: p.t, v: p.memory }))} format={(v) => memLabel(Math.round(v / 1024 / 1024))} max={memoryTop} />
          </div>
          <div>
            <p className="mb-1 text-[13px] font-medium text-ink">Network in</p>
            <LineChart label="Network traffic received" points={points.map((p) => ({ t: p.t, v: p.netIn }))} format={rate} />
          </div>
          <div>
            <p className="mb-1 text-[13px] font-medium text-ink">Network out</p>
            <LineChart label="Network traffic sent" points={points.map((p) => ({ t: p.t, v: p.netOut }))} format={rate} />
          </div>
        </div>
      )}
    </Panel>
  );
}

/** What happened to the server: who did what, and when. */
function ActivityPanel({ id }: { id: string }) {
  const list = useInfiniteList<{ id: string; text: string; byStaff: boolean; createdAt: string }, string>(
    async (cursor, signal) => {
      const page = await get<{ activity: { id: string; text: string; byStaff: boolean; createdAt: string }[]; next: string | null }>(
        `/vps/${encodeURIComponent(id)}/activity`,
        { before: cursor ?? undefined, limit: 30 },
        signal,
      );
      return { items: page.activity, next: page.next };
    },
    [id],
  );
  const reveal = useReveal(list.items.length, list.hasMore, list.loadMore);
  return (
    <Panel title="Activity" description="What was done to this server.">
      {list.loading ? (
        <LoadingBlock rows={3} label="Loading the activity" />
      ) : list.error && list.items.length === 0 ? (
        <ErrorState title="The activity could not be loaded" message={list.error.message} onRetry={list.reload} />
      ) : list.items.length === 0 ? (
        <p className="text-[14px] text-ink2">Nothing yet. Power actions, snapshots and changes appear here.</p>
      ) : (
        <ul className="grid gap-1.5">
          {list.items.slice(0, reveal.shown).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-4 py-3">
              <p className="text-[14px] font-medium text-ink">
                {row.text}
                {row.byStaff && <span className="ml-2 rounded-full bg-s3 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink2">our team</span>}
              </p>
              <span className="whitespace-nowrap font-mono text-[12px] text-ink3">{new Date(row.createdAt).toLocaleString()}</span>
            </li>
          ))}
          {reveal.hidden && (
            <li>
              <FadedLoadMore loadingMore={list.loadingMore} faded onClick={reveal.more} />
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

/** The checks the platform can make when a server does not answer, one by one. */
function DiagnosePanel({ id }: { id: string }) {
  const state = useAsync<{ steps: { id: string; ok: boolean | null; title: string; detail: string }[] }>((signal) => get(`/vps/${encodeURIComponent(id)}/diagnose`, undefined, signal), [id]);
  return (
    <div className="mt-3 grid gap-2 rounded-2xl bg-s2 p-4" aria-live="polite">
      {state.loading ? (
        <LoadingBlock rows={2} label="Checking the server" />
      ) : state.error ? (
        <ErrorState title="The check could not be made" message={state.error.message} onRetry={state.reload} />
      ) : (
        <>
          <ul className="grid gap-2">
            {state.data?.steps.map((step) => (
              <li key={step.id} className="flex gap-3">
                <span aria-hidden="true" className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[12px] font-bold ${step.ok === true ? 'bg-acc-bg text-acc' : step.ok === false ? 'bg-bad/15 text-bad' : 'bg-s3 text-ink3'}`}>
                  {step.ok === true ? '✓' : step.ok === false ? '!' : '?'}
                </span>
                <div>
                  <p className="text-[14px] font-medium text-ink">{step.title}</p>
                  <p className="text-[13px] text-ink2">{step.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <div><SoftButton onClick={state.reload}>Check again</SoftButton></div>
        </>
      )}
    </div>
  );
}

/** The contract: what it costs, when it renews, and the switch for the automatic renewal. */
function ContractCard({ server, onChanged }: { server: VpsServerView; onChanged: () => void }) {
  const { push } = useToast();
  const contract = server.contract ?? null;
  const toggle = useAction(async () => {
    if (!contract) return;
    try {
      await post(`/billing/subscriptions/${encodeURIComponent(contract.subscriptionId)}/${contract.cancelAtPeriodEnd ? 'resume' : 'cancel'}`);
      push(contract.cancelAtPeriodEnd ? 'The server will renew automatically.' : 'The server will end when the paid period ends.', 'ok');
      onChanged();
    } catch (failure) {
      push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    }
  });
  const end = contract?.periodEnd ? new Date(contract.periodEnd) : null;
  const days = end ? Math.ceil((end.getTime() - Date.now()) / 86_400_000) : null;
  return (
    <Panel title="Contract" description={contract ? undefined : 'No subscription is linked to this server.'}>
      {contract && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] text-ink2">
              <Money amount={contract.amount} currency={contract.currency} /> {contract.interval === 'YEARLY' ? 'a year' : 'a month'} ·{' '}
              {contract.cancelAtPeriodEnd ? 'ends' : 'renews'} {end ? end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'on the next period'}
            </p>
            {days !== null && days <= 7 && days >= 0 && (
              <span className="rounded-full bg-warn/15 px-3 py-1 text-[12px] font-bold text-warn">{contract.cancelAtPeriodEnd ? `Ends in ${days} day${days === 1 ? '' : 's'}` : `Renews in ${days} day${days === 1 ? '' : 's'}`}</span>
            )}
          </div>
          {contract.status === 'past_due' && <p role="alert" className="rounded-2xl bg-bad/12 px-3.5 py-2.5 text-[13.5px] text-bad">The last payment did not go through. Update the payment method in Billing to keep the server.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <SoftButton onClick={() => void toggle.run()} disabled={toggle.pending}>
              {toggle.pending ? 'Working…' : contract.cancelAtPeriodEnd ? 'Turn automatic renewal on' : 'Turn automatic renewal off'}
            </SoftButton>
            <ButtonLink to="/app/billing" variant="soft">Billing</ButtonLink>
          </div>
          <p className="text-[12.5px] text-ink3">
            {contract.cancelAtPeriodEnd
              ? 'The server keeps running until the end of the paid period, then it is stopped. Turn the renewal back on to keep it.'
              : 'The subscription renews by itself at the end of each period.'}
          </p>
        </div>
      )}
    </Panel>
  );
}

/** The address of the server, and the one thing about the network that needs a person: port 25. */
function NetworkCard({ server }: { server: VpsServerView }) {
  const { push } = useToast();
  const request = useAction(async () => {
    try {
      await post('/tickets', {
        subject: `Unblock outgoing mail (port 25) for ${server.name}`,
        category: 'technical',
        priority: 'normal',
        body: `Please unblock outgoing connections on port 25 for the server ${server.name} (${server.publicIp ?? 'no address'}). I will use it to send mail from my own domain, with SPF, DKIM and a valid reverse record, and I will not send unsolicited mail.`,
      });
      push('The request was sent to support as a ticket.', 'ok');
    } catch (failure) {
      push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    }
  });
  return (
    <Panel title="Network">
      <dl className="grid gap-2">
        <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5"><dt className="text-[12.5px] text-ink3">Address</dt><dd className="font-mono text-[13px] font-semibold text-ink">{server.publicIp ?? '—'}</dd></div>
        <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5"><dt className="text-[12.5px] text-ink3">SSH port</dt><dd className="font-mono text-[13px] font-semibold text-ink">{server.sshPort ?? '—'}</dd></div>
        <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5"><dt className="text-[12.5px] text-ink3">Address type</dt><dd className="text-[13px] font-semibold text-ink">{server.dedicatedIp ? 'Dedicated IPv4' : 'Shared IPv4'}</dd></div>
        <div className="flex justify-between gap-3 pb-1.5"><dt className="text-[12.5px] text-ink3">IPv6</dt><dd className="text-[13px] text-ink3">Not available</dd></div>
      </dl>
      <div className="mt-3 grid gap-2 rounded-2xl bg-s2 p-3.5">
        <p className="text-[13.5px] font-medium text-ink">Outgoing mail (port 25)</p>
        <p className="text-[12.5px] text-ink2">To prevent spam, outgoing connections on port 25 are blocked on every server. If you run a mail server, ask support to unblock it.</p>
        <div><SoftButton onClick={() => void request.run()} disabled={request.pending}>{request.pending ? 'Sending…' : 'Request unlock'}</SoftButton></div>
      </div>
    </Panel>
  );
}

const VPS_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'console', label: 'Console' },
  { id: 'snapshots', label: 'Snapshots' },
  { id: 'boot', label: 'Image and reinstall' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' },
] as const;

/** A readable name for an image file: AlmaLinux-9.8-x86_64-minimal.iso becomes AlmaLinux 9.8 minimal. */
const isoName = (file: string): string => file.replace(/\.iso$/i, '').replace(/[-_]x86_64|[-_]amd64/g, '').replace(/[-_]/g, ' ');

const bytesLabel = (n: number): string => {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.round((n / 1024 ** 3) * 10) / 10} GB`;
};

const uptimeLabel = (seconds: number): string => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d} d ${h} h` : h > 0 ? `${h} h ${m} min` : `${m} min`;
};

/** What the server uses right now. It asks the hypervisor every ten seconds and shows nothing it did not hear. */
function UsagePanel({ id }: { id: string }) {
  const state = useAsync<{ usage: VpsUsageView }>((signal) => get<{ usage: VpsUsageView }>(`/vps/${encodeURIComponent(id)}/usage`, undefined, signal), [id]);
  useEffect(() => {
    const timer = window.setInterval(state.reload, 10_000);
    return () => window.clearInterval(timer);
  }, [state.reload]);
  const usage = state.data?.usage ?? null;
  return (
    <Panel title="Usage" description="Read from the hypervisor every ten seconds.">
      {!usage ? (
        state.error ? (
          <ErrorState title="The usage could not be read" message={state.error.message} onRetry={state.reload} />
        ) : (
          <LoadingBlock rows={1} label="Reading the usage" />
        )
      ) : (
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <Spec label="Processor" value={`${usage.cpuPercent}% of ${usage.cpus} vCPU`} />
          <Spec label="Memory" value={`${bytesLabel(usage.memoryUsed)} of ${bytesLabel(usage.memoryTotal)}`} />
          <Spec label="Uptime" value={uptimeLabel(usage.uptimeSeconds)} />
          <Spec label="Network in" value={bytesLabel(usage.networkIn)} />
          <Spec label="Network out" value={bytesLabel(usage.networkOut)} />
          <Spec label="Disk written" value={bytesLabel(usage.diskWritten)} />
        </dl>
      )}
    </Panel>
  );
}

interface SnapshotsAnswer { max: number; snapshots: { name: string; description: string; createdAt: string | null }[] }

/** Snapshots of the disk: a point to go back to before a risky change. Taking and restoring one are pages of their own. */
function SnapshotsPanel({ id }: { id: string }) {
  const { push } = useToast();
  const base = `/vps/${encodeURIComponent(id)}/snapshots`;
  const state = useAsync<SnapshotsAnswer>((signal) => get<SnapshotsAnswer>(base, undefined, signal), [id]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const remove = useAction(async (name: string) => {
    try {
      await del(`${base}/${encodeURIComponent(name)}`);
      push('The snapshot was deleted.', 'ok');
      state.reload();
    } catch (failure) {
      push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setDeleting(null);
    }
  });
  const data = state.data;
  return (
    <Panel
      title="Snapshots"
      description={data ? `A server keeps ${data.max} snapshots. Restoring one replaces the disk as it is now.` : 'Points of the disk you can go back to.'}
      action={data && data.snapshots.length < data.max ? <ButtonLink to={`/app/vps/${encodeURIComponent(id)}/snapshots/new`} variant="soft">Take a snapshot</ButtonLink> : undefined}
    >
      {state.error ? (
        <ErrorState title="The snapshots could not be read" message={state.error.message} onRetry={state.reload} />
      ) : !data ? (
        <LoadingBlock rows={1} label="Reading the snapshots" />
      ) : data.snapshots.length === 0 ? (
        <p className="text-[14px] text-ink2">No snapshot yet.</p>
      ) : (
        <ul className="grid">
          {data.snapshots.map((snapshot) => (
            <li key={snapshot.name} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="font-mono text-[14px] font-semibold text-ink">{snapshot.name}</p>
                <p className="text-[12.5px] text-ink3">{snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : ''}{snapshot.description ? ` · ${snapshot.description}` : ''}</p>
              </div>
              <ButtonGroup label={`Actions for ${snapshot.name}`}>
                <ButtonLink to={`/app/vps/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snapshot.name)}/restore`} variant="soft" title="Restore this snapshot. The disk goes back to it.">Restore</ButtonLink>
                <SoftButton onClick={() => setDeleting(snapshot.name)} disabled={remove.pending} title="Delete this snapshot. It cannot be restored afterwards.">Delete</SoftButton>
              </ButtonGroup>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this snapshot?"
        description="The point of the disk is removed and you can no longer go back to it."
        confirmLabel="Delete"
        busy={remove.pending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) void remove.run(deleting); }}
      />
    </Panel>
  );
}

interface IsoAnswer { isos: { file: string; size: number }[]; mounted: string | null }

/** Boot the server from an installation image. Mounting one is a page of its own; ejecting it is one click. */
function IsoPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { push } = useToast();
  const path = `/vps/${encodeURIComponent(id)}/iso`;
  const state = useAsync<IsoAnswer>((signal) => get<IsoAnswer>(path, undefined, signal), [id]);
  const eject = useAction(async () => {
    try {
      await del(path);
      push('The image was ejected. The next boot is from the disk.', 'ok');
      state.reload();
      onChanged();
    } catch (failure) {
      push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    }
  });
  const data = state.data;
  return (
    <Panel
      title="Boot from an image"
      description="Mount an installation image, restart the server and install from it. The display is a graphical one while an image is mounted."
      action={data && data.isos.length > 0 ? <ButtonLink to={`/app/vps/${encodeURIComponent(id)}/iso`} variant="soft">Mount an image</ButtonLink> : undefined}
    >
      {state.error ? (
        <ErrorState title="The images could not be read" message={state.error.message} onRetry={state.reload} />
      ) : !data ? (
        <LoadingBlock rows={1} label="Reading the images" />
      ) : data.mounted ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[14px] text-ink">Mounted: <span className="font-mono">{data.mounted}</span>. Restart the server to boot from it.</p>
          <SoftButton onClick={() => void eject.run()} disabled={eject.pending} title="Eject the image. The next boot is from the disk.">Eject</SoftButton>
        </div>
      ) : (
        <p className="text-[14px] text-ink2">{data.isos.length === 0 ? 'No installation image is offered at the moment.' : 'No image is mounted. The server boots from its disk.'}</p>
      )}
    </Panel>
  );
}

/** The things a customer does to a server that are not power: each change is a page of its own. */
function ManagePanel({ server, section }: { server: VpsServerView; onChanged?: () => void; section: 'settings' | 'danger' }) {
  const base = `/app/vps/${encodeURIComponent(server.id)}`;
  if (section === 'settings') {
    return (
      <Panel title="Settings" description="The name is also the hostname of the server.">
        <ul className="grid">
          <li className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 first:border-t-0 first:pt-0">
            <div className="min-w-0">
              <p className="text-[12.5px] text-ink3">Name</p>
              <p className="break-all text-[14.5px] font-semibold text-ink">{server.name}</p>
            </div>
            <ButtonLink to={`${base}/settings/edit`} variant="soft">Rename</ButtonLink>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 last:pb-0">
            <div className="min-w-0">
              <p className="text-[12.5px] text-ink3">SSH public key</p>
              <p className="text-[13.5px] text-ink2">Replaces the key that opens the server. The server restarts once to read it.</p>
            </div>
            <ButtonLink to={`${base}/ssh-key`} variant="soft">Change the key</ButtonLink>
          </li>
        </ul>
      </Panel>
    );
  }
  return (
    <Panel title="Reinstall and cancel" description="These two cannot be undone.">
      <ul className="grid">
        <li className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 first:border-t-0 first:pt-0">
          <p className="min-w-0 flex-1 text-[14px] text-ink2">
            Reinstalling builds the server again from a clean image of the system you choose. <strong className="text-ink">Everything on its disk is deleted.</strong>
          </p>
          <ButtonLink to={`${base}/reinstall`} variant="danger" title="Review and reinstall the server. The disk is erased.">Reinstall</ButtonLink>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 last:pb-0">
          <p className="min-w-0 flex-1 text-[14px] text-ink2">Stop paying for this server</p>
          <ButtonLink to="/app/billing" variant="soft" title="Cancel its subscription in Billing. The server keeps running until the end of the paid period.">Cancel in Billing</ButtonLink>
        </li>
      </ul>
    </Panel>
  );
}

/** The query of the address, as the router gives it. */
function useRouterQuery() {
  // Read here so the checkout does not depend on the shape of the router in more than one place.
  return { query: Object.fromEntries(new URLSearchParams(typeof location === 'undefined' ? '' : location.search)) as Record<string, string | undefined> };
}
