/**
 * Virtual private servers: the storefront, the order, the list and the page of a server.
 *
 * The storefront is public. Every number on it comes from GET /vps/plans, so the page
 * never writes a price or a size of its own.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, post, type Order, type VpsPlanView, type VpsServerView } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { memLabel } from '../lib/pricing';
import { Link, useParams } from '../router';
import { useSession } from '../session';
import { Icon } from '../icons';
import { Eyebrow, Footer, Nav, Wrap } from '../site/ui';
import {
  ButtonLink,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Money,
  Panel,
  PrimaryButton,
  SoftButton,
  StatusPill,
  TextArea,
  TextInput,
  useToast,
} from '../ui-app';

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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!slug && plans[0]) setSlug(plans[0].slug);
  }, [plans, slug]);

  const plan = plans.find((entry) => entry.slug === slug) ?? null;
  const total = plan?.price ? plan.price.amount + (dedicated && plan.dedicatedIp ? plan.dedicatedIp.amount : 0) : null;

  const order = useAction(async () => {
    if (!plan) return;
    setError(null);
    try {
      const created = await post<{ order: Order }>('/orders', {
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
                      {entry.price ? <Money amount={entry.price.amount} currency={entry.price.currency} /> : '—'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <TextInput
              label="Name of the server"
              hint="Lowercase letters, numbers and dashes. It is also the hostname. Leave it empty for a name we choose."
              value={name}
              onChange={(event) => setName(event.target.value.toLowerCase())}
              placeholder="api-prod"
              autoComplete="off"
              spellCheck={false}
            />

            <TextArea
              label="Public SSH key"
              hint="The line of the .pub file. To make one, run ssh-keygen -t ed25519, then show ~/.ssh/id_ed25519.pub. Never paste the private key."
              value={key}
              onChange={(event) => setKey(event.target.value)}
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
                  {plan?.dedicatedIp ? <> · <Money amount={plan.dedicatedIp.amount} currency="EUR" /> / month</> : null}
                </span>
                <span className="block text-[13px] text-ink2">
                  {plan?.dedicatedIp
                    ? 'An address only your server uses, with every port open to it and SSH on port 22.'
                    : 'No dedicated address is free right now. The server gets the shared address, with SSH on a port of its own.'}
                </span>
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] font-medium text-bad">
                {error}
              </p>
            )}
            {notice && <p className="rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink2">{notice}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-[14px] text-ink2">
                Total{' '}
                <span className="text-[20px] font-semibold text-ink">{total !== null ? <Money amount={total} currency="EUR" /> : '—'}</span> a month
              </p>
              <PrimaryButton onClick={() => void order.run()} disabled={order.pending || !plan || !key.trim()}>
                {order.pending ? 'Opening the payment…' : 'Continue to payment'}
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

/** The servers of the customer. */
export function VpsList() {
  const state = useAsync<{ servers: VpsServerView[] }>((signal) => get<{ servers: VpsServerView[] }>('/vps', undefined, signal), []);
  const servers = state.data?.servers ?? [];
  // A server that is being built is looked at again until it is done.
  useEffect(() => {
    if (!servers.some((server) => server.status === 'pending' || server.status === 'provisioning')) return;
    const timer = window.setInterval(state.reload, 6000);
    return () => window.clearInterval(timer);
  }, [servers, state.reload]);

  return (
    <Panel title="Your servers" description="Virtual private servers with root access.">
      {state.loading && !state.data ? (
        <LoadingBlock rows={2} label="Loading your servers" />
      ) : state.error ? (
        <ErrorState title="Your servers could not be loaded" message={state.error.message} onRetry={state.reload} />
      ) : servers.length === 0 ? (
        <EmptyState title="No server yet." description="A virtual server with root access, ready in a few minutes." action={<ButtonLink to={VPS_NEW_PATH}>Order a server</ButtonLink>} />
      ) : (
        <ul className="grid gap-3">
          {servers.map((server) => {
            const status = statusOf(server);
            return (
              <li key={server.id} className="rounded-2xl bg-s2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/app/vps/${server.id}`} className="text-[16px] font-semibold text-ink underline-offset-4 hover:underline">
                      {server.name}
                    </Link>
                    <p className="mt-0.5 font-mono text-[12.5px] text-ink3">
                      {server.plan.name} · {server.cpu} vCPU · {memLabel(server.ram)} · {server.disk} GB
                    </p>
                  </div>
                  <StatusPill status={status.tone} label={status.label} />
                </div>
                {server.sshCommand && <div className="mt-3"><CopyLine value={server.sshCommand} /></div>}
                {server.lastError && <p className="mt-2 text-[13px] text-bad">{server.lastError}</p>}
              </li>
            );
          })}
        </ul>
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
      <Panel title={server.name} description={`${server.plan.name} · Debian 13`} action={<StatusPill status={status.tone} label={status.label} />}>
        <dl className="grid gap-2 sm:grid-cols-3">
          <Spec label="vCPU" value={server.cpu} />
          <Spec label="Memory" value={memLabel(server.ram)} />
          <Spec label="Disk" value={`${server.disk} GB`} />
        </dl>

        {server.status === 'failed' && (
          <p role="alert" className="mt-4 rounded-2xl bg-bad/12 px-4 py-3 text-[14px] text-bad">
            The server could not be built{server.lastError ? `: ${server.lastError}` : '.'} Write to support and we will fix it.
          </p>
        )}
        {(server.status === 'pending' || server.status === 'provisioning') && (
          <p className="mt-4 rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink2">Your server is being built. This takes a few minutes, and the page updates by itself.</p>
        )}

        {server.sshCommand && server.status === 'active' && (
          <div className="mt-4 grid gap-2">
            <p className="text-[13.5px] font-medium text-ink">Log in</p>
            <CopyLine value={server.sshCommand} />
            <p className="text-[12.5px] text-ink3">
              The user is <span className="font-mono">debian</span> and it can use sudo. Only the key you gave us opens the server.
              {server.dedicatedIp ? ' The address is yours alone.' : ' The address is shared, so the port is the one of this server.'}
            </p>
          </div>
        )}

        {server.status === 'active' && (
          <div className="mt-4 flex flex-wrap gap-2">
            <SoftButton onClick={() => void control.run('start')} disabled={control.pending || server.power === 'running'}>Start</SoftButton>
            <SoftButton onClick={() => void control.run('reboot')} disabled={control.pending || server.power !== 'running'}>Restart</SoftButton>
            <SoftButton onClick={() => void control.run('shutdown')} disabled={control.pending || server.power !== 'running'}>Shut down</SoftButton>
          </div>
        )}
      </Panel>
    </div>
  );
}

/** The query of the address, as the router gives it. */
function useRouterQuery() {
  // Read here so the checkout does not depend on the shape of the router in more than one place.
  return { query: Object.fromEntries(new URLSearchParams(typeof location === 'undefined' ? '' : location.search)) as Record<string, string | undefined> };
}
