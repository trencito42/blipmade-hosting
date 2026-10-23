import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { CardList, DataTable, EmptyState, ErrorState, Field, LoadingBlock, Money, Panel, StatusPill, useToast } from '../ui-app';
import { LiveRegion, can, denseGhost, denseInput, densePrimary, denseSelect, fmtDate, useStaffUser } from './Overview';

/**
 * Staff promotions — GET /api/admin/promotions, POST /api/admin/promotions
 *
 * A percentage is stored in basis points (1000 = 10%) and a fixed amount in
 * minor units, so both stay integers. Redemption counts come from the API and
 * are shown against the real cap.
 */

interface AdminPromotion {
  id: string;
  code: string;
  type: string;
  value: number;
  maxRedemptions: number | null;
  usedCount: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

/** Basis points to a human percentage: 1000 becomes 10%. */
function fmtBasisPoints(value: number): string {
  const percent = value / 100;
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(2))}%`;
}

function toIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default function Promotions() {
  const staff = useStaffUser();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const state = useAsync((signal) => get<{ promotions: AdminPromotion[] }>('/admin/promotions', undefined, signal), []);
  const promotions = state.data?.promotions ?? [];
  const mayWrite = can(staff, 'promotions.write');

  const [code, setCode] = useState('');
  const [type, setType] = useState('percent');
  const [value, setValue] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [active, setActive] = useState(true);
  const [touched, setTouched] = useState(false);

  const create = useAction(async () => {
    return post<{ promotion: AdminPromotion }>('/admin/promotions', {
      code: code.trim().toUpperCase(),
      type: type === 'percent' ? 'PERCENT' : 'FIXED',
      value: Number(value),
      maxRedemptions: maxRedemptions.trim() === '' ? null : Number(maxRedemptions),
      startsAt: toIso(startsAt),
      endsAt: toIso(endsAt),
      active,
    });
  });

  const codeError = touched && code.trim().length < 2 ? 'Give the code at least two characters.' : undefined;
  const valueError = touched && !/^\d+$/.test(value.trim()) ? 'Use whole numbers only.' : undefined;
  const capError = touched && maxRedemptions.trim() !== '' && !/^\d+$/.test(maxRedemptions.trim()) ? 'Use whole numbers only.' : undefined;

  const submit = async () => {
    setTouched(true);
    if (code.trim().length < 2 || !/^\d+$/.test(value.trim())) return;
    if (maxRedemptions.trim() !== '' && !/^\d+$/.test(maxRedemptions.trim())) return;
    const result = await create.run();
    if (!result) return;
    toast.push(`Promotion ${result.promotion.code} created`, 'ok');
    setCode('');
    setValue('');
    setMaxRedemptions('');
    setStartsAt('');
    setEndsAt('');
    setTouched(false);
    state.reload();
  };

  const valueLabel = (promotion: AdminPromotion) => {
    if (promotion.type === 'percent') {
      return (
        <span className="block">
          <span className="block text-ink">{fmtBasisPoints(promotion.value)}</span>
          <span className="block font-mono text-[12px] text-ink3">{promotion.value} bp</span>
        </span>
      );
    }
    return <Money amount={promotion.value} />;
  };

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${promotions.length} promotion${promotions.length === 1 ? '' : 's'}`} />
      <Panel
        title="Promotions"
        description="Codes with the real redemption count against the real cap. Nothing here is a simulated counter."
        actionBelow
        action={
          mayWrite ? (
            <button type="button" onClick={() => setCreating((value) => !value)} aria-expanded={creating} className={densePrimary}>
              {creating ? 'Close the form' : 'New promotion'}
            </button>
          ) : undefined
        }
      >
        <div className="grid gap-3">
          {creating && mayWrite && (
            <div className="grid gap-3 rounded-2xl bg-s2 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Code" htmlFor="promotion-code" error={codeError}>
                  <input
                    id="promotion-code"
                    type="text"
                    autoComplete="off"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="LAUNCH"
                    className={denseInput}
                  />
                </Field>
                <Field label="Type" htmlFor="promotion-type">
                  <select
                    id="promotion-type"
                    value={type}
                    onChange={(event) => {
                      setType(event.target.value);
                      setValue('');
                    }}
                    className={denseSelect}
                  >
                    <option value="percent">Percentage</option>
                    <option value="fixed">Fixed amount</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={type === 'percent' ? 'Value (basis points, 1000 = 10%)' : 'Value (cents)'}
                  htmlFor="promotion-value"
                  error={valueError}
                  hint={type === 'percent' && /^\d+$/.test(value.trim()) ? fmtBasisPoints(Number(value.trim())) : undefined}
                >
                  <input
                    id="promotion-value"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={type === 'percent' ? '1000' : '500'}
                    className={denseInput}
                  />
                </Field>
                <Field label="Redemption cap" htmlFor="promotion-cap" error={capError} hint="Empty means no cap.">
                  <input
                    id="promotion-cap"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={maxRedemptions}
                    onChange={(event) => setMaxRedemptions(event.target.value)}
                    placeholder="100"
                    className={denseInput}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Starts at" htmlFor="promotion-start" hint="Optional. Local time, sent as UTC.">
                  <input
                    id="promotion-start"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                    className={denseInput}
                  />
                </Field>
                <Field label="Ends at" htmlFor="promotion-end" hint="Optional. Local time, sent as UTC.">
                  <input
                    id="promotion-end"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(event) => setEndsAt(event.target.value)}
                    className={denseInput}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActive((value) => !value)}
                  className={active ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}
                >
                  {active ? 'Active' : 'Inactive'}
                </button>
                <button type="button" onClick={submit} disabled={create.pending} className={densePrimary}>
                  {create.pending ? 'Saving…' : 'Create promotion'}
                </button>
              </div>

              {create.error && (
                <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
                  {create.error}
                </p>
              )}
            </div>
          )}

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
                    render: (promotion: AdminPromotion) => (
                      <span className="font-mono text-[13.5px] font-bold text-ink">{promotion.code}</span>
                    ),
                  },
                  {
                    key: 'type',
                    header: 'Type',
                    render: (promotion: AdminPromotion) => (
                      <span className="capitalize text-ink2">{promotion.type}</span>
                    ),
                  },
                  {
                    key: 'value',
                    header: 'Value',
                    render: (promotion: AdminPromotion) => valueLabel(promotion),
                  },
                  {
                    key: 'used',
                    header: 'Redemptions',
                    render: (promotion: AdminPromotion) => (
                      <span className="font-mono tabular-nums text-ink2">
                        {promotion.usedCount} / {promotion.maxRedemptions ?? 'no cap'}
                      </span>
                    ),
                  },
                  {
                    key: 'active',
                    header: 'State',
                    render: (promotion: AdminPromotion) => (
                      <StatusPill status={promotion.active ? 'active' : 'draft'} label={promotion.active ? 'Active' : 'Inactive'} />
                    ),
                  },
                  {
                    key: 'window',
                    header: 'Window',
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
                        <p className="truncate font-mono text-[14px] font-bold text-ink" title={promotion.code}>
                          {promotion.code}
                        </p>
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
                      <div className="col-span-2">
                        <dt className="text-ink3">Window</dt>
                        <dd className="text-ink">
                          {fmtDate(promotion.startsAt)} → {fmtDate(promotion.endsAt)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}
              </CardList>
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
