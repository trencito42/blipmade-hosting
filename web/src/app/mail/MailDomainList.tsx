/**
 * The table of the domains of a subscription.
 *
 * Every domain is one row, and every row leads to the page of the domain.
 * The table never holds a domain of another subscription, so the domains of
 * two plans are never read as one list.
 */

import type { ReactNode } from 'react';
import { Icon } from '../../icons';
import { memLabel } from '../../lib/pricing';
import { Link } from '../../router';
import { ButtonLink, CardList, DataTable, EmptyState, Pager, StatusPill, usePaged } from '../../ui-app';
import { MAIL_DNS_STATE_LABELS, MAIL_STATUS_TONES, mailDomainPath, type MailDomainRow } from './shared';

export function MailDomainList({
  domains,
  title,
  description,
  action,
  emptyTitle = 'No email domain yet',
  emptyDescription = 'Add the hostname that will carry the mail.',
}: {
  domains: MailDomainRow[];
  /** The name of the section. */
  title?: string;
  /** The line under the name of the section. */
  description?: string;
  /** The action of the section, usually the button that adds a domain. */
  action?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const paged = usePaged(domains, 20);
  if (!domains.length) {
    return (
      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        <EmptyState title={emptyTitle} description={emptyDescription} action={action} />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {title && <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-ink">{title}</h2>}
          {description && <p className="mt-1 text-[13.5px] text-ink2">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      <DataTable
        columns={[
          {
            key: 'name',
            header: 'Domain',
            truncate: true,
            render: (domain: MailDomainRow) => (
              <span className="font-bold text-ink" title={domain.name}>
                {domain.name}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            nowrap: true,
            render: (domain: MailDomainRow) => (
              <StatusPill status={MAIL_STATUS_TONES[domain.status]} label={domain.statusLabel} />
            ),
          },
          {
            key: 'mailboxes',
            header: 'Mailboxes',
            nowrap: true,
            render: (domain: MailDomainRow) => (
              <span className="font-mono text-[13px] text-ink2">
                {domain.mailboxes} / {domain.maxMailboxes}
              </span>
            ),
          },
          {
            key: 'aliases',
            header: 'Aliases',
            nowrap: true,
            render: (domain: MailDomainRow) => (
              <span className="font-mono text-[13px] text-ink2">
                {domain.aliases} / {domain.maxAliases}
              </span>
            ),
          },
          {
            key: 'storage',
            header: 'Storage',
            nowrap: true,
            render: (domain: MailDomainRow) => (
              <span className="font-mono text-[13px] text-ink2">
                {memLabel(domain.usedMb)} / {memLabel(domain.quotaMb)}
              </span>
            ),
          },
          {
            key: 'dns',
            header: 'DNS status',
            nowrap: true,
            render: (domain: MailDomainRow) => (
              <span
                className={`text-[13px] ${
                  domain.dns === 'verified' ? 'text-acc' : domain.dns === 'failed' ? 'text-bad' : 'text-ink2'
                }`}
              >
                {MAIL_DNS_STATE_LABELS[domain.dns]}
              </span>
            ),
          },
        ]}
        rows={paged.rows}
        rowKey={(domain: MailDomainRow) => domain.id}
        rowTo={(domain: MailDomainRow) => mailDomainPath(domain.id)}
        minWidth="820px"
      />

      <CardList rows={paged.rows} rowKey={(domain: MailDomainRow) => domain.id}>
        {(domain: MailDomainRow) => (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link to={mailDomainPath(domain.id)} className="min-w-0 flex-1 break-all font-bold text-ink hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">{domain.name}</Link>
              <StatusPill status={MAIL_STATUS_TONES[domain.status]} label={domain.statusLabel} />
            </div>
            <span className="font-mono text-[12.5px] text-ink2">
              {domain.mailboxes} / {domain.maxMailboxes} mailboxes · {domain.aliases} / {domain.maxAliases} aliases ·{' '}
              {memLabel(domain.usedMb)} / {memLabel(domain.quotaMb)}
            </span>
            <span
              className={`text-[12.5px] ${
                domain.dns === 'verified' ? 'text-acc' : domain.dns === 'failed' ? 'text-bad' : 'text-ink3'
              }`}
            >
              {MAIL_DNS_STATE_LABELS[domain.dns]}
            </span>
            {domain.lastError && (
              <p role="alert" className="text-[12.5px] text-ink2">
                <span className="font-bold text-bad">Last error: </span>
                {domain.lastError}
              </p>
            )}
          </div>
        )}
      </CardList>
      <Pager paged={paged} label="Email domains pages" />
    </section>
  );
}
