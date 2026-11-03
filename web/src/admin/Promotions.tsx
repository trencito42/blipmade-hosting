import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { CardList, DataTable, EmptyState, ErrorState, LoadingBlock, Money, Panel, StatusPill } from '../ui-app';
import { LiveRegion, TruncationNote, can, denseGhost, denseInput, densePrimary, denseSelect, denseSoft, fmtDate, useAdminSession } from './Overview';

/**
 * Staff promotions — GET /api/admin/promotions, POST /api/admin/promotions,
 * PATCH /api/admin/promotions/:id
 *
 * A percentage is stored in basis points (1000 = 10%) and a fixed amount in
 * minor units, so both stay integers. Redemption counts come from the API and
 * are shown against the real cap.
 *
 * Two limits are set here:
 *
 *   the cap of the campaign   how many times the code may be used at all
 *   the limit per account     how many times one account may use the code
 *
 * The limit per account is checked when the code is resolved and again when
 * the slot is reserved, so two orders sent at the same moment cannot both
 * take a slot.
 */

interface AdminPromotion {
  id: string;
  code: string;
  type: string;
  value: number;
  maxRedemptions: number | null;
  /** How many times one account may use the code. Null means no limit. */
  maxPerUser: number | null;
  usedCount: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

/** Basis points to a human percentage: 1000 becomes 10%. */
export function fmtBasisPoints(value: number): string {
  const percent = value / 100;
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(2))}%`;
}

/**
 * A limit of a campaign: a whole number of one or more, or nothing at all.
 *
 * Null means "no limit". Undefined means the text in the field is not a
 * limit, so the form must not be sent.
 */
export function parseLimit(value: string): number | null | undefined {
  const text = value.trim();
  if (text === '') return null;
  if (!/^\d+$/.test(text)) return undefined;
  const parsed = Number(text);
  return parsed >= 1 ? parsed : undefined;
}

export function toIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default function Promotions() {
  const session = useAdminSession();
  const staff = session.staff;
  const state = useAsync((signal) => get<{ promotions: AdminPromotion[]; total?: number }>('/admin/promotions', undefined, signal), []);
  const promotions = state.data?.promotions ?? [];
  const total = state.data?.total;
  const mayWrite = can(staff, 'promotions.write');

  const valueLabel = (promotion: AdminPromotion) => {
    if (promotion.type === 'percent') {
      return (
        <span className="block">
          <span className="block text-ink">{fmtBasisPoints(promotion.value)}</span>
          <span className="block font-mono text-[12px] text-ink3">{promotion.value} bp</span>
        </span>
      );
    }
    return (
      <span className="block">
        <Money amount={promotion.value} />
        <span className="block font-mono text-[12px] text-ink3">cap {promotion.value} cents</span>
      </span>
    );
  };

  /** What the campaign does, in one line: the amount it takes and its cap. */
  const capOf = (promotion: AdminPromotion) =>
    promotion.type === 'percent'
      ? `At most the order total (${fmtBasisPoints(promotion.value)} of the order).`
      : `At most ${promotion.value} cents off one order.`;

  if (session.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={3} label="Loading your permissions" />
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
      <LiveRegion message={`${promotions.length} promotion${promotions.length === 1 ? '' : 's'}`} />
      <Panel
        title="Promotions"
        description="Codes with the real redemption count against the real cap. Nothing here is a simulated counter."
        actionBelow
        action={
          mayWrite ? (
            <Link to="/admin/promotions/new" className={densePrimary}>New promotion</Link>
          ) : undefined
        }
      >
        <div className="grid gap-3">
          {state.loading ? (
            <LoadingBlock rows={3} label="Loading promotions" />
          ) : state.error ? (
            <ErrorState title="The promotion list could not be loaded" message={state.error.message} onRetry={state.reload} />
          ) : !promotions.length ? (
            <EmptyState title="No promotions yet." description="Create a code to start a campaign." />
          ) : (
            <div className="grid gap-3">
              <DataTable<AdminPromotion>
                rows={promotions}
                rowKey={(promotion) => promotion.id}
                columns={[
                  {
                    key: 'code',
                    header: 'Code',
                    nowrap: true,
                    render: (promotion: AdminPromotion) => (
                      <Link to={`/admin/promotions/${promotion.id}`} className="font-mono text-[13.5px] font-medium text-acc hover:underline">{promotion.code}</Link>
                    ),
                  },
                  {
                    key: 'type',
                    header: 'Type',
                    nowrap: true,
                    render: (promotion: AdminPromotion) => (
                      <span className="capitalize text-ink2">{promotion.type}</span>
                    ),
                  },
                  {
                    key: 'value',
                    header: 'Value',
                    align: 'right',
                    nowrap: true,
                    render: (promotion: AdminPromotion) => valueLabel(promotion),
                  },
                  {
                    key: 'used',
                    header: 'Redemptions',
                    align: 'right',
                    nowrap: true,
                    render: (promotion: AdminPromotion) => (
                      <span className="font-mono tabular-nums text-ink2">
                        {promotion.usedCount} / {promotion.maxRedemptions ?? 'no cap'}
                      </span>
                    ),
                  },
                  {
                    key: 'perUser',
                    header: 'Per account',
                    nowrap: true,
                    render: (promotion: AdminPromotion) => (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono tabular-nums text-ink2">
                          {promotion.maxPerUser === null ? 'no limit' : `${promotion.maxPerUser} time${promotion.maxPerUser === 1 ? '' : 's'}`}
                        </span>
                        {mayWrite && (
                          <Link to={`/admin/promotions/${promotion.id}`} className={denseGhost}>Manage</Link>
                        )}
                      </span>
                    ),
                  },
                  {
                    key: 'active',
                    header: 'State',
                    nowrap: true,
                    render: (promotion: AdminPromotion) => (
                      <StatusPill status={promotion.active ? 'active' : 'draft'} label={promotion.active ? 'Active' : 'Inactive'} />
                    ),
                  },
                  {
                    key: 'window',
                    header: 'Window',
                    nowrap: true,
                    render: (promotion: AdminPromotion) => (
                      <span className="text-ink2">
                        {fmtDate(promotion.startsAt)} → {fmtDate(promotion.endsAt)}
                      </span>
                    ),
                  },
                ]}
              />
              <CardList<AdminPromotion> rows={promotions} rowKey={(promotion) => promotion.id}>
                {(promotion) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1">
                        <Link to={`/admin/promotions/${promotion.id}`} className="truncate font-mono text-[14px] font-medium text-acc" title={promotion.code}>{promotion.code}</Link>
                        <p className="text-[12.5px] capitalize text-ink3">{promotion.type}</p>
                      </div>
                      <StatusPill status={promotion.active ? 'active' : 'draft'} label={promotion.active ? 'Active' : 'Inactive'} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                      <div>
                        <dt className="text-ink3">Value</dt>
                        <dd>{valueLabel(promotion)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink3">Redemptions</dt>
                        <dd className="font-mono text-ink">
                          {promotion.usedCount} / {promotion.maxRedemptions ?? 'no cap'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink3">Per account</dt>
                        <dd className="font-mono text-ink">
                          {promotion.maxPerUser === null ? 'no limit' : `${promotion.maxPerUser} time${promotion.maxPerUser === 1 ? '' : 's'}`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink3">Window</dt>
                        <dd className="text-ink">
                          {fmtDate(promotion.startsAt)} → {fmtDate(promotion.endsAt)}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-[12.5px] text-ink3">{capOf(promotion)}</p>
                    {mayWrite && (
                      <Link to={`/admin/promotions/${promotion.id}`} className={`${denseGhost} mt-2`}>Manage campaign</Link>
                    )}
                  </div>
                )}
              </CardList>
              <TruncationNote shown={promotions.length} total={total} />
            </div>
          )}

          {!mayWrite && (
            <p className="px-1 text-[13px] text-ink3">
              Your role does not hold &quot;promotions.write&quot;, so promotions are read-only for you.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
