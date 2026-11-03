/**
 * The page of one email domain.
 *
 * The domain has a page of its own, so the customer opens it, works on it
 * and goes back, with the browser and with the link at the top. Nothing of
 * the domain is expanded under the list of the domains any more.
 *
 * The id of the domain comes from the route: the page is wired at
 * `/app/mail/domains/:id` and reads the parameter of the router.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  deleteMailAlias,
  deleteMailDomain,
  deleteMailbox,
  get,
  getMailDns,
  listMailAliases,
  listMailboxes,
  post,
  type DnsCheckResult,
  type DnsRecordView,
  type MailAliasView,
  type MailDomainView,
  type MailServiceView,
  type MailboxView,
} from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { memLabel } from '../../lib/pricing';
import { Link, useParams, useRouter } from '../../router';
import { ButtonLink, ErrorState, LoadingBlock, Panel, Segmented, StatusPill, useToast } from '../../ui-app';
import { Icon } from '../../icons';
import { AliasTable } from './AliasTable';
import { MailDeleteDialog } from './MailDeleteDialog';
import { MailDnsPanel } from './MailDnsPanel';
import { MailStat } from './MailStat';
import { MailboxTable } from './MailboxTable';
import {
  MAIL_OWNERSHIP_LABELS,
  MAIL_STATUS_LABELS,
  MAIL_STATUS_TONES,
  buildDomainRow,
  type MailDeleteRequest,
} from './shared';

/** The sections of the page of a domain. */
const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'mailboxes', label: 'Mailboxes' },
  { value: 'aliases', label: 'Aliases' },
  { value: 'dns', label: 'DNS & Verification' },
  { value: 'settings', label: 'Settings' },
] as const;

type Tab = (typeof TABS)[number]['value'];

export function MailDomainPage() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [pendingDelete, setPendingDelete] = useState<MailDeleteRequest | null>(null);
  const [proofAnswer, setProofAnswer] = useState<{ verified: boolean; message: string } | null>(null);

  // Every answer carries the domain it was asked for, so the answer of the
  // domain before is never shown for the domain of the customer.
  const domainState = useAsync(
    async (signal: AbortSignal) => ({ id, domain: (await get<{ domain: MailDomainView }>(`/mail/domains/${id}`, undefined, signal)).domain }),
    [id],
  );
  const mailboxesState = useAsync(
    async (signal: AbortSignal) => ({ id, mailboxes: (await listMailboxes(id, signal)).mailboxes }),
    [id],
  );
  const aliasesState = useAsync(
    async (signal: AbortSignal) => ({ id, aliases: (await listMailAliases(id, signal)).aliases }),
    [id],
  );
  const dnsState = useAsync(
    async (signal: AbortSignal) => ({ id, dns: await getMailDns(id, signal) }),
    [id],
  );
  const servicesState = useAsync<{ services: MailServiceView[] }>(
    (signal) => get<{ services: MailServiceView[] }>('/mail/services', undefined, signal),
    [],
  );

  const domain = domainState.data?.id === id ? domainState.data.domain : null;
  const mailboxes: MailboxView[] = mailboxesState.data?.id === id ? mailboxesState.data.mailboxes : [];
  const aliases: MailAliasView[] = aliasesState.data?.id === id ? aliasesState.data.aliases : [];
  const dns = dnsState.data?.id === id ? dnsState.data.dns : null;
  const records: DnsRecordView[] = dns?.records ?? [];
  const verified = dns?.verified ?? false;
  const results: DnsCheckResult[] | undefined = dns?.results;

  // The subscription the domain belongs to. It holds the proof of ownership,
  // which the list of the customer does not carry.
  const service = useMemo(() => {
    for (const entry of servicesState.data?.services ?? []) {
      if (entry.domains.some((item) => item.id === id)) return entry;
    }
    return null;
  }, [servicesState.data, id]);
  const serviceDomain = useMemo(
    () => service?.domains.find((item) => item.id === id) ?? null,
    [service, id],
  );

  // A new domain starts without the state of the domain before.
  useEffect(() => {
    setTab('overview');
    setProofAnswer(null);
    setPendingDelete(null);
  }, [id]);

  const remove = useAction(async (request: MailDeleteRequest) => {
    try {
      if (request.kind === 'domain') {
        await deleteMailDomain(request.domain.id);
      } else if (request.kind === 'mailbox') {
        await deleteMailbox(request.domain.id, request.mailbox.id);
      } else {
        await deleteMailAlias(request.domain.id, request.alias.id);
      }
    } catch (err) {
      // The dialog closes, so the failure is readable instead of hidden
      // behind it.
      setPendingDelete(null);
      throw err;
    }
    setPendingDelete(null);
    if (request.kind === 'domain') {
      push('The email domain and everything it held are deleted.');
      // The domain is gone: the page of it has nothing left to show.
      navigate('/app/mail');
      return 'domain';
    }
    if (request.kind === 'mailbox') {
      mailboxesState.reload();
      domainState.reload();
      push('The mailbox is deleted.');
      return 'mailbox';
    }
    aliasesState.reload();
    domainState.reload();
    push('The alias is deleted.');
    return 'alias';
  });

  const checkProof = useAction(async () => {
    const answer = await post<{ verified: boolean; message: string }>(`/mail/domains/${encodeURIComponent(id)}/verify`);
    setProofAnswer({ verified: answer.verified, message: answer.message });
    servicesState.reload();
    return answer;
  });

  const loading = domainState.loading || !domain;
  const failure = domainState.error ?? null;

  if (!id) {
    return (
      <div className="grid gap-4">
        <ErrorState
          title="This domain was not found"
          message="The address of the page does not carry the id of a domain."
        />
        <Link to="/app/mail" className="px-1 text-[14px] font-medium text-acc hover:underline">
          Back to Email
        </Link>
      </div>
    );
  }

  if (failure) {
    return (
      <div className="grid gap-4">
        <nav aria-label="Breadcrumb">
          <Link
            to="/app/mail"
            className="inline-flex items-center gap-2 text-[13.5px] font-medium text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            <Icon name="arrow" size={13} className="rotate-180" />
            Back to Email
          </Link>
        </nav>
        <ErrorState
          title="This domain is not available"
          message={failure.message}
          onRetry={domainState.reload}
        />
      </div>
    );
  }

  if (loading || !domain) {
    return (
      <div className="grid gap-4">
        <nav aria-label="Breadcrumb">
          <Link
            to="/app/mail"
            className="inline-flex items-center gap-2 text-[13.5px] font-medium text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            <Icon name="arrow" size={13} className="rotate-180" />
            Back to Email
          </Link>
        </nav>
        <LoadingBlock rows={4} label="Loading the domain" />
      </div>
    );
  }

  const row = buildDomainRow(serviceDomain, domain);
  const alerts: string[] = [];
  if (domain.lastError) alerts.push(domain.lastError);
  if (serviceDomain?.lastError && serviceDomain.lastError !== domain.lastError) alerts.push(serviceDomain.lastError);
  if (!verified && records.length > 0) {
    alerts.push('The records of DNS are not all in place yet, so the mail of this domain is not delivered.');
  }
  if (service && service.status !== 'ACTIVE') {
    alerts.push(`The subscription of this domain is ${service.status.toLowerCase()}.`);
  }

  return (
    <div className="grid gap-4">
      <nav aria-label="Breadcrumb">
        <Link
          to="/app/mail"
          className="inline-flex items-center gap-2 text-[13.5px] font-medium text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        >
          <Icon name="arrow" size={13} className="rotate-180" />
          Back to Email
        </Link>
      </nav>

      <header className="grid gap-2">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 break-all text-[20px] font-semibold tracking-[-0.035em] text-ink">{domain.name}</h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <StatusPill status={MAIL_STATUS_TONES[row.status]} label={MAIL_STATUS_LABELS[row.status]} />
            {serviceDomain && (
              <>
                <span aria-hidden="true" className="text-[13px] text-ink3">
                  ·
                </span>
                <span className="text-[13px] text-ink3">{MAIL_OWNERSHIP_LABELS[serviceDomain.ownershipStatus]}</span>
              </>
            )}
          </div>
        </div>
      </header>

      <Segmented
        options={TABS.map((entry) => ({ value: entry.value, label: entry.label }))}
        value={tab}
        onChange={(value) => setTab(value as Tab)}
        ariaLabel="The sections of the domain"
      />

      {tab === 'overview' && (
        <div className="grid gap-4">
          <Panel
            title="What this domain holds"
            description={
              service
                ? `The domain of the subscription ${service.plan.name}, which is ${service.status.toLowerCase()}.`
                : 'The domain carries mail on its own, without a plan of hosted mail.'
            }
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <MailStat
                label="Mailboxes"
                value={`${domain.mailboxes} / ${domain.maxMailboxes}`}
                used={domain.mailboxes}
                limit={domain.maxMailboxes}
              />
              <MailStat
                label="Aliases"
                value={`${domain.aliases} / ${domain.maxAliases}`}
                used={domain.aliases}
                limit={domain.maxAliases}
              />
              <MailStat
                label="Storage"
                value={`${memLabel(domain.usedMb)} / ${memLabel(domain.quotaMb)}`}
                used={domain.usedMb}
                limit={domain.quotaMb}
              />
              <MailStat
                label="DNS"
                value={verified ? 'Verified' : records.length ? 'Not verified' : 'Unknown'}
                hint={verified ? 'The server has seen the records.' : 'The records are not all in place.'}
              />
            </div>
          </Panel>

          {alerts.length > 0 && (
            <Panel title="What needs your attention">
              <ul className="grid gap-2">
                {alerts.map((alert) => (
                  <li
                    key={alert}
                    role="status"
                    className="rounded-2xl bg-warn/12 px-3.5 py-3 text-[13.5px] leading-relaxed text-ink2"
                  >
                    {alert}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="The domain" description="What the platform knows about this domain.">
            <dl className="grid gap-2 text-[13.5px]">
              <div className="flex flex-wrap gap-2">
                <dt className="text-ink3">Name</dt>
                <dd className="font-mono text-ink">{domain.name}</dd>
              </div>
              <div className="flex flex-wrap gap-2">
                <dt className="text-ink3">Created</dt>
                <dd className="text-ink2">{new Date(domain.createdAt).toLocaleDateString('en-GB')}</dd>
              </div>
            </dl>
          </Panel>
        </div>
      )}

      {tab === 'mailboxes' && (
        <Panel title="Mailboxes" description="The addresses of this domain that hold mail.">
          <MailboxTable
            domain={domain}
            mailboxes={mailboxes}
            createTo={`/app/mail/domains/${encodeURIComponent(domain.id)}/mailboxes/new`}
            onDelete={(mailbox) => setPendingDelete({ kind: 'mailbox', domain, mailbox })}
            busy={remove.pending}
          />
        </Panel>
      )}

      {tab === 'aliases' && (
        <Panel title="Aliases" description="The other addresses of this domain, and the mailbox each of them reaches.">
          <AliasTable
            domain={domain}
            aliases={aliases}
            createTo={`/app/mail/domains/${encodeURIComponent(domain.id)}/aliases/new`}
            onDelete={(alias) => setPendingDelete({ kind: 'alias', domain, alias })}
            busy={remove.pending}
          />
        </Panel>
      )}

      {tab === 'dns' && (
        <Panel
          title="DNS & Verification"
          description="The records the platform asks for, and what the world answered when the server looked."
        >
          {dnsState.loading && !dns ? (
            <LoadingBlock rows={2} label="Loading the records" />
          ) : (
            <MailDnsPanel
              records={records}
              verified={verified}
              results={results}
              onRecheck={dnsState.reload}
              checking={dnsState.loading}
              proof={
                serviceDomain
                  ? {
                      status: serviceDomain.ownershipStatus,
                      host: serviceDomain.verificationHost,
                      token: serviceDomain.verificationToken,
                      answer: proofAnswer ?? undefined,
                      busy: checkProof.pending,
                      onCheck: () => void checkProof.run(),
                    }
                  : undefined
              }
            />
          )}
        </Panel>
      )}

      {tab === 'settings' && (
        <div className="grid gap-4">
          <Panel title="The domain" description="What the platform knows about this domain.">
            <dl className="grid gap-2 text-[13.5px]">
              <div className="flex flex-wrap gap-2">
                <dt className="text-ink3">Name</dt>
                <dd className="font-mono text-ink">{domain.name}</dd>
              </div>
              <div className="flex flex-wrap gap-2">
                <dt className="text-ink3">Created</dt>
                <dd className="text-ink2">{new Date(domain.createdAt).toLocaleDateString('en-GB')}</dd>
              </div>
              <div className="flex flex-wrap gap-2">
                <dt className="text-ink3">Space</dt>
                <dd className="font-mono text-ink2">
                  {memLabel(domain.usedMb)} of {memLabel(domain.quotaMb)}
                </dd>
              </div>
              <div className="flex flex-wrap gap-2">
                <dt className="text-ink3">Mailboxes</dt>
                <dd className="font-mono text-ink2">
                  {domain.mailboxes} of {domain.maxMailboxes}
                </dd>
              </div>
              <div className="flex flex-wrap gap-2">
                <dt className="text-ink3">Aliases</dt>
                <dd className="font-mono text-ink2">
                  {domain.aliases} of {domain.maxAliases}
                </dd>
              </div>
              {domain.webmailUrl && (
                <div className="flex flex-wrap gap-2">
                  <dt className="text-ink3">Webmail</dt>
                  <dd className="min-w-0 break-all text-ink2">{domain.webmailUrl}</dd>
                </div>
              )}
            </dl>
          </Panel>

          <Panel
            title="The subscription of this domain"
            description="The plan the domain belongs to. The plan is changed from the page of the email."
          >
            {service ? (
              <dl className="grid gap-2 text-[13.5px]">
                <div className="flex flex-wrap gap-2">
                  <dt className="text-ink3">Plan</dt>
                  <dd className="text-ink">{service.plan.name}</dd>
                </div>
                <div className="flex flex-wrap gap-2">
                  <dt className="text-ink3">State</dt>
                  <dd className="text-ink2">{service.status.toLowerCase()}</dd>
                </div>
                <div className="flex flex-wrap gap-2">
                  <dt className="text-ink3">Domains</dt>
                  <dd className="font-mono text-ink2">
                    {service.usage.domains} of {service.limits.maxDomains}
                  </dd>
                </div>
                <div>
                  <Link to="/app/mail" className="text-[13.5px] font-medium text-acc hover:underline">
                    Change the plan of the subscription
                  </Link>
                </div>
              </dl>
            ) : (
              <p className="text-[13.5px] text-ink2">
                This domain does not belong to a plan of hosted mail. It carries mail on its own.
              </p>
            )}
          </Panel>

          <Panel
            title="Delete this domain"
            description="The actions of this page are the ones that are rarely used and the ones that cannot be undone."
          >
            <p className="text-[13.5px] leading-relaxed text-ink2">
              Deleting {domain.name} stops the mail of the domain at once. Its {domain.mailboxes} mailboxes and its{' '}
              {domain.aliases} aliases are deleted with it, and the mail they hold goes with them. This cannot be
              undone.
            </p>
            <div className="mt-3">
              <ButtonLink to={`/app/mail/domains/${encodeURIComponent(domain.id)}/settings`} variant="danger">Review domain deletion</ButtonLink>
            </div>
          </Panel>
        </div>
      )}

      <MailDeleteDialog
        request={pendingDelete}
        busy={remove.pending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void remove.run(pendingDelete);
        }}
      />

      {remove.error && (
        <p role="alert" className="text-[13.5px] font-medium text-bad">
          {remove.error}
        </p>
      )}
    </div>
  );
}

export default MailDomainPage;
