/**
 * The mailboxes of a domain.
 *
 * The list is searched, because a domain of a plan that allows many
 * mailboxes is long, and every row keeps its own actions.
 */

import { useMemo, useState } from 'react';
import { Icon } from '../../icons';
import type { MailDomainView, MailboxView } from '../../lib/api';
import { memLabel } from '../../lib/pricing';
import { ButtonLink, CardList, DataTable, DangerButton, EmptyState, PrimaryButton, StatusPill, TextInput } from '../../ui-app';
import { MAILBOX_STATUS_LABELS, MAILBOX_STATUS_TONES } from './shared';

export function MailboxTable({
  domain,
  mailboxes,
  onCreate,
  onDelete,
  busy,
  searchable = true,
}: {
  domain: MailDomainView;
  mailboxes: MailboxView[];
  /** Asks for the dialog of a new mailbox. Without it, no button is shown. */
  onCreate?: () => void;
  /** The customer asked to delete a mailbox: the dialog confirms it. */
  onDelete?: (mailbox: MailboxView) => void;
  /** True while an action of the table is running. */
  busy?: boolean;
  /** The list of a short domain is not searched. */
  searchable?: boolean;
}) {
  const [query, setQuery] = useState('');

  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return mailboxes;
    return mailboxes.filter((mailbox) => mailbox.address.toLowerCase().includes(needle));
  }, [mailboxes, query]);

  const webmail = domain.webmailUrl;

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">
          Mailboxes · {domain.mailboxes} of {domain.maxMailboxes}
        </p>
        {onCreate && (
          <PrimaryButton onClick={onCreate} disabled={busy} className="h-9 px-3.5">
            <Icon name="plus" size={13} />
            Create mailbox
          </PrimaryButton>
        )}
      </div>

      {searchable && mailboxes.length > 3 && (
        <TextInput
          label="Search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by address"
          autoComplete="off"
        />
      )}

      {mailboxes.length === 0 ? (
        <EmptyState
          title="No mailbox yet"
          description="Add the address your customers write to."
        />
      ) : found.length === 0 ? (
        <p className="rounded-2xl bg-s2 px-3.5 py-3 text-[13.5px] text-ink2">
          No mailbox of this domain carries “{query.trim()}”.
        </p>
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: 'address',
                header: 'Email address',
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
                header: 'Storage usage',
                nowrap: true,
                render: (mailbox: MailboxView) => (
                  <span className="font-mono text-[13px] text-ink2">
                    {memLabel(mailbox.usedMb)} of {memLabel(mailbox.quotaMb)}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                srOnlyHeader: true,
                align: 'right',
                render: (mailbox: MailboxView) => (
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    {webmail && (
                      <ButtonLink href={webmail} target="_blank" rel="noreferrer noopener" variant="soft" className="h-9 px-3">
                        <Icon name="mail" size={13} />
                        Open webmail
                      </ButtonLink>
                    )}
                    {onDelete && (
                      <DangerButton onClick={() => onDelete(mailbox)} disabled={busy} className="h-9 px-3">
                        Delete
                      </DangerButton>
                    )}
                  </span>
                ),
              },
            ]}
            rows={found}
            rowKey={(mailbox: MailboxView) => mailbox.id}
            minWidth="620px"
          />
          <CardList rows={found} rowKey={(mailbox: MailboxView) => mailbox.id}>
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
                  {memLabel(mailbox.usedMb)} of {memLabel(mailbox.quotaMb)}
                </span>
                {(webmail || onDelete) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {webmail && (
                      <ButtonLink href={webmail} target="_blank" rel="noreferrer noopener" variant="soft" className="h-9 px-3">
                        <Icon name="mail" size={13} />
                        Open webmail
                      </ButtonLink>
                    )}
                    {onDelete && (
                      <DangerButton onClick={() => onDelete(mailbox)} disabled={busy} className="h-9 px-3">
                        Delete
                      </DangerButton>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardList>
        </>
      )}
    </section>
  );
}
