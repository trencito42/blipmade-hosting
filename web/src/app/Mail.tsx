import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createMailAlias,
  createMailDomain,
  createMailbox,
  deleteMailAlias,
  deleteMailbox,
  deleteMailDomain,
  getMailDns,
  getMailDomain,
  listMailAliases,
  listMailDomains,
  listMailboxes,
  type DnsRecordView,
  type MailAliasView,
  type MailDomainView,
  type MailboxView,
} from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
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
  PrimaryButton,
  Select,
  SoftButton,
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

/** One part of a hostname: letters, digits and dashes, never starting or ending with a dash. */
const HOSTNAME_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** The name of a mailbox, before the @. */
const LOCAL_PART = /^[a-z0-9._%+-]+$/;

/**
 * Checks the name of an email domain.
 *
 * The customer types a hostname they own, so the shape of the name is
 * checked here: a name without a dot is not a hostname, and a name with a
 * protocol or a path is an address of a page and not a hostname.
 *
 * The answer is the sentence to show under the field, or null when the name
 * can be used.
 */
export function validateMailDomainName(name: string): string | null {
  const value = name.trim().toLowerCase();
  if (!value) return 'Enter the hostname you want to use.';
  if (/\s/.test(value)) return 'A hostname cannot contain spaces.';
  if (value.includes('://') || /^[a-z][a-z0-9+.-]*:/.test(value)) {
    return 'Write the hostname on its own, without a protocol or a port, like acme.ro.';
  }
  if (value.includes('/')) return 'Write only the hostname, without a path, like acme.ro.';
  if (!value.includes('.')) return 'A hostname needs at least one dot, like acme.ro.';
  if (value.length > 253) return 'That hostname is too long.';

  for (const label of value.split('.')) {
    if (!HOSTNAME_LABEL.test(label)) {
      return 'That is not a valid hostname. Use letters, digits and dashes, like acme.ro.';
    }
  }
  return null;
}

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
      <p className="text-[15px] font-extrabold tracking-[-0.02em] text-ink">The password of {address}</p>
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
export function MailDnsRecords({ records, verified }: { records: DnsRecordView[]; verified: boolean }) {
  return (
    <section>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">DNS records to publish</p>

      {verified ? (
        <p className="rounded-2xl bg-acc/12 px-3.5 py-3 text-[13.5px] font-bold text-acc">
          The server has seen these records. Mail is delivered to this domain.
        </p>
      ) : (
        <p className="rounded-2xl bg-warn/12 px-3.5 py-3 text-[13.5px] leading-relaxed text-ink2">
          <span className="font-bold text-warn">Not verified yet. </span>
          Mail is not delivered to this domain until the records below are published at your registrar and the server
          has seen them.
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
                  truncate: true,
                  render: (record: DnsRecordView) => (
                    <span className="font-mono text-[12.5px] text-ink2" title={record.name}>
                      {record.name}
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
                  truncate: true,
                  render: (record: DnsRecordView) => (
                    <span className="font-mono text-[12.5px] text-ink" title={record.value}>
                      {record.value}
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
                  key: 'purpose',
                  header: 'What it is for',
                  render: (record: DnsRecordView) => <span className="text-[13.5px] text-ink2">{record.purpose}</span>,
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
                <span className="min-w-0 break-all font-mono text-[12.5px] text-ink2">{record.name}</span>
                <span className="min-w-0 break-all font-mono text-[12.5px] text-ink">{record.value}</span>
                <span className="text-[13px] text-ink2">{record.purpose}</span>
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

      <MailDnsRecords records={records} verified={verified} />
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
  const dnsState = useAsync<{ records: DnsRecordView[]; verified: boolean }>(
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

  const addDomainDisabled = createDomain.pending || name.trim().length === 0;
  const addMailboxDisabled = addMailbox.pending || localPart.trim().length === 0;
  const addAliasDisabled = addAlias.pending || aliasName.trim().length === 0 || !aliasTarget;

  return (
    <div className="grid gap-4">
      <Panel
        title="Add an email domain"
        description="Claim a hostname you own. We will tell you exactly which DNS records to publish, and mail is not delivered until they are in place."
      >
        <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <TextInput
            label="Hostname"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="acme.ro"
            error={nameError ?? undefined}
            hint="The hostname without a protocol, like acme.ro."
            autoComplete="off"
            spellCheck={false}
            className="scroll-mt-16"
          />
          <div>
            <PrimaryButton
              onClick={() => void submitDomain()}
              disabled={addDomainDisabled}
              className="w-full sm:w-auto"
            >
              {createDomain.pending ? 'Adding…' : 'Add domain'}
            </PrimaryButton>
          </div>
        </div>
        {createDomain.error && (
          <p role="alert" className="mt-2 text-[13.5px] font-bold text-bad">
            {createDomain.error}
          </p>
        )}
      </Panel>

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
                    <p className="truncate text-[16px] font-extrabold tracking-[-0.02em] text-ink" title={domain.name}>
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
          {mailboxesState.loading || aliasesState.loading || dnsState.loading ? (
            <LoadingBlock rows={3} label="Loading the domain" />
          ) : (
            <MailDomainSection
              domain={selected}
              mailboxes={mailboxes}
              aliases={aliases}
              records={records}
              verified={verified}
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
                    <p role="alert" className="mt-2 text-[13.5px] font-bold text-bad">
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
                    <p role="alert" className="mt-2 text-[13.5px] font-bold text-bad">
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
        <p role="alert" className="text-[13.5px] font-bold text-bad">
          {remove.error}
        </p>
      )}
    </div>
  );
}
