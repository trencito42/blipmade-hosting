import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createMailAlias,
  createMailDomain,
  createMailbox,
  deleteMailAlias,
  deleteMailbox,
  deleteMailDomain,
  get,
  getMailDns,
  getMailDomain,
  listMailAliases,
  listMailDomains,
  listMailboxes,
  post,
  type DnsCheckResult,
  type DnsRecordView,
  type MailAliasView,
  type MailDomainView,
  type MailOwnershipStatus,
  type MailPlanView,
  type MailServiceDnsView,
  type MailServiceDomainView,
  type MailServiceStatus,
  type MailServiceView,
  type MailboxView,
  type Order,
} from '../lib/api';
import { Icon } from '../icons';
import { useAction, useAsync } from '../lib/useAsync';
import { categoryLabel, formatPrice, memLabel, periodSuffix } from '../lib/pricing';
import {
  ButtonLink,
  CardList,
  ConfirmDialog,
  DangerButton,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Panel,
  InputWithButton,
  PrimaryButton,
  Select,
  SoftButton,
  StatTile,
  StatusPill,
  TextInput,
  useToast,
} from '../ui-app';

/**
 * Email hosting.
 *
 * A domain of the customer holds mailboxes, aliases and the DNS records that
 * make the mail arrive. The server owns the truth: a domain is only shown as
 * active when the server says so, and the records are only shown as published
 * when the server has seen them.
 */

/** The state of a domain, written the way the pill writes it. */
const MAIL_STATUS_LABELS: Record<MailDomainView['status'], string> = {
  pending: 'Pending',
  active: 'Active',
  error: 'Error',
  suspended: 'Suspended',
};

/** Maps the state of a domain onto a colour the pill knows. */
const MAIL_STATUS_TONES: Record<MailDomainView['status'], string> = {
  pending: 'pending',
  active: 'active',
  error: 'error',
  suspended: 'suspended',
};

/** The state of a mailbox, written the way the pill writes it. */
const MAILBOX_STATUS_LABELS: Record<MailboxView['status'], string> = {
  active: 'Active',
  disabled: 'Disabled',
};

/** Maps the state of a mailbox onto a colour the pill knows. */
const MAILBOX_STATUS_TONES: Record<MailboxView['status'], string> = {
  active: 'active',
  disabled: 'neutral',
};

/** The name of a mailbox, before the @. */
const LOCAL_PART = /^[a-z0-9._%+-]+$/;

// The check of the name of a domain lives in a module of its own, so the
// public storefront does not carry the whole dashboard with it. It is
// re-exported here because the dashboard and the checkout of a server both
// use it.
import { validateMailDomainName } from '../lib/mail-domain';
export { validateMailDomainName };

/**
 * Checks the name of a mailbox, the part before the @.
 */
export function validateMailLocalPart(part: string): string | null {
  const value = part.trim().toLowerCase();
  if (!value) return 'Enter the name before the @.';
  if (/\s/.test(value)) return 'The name of a mailbox cannot contain spaces.';
  if (!LOCAL_PART.test(value)) return 'Use letters, digits and the marks . _ % + - only.';
  if (value.startsWith('.') || value.endsWith('.') || value.includes('..')) {
    return 'The name cannot start or end with a dot, nor hold two dots in a row.';
  }
  return null;
}

/**
 * Checks the alias the customer typed.
 *
 * An alias belongs to the domain of the page, so an alias of another domain
 * is refused here instead of being sent to the server.
 */
export function validateMailAlias(input: string, domainName: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value) return 'Enter the address that should receive the mail.';
  if (/\s/.test(value)) return 'An address cannot contain spaces.';
  const [local, domain] = value.split('@');
  if (value.includes('@') && domain !== domainName.toLowerCase()) {
    return `The alias must be an address of ${domainName}.`;
  }
  return validateMailLocalPart(local ?? '');
}

/** The address of an alias: the name the customer typed, on the domain of the page. */
export function mailAliasAddress(input: string, domainName: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  const local = value.split('@')[0] ?? '';
  if (!local) return null;
  return `${local}@${domainName}`;
}

/**
 * A password the server made for a mailbox.
 *
 * It is shown once, in the box of the page, and it is never written
 * anywhere else: not to the console, not to the storage of the browser, not
 * to the address of the page.
 */
export interface OneTimePassword {
  /** The mailbox the password belongs to. */
  address: string;
  /** The password itself. */
  password: string;
}

/**
 * What the customer asked to delete.
 *
 * The request is the proof that the customer confirmed the deletion: the
 * delete only runs from the confirmation of the request.
 */
export type MailDeleteRequest =
  | { kind: 'domain'; domain: MailDomainView }
  | { kind: 'mailbox'; domain: MailDomainView; mailbox: MailboxView }
  | { kind: 'alias'; domain: MailDomainView; alias: MailAliasView };

/**
 * Deletes what the customer asked to delete.
 *
 * Without a request nothing is deleted and the server is never asked: a
 * delete always needs a confirmation.
 */
export async function runMailDelete(request: MailDeleteRequest | null): Promise<'domain' | 'mailbox' | 'alias' | null> {
  if (!request) return null;
  if (request.kind === 'domain') {
    await deleteMailDomain(request.domain.id);
    return 'domain';
  }
  if (request.kind === 'mailbox') {
    await deleteMailbox(request.domain.id, request.mailbox.id);
    return 'mailbox';
  }
  await deleteMailAlias(request.domain.id, request.alias.id);
  return 'alias';
}

/**
 * The box of a password that is shown once.
 *
 * The password is the only thing on the page the customer cannot ask for
 * again, so it is written in a box of its own and the note says plainly
 * that it has to be stored now.
 */
export function OneTimePasswordBox({
  address,
  password,
  onDismiss,
}: {
  address: string;
  password: string;
  onDismiss?: () => void;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
    } catch {
      // The clipboard can be refused by the browser. The password is on the
      // screen, so the customer can still copy it by hand.
    }
  };

  return (
    <div role="status" className="rounded-2xl bg-acc-bg p-4">
      <p className="text-[15px] font-semibold tracking-[-0.02em] text-ink">The password of {address}</p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-ink2">
        This password is shown only once. Copy it now and store it: it cannot be shown again, and nobody can read it
        for you.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 select-all break-all rounded-xl bg-s1 px-3.5 py-3 font-mono text-[15px] text-ink">
          {password}
        </p>
        <SoftButton surface="s1" onClick={() => void copy()} aria-label={`Copy the password of ${address}`}>
          Copy
        </SoftButton>
      </div>
      {onDismiss && (
        <div className="mt-3">
          <SoftButton onClick={onDismiss}>I have stored it</SoftButton>
        </div>
      )}
    </div>
  );
}

/**
 * The DNS records the customer has to publish, and whether the server has
 * seen them.
 *
 * The purpose of every record is written next to it, because a record
 * without a reason is a record nobody publishes.
 */
export function MailDnsRecords({
  records,
  verified,
  results,
  onRecheck,
  checking = false,
}: {
  records: DnsRecordView[];
  verified: boolean;
  /** What the server found for every record, when it looked. */
  results?: DnsCheckResult[];
  /** Asks the server to look the records up again. */
  onRecheck?: () => void;
  checking?: boolean;
}) {
  const { push } = useToast();
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      push(`${label} copied.`, 'ok');
    } catch {
      push('Copy failed. Select the value and copy it manually.', 'error');
    }
  };
  const resultOf = (record: DnsRecordView) =>
    results?.find((entry) => entry.name === record.name && entry.type === record.type);
  const inPlace = results ? results.filter((entry) => entry.ok).length : null;
  const statusOf = (record: DnsRecordView) => {
    const result = resultOf(record);
    if (!result) return null;
    return (
      <span className="grid gap-0.5">
        <span className={result.ok ? 'font-semibold text-acc' : 'font-semibold text-warn'}>
          {result.ok ? 'Published' : result.found.length ? 'Different value' : 'Not found'}
        </span>
        {!result.ok && result.found.length > 0 && (
          <span className="break-all font-mono text-[11.5px] text-ink3" title={result.found.join('\n')}>
            {result.found[0].length > 60 ? `${result.found[0].slice(0, 60)}…` : result.found[0]}
          </span>
        )}
      </span>
    );
  };
  const copyButton = (value: string, label: string) => (
    <button
      type="button"
      onClick={() => void copy(value, label)}
      aria-label={`Copy the ${label.toLowerCase()}`}
      className="grid size-7 shrink-0 place-items-center rounded-lg text-ink3 hover:bg-s2 hover:text-ink focus-visible:outline-2 focus-visible:outline-acc"
    >
      <Icon name="copy" size={13} />
    </button>
  );
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">DNS records to publish</p>
        {onRecheck && (
          <SoftButton onClick={onRecheck} disabled={checking} className="h-9 px-3.5">
            {checking ? 'Checking' : 'Check DNS again'}
          </SoftButton>
        )}
      </div>

      {verified ? (
        <p className="rounded-2xl bg-acc/12 px-3.5 py-3 text-[13.5px] font-medium text-acc">
          The server has seen these records. Mail is delivered to this domain.
        </p>
      ) : (
        <p className="rounded-2xl bg-warn/12 px-3.5 py-3 text-[13.5px] leading-relaxed text-ink2">
          <span className="font-bold text-warn">Not verified yet. </span>
          {inPlace !== null ? `${inPlace} of ${records.length} records are in place. ` : ''}
          Mail is not delivered to this domain until every record below is published at your registrar.
        </p>
      )}

      {records.length ? (
        <>
          <div className="mt-3">
            <DataTable
              columns={[
                {
                  key: 'name',
                  header: 'Name',
                  render: (record: DnsRecordView) => (
                    <span className="flex items-center gap-1">
                      <span className="min-w-0 break-all font-mono text-[12.5px] text-ink2">{record.name}</span>
                      {copyButton(record.name, 'Name')}
                    </span>
                  ),
                },
                {
                  key: 'type',
                  header: 'Type',
                  nowrap: true,
                  render: (record: DnsRecordView) => (
                    <span className="font-mono text-[12.5px] text-ink2">{record.type}</span>
                  ),
                },
                {
                  key: 'value',
                  header: 'Value',
                  render: (record: DnsRecordView) => (
                    <span className="flex items-center gap-1">
                      <span className="min-w-0 break-all font-mono text-[12.5px] text-ink">{record.value}</span>
                      {copyButton(record.value, 'Value')}
                    </span>
                  ),
                },
                {
                  key: 'priority',
                  header: 'Priority',
                  nowrap: true,
                  render: (record: DnsRecordView) => (
                    <span className="font-mono text-[12.5px] text-ink2">
                      {record.priority === undefined ? '—' : record.priority}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (record: DnsRecordView) => <span className="text-[13px]">{statusOf(record)}</span>,
                },
              ]}
              rows={records}
              rowKey={(record: DnsRecordView) => `${record.name}-${record.type}-${record.value}`}
              minWidth="760px"
            />
          </div>
          {/* The phone reads the same records as cards: five columns do not
              fit in 320px. */}
          <CardList
            rows={records}
            rowKey={(record: DnsRecordView) => `${record.name}-${record.type}-${record.value}`}
          >
            {(record: DnsRecordView) => (
              <div className="grid gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">{record.type}</span>
                  {record.priority !== undefined && (
                    <span className="font-mono text-[11px] text-ink3">priority {record.priority}</span>
                  )}
                </div>
                <span className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-ink2">{record.name}</span>
                  {copyButton(record.name, 'Name')}
                </span>
                <span className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-ink">{record.value}</span>
                  {copyButton(record.value, 'Value')}
                </span>
                <span className="text-[13px]">{statusOf(record)}</span>
              </div>
            )}
          </CardList>
        </>
      ) : (
        <p className="mt-3 rounded-2xl bg-s2 px-3.5 py-3 text-[13.5px] text-ink2">
          The server did not return DNS records for this domain yet.
        </p>
      )}
    </section>
  );
}

/**
 * Everything the customer manages inside one domain: the mailboxes, the
 * aliases and the DNS records.
 *
 * The password the server made is given to this section on its own, so it
 * stays on the screen even when the list of the mailboxes is loaded again.
 */
export function MailDomainSection({
  domain,
  mailboxes,
  aliases,
  records,
  verified,
  dnsResults,
  onRecheckDns,
  checkingDns,
  oneTimePassword,
  onDismissPassword,
  onDeleteMailbox,
  onDeleteAlias,
  children,
}: {
  domain: MailDomainView;
  mailboxes: MailboxView[];
  aliases: MailAliasView[];
  records: DnsRecordView[];
  verified: boolean;
  dnsResults?: DnsCheckResult[];
  onRecheckDns?: () => void;
  checkingDns?: boolean;
  oneTimePassword: OneTimePassword | null;
  onDismissPassword?: () => void;
  onDeleteMailbox?: (mailbox: MailboxView) => void;
  onDeleteAlias?: (alias: MailAliasView) => void;
  /** The forms of the mailbox and of the alias. */
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-6">
      {oneTimePassword && (
        <OneTimePasswordBox
          address={oneTimePassword.address}
          password={oneTimePassword.password}
          onDismiss={onDismissPassword}
        />
      )}

      {children}

      <section>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">
          Mailboxes · {domain.mailboxes} of {domain.maxMailboxes}
        </p>
        {mailboxes.length ? (
          <>
            <DataTable
              columns={[
                {
                  key: 'address',
                  header: 'Mailbox',
                  truncate: true,
                  render: (mailbox: MailboxView) => (
                    <span className="font-bold text-ink" title={mailbox.address}>
                      {mailbox.address}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  nowrap: true,
                  render: (mailbox: MailboxView) => (
                    <StatusPill
                      status={MAILBOX_STATUS_TONES[mailbox.status]}
                      label={MAILBOX_STATUS_LABELS[mailbox.status]}
                    />
                  ),
                },
                {
                  key: 'usage',
                  header: 'Usage',
                  nowrap: true,
                  render: (mailbox: MailboxView) => (
                    <span className="font-mono text-[13px] text-ink2">
                      {mailbox.usedMb} MB of {mailbox.quotaMb} MB
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  srOnlyHeader: true,
                  align: 'right',
                  render: (mailbox: MailboxView) => (
                    <DangerButton onClick={() => onDeleteMailbox?.(mailbox)}>Delete</DangerButton>
                  ),
                },
              ]}
              rows={mailboxes}
              rowKey={(mailbox: MailboxView) => mailbox.id}
              minWidth="560px"
            />
            <CardList rows={mailboxes} rowKey={(mailbox: MailboxView) => mailbox.id}>
              {(mailbox: MailboxView) => (
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 break-all font-bold text-ink">{mailbox.address}</span>
                    <StatusPill
                      status={MAILBOX_STATUS_TONES[mailbox.status]}
                      label={MAILBOX_STATUS_LABELS[mailbox.status]}
                    />
                  </div>
                  <span className="font-mono text-[13px] text-ink2">
                    {mailbox.usedMb} MB of {mailbox.quotaMb} MB
                  </span>
                  <div>
                    <DangerButton onClick={() => onDeleteMailbox?.(mailbox)}>Delete</DangerButton>
                  </div>
                </div>
              )}
            </CardList>
          </>
        ) : (
          <p className="rounded-2xl bg-s2 px-3.5 py-3 text-[13.5px] text-ink2">
            No mailbox yet. Add the address your customers write to.
          </p>
        )}
      </section>

      <section>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">
          Aliases · {domain.aliases} of {domain.maxAliases}
        </p>
        {aliases.length ? (
          <>
            <DataTable
              columns={[
                {
                  key: 'alias',
                  header: 'Alias',
                  truncate: true,
                  render: (alias: MailAliasView) => (
                    <span className="font-bold text-ink" title={alias.alias}>
                      {alias.alias}
                    </span>
                  ),
                },
                {
                  key: 'target',
                  header: 'Goes to',
                  truncate: true,
                  render: (alias: MailAliasView) => (
                    <span className="text-[13.5px] text-ink2" title={alias.target}>
                      {alias.target}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  srOnlyHeader: true,
                  align: 'right',
                  render: (alias: MailAliasView) => (
                    <DangerButton onClick={() => onDeleteAlias?.(alias)}>Delete</DangerButton>
                  ),
                },
              ]}
              rows={aliases}
              rowKey={(alias: MailAliasView) => alias.id}
              minWidth="520px"
            />
            <CardList rows={aliases} rowKey={(alias: MailAliasView) => alias.id}>
              {(alias: MailAliasView) => (
                <div className="grid gap-2">
                  <span className="min-w-0 break-all font-bold text-ink">{alias.alias}</span>
                  <span className="min-w-0 break-all text-[13.5px] text-ink2">Goes to {alias.target}</span>
                  <div>
                    <DangerButton onClick={() => onDeleteAlias?.(alias)}>Delete</DangerButton>
                  </div>
                </div>
              )}
            </CardList>
          </>
        ) : (
          <p className="rounded-2xl bg-s2 px-3.5 py-3 text-[13.5px] text-ink2">
            No alias yet. An alias is another address that reaches one of your mailboxes.
          </p>
        )}
      </section>

      <MailDnsRecords records={records} verified={verified} results={dnsResults} onRecheck={onRecheckDns} checking={checkingDns} />
    </div>
  );
}

/**
 * The confirmation of a delete.
 *
 * Nothing is deleted without it, and it says plainly that the action cannot
 * be undone.
 */
export function MailDeleteDialog({
  request,
  busy,
  onCancel,
  onConfirm,
}: {
  request: MailDeleteRequest | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!request) return null;

  if (request.kind === 'domain') {
    return (
      <ConfirmDialog
        open
        title="Delete this email domain?"
        description={`${request.domain.name} stops receiving mail as soon as it is deleted, together with its ${request.domain.mailboxes} mailboxes and its ${request.domain.aliases} aliases. This cannot be undone.`}
        confirmLabel="Delete domain"
        requireText={request.domain.name}
        busy={busy}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
  }

  if (request.kind === 'mailbox') {
    return (
      <ConfirmDialog
        open
        title="Delete this mailbox?"
        description={`${request.mailbox.address} stops receiving mail as soon as it is deleted. The mail it holds is deleted with it. This cannot be undone.`}
        confirmLabel="Delete mailbox"
        busy={busy}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
  }

  return (
    <ConfirmDialog
      open
      title="Delete this alias?"
      description={`${request.alias.alias} stops forwarding mail to ${request.alias.target} as soon as it is deleted. This cannot be undone.`}
      confirmLabel="Delete alias"
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

// --- hosted mail -----------------------------------------------------------

/**
 * The storefront of hosted mail.
 *
 * The route is wired in routes.tsx. The address is also written in
 * EmailHosting.tsx, which is the page of the storefront.
 */
const EMAIL_STOREFRONT = '/email';

/** The state of a mail service, written the way the pill writes it. */
const MAIL_SERVICE_STATUS_LABELS: Record<MailServiceStatus, string> = {
  PENDING: 'Waiting for the domain',
  PROVISIONING: 'Being set up',
  ACTIVE: 'Active',
  GRACE: 'Grace period',
  SUSPENDED: 'Suspended',
  CANCELLED: 'Cancelled',
};

/** Maps the state of a mail service onto a colour the pill knows. */
const MAIL_SERVICE_STATUS_TONES: Record<MailServiceStatus, string> = {
  PENDING: 'pending',
  PROVISIONING: 'provisioning',
  ACTIVE: 'active',
  GRACE: 'degraded',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
};

/** The state of the proof of ownership of a domain, written in words. */
const MAIL_OWNERSHIP_LABELS: Record<MailOwnershipStatus, string> = {
  UNVERIFIED: 'The proof is not published yet',
  VERIFIED: 'The proof is accepted',
  FAILED: 'The proof was refused',
};

/** Maps the state of the proof onto a colour the pill knows. */
const MAIL_OWNERSHIP_TONES: Record<MailOwnershipStatus, string> = {
  UNVERIFIED: 'pending',
  VERIFIED: 'verified',
  FAILED: 'failed',
};

/**
 * A day of the life of a service, in the words of the customer.
 *
 * The moment itself comes from the platform; only the shape of it is written
 * here.
 */
function mailServiceDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The state of a domain of a mail service, in words. */
function mailDomainStatusLabel(status: string): string {
  const value = status.toLowerCase();
  if (value === 'active') return 'Active';
  if (value === 'pending') return 'Waiting for the proof';
  if (value === 'provisioning') return 'Being set up';
  if (value === 'suspended') return 'Suspended';
  if (value === 'cancelled') return 'Cancelled';
  if (value === 'error' || value === 'failed') return 'Error';
  return value.replace(/_/g, ' ');
}

/**
 * The proof of ownership of a domain.
 *
 * The platform never writes the DNS of a customer: it shows the record to
 * publish and the token of it, and the customer asks the server to look at the
 * proof when the record is in place. A proof that is refused is an explanation
 * of what is missing, never an error page.
 */
export function MailOwnershipProof({
  domain,
  answer,
  busy,
  onCheck,
}: {
  domain: MailServiceDomainView;
  /** The answer of the last look at the proof. */
  answer?: { verified: boolean; message: string };
  busy?: boolean;
  onCheck?: () => void;
}) {
  const proved = domain.ownershipStatus === 'VERIFIED';
  return (
    <div className="mt-3 rounded-2xl bg-s3 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusPill
          status={MAIL_OWNERSHIP_TONES[domain.ownershipStatus]}
          label={MAIL_OWNERSHIP_LABELS[domain.ownershipStatus]}
        />
        {!proved && onCheck && (
          <SoftButton onClick={onCheck} disabled={busy}>
            {busy ? 'Checking…' : 'Check the proof'}
          </SoftButton>
        )}
      </div>

      {!proved && (domain.verificationHost || domain.verificationToken) && (
        <dl className="mt-3 grid gap-2">
          {domain.verificationHost && (
            <div>
              <dt className="text-[11px] uppercase tracking-[0.08em] text-ink3">The record to publish</dt>
              <dd className="mt-0.5 break-all font-mono text-[12.5px] text-ink">{domain.verificationHost}</dd>
            </div>
          )}
          {domain.verificationToken && (
            <div>
              <dt className="text-[11px] uppercase tracking-[0.08em] text-ink3">The token</dt>
              <dd className="mt-0.5 break-all font-mono text-[12.5px] text-ink">{domain.verificationToken}</dd>
            </div>
          )}
        </dl>
      )}

      {answer && (
        <p
          role="status"
          data-proof-state={answer.verified ? 'verified' : 'refused'}
          className="mt-3 rounded-xl bg-s2 px-3 py-2.5 text-[13px] leading-relaxed text-ink2"
        >
          <span className="font-bold text-ink">
            {answer.verified ? 'The proof is accepted.' : 'The proof is not accepted yet.'}
          </span>{' '}
          {answer.message}
        </p>
      )}
    </div>
  );
}

/**
 * Cancels a mail service, but only when the customer confirmed it.
 *
 * The request is null until the customer confirms, so a click that never
 * reached the dialog cannot cancel anything.
 */
export async function runMailServiceCancel(request: MailServiceView | null): Promise<boolean> {
  if (!request) return false;
  await post(`/mail/services/${encodeURIComponent(request.id)}/cancel`);
  return true;
}

/**
 * The confirmation of the cancel of a mail service.
 *
 * The mail stops at once, but the data is kept until the retention of the
 * platform ends, and the dialog says so before anything happens.
 */
export function MailServiceCancelDialog({
  request,
  busy,
  onCancel,
  onConfirm,
}: {
  request: MailServiceView | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!request) return null;
  const retention = request.retentionUntil ? mailServiceDay(request.retentionUntil) : null;
  return (
    <ConfirmDialog
      open
      title="Cancel this mail service?"
      description={
        retention
          ? `The mail of ${request.plan.name} stops at once. The data of the service is kept until ${retention}, when it is deleted.`
          : `The mail of ${request.plan.name} stops at once. The data of the service is kept until the retention of the platform ends, when it is deleted.`
      }
      confirmLabel="Cancel the service"
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

/** The plan of a list of choices, with the price the platform asks. */
export function mailPlanOptionLabel(plan: MailPlanView): string {
  if (!plan.price) return plan.name;
  return `${plan.name} — ${formatPrice(plan.price.amount, plan.price.currency)} ${periodSuffix(plan.price.period)}`;
}

/**
 * The plans of hosted mail that the platform sells right now.
 *
 * The sale of hosted mail can be closed by the operator, and a plan that is
 * not on sale is never offered.
 */
export function onSaleMailPlans(plans: MailPlanView[]): MailPlanView[] {
  return plans.filter((plan) => plan.onSale && plan.price !== null);
}

/** What the card of a mail service needs to know. */
export interface MailServiceCardProps {
  service: MailServiceView;
  /** The plans the platform sells right now. */
  plans: MailPlanView[];
  /**
   * The words under the choice of the plan, when the page has something to say
   * about the sale of hosted mail.
   */
  plansNote?: string;
  /** The records of DNS, when the customer asked for them. */
  dns?: MailServiceDnsView[];
  /** The answer of the last look at the proof, by domain. */
  proof?: Record<string, { verified: boolean; message: string }>;
  /** True while an action of the card is running. */
  busy?: boolean;
  onAddDomain?: (serviceId: string, name: string) => void;
  onVerifyDomain?: (serviceId: string, domainId: string) => void;
  onLoadDns?: (serviceId: string) => void;
  onSuspend?: (serviceId: string) => void;
  onResume?: (serviceId: string) => void;
  /** The customer asked to cancel: the card only asks, the dialog confirms. */
  onRequestCancel?: (serviceId: string) => void;
  onReactivate?: (serviceId: string) => void;
  onChangePlan?: (serviceId: string, productSlug: string) => void;
}

/**
 * One mail service of the customer.
 *
 * The card shows the plan, the state of the service, the use of it, the life of
 * it and the domains it holds. Everything it shows comes from the platform.
 */
export function MailServiceCard({
  service,
  plans,
  plansNote,
  dns,
  proof,
  busy,
  onAddDomain,
  onVerifyDomain,
  onLoadDns,
  onSuspend,
  onResume,
  onRequestCancel,
  onReactivate,
  onChangePlan,
}: MailServiceCardProps) {
  const [newDomain, setNewDomain] = useState('');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [planSlug, setPlanSlug] = useState('');
  const [showDns, setShowDns] = useState(false);

  const submitDomain = () => {
    const hostname = newDomain.trim().toLowerCase();
    const problem = validateMailDomainName(hostname);
    if (problem) {
      setDomainError(problem);
      return;
    }
    setDomainError(null);
    onAddDomain?.(service.id, hostname);
    setNewDomain('');
  };

  // The webmail comes from the platform. When the platform does not give one,
  // the page says that it is not set up instead of inventing an address.
  const webmailUrl =
    service.webmailUrl ?? service.domains.find((domain) => domain.webmailUrl)?.webmailUrl ?? null;

  return (
    <article data-service={service.id} className="rounded-2xl bg-s2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-[16px] font-semibold tracking-[-0.02em] text-ink">{service.plan.name}</p>
          <p className="mt-0.5 text-[13px] text-ink3">{categoryLabel(service.plan.category)}</p>
        </div>
        {/* The state gets a line of its own on a phone, so the name of the plan
            is not cut to make room for the pill. */}
        <div className="w-full sm:w-auto">
          <StatusPill
            status={MAIL_SERVICE_STATUS_TONES[service.status]}
            label={MAIL_SERVICE_STATUS_LABELS[service.status]}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <StatTile
          label="Mailboxes"
          value={`${service.usage.mailboxes} / ${service.limits.maxMailboxes}`}
        />
        <StatTile
          label="Space used"
          value={memLabel(service.usage.storageMb)}
          hint={`of ${memLabel(service.usage.storageLimitMb)}`}
        />
        <StatTile label="Domains" value={`${service.usage.domains} / ${service.limits.maxDomains}`} />
      </div>

      {(service.graceUntil || service.suspendedAt || service.cancelledAt || service.retentionUntil) && (
        <ul className="mt-3 grid gap-1">
          {service.graceUntil && (
            <li className="text-[13px] text-ink2">The grace period ends on {mailServiceDay(service.graceUntil)}.</li>
          )}
          {service.suspendedAt && (
            <li className="text-[13px] text-ink2">
              The service was suspended on {mailServiceDay(service.suspendedAt)}.
            </li>
          )}
          {service.cancelledAt && (
            <li className="text-[13px] text-ink2">
              The service was cancelled on {mailServiceDay(service.cancelledAt)}.
            </li>
          )}
          {service.retentionUntil && (
            <li className="text-[13px] text-ink2">
              The data of the service is kept until {mailServiceDay(service.retentionUntil)}.
            </li>
          )}
        </ul>
      )}

      {service.lastError && (
        <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-3.5 py-2.5 text-[13.5px] text-ink2">
          <span className="font-bold text-bad">Last error: </span>
          {service.lastError}
        </p>
      )}

      <div className="mt-4 grid gap-3">
        {service.domains.length === 0 ? (
          <p className="rounded-2xl bg-s3 px-3.5 py-3 text-[13.5px] leading-relaxed text-ink2">
            This service has no domain yet. Add the hostname that will carry the mail.
          </p>
        ) : (
          service.domains.map((domain) => (
            <div key={domain.id} className="rounded-2xl bg-s3 p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="break-all text-[14.5px] font-medium text-ink">{domain.name}</p>
                <StatusPill status={domain.status.toLowerCase()} label={mailDomainStatusLabel(domain.status)} />
              </div>
              {domain.lastError && (
                <p role="alert" className="mt-2 text-[13px] text-ink2">
                  <span className="font-bold text-bad">Last error: </span>
                  {domain.lastError}
                </p>
              )}
              <MailOwnershipProof
                domain={domain}
                answer={proof?.[domain.id]}
                busy={busy}
                onCheck={onVerifyDomain ? () => onVerifyDomain(service.id, domain.id) : undefined}
              />
            </div>
          ))
        )}
      </div>

      <div className="mt-4">
        <InputWithButton
          label="Add a domain"
          value={newDomain}
          onChange={(event) => {
            setNewDomain(event.target.value);
            if (domainError) setDomainError(null);
          }}
          error={domainError ?? undefined}
          hint="The hostname you own and that will carry the mail."
          placeholder="acme.ro"
          autoComplete="off"
          spellCheck={false}
          button={
            <PrimaryButton onClick={submitDomain} disabled={busy || newDomain.trim() === ''}>
              Add domain
            </PrimaryButton>
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {webmailUrl ? (
          <ButtonLink href={webmailUrl} target="_blank" rel="noreferrer noopener" variant="soft">
            Open webmail
          </ButtonLink>
        ) : (
          <span className="text-[13px] text-ink3">The webmail is not set up on this platform.</span>
        )}
        <SoftButton
          onClick={() => {
            setShowDns((open) => !open);
            if (!showDns) onLoadDns?.(service.id);
          }}
        >
          {showDns ? 'Hide the records' : 'DNS records'}
        </SoftButton>
        {service.status === 'ACTIVE' && (
          <SoftButton onClick={() => onSuspend?.(service.id)} disabled={busy}>
            Suspend
          </SoftButton>
        )}
        {(service.status === 'SUSPENDED' || service.status === 'GRACE') && (
          <SoftButton onClick={() => onResume?.(service.id)} disabled={busy}>
            Resume
          </SoftButton>
        )}
        {service.status !== 'CANCELLED' && (
          <DangerButton onClick={() => onRequestCancel?.(service.id)} disabled={busy}>
            Cancel
          </DangerButton>
        )}
        {service.status === 'CANCELLED' && (
          <SoftButton onClick={() => onReactivate?.(service.id)} disabled={busy}>
            Reactivate
          </SoftButton>
        )}
      </div>

      {showDns && (
        <div className="mt-3 grid gap-2">
          {!dns ? (
            <p className="rounded-2xl bg-s3 px-3.5 py-3 text-[13.5px] text-ink2">The records are on their way.</p>
          ) : !dns.length ? (
            <p className="rounded-2xl bg-s3 px-3.5 py-3 text-[13.5px] text-ink2">
              This service has no domain yet, so it has no records.
            </p>
          ) : (
            dns.map((entry) => (
              <div key={entry.id} className="rounded-2xl bg-s3 p-3.5">
                <p className="break-all text-[14px] font-medium text-ink">{entry.name}</p>
                <p className="mt-0.5 text-[12.5px] text-ink3">
                  {entry.verified
                    ? 'The server has seen the records of this domain.'
                    : 'The server has not seen all the records of this domain yet.'}
                </p>
                <ul className="mt-2 grid gap-1.5">
                  {entry.records.map((record) => (
                    <li
                      key={`${record.name}-${record.type}-${record.value}`}
                      className="break-all font-mono text-[12px] text-ink2"
                    >
                      {record.name} {record.type} {record.value}
                      {record.priority === undefined ? '' : ` (${record.priority})`}
                      {record.purpose ? ` — ${record.purpose}` : ''}
                    </li>
                  ))}
                </ul>
                {Array.isArray(entry.missing) && entry.missing.length > 0 && (
                  <p className="mt-2 text-[12.5px] text-ink3">Still missing: {entry.missing.join(', ')}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end">
        <Select
          label="Change the plan"
          value={planSlug}
          onChange={(event) => setPlanSlug(event.target.value)}
          hint={
            plansNote ??
            (plans.length
              ? 'The new plan is bought with an order, so the price is the one of the platform.'
              : 'The sale of hosted mail is closed at the moment, so the plan cannot be changed.')
          }
        >
          <option value="">Keep the current plan</option>
          {plans.map((plan) => (
            <option key={plan.slug} value={plan.slug}>
              {mailPlanOptionLabel(plan)}
            </option>
          ))}
        </Select>
        <div>
          <PrimaryButton
            onClick={() => {
              if (planSlug) onChangePlan?.(service.id, planSlug);
            }}
            disabled={busy || !planSlug}
            className="w-full sm:w-auto"
          >
            Change the plan
          </PrimaryButton>
        </div>
      </div>
    </article>
  );
}

/**
 * The section "Email hosting" of the dashboard.
 *
 * It shows the mail services of the customer: the plan, the state, the use,
 * the life and the domains of each of them, with the records of DNS to publish
 * and the actions of the service.
 */
function MailHostingSection({ onServiceCount }: { onServiceCount?: (count: number) => void }) {
  const { push } = useToast();

  const servicesState = useAsync<{ services: MailServiceView[] }>(
    (signal) => get<{ services: MailServiceView[] }>('/mail/services', undefined, signal),
    [],
  );
  const services = useMemo(() => servicesState.data?.services ?? [], [servicesState.data]);
  useEffect(() => {
    if (servicesState.data) onServiceCount?.(services.length);
  }, [servicesState.data, services.length, onServiceCount]);

  const plansState = useAsync<{ plans: MailPlanView[] }>(
    (signal) => get<{ plans: MailPlanView[] }>('/mail/plans', undefined, signal),
    [],
  );
  // The sale of hosted mail can be closed by the operator: a plan that is not
  // on sale is not offered.
  const plans = useMemo(() => onSaleMailPlans(plansState.data?.plans ?? []), [plansState.data]);

  const [dns, setDns] = useState<Record<string, MailServiceDnsView[]>>({});
  const [proof, setProof] = useState<Record<string, { verified: boolean; message: string }>>({});
  const [pendingCancel, setPendingCancel] = useState<MailServiceView | null>(null);

  const addDomain = useAction(async (serviceId: string, name: string) => {
    await post(`/mail/services/${encodeURIComponent(serviceId)}/domains`, { name });
    servicesState.reload();
    push(`${name} was added to the mail service. Publish the record of DNS to prove that you own it.`);
  });

  const verifyDomain = useAction(async (serviceId: string, domainId: string) => {
    const answer = await post<{ verified: boolean; message: string; domain: MailServiceDomainView }>(
      `/mail/domains/${encodeURIComponent(domainId)}/verify`,
    );
    setProof((current) => ({
      ...current,
      [domainId]: { verified: answer.verified, message: answer.message },
    }));
    servicesState.reload();
    return answer;
  });

  const loadDns = useAction(async (serviceId: string) => {
    const answer = await get<{ domains: MailServiceDnsView[] }>(
      `/mail/services/${encodeURIComponent(serviceId)}/dns`,
    );
    setDns((current) => ({ ...current, [serviceId]: answer.domains }));
    return answer.domains;
  });

  const suspend = useAction(async (serviceId: string) => {
    await post(`/mail/services/${encodeURIComponent(serviceId)}/suspend`);
    servicesState.reload();
    push('The mail service is suspended. The data of the service is kept.');
  });

  const resume = useAction(async (serviceId: string) => {
    await post(`/mail/services/${encodeURIComponent(serviceId)}/resume`);
    servicesState.reload();
    push('The mail service works again.');
  });

  const reactivate = useAction(async (serviceId: string) => {
    await post(`/mail/services/${encodeURIComponent(serviceId)}/reactivate`);
    servicesState.reload();
    push('The mail service is active again.');
  });

  const changePlan = useAction(async (serviceId: string, productSlug: string) => {
    const { order } = await post<{ order: Order }>(
      `/mail/services/${encodeURIComponent(serviceId)}/plan`,
      { productSlug },
    );
    const checkout = await post<{ url: string | null; message?: string }>(
      `/orders/${encodeURIComponent(order.id)}/checkout`,
    );
    if (checkout.url) {
      location.assign(checkout.url);
      return;
    }
    push(checkout.message ?? 'The order of the new plan is created. The payment could not be opened.');
  });

  const cancel = useAction(async (service: MailServiceView) => {
    try {
      await runMailServiceCancel(service);
    } catch (err) {
      // The dialog closes, so the failure is readable instead of hidden behind
      // it.
      setPendingCancel(null);
      throw err;
    }
    setPendingCancel(null);
    servicesState.reload();
    push('The mail service is cancelled. Its data is kept until the retention ends.');
  });

  const busy =
    addDomain.pending ||
    verifyDomain.pending ||
    loadDns.pending ||
    suspend.pending ||
    resume.pending ||
    reactivate.pending ||
    changePlan.pending ||
    cancel.pending;

  const failure =
    addDomain.error ||
    verifyDomain.error ||
    loadDns.error ||
    suspend.error ||
    resume.error ||
    reactivate.error ||
    changePlan.error ||
    cancel.error ||
    null;

  return (
    <Panel
      title="Email hosting"
      description="The hosted mail you bought: the plan, the use, the domains and the records of DNS to publish. The platform never writes the DNS of a customer."
    >
      {servicesState.loading ? (
        <LoadingBlock rows={2} label="Loading your email hosting" />
      ) : servicesState.error ? (
        <ErrorState
          title="Could not load your email hosting"
          message={servicesState.error.message}
          onRetry={servicesState.reload}
        />
      ) : !services.length ? (
        <EmptyState
          title="No hosted mail yet"
          description="You have not bought a plan of hosted mail. The storefront shows the plans, their limits and their price."
          action={<ButtonLink to={EMAIL_STOREFRONT}>See the plans of hosted mail</ButtonLink>}
        />
      ) : (
        <div className="grid gap-3">
          {services.map((service) => (
            <MailServiceCard
              key={service.id}
              service={service}
              plans={plans}
              plansNote={
                plansState.error
                  ? 'The plans of hosted mail could not be loaded, so the plan cannot be changed.'
                  : undefined
              }
              dns={dns[service.id]}
              proof={proof}
              busy={busy}
              onAddDomain={(serviceId, name) => void addDomain.run(serviceId, name)}
              onVerifyDomain={(serviceId, domainId) => void verifyDomain.run(serviceId, domainId)}
              onLoadDns={(serviceId) => void loadDns.run(serviceId)}
              onSuspend={(serviceId) => void suspend.run(serviceId)}
              onResume={(serviceId) => void resume.run(serviceId)}
              onRequestCancel={(serviceId) =>
                setPendingCancel(services.find((entry) => entry.id === serviceId) ?? null)
              }
              onReactivate={(serviceId) => void reactivate.run(serviceId)}
              onChangePlan={(serviceId, productSlug) => void changePlan.run(serviceId, productSlug)}
            />
          ))}
        </div>
      )}

      {failure && (
        <p role="alert" className="mt-3 text-[13.5px] font-medium text-bad">
          {failure}
        </p>
      )}

      <MailServiceCancelDialog
        request={pendingCancel}
        busy={cancel.pending}
        onCancel={() => setPendingCancel(null)}
        onConfirm={() => {
          if (pendingCancel) void cancel.run(pendingCancel);
        }}
      />
    </Panel>
  );
}

export default function Mail() {
  const { push } = useToast();

  const domainsState = useAsync<{ domains: MailDomainView[] }>((signal) => listMailDomains(signal), []);
  const domains = useMemo(() => domainsState.data?.domains ?? [], [domainsState.data]);

  const [selectedId, setSelectedId] = useState('');
  const [oneTime, setOneTime] = useState<OneTimePassword | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MailDeleteRequest | null>(null);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const [localPart, setLocalPart] = useState('');
  const [localPartError, setLocalPartError] = useState<string | null>(null);
  const [mailboxPassword, setMailboxPassword] = useState('');

  const [aliasName, setAliasName] = useState('');
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [aliasTarget, setAliasTarget] = useState('');

  const selected = useMemo(
    () => domains.find((domain) => domain.id === selectedId) ?? null,
    [domains, selectedId],
  );

  const mailboxesState = useAsync<{ mailboxes: MailboxView[] }>(
    (signal) => (selectedId ? listMailboxes(selectedId, signal) : Promise.resolve({ mailboxes: [] })),
    [selectedId],
  );
  const aliasesState = useAsync<{ aliases: MailAliasView[] }>(
    (signal) => (selectedId ? listMailAliases(selectedId, signal) : Promise.resolve({ aliases: [] })),
    [selectedId],
  );
  const dnsState = useAsync<{ records: DnsRecordView[]; verified: boolean; results?: DnsCheckResult[] }>(
    (signal) => (selectedId ? getMailDns(selectedId, signal) : Promise.resolve({ records: [], verified: false })),
    [selectedId],
  );

  const mailboxes = useMemo(() => mailboxesState.data?.mailboxes ?? [], [mailboxesState.data]);
  const aliases = useMemo(() => aliasesState.data?.aliases ?? [], [aliasesState.data]);
  const records = useMemo(() => dnsState.data?.records ?? [], [dnsState.data]);
  const verified = dnsState.data?.verified ?? false;

  // The first mailbox is the target of an alias, so the customer does not have
  // to pick one every time. A target of another domain is dropped, because
  // the customer moved to another domain.
  useEffect(() => {
    const stillThere = mailboxes.some((mailbox) => mailbox.address === aliasTarget);
    if (!stillThere && mailboxes.length) setAliasTarget(mailboxes[0]!.address);
  }, [aliasTarget, mailboxes]);

  /** Refreshes one domain of the list, so the counters stay true. */
  const refreshDomain = useAction(async (id: string) => {
    const { domain } = await getMailDomain(id);
    domainsState.setData({
      domains: (domainsState.data?.domains ?? []).map((entry) => (entry.id === id ? domain : entry)),
    });
    return domain;
  });

  const createDomain = useAction(async (hostname: string) => {
    const { domain } = await createMailDomain(hostname);
    domainsState.reload();
    setSelectedId(domain.id);
    push(`${domain.name} added. Publish the DNS records of the domain before any mail arrives.`);
    return domain;
  });

  const addMailbox = useAction(async (domainId: string, part: string, password: string) => {
    const body: { localPart: string; password?: string } = { localPart: part };
    if (password) body.password = password;
    const { mailbox } = await createMailbox(domainId, body);
    mailboxesState.reload();
    void refreshDomain.run(domainId);
    if (mailbox.password) {
      // The server made the password and this is the only time it is seen.
      setOneTime({ address: mailbox.address, password: mailbox.password });
      push(`The mailbox ${mailbox.address} is ready. Its password is shown once, below.`);
    } else {
      push(`The mailbox ${mailbox.address} is ready.`);
    }
    return mailbox;
  });

  const addAlias = useAction(async (domainId: string, alias: string, target: string) => {
    const { alias: created } = await createMailAlias(domainId, { alias, target });
    aliasesState.reload();
    void refreshDomain.run(domainId);
    push(`${created.alias} now goes to ${created.target}.`);
    return created;
  });

  const remove = useAction(async (request: MailDeleteRequest) => {
    try {
      await runMailDelete(request);
    } catch (err) {
      // The dialog closes, so the failure is readable instead of hidden
      // behind it.
      setPendingDelete(null);
      throw err;
    }
    setPendingDelete(null);
    if (request.kind === 'domain') {
      domainsState.reload();
      if (selectedId === request.domain.id) setSelectedId('');
      push('The email domain and everything it held are deleted.');
    } else if (request.kind === 'mailbox') {
      mailboxesState.reload();
      void refreshDomain.run(request.domain.id);
      push('The mailbox is deleted.');
    } else {
      aliasesState.reload();
      void refreshDomain.run(request.domain.id);
      push('The alias is deleted.');
    }
    return request.kind;
  });

  const submitDomain = async () => {
    const hostname = name.trim().toLowerCase();
    const problem = validateMailDomainName(hostname);
    if (problem) {
      setNameError(problem);
      return;
    }
    setNameError(null);
    const created = await createDomain.run(hostname);
    if (created) setName('');
  };

  const submitMailbox = async () => {
    if (!selected) return;
    const part = localPart.trim().toLowerCase();
    const problem = validateMailLocalPart(part);
    if (problem) {
      setLocalPartError(problem);
      return;
    }
    setLocalPartError(null);
    const created = await addMailbox.run(selected.id, part, mailboxPassword);
    if (created) {
      setLocalPart('');
      setMailboxPassword('');
    }
  };

  const submitAlias = async () => {
    if (!selected) return;
    const problem = validateMailAlias(aliasName, selected.name);
    if (problem) {
      setAliasError(problem);
      return;
    }
    if (!aliasTarget) {
      setAliasError('Choose the mailbox that receives the mail.');
      return;
    }
    setAliasError(null);
    const address = mailAliasAddress(aliasName, selected.name);
    if (!address) {
      setAliasError('Enter the address that should receive the mail.');
      return;
    }
    const created = await addAlias.run(selected.id, address, aliasTarget);
    if (created) setAliasName('');
  };

  const [serviceCount, setServiceCount] = useState<number | null>(null);
  const addDomainDisabled = createDomain.pending || name.trim().length === 0;
  const addMailboxDisabled = addMailbox.pending || localPart.trim().length === 0;
  const addAliasDisabled = addAlias.pending || aliasName.trim().length === 0 || !aliasTarget;

  return (
    <div className="grid gap-4">
      <MailHostingSection onServiceCount={setServiceCount} />

      {!serviceCount && (
      <Panel
        title="Add an email domain"
        description="Claim a hostname you own. We will tell you exactly which DNS records to publish, and mail is not delivered until they are in place."
      >
        <InputWithButton
          label="Hostname"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="acme.ro"
          error={nameError ?? undefined}
          hint="The hostname without a protocol, like acme.ro."
          autoComplete="off"
          spellCheck={false}
          className="scroll-mt-16"
          button={
            <PrimaryButton onClick={() => void submitDomain()} disabled={addDomainDisabled}>
              {createDomain.pending ? 'Adding…' : 'Add domain'}
            </PrimaryButton>
          }
        />
        {createDomain.error && (
          <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">
            {createDomain.error}
          </p>
        )}
      </Panel>
      )}

      <Panel title="Your email domains">
        {domainsState.loading ? (
          <LoadingBlock rows={3} label="Loading your email domains" />
        ) : domainsState.error ? (
          <ErrorState
            title="Could not load your email domains"
            message={domainsState.error.message}
            onRetry={domainsState.reload}
          />
        ) : !domains.length ? (
          <EmptyState
            title="No email domains yet"
            description="Add a hostname above. We will tell you exactly which DNS records to create."
          />
        ) : (
          <div className="grid gap-3">
            {domains.map((domain) => (
              <article key={domain.id} className="rounded-2xl bg-s2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="w-0 min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold tracking-[-0.02em] text-ink" title={domain.name}>
                      {domain.name}
                    </p>
                    <p className="mt-0.5 text-[13px] text-ink3">
                      {domain.usedMb} MB of {domain.quotaMb} MB used · {domain.mailboxes} of {domain.maxMailboxes}{' '}
                      mailboxes · {domain.aliases} of {domain.maxAliases} aliases
                    </p>
                  </div>
                  {/* The status gets a line of its own on a phone, so the name
                      is not cut to make room for the pill. */}
                  <div className="w-full sm:w-auto">
                    <StatusPill status={MAIL_STATUS_TONES[domain.status]} label={MAIL_STATUS_LABELS[domain.status]} />
                  </div>
                </div>

                {domain.lastError && (
                  <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-3.5 py-2.5 text-[13.5px] text-ink2">
                    <span className="font-bold text-bad">Last error: </span>
                    {domain.lastError}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {domain.webmailUrl && (
                    <ButtonLink href={domain.webmailUrl} target="_blank" rel="noreferrer noopener" variant="soft">
                      Open webmail
                    </ButtonLink>
                  )}
                  <SoftButton onClick={() => setSelectedId(domain.id)}>
                    {selectedId === domain.id ? 'Selected' : 'Manage'}
                  </SoftButton>
                  <DangerButton onClick={() => setPendingDelete({ kind: 'domain', domain })}>Delete</DangerButton>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {selected && (
        <Panel
          title={selected.name}
          description="The mailboxes of the domain, the aliases that reach them and the records to publish."
        >
          {mailboxesState.loading || aliasesState.loading || (dnsState.loading && !dnsState.data) ? (
            <LoadingBlock rows={3} label="Loading the domain" />
          ) : (
            <MailDomainSection
              domain={selected}
              mailboxes={mailboxes}
              aliases={aliases}
              records={records}
              verified={verified}
              dnsResults={dnsState.data?.results}
              onRecheckDns={dnsState.reload}
              checkingDns={dnsState.loading}
              oneTimePassword={oneTime}
              onDismissPassword={() => setOneTime(null)}
              onDeleteMailbox={(mailbox) => setPendingDelete({ kind: 'mailbox', domain: selected, mailbox })}
              onDeleteAlias={(alias) => setPendingDelete({ kind: 'alias', domain: selected, alias })}
            >
              <div className="grid gap-3 rounded-2xl bg-s2 p-4">
                <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
                  <TextInput
                    label="New mailbox"
                    value={localPart}
                    onChange={(event) => setLocalPart(event.target.value)}
                    placeholder="contact"
                    error={localPartError ?? undefined}
                    hint="The name before the @. The domain is added for you."
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <TextInput
                    label="Password (optional)"
                    type="password"
                    value={mailboxPassword}
                    onChange={(event) => setMailboxPassword(event.target.value)}
                    placeholder="Leave it empty"
                    hint="Leave it empty and the server makes a password you see once."
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <PrimaryButton
                    onClick={() => void submitMailbox()}
                    disabled={addMailboxDisabled}
                    className="w-full sm:w-auto"
                  >
                    {addMailbox.pending ? 'Adding…' : 'Add mailbox'}
                  </PrimaryButton>
                  {addMailbox.error && (
                    <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">
                      {addMailbox.error}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl bg-s2 p-4">
                <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
                  <TextInput
                    label="New alias"
                    value={aliasName}
                    onChange={(event) => setAliasName(event.target.value)}
                    placeholder="info"
                    error={aliasError ?? undefined}
                    hint="The address that receives the mail and forwards it to a mailbox."
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Select
                    label="Goes to"
                    value={aliasTarget}
                    onChange={(event) => setAliasTarget(event.target.value)}
                    hint="The mailbox that receives the mail."
                  >
                    {mailboxes.length ? (
                      mailboxes.map((mailbox) => (
                        <option key={mailbox.id} value={mailbox.address}>
                          {mailbox.address}
                        </option>
                      ))
                    ) : (
                      <option value="">No mailbox yet</option>
                    )}
                  </Select>
                </div>
                <div>
                  <PrimaryButton
                    onClick={() => void submitAlias()}
                    disabled={addAliasDisabled}
                    className="w-full sm:w-auto"
                  >
                    {addAlias.pending ? 'Adding…' : 'Add alias'}
                  </PrimaryButton>
                  {addAlias.error && (
                    <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">
                      {addAlias.error}
                    </p>
                  )}
                </div>
              </div>
            </MailDomainSection>
          )}
        </Panel>
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
