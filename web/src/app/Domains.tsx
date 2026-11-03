import { useMemo, useState } from 'react';
import { get, post, type Domain } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { ButtonGroup } from './components/premium';
import {
  ButtonLink,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Panel,
  SoftButton,
  StatusPill,
  useToast,
} from '../ui-app';

/**
 * Custom domains. A domain is only shown as Active when the server says so.
 */

const DOMAIN_STATUS_LABELS: Record<Domain['status'], string> = {
  pending_dns: 'Pending DNS',
  pending_gateway: 'Pending gateway',
  verifying: 'Verifying',
  active: 'Active',
  error: 'Error',
};

/** Maps the domain status onto a status the pill can colour, keeping the real label. */
const DOMAIN_TONES: Record<Domain['status'], string> = {
  pending_dns: 'pending',
  pending_gateway: 'pending',
  verifying: 'provisioning',
  active: 'active',
  error: 'error',
};

/** The base of the addresses the platform gives to every instance. */
export const PLATFORM_BASE = 'apps.blipmade.com';

/** Whether the hostname is one of the platform: it needs no proof and no DNS record. */
function isPlatformHostname(hostname: string): boolean {
  return hostname.toLowerCase().endsWith(`.${PLATFORM_BASE}`);
}

export default function Domains() {
  const { push } = useToast();

  const domainsState = useAsync<{ domains: Domain[] }>(
    (signal) => get<{ domains: Domain[] }>('/domains', undefined, signal),
    [],
  );
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const domains = useMemo(() => domainsState.data?.domains ?? [], [domainsState.data]);

  const verify = useAction(async (id: string) => {
    const result = await post<{ domain: Domain }>(`/domains/${id}/verify`);
    domainsState.reload();
    push(`Verification started for ${result.domain.hostname}.`);
    return result.domain;
  });

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      push(`${label} copied.`);
    } catch {
      push('Copy failed. Select the value and copy it manually.', 'error');
    }
  };

  return (
    <div className="grid gap-4">
      <Panel
        title="Your domains"
        description="Website hostnames routed to your apps and databases. Ownership and routing remain separate from hosted email."
        action={<ButtonLink to="/app/domains/new">Add domain</ButtonLink>}
        actionBelow
      >
        {domainsState.loading ? (
          <LoadingBlock rows={3} label="Loading your domains" />
        ) : domainsState.error ? (
          <ErrorState
            title="Could not load your domains"
            message={domainsState.error.message}
            onRetry={domainsState.reload}
          />
        ) : !domains.length ? (
          <EmptyState
            title="No domains yet"
            description="Claim a hostname and we will tell you exactly which ownership and address records to create."
            action={<ButtonLink to="/app/domains/new">Add your first domain</ButtonLink>}
          />
        ) : (
          <div className="grid">
            {domains.map((domain) => (
              <article key={domain.id} className="border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="w-0 min-w-0 flex-1">
                    <p
                      className="truncate text-[16px] font-semibold tracking-[-0.02em] text-ink"
                      title={domain.hostname}
                    >
                      {domain.hostname}
                    </p>
                    <p className="mt-0.5 break-words text-[13px] text-ink3">
                      {domain.instanceName} · port {domain.targetPort}
                    </p>
                  </div>
                  {/* The status and the actions share one line; on a phone they wrap under the hostname. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={DOMAIN_TONES[domain.status]} label={DOMAIN_STATUS_LABELS[domain.status]} />
                    <ButtonGroup label={`Actions for ${domain.hostname}`}>
                      {(domain.platform ?? isPlatformHostname(domain.hostname)) ? (
                        <ButtonLink
                          to={`/app/domains/${encodeURIComponent(domain.id)}/edit`}
                          variant="soft"
                          title="Change the name of this address. It belongs to Blipmade, so it needs no DNS record and no proof of ownership. The name can change once in 7 days."
                        >
                          Change
                        </ButtonLink>
                      ) : (
                        <SoftButton
                          onClick={() => {
                            setVerifyingId(domain.id);
                            void verify.run(domain.id).finally(() => setVerifyingId(null));
                          }}
                          disabled={verify.pending}
                          title="Check the DNS records now. DNS can take a few minutes to update."
                        >
                          {verifyingId === domain.id ? 'Working…' : 'Verify'}
                        </SoftButton>
                      )}
                      <ButtonLink
                        to={`/app/domains/${encodeURIComponent(domain.id)}/delete`}
                        variant="danger"
                        title="Delete this domain. It stops resolving and cannot be restored."
                      >
                        Delete
                      </ButtonLink>
                    </ButtonGroup>
                  </div>
                </div>

                {domain.lastError && (
                  <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-3.5 py-2.5 text-[13.5px] text-ink2">
                    <span className="font-bold text-bad">Last error: </span>
                    {domain.lastError}
                  </p>
                )}

                {!domain.verification.verified && domain.verification.instructions && (
                  <div className="mt-3 rounded-2xl bg-acc-bg p-4">
                    <p className="text-[14px] font-medium text-acc">Verify this domain in three steps</p>
                    <ol className="mt-2 grid list-decimal gap-1 pl-5 text-[13.5px] text-ink2">
                      <li>Add the TXT record below at your registrar. It proves the hostname is yours.</li>
                      <li>Add the address record shown under it, so traffic reaches Blipmade.</li>
                      <li>Press Verify now. DNS can take a few minutes to update.</li>
                    </ol>
                    <dl className="mt-3 grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Name</dt>
                        <dd
                          className="min-w-0 flex-1 truncate font-mono text-[12.5px] break-all text-ink"
                          title={domain.verification.host ?? undefined}
                        >
                          {domain.verification.host}
                        </dd>
                        <SoftButton
                          surface="s1"
                          onClick={() => void copy(domain.verification.host ?? '', 'TXT name')}
                          aria-label="Copy the TXT name"
                        >
                          Copy
                        </SoftButton>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Type</dt>
                        <dd className="font-mono text-[12.5px] text-ink">TXT</dd>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Value</dt>
                        <dd
                          className="min-w-0 flex-1 font-mono text-[12.5px] break-all text-ink"
                          title={domain.verification.token ?? undefined}
                        >
                          {domain.verification.token}
                        </dd>
                        <SoftButton
                          surface="s1"
                          onClick={() => void copy(domain.verification.token ?? '', 'TXT value')}
                          aria-label="Copy the TXT value"
                        >
                          Copy
                        </SoftButton>
                      </div>
                    </dl>
                  </div>
                )}

                {!(domain.platform ?? isPlatformHostname(domain.hostname)) && (
                <div className="mt-4">
                  <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">
                    Address record to create
                  </p>
                  {domain.dnsRecords.length ? (
                    <>
                    <div className="hidden overflow-x-auto overscroll-x-contain bm-hide-scroll md:block">
                      {/* A real table: the header and the rows share the same
                          columns, so a header always stands on its column. */}
                      <table className="w-full border-separate text-left" style={{ borderSpacing: '0 6px' }}>
                        <colgroup>
                          <col style={{ width: '28%' }} />
                          <col style={{ width: '14%' }} />
                          <col style={{ width: '42%' }} />
                          <col style={{ width: '16%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th scope="col" className="px-2 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">
                              Name
                            </th>
                            <th scope="col" className="px-2 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">
                              Type
                            </th>
                            <th scope="col" className="px-2 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">
                              Value
                            </th>
                            <th scope="col" className="px-2 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {domain.dnsRecords.map((record) => (
                            <tr key={`${record.name}-${record.type}`}>
                              <td
                                className="max-w-0 truncate rounded-l-2xl bg-s3 px-2.5 py-2.5 align-middle font-mono text-[12.5px] text-ink2"
                                title={record.name}
                              >
                                {record.name}
                              </td>
                              <td className="whitespace-nowrap bg-s3 px-2.5 py-2.5 align-middle font-mono text-[12.5px] text-ink2">
                                {record.type}
                              </td>
                              <td
                                className="max-w-0 truncate bg-s3 px-2.5 py-2.5 align-middle font-mono text-[12.5px] text-ink"
                                title={record.value}
                              >
                                {record.value}
                              </td>
                              <td className="rounded-r-2xl bg-s3 px-2.5 py-2.5 align-middle text-right">
                                <SoftButton
                                  surface="s1"
                                  onClick={() => void copy(record.value, `${record.type} value`)}
                                  aria-label={`Copy the ${record.type} value for ${record.name}`}
                                >
                                  Copy
                                </SoftButton>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* The phone reads the same rows as cards: a table of
                        four columns does not fit in 320px. */}
                    <div className="grid gap-1.5 md:hidden">
                      {domain.dnsRecords.map((record) => (
                        <div key={`${record.name}-${record.type}`} className="grid gap-1 rounded-2xl bg-s3 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">
                              {record.type}
                            </span>
                            <SoftButton
                              surface="s1"
                              className="shrink-0"
                              onClick={() => void copy(record.value, `${record.type} value`)}
                              aria-label={`Copy the ${record.type} value for ${record.name}`}
                            >
                              Copy
                            </SoftButton>
                          </div>
                          <span className="min-w-0 break-all font-mono text-[12.5px] text-ink2">{record.name}</span>
                          <span className="min-w-0 break-all font-mono text-[12.5px] text-ink">{record.value}</span>
                        </div>
                      ))}
                    </div>
                    </>
                  ) : (
                    <p className="rounded-2xl bg-s3 px-3.5 py-3 text-[13.5px] text-ink2">
                      The server did not return DNS records for this domain yet.
                    </p>
                  )}
                </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Email domains"
        description="This page lists the domains routed to your apps and servers. Domains used for hosted email, with their ownership proof and DNS records, are managed in the Email section."
      >
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink to="/app/mail" variant="soft">
            Go to Email
          </ButtonLink>
          <span className="text-sm text-slate-500">
            An email domain and an app domain are separate and managed separately.
          </span>
        </div>
      </Panel>

      {verify.error && (
        <p role="alert" className="text-[13.5px] font-medium text-bad">
          {verify.error}
        </p>
      )}
    </div>
  );
}
