import { useEffect, useMemo, useState } from 'react';
import { del, get, post, type Domain, type Instance } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import {
  ButtonLink,
  ConfirmDialog,
  DangerButton,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Panel,
  PrimaryButton,
  SoftButton,
  StatusPill,
  TextInput,
  Select,
  useToast,
} from '../ui-app';

/**
 * Custom domains. A domain is only shown as Active when the server says so.
 */

const DOMAIN_STATUS_LABELS: Record<Domain['status'], string> = {
  pending_dns: 'Pending DNS',
  verifying: 'Verifying',
  active: 'Active',
  error: 'Error',
};

/** Maps the domain status onto a status the pill can colour, keeping the real label. */
const DOMAIN_TONES: Record<Domain['status'], string> = {
  pending_dns: 'pending',
  verifying: 'provisioning',
  active: 'active',
  error: 'error',
};

export default function Domains() {
  const { push } = useToast();

  const domainsState = useAsync<{ domains: Domain[] }>(
    (signal) => get<{ domains: Domain[] }>('/domains', undefined, signal),
    [],
  );
  const instancesState = useAsync<{ instances: Instance[] }>(
    (signal) => get<{ instances: Instance[] }>('/instances', undefined, signal),
    [],
  );

  const [instanceId, setInstanceId] = useState('');
  const [hostname, setHostname] = useState('');
  const [hostnameError, setHostnameError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Domain | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const instances = useMemo(() => instancesState.data?.instances ?? [], [instancesState.data]);
  const domains = useMemo(() => domainsState.data?.domains ?? [], [domainsState.data]);

  useEffect(() => {
    const first = instances[0];
    if (!instanceId && first) setInstanceId(first.id);
  }, [instances, instanceId]);

  const create = useAction(async (targetInstanceId: string, host: string) => {
    const result = await post<{ domain: Domain }>(`/instances/${targetInstanceId}/domains`, { hostname: host });
    const created = result.domain;
    domainsState.reload();
    push(
      `${created.hostname} claimed. Publish the TXT record below at your registrar, then verify.`,
    );
    return created;
  });

  const verify = useAction(async (id: string) => {
    const result = await post<{ domain: Domain }>(`/domains/${id}/verify`);
    domainsState.reload();
    push(`Verification started for ${result.domain.hostname}.`);
    return result.domain;
  });

  const remove = useAction(async (id: string) => {
    try {
      await del(`/domains/${id}`);
    } catch (err) {
      // Close the dialog so the failure is readable instead of hidden behind it.
      setPendingDelete(null);
      throw err;
    }
    domainsState.reload();
    setPendingDelete(null);
    push('Domain deleted.');
  });

  const submit = async () => {
    const host = hostname.trim().toLowerCase();
    if (!host) {
      setHostnameError('Enter the hostname you want to use.');
      return;
    }
    if (!instanceId) {
      setHostnameError('Choose the instance this domain points to.');
      return;
    }
    setHostnameError(null);
    const created = await create.run(instanceId, host);
    if (created) {
      setHostname('');
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      push(`${label} copied.`);
    } catch {
      push('Copy failed. Select the value and copy it manually.', 'error');
    }
  };

  const addDisabled = create.pending || !instanceId || hostname.trim().length === 0;

  return (
    <div className="grid gap-4">
      <Panel
        title="Add a domain"
        description="Claim a hostname for one of your instances. You prove that it is yours with a TXT record before it is routed."
      >
        {instancesState.loading ? (
          <LoadingBlock rows={1} label="Loading your instances" />
        ) : instancesState.error ? (
          <ErrorState
            title="Could not load your instances"
            message={instancesState.error.message}
            onRetry={instancesState.reload}
          />
        ) : !instances.length ? (
          <EmptyState
            title="No instances yet"
            description="A domain is attached to an instance, so deploy an app or a database first."
            action={
              <ButtonLink to="/app/deploy">See what you can deploy</ButtonLink>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <Select
              label="Instance"
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              hint="The domain is attached to this instance."
              className="scroll-mt-16"
            >
              {instances.map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instance.name} · {instance.product.name}
                </option>
              ))}
            </Select>
            <TextInput
              label="Hostname"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="app.example.com"
              error={hostnameError ?? undefined}
              hint="The full hostname, without a protocol."
              autoComplete="off"
              spellCheck={false}
              className="scroll-mt-16"
            />
            <div className="sm:col-span-2">
              <PrimaryButton onClick={() => void submit()} disabled={addDisabled} className="w-full sm:w-auto">
                {create.pending ? 'Adding…' : 'Add domain'}
              </PrimaryButton>
              {create.error && (
                <p role="alert" className="mt-2 text-[13.5px] font-bold text-bad">
                  {create.error}
                </p>
              )}
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Your domains">
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
            description="Add a hostname above. We will tell you exactly which DNS records to create."
          />
        ) : (
          <div className="grid gap-3">
            {domains.map((domain) => (
              <article key={domain.id} className="rounded-2xl bg-s2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="w-0 min-w-0 flex-1">
                    <p
                      className="truncate text-[16px] font-extrabold tracking-[-0.02em] text-ink"
                      title={domain.hostname}
                    >
                      {domain.hostname}
                    </p>
                    <p className="mt-0.5 break-words text-[13px] text-ink3">
                      {domain.instanceName} · port {domain.targetPort}
                    </p>
                  </div>
                  {/* The status gets a line of its own on a phone, so the
                      hostname is not cut to make room for the pill. */}
                  <div className="w-full sm:w-auto">
                    <StatusPill status={DOMAIN_TONES[domain.status]} label={DOMAIN_STATUS_LABELS[domain.status]} />
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
                    <p className="text-[14px] font-bold text-acc">Prove that you own this hostname</p>
                    <p className="mt-1 text-[13.5px] text-ink2">
                      An address record is not enough, because every customer points at the same address. Add a TXT
                      record with the value below at your registrar, then press Verify now.
                    </p>
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

                <div className="mt-4 flex flex-wrap gap-2">
                  <SoftButton
                    onClick={() => {
                      setVerifyingId(domain.id);
                      void verify.run(domain.id).finally(() => setVerifyingId(null));
                    }}
                    disabled={verify.pending}
                  >
                    {verifyingId === domain.id ? 'Working…' : 'Verify now'}
                  </SoftButton>
                  <DangerButton onClick={() => setPendingDelete(domain)}>Delete</DangerButton>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {verify.error && (
        <p role="alert" className="text-[13.5px] font-bold text-bad">
          {verify.error}
        </p>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this domain?"
        description={
          pendingDelete
            ? `${pendingDelete.hostname} stops resolving as soon as it is deleted. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete domain"
        requireText={pendingDelete?.hostname}
        busy={remove.pending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void remove.run(pendingDelete.id);
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
