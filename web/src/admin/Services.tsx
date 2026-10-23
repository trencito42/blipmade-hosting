import { useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import type { TableColumn } from '../lib/table';
import { Link } from '../router';
import { Icon } from '../icons';
import { CardList, DataTable, EmptyState, ErrorState, Field, LoadingBlock, Money, Panel, Segmented, StatusPill, useToast } from '../ui-app';
import { ConfirmWithReason, DASH, LiveRegion, TruncationNote, can, denseDanger, denseGhost, denseInput, fmtDate, maskEmail, useAdminSession } from './Overview';

/**
 * Staff service list — GET /api/admin/services?status=&search=
 *
 * Retrying provisioning calls POST /api/admin/instances/:id/retry with a
 * reason. Only a member whose role holds "services.write" sees the button.
 */

interface AdminService {
  id: string;
  name: string;
  status: string;
  ram: number;
  cpu: number;
  disk: number;
  price: number;
  currency: string;
  createdAt: string;
  pterodactylServerId: number | null;
  customer: { id: string; email: string };
  product: { name: string; slug: string };
}

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PROVISIONING', label: 'Provisioning' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'RESTARTING', label: 'Restarting' },
  { value: 'STOPPED', label: 'Stopped' },
  { value: 'DEGRADED', label: 'Degraded' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

/** Purchased memory, never live usage. */
function fmtRam(mb: number): string {
  if (!Number.isFinite(mb)) return DASH;
  if (mb < 1024) return `${mb} MB`;
  return `${Math.round((mb / 1024) * 100) / 100} GB`;
}

export default function Services() {
  const session = useAdminSession();
  const staff = session.staff;
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [showEmails, setShowEmails] = useState(false);
  const [target, setTarget] = useState<AdminService | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const state = useAsync(
    (signal) =>
      get<{ services: AdminService[]; total?: number }>(
        '/admin/services',
        { status: status || undefined, search: query || undefined },
        signal,
      ),
    [status, query],
  );

  const retry = useAction(async (instanceId: string) => {
    return post<{ instance: { id: string; status: string } }>(`/admin/instances/${instanceId}/retry`, {
      reason: reason.trim(),
    });
  });

  const services = state.data?.services ?? [];
  const total = state.data?.total;
  const mayWrite = can(staff, 'services.write');
  const email = (value: string) => (showEmails ? value : maskEmail(value));

  const openRetry = (service: AdminService) => {
    setTarget(service);
    setReason('');
    setReasonError(null);
  };

  const confirmRetry = async () => {
    if (!target) return;
    if (!reason.trim()) {
      setReasonError('Give a reason. It is written to the audit log.');
      return;
    }
    const result = await retry.run(target.id);
    if (!result) return;
    setTarget(null);
    setReason('');
    state.reload();
    toast.push(`Provisioning queued for ${target.name}`, 'ok');
  };

  const resources = (service: AdminService) => (
    <span className="font-mono text-[12.5px] text-ink2">
      {fmtRam(service.ram)} · {service.cpu} vCPU · {service.disk} GB
    </span>
  );

  if (session.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={4} label="Loading your permissions" />
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="grid gap-4">
        <ErrorState title="The session could not be read" message={session.error} onRetry={session.reload} />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${services.length} service${services.length === 1 ? '' : 's'}`} />
      <Panel
        title="Services"
        description="Every instance on the platform. Retrying a provisioning run re-queues the worker for that instance."
        actionBelow
        action={
          <button
            type="button"
            aria-pressed={showEmails}
            onClick={() => setShowEmails((value) => !value)}
            title="Revealing addresses is a local view change. The API has no endpoint that records a reveal."
            className={showEmails ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}
          >
            <Icon name={showEmails ? 'eyeOff' : 'eye'} size={16} />
            {showEmails ? 'Mask e-mails' : 'Show e-mails'}
          </button>
        }
      >
        <div className="grid gap-3">
          <Segmented ariaLabel="Filter services by status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />

          <Field label="Search" htmlFor="service-search" hint="Matches the instance name.">
            <input
              id="service-search"
              type="search"
              inputMode="search"
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Instance name"
              className={denseInput}
            />
          </Field>

          {state.loading ? (
            <LoadingBlock rows={4} label="Loading services" />
          ) : state.error ? (
            <ErrorState title="The service list could not be loaded" message={state.error.message} onRetry={state.reload} />
          ) : !services.length ? (
            <EmptyState
              title={status || query ? 'No instance matches.' : 'No instances yet.'}
              description={status || query ? 'Try another status or name.' : 'Instances appear here once they are ordered.'}
            />
          ) : (
            <div className="grid gap-3">
              <DataTable<AdminService>
                rows={services}
                rowKey={(service) => service.id}
                columns={[
                  {
                    key: 'name',
                    header: 'Instance',
                    truncate: true,
                    render: (service: AdminService) => (
                      <span className="block min-w-0">
                        <span className="block truncate font-bold tracking-[-0.02em] text-ink" title={service.name}>
                          {service.name}
                        </span>
                        <span className="block truncate text-[12.5px] text-ink3" title={service.product.name}>
                          {service.product.name}
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: 'customer',
                    header: 'Customer',
                    truncate: true,
                    render: (service: AdminService) =>
                      service.customer?.id ? (
                        <Link
                          to={`/admin/customers/${service.customer.id}`}
                          className="font-mono text-[12.5px] text-ink2 hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                        >
                          {email(service.customer.email)}
                        </Link>
                      ) : (
                        <span className="font-mono text-[12.5px] text-ink2">{email(service.customer?.email ?? '')}</span>
                      ),
                  },
                  {
                    key: 'resources',
                    header: 'Resources',
                    nowrap: true,
                    render: (service: AdminService) => resources(service),
                  },
                  {
                    key: 'price',
                    header: 'Price',
                    align: 'right',
                    nowrap: true,
                    render: (service: AdminService) => <Money amount={service.price} currency={service.currency} period="month" />,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    nowrap: true,
                    render: (service: AdminService) => <StatusPill status={service.status} />,
                  },
                  {
                    key: 'server',
                    header: 'Pterodactyl id',
                    nowrap: true,
                    render: (service: AdminService) => (
                      <span className="font-mono text-[12.5px] text-ink2">{service.pterodactylServerId ?? DASH}</span>
                    ),
                  },
                  ...(mayWrite
                    ? ([
                        {
                          key: 'retry',
                          header: 'Action',
                          align: 'right',
                          nowrap: true,
                          render: (service: AdminService) => (
                            <button type="button" onClick={() => openRetry(service)} className={denseDanger}>
                              Retry provisioning
                            </button>
                          ),
                        },
                      ] satisfies TableColumn<AdminService>[])
                    : []),
                ]}
              />
              <CardList<AdminService> rows={services} rowKey={(service) => service.id}>
                {(service) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={service.name}>
                          {service.name}
                        </p>
                        <p className="truncate text-[12.5px] text-ink3" title={service.product.name}>
                          {service.product.name}
                        </p>
                      </div>
                      <StatusPill status={service.status} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                      <div className="min-w-0">
                        <dt className="text-ink3">Customer</dt>
                        <dd className="truncate font-mono text-ink" title={email(service.customer?.email ?? '')}>
                          {email(service.customer?.email ?? '')}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-ink3">Price</dt>
                        <dd className="min-w-0 break-words">
                          <Money amount={service.price} currency={service.currency} period="month" />
                        </dd>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <dt className="text-ink3">Resources</dt>
                        <dd className="font-mono break-words text-ink">{resources(service)}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-ink3">Pterodactyl id</dt>
                        <dd className="font-mono break-all text-ink">{service.pterodactylServerId ?? DASH}</dd>
                      </div>
                      <div>
                        <dt className="text-ink3">Created</dt>
                        <dd className="text-ink">{fmtDate(service.createdAt)}</dd>
                      </div>
                    </dl>
                    {mayWrite && (
                      <button type="button" onClick={() => openRetry(service)} className={`${denseDanger} mt-3`}>
                        Retry provisioning
                      </button>
                    )}
                  </div>
                )}
              </CardList>
              <TruncationNote shown={services.length} total={total} />
            </div>
          )}

          {!mayWrite && (
            <p className="px-1 text-[13px] text-ink3">
              Your role does not hold &quot;services.write&quot;, so retrying provisioning is hidden.
            </p>
          )}
        </div>
      </Panel>

      <ConfirmWithReason
        open={target !== null}
        title="Retry provisioning"
        description={
          target
            ? `This puts ${target.name} back into provisioning and re-queues the worker for it. The run is idempotent, but a half-created server may be replaced and the instance is unavailable while it runs again. The customer is not notified.`
            : undefined
        }
        confirmLabel="Retry provisioning"
        reasonLabel="Reason (required)"
        reason={reason}
        onReasonChange={(value) => {
          setReason(value);
          if (reasonError) setReasonError(null);
        }}
        onConfirm={confirmRetry}
        onCancel={() => setTarget(null)}
        busy={retry.pending}
        error={reasonError}
      />
    </div>
  );
}
