/**
 * The DNS of a domain and the proof that the customer owns it.
 *
 * Three things are told apart here, because they are not the same thing:
 *
 *   - the value the platform asks for, the one that is *configured*;
 *   - the value the world answered when the server looked, the one that is
 *     *observed*;
 *   - the state of the domain, the one that is *verified*.
 *
 * The records fold away when everything is in place. A record that is
 * missing or wrong is never folded away.
 */

import type { ReactNode } from 'react';
import { Icon } from '../../icons';
import type { DnsCheckResult, DnsRecordView, MailOwnershipStatus } from '../../lib/api';
import { CardList, DataTable, SoftButton, StatusPill, useToast } from '../../ui-app';
import { MAIL_OWNERSHIP_LABELS, MAIL_OWNERSHIP_TONES } from './shared';

/**
 * The proof that the customer owns a domain.
 *
 * The proof is a record of DNS: the customer publishes it and the platform
 * looks at it. It is never written by the platform.
 */
export interface MailDnsProof {
  /** The state of the proof. */
  status: MailOwnershipStatus;
  /** The name of the record that carries the proof. */
  host: string | null;
  /** The token the record has to hold. */
  token: string | null;
  /** The answer of the last look at the proof. */
  answer?: { verified: boolean; message: string };
  /** True while the proof is being looked at. */
  busy?: boolean;
  /** Asks the server to look at the proof again. */
  onCheck?: () => void;
}

/**
 * The records fold away when everything is in place, so they do not push the
 * rest of the page down. While something is missing they stay open.
 */
function Disclosure({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  if (!collapsed) return <>{children}</>;
  return (
    <details className="group mt-3">
      <summary className="cursor-pointer list-none text-[13.5px] font-medium text-ink3 hover:text-ink focus-visible:outline-2 focus-visible:outline-acc">
        Show the records
      </summary>
      {children}
    </details>
  );
}

/**
 * The DNS records the customer has to publish, and whether the server has
 * seen them.
 *
 * The purpose of every record is written next to it, because a record
 * without a reason is a record nobody publishes.
 */
export function MailDnsPanel({
  records,
  verified,
  results,
  onRecheck,
  checking = false,
  proof,
}: {
  records: DnsRecordView[];
  verified: boolean;
  /** What the server found for every record, when it looked. */
  results?: DnsCheckResult[];
  /** Asks the server to look the records up again. */
  onRecheck?: () => void;
  checking?: boolean;
  /** The proof that the customer owns the domain, when the domain has one. */
  proof?: MailDnsProof;
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
  const allOk = records.length > 0 && records.every((record) => resultOf(record)?.ok === true);

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
        {!result.ok && result.found.length === 0 && (
          <span className="text-[12px] text-ink3">Nothing answers for this record yet.</span>
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
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">DNS records to publish</p>
        {onRecheck && (
          <SoftButton onClick={onRecheck} disabled={checking} className="h-9 px-3.5">
            <Icon name="refresh" size={13} />
            {checking ? 'Checking…' : 'Check DNS again'}
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

      {proof && (
        <div className="rounded-2xl bg-s3 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusPill
              status={MAIL_OWNERSHIP_TONES[proof.status]}
              label={MAIL_OWNERSHIP_LABELS[proof.status]}
            />
            {proof.status !== 'VERIFIED' && proof.onCheck && (
              <SoftButton onClick={proof.onCheck} disabled={proof.busy} className="h-9 px-3.5">
                {proof.busy ? 'Checking…' : 'Check the proof'}
              </SoftButton>
            )}
          </div>

          <p className="mt-2 text-[13px] leading-relaxed text-ink2">
            The platform never writes your DNS. Publish the record below at your registrar, then ask the server to
            look at it.
          </p>

          {!proof.host && !proof.token ? (
            <p className="mt-2 text-[13px] text-ink3">
              This domain has no proof of ownership: it was hosted without a plan of hosted mail.
            </p>
          ) : (
            <dl className="mt-3 grid gap-2">
              {proof.host && (
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.08em] text-ink3">The record to publish</dt>
                  <dd className="mt-0.5 flex items-center gap-1 break-all font-mono text-[12.5px] text-ink">
                    <span className="min-w-0 break-all">{proof.host}</span>
                    {copyButton(proof.host, 'Name')}
                  </dd>
                </div>
              )}
              {proof.token && (
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.08em] text-ink3">The token</dt>
                  <dd className="mt-0.5 flex items-center gap-1 break-all font-mono text-[12.5px] text-ink">
                    <span className="min-w-0 break-all">{proof.token}</span>
                    {copyButton(proof.token, 'Token')}
                  </dd>
                </div>
              )}
            </dl>
          )}

          {proof.answer && (
            <p
              role="status"
              data-proof-state={proof.answer.verified ? 'verified' : 'refused'}
              className="mt-3 rounded-xl bg-s2 px-3 py-2.5 text-[13px] leading-relaxed text-ink2"
            >
              <span className="font-bold text-ink">
                {proof.answer.verified ? 'The proof is accepted.' : 'The proof is not accepted yet.'}
              </span>{' '}
              {proof.answer.message}
            </p>
          )}
        </div>
      )}

      {records.length ? (
        <Disclosure collapsed={verified && allOk}>
          <div className="mt-3">
            <p className="mb-2 text-[12.5px] leading-relaxed text-ink3">
              These are the values the platform asks for. The status of every record is what the world answered when
              the server looked.
            </p>
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
                  key: 'purpose',
                  header: 'What it is for',
                  render: (record: DnsRecordView) => (
                    <span className="text-[13px] text-ink2">{record.purpose}</span>
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
              minWidth="860px"
            />
          </div>
          {/* The phone reads the same records as cards: six columns do not
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
                <span className="text-[12.5px] text-ink3">{record.purpose}</span>
                <span className="text-[13px]">{statusOf(record)}</span>
              </div>
            )}
          </CardList>
        </Disclosure>
      ) : (
        <p className="rounded-2xl bg-s2 px-3.5 py-3 text-[13.5px] text-ink2">
          The server did not return DNS records for this domain yet.
        </p>
      )}
    </section>
  );
}
