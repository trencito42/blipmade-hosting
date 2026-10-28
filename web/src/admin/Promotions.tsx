import { useState } from 'react';
import { get, patch, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { CardList, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, LoadingBlock, Money, Panel, StatusPill, useToast } from '../ui-app';
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
function fmtBasisPoints(value: number): string {
  const percent = value / 100;
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(2))}%`;
}

/**
 * A limit of a campaign: a whole number of one or more, or nothing at all.
 *
 * Null means "no limit". Undefined means the text in the field is not a
 * limit, so the form must not be sent.
 */
function parseLimit(value: string): number | null | undefined {
  const text = value.trim();
  if (text === '') return null;
  if (!/^\d+$/.test(text)) return undefined;
  const parsed = Number(text);
  return parsed >= 1 ? parsed : undefined;
}

function toIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default function Promotions() {
  const session = useAdminSession();
  const staff = session.staff;
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState<AdminPromotion | null>(null);

  const state = useAsync((signal) => get<{ promotions: AdminPromotion[]; total?: number }>('/admin/promotions', undefined, signal), []);
  const promotions = state.data?.promotions ?? [];
  const total = state.data?.total;
  const mayWrite = can(staff, 'promotions.write');

  const [code, setCode] = useState('');
  const [type, setType] = useState('percent');
  const [value, setValue] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [maxPerUser, setMaxPerUser] = useState('');
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
      maxPerUser: parseLimit(maxPerUser) ?? null,
      startsAt: toIso(startsAt),
      endsAt: toIso(endsAt),
      active,
    });
  });

  const codeError = touched && code.trim().length < 2 ? 'Give the code at least two characters.' : undefined;
  const valueError =
    touched && !/^\d+$/.test(value.trim())
      ? 'Use whole numbers only.'
      : touched && type === 'fixed' && Number(value.trim()) < 1
        ? 'A fixed amount has to be at least one cent.'
        : undefined;
  const capError = touched && maxRedemptions.trim() !== '' && !/^\d+$/.test(maxRedemptions.trim()) ? 'Use whole numbers only.' : undefined;
  const perUserLimit = parseLimit(maxPerUser);
  const perUserError = touched && perUserLimit === undefined ? 'Use a whole number of one or more, or leave the field empty.' : undefined;

  const submit = async () => {
    setTouched(true);
    if (code.trim().length < 2 || !/^\d+$/.test(value.trim())) return;
    if (type === 'fixed' && Number(value.trim()) < 1) return;
    if (maxRedemptions.trim() !== '' && !/^\d+$/.test(maxRedemptions.trim())) return;
    if (perUserLimit === undefined) return;
    const result = await create.run();
    if (!result) return;
    toast.push(`Promotion ${result.promotion.code} created`, 'ok');
    setCode('');
    setValue('');
    setMaxRedemptions('');
    setMaxPerUser('');
    setStartsAt('');
    setEndsAt('');
    setTouched(false);
    setConfirming(false);
    state.reload();
  };

  /** What the confirmation states: the code that is created and what it does. */
  const confirmation = [
    `The code ${code.trim().toUpperCase() || '(no code)'} is created.`,
    type === 'percent'
      ? `Every order that uses it is reduced by ${value ? fmtBasisPoints(Number(value)) : 'nothing yet'}.`
      : `Every order that uses it is reduced by ${value || 0} cents, and never by more than the order is worth.`,
    maxRedemptions.trim() === '' ? 'The code can be used as often as it is used.' : `The code can be used ${maxRedemptions.trim()} times.`,
    perUserLimit === null
      ? 'One account may use the code as often as it likes.'
      : `One account may use the code ${perUserLimit} time${perUserLimit === 1 ? '' : 's'}.`,
    active ? 'The code works from the moment it is created.' : 'The code is created inactive and does not work yet.',
  ].join(' ');

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
                  hint={
                    type === 'percent'
                      ? /^\d+$/.test(value.trim())
                        ? `Takes ${fmtBasisPoints(Number(value.trim()))} off an order, at most the order total.`
                        : 'The code never takes more than the order is worth.'
                      : 'The most the code takes off one order. It never takes more than the order is worth.'
                  }
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
                <Field
                  label="Limit per account"
                  htmlFor="promotion-per-user"
                  error={perUserError}
                  hint="Empty means no limit. How many times one account may use the code."
                >
                  <input
                    id="promotion-per-user"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={maxPerUser}
                    onChange={(event) => setMaxPerUser(event.target.value)}
                    placeholder="1"
                    className={denseInput}
                  />
                </Field>
                <p className="self-end text-[12.5px] leading-relaxed text-ink3">
                  The limit is checked when the code is resolved and again when the slot is reserved, so two orders sent at the same
                  moment cannot both take a slot.
                </p>
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
                <button type="button" onClick={() => setConfirming(true)} disabled={create.pending} className={densePrimary}>
                  {create.pending ? 'Saving…' : 'Create promotion'}
                </button>
              </div>

              {create.error && (
                <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
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
                    nowrap: true,
                    render: (promotion: AdminPromotion) => (
                      <span className="font-mono text-[13.5px] font-medium text-ink">{promotion.code}</span>
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
                          <button
                            type="button"
                            onClick={() => setEditing(promotion)}
                            aria-label={`Change the limit per account of ${promotion.code}`}
                            className={denseGhost}
                          >
                            Change
                          </button>
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
                        <p className="truncate font-mono text-[14px] font-medium text-ink" title={promotion.code}>
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
                      <button
                        type="button"
                        onClick={() => setEditing(promotion)}
                        aria-label={`Change the limit per account of ${promotion.code}`}
                        className={`${denseGhost} mt-2`}
                      >
                        Change the limit per account
                      </button>
                    )}
                  </div>
                )}
              </CardList>
              <TruncationNote shown={promotions.length} total={total} />
            </div>
          )}

          {editing && mayWrite && (
            <PromotionLimitEditor promotion={editing} onClose={() => setEditing(null)} onSaved={state.reload} />
          )}

          {!mayWrite && (
            <p className="px-1 text-[13px] text-ink3">
              Your role does not hold &quot;promotions.write&quot;, so promotions are read-only for you.
            </p>
          )}
        </div>
      </Panel>

      <ConfirmDialog
        open={confirming}
        title="Create the promotion"
        description={confirmation}
        confirmLabel="Create promotion"
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
        busy={create.pending}
      />
    </div>
  );
}

/**
 * The limit per account of a campaign that already exists.
 *
 * The field is empty when the campaign has no limit, and the server is told
 * the same thing, so the limit can be set, changed and cleared.
 */
function PromotionLimitEditor({
  promotion,
  onClose,
  onSaved,
}: {
  promotion: AdminPromotion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [limit, setLimit] = useState(promotion.maxPerUser === null ? '' : String(promotion.maxPerUser));
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const parsed = parseLimit(limit);
  const valid = parsed !== undefined;
  const limitError = touched && !valid ? 'Use a whole number of one or more, or leave the field empty.' : undefined;

  const save = useAction(async () => {
    return patch<{ promotion: AdminPromotion }>(`/admin/promotions/${promotion.id}`, { maxPerUser: parsed ?? null });
  });

  /** What changes, in words, so the confirmation says it before it happens. */
  const changes: string[] = [];
  if (valid) {
    if (parsed === null && promotion.maxPerUser !== null) {
      changes.push('The limit per account is cleared, so one account may use the code as often as it likes.');
    } else if (parsed !== null && promotion.maxPerUser === null) {
      changes.push(`One account may use the code ${parsed} time${parsed === 1 ? '' : 's'}.`);
    } else if (parsed !== null && parsed !== promotion.maxPerUser) {
      changes.push(`The limit per account goes from ${promotion.maxPerUser} to ${parsed}.`);
    }
  }
  const changed = changes.length > 0;

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    const result = await save.run();
    if (!result) return;
    toast.push(`The limit of ${promotion.code} is saved`, 'ok');
    setConfirming(false);
    onSaved();
    onClose();
  };

  return (
    <div className="grid gap-3 rounded-2xl bg-s2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[14px] font-medium text-ink">{promotion.code}</p>
        <p className="text-[12.5px] text-ink3">The limit per account of this campaign.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Limit per account"
          htmlFor={`promotion-per-user-${promotion.id}`}
          error={limitError}
          hint="Empty means no limit. The limit is checked when the code is resolved and when the slot is reserved."
        >
          <input
            id={`promotion-per-user-${promotion.id}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            placeholder="1"
            className={denseInput}
          />
        </Field>
        <div className="grid content-end gap-1 text-[12.5px] text-ink3">
          <p>Now: {promotion.maxPerUser === null ? 'no limit per account' : `${promotion.maxPerUser} time${promotion.maxPerUser === 1 ? '' : 's'} per account`}.</p>
          <p>{promotion.code} {promotion.type === 'percent' ? `takes ${fmtBasisPoints(promotion.value)} off an order` : `takes at most ${promotion.value} cents off an order`}.</p>
        </div>
      </div>

      {save.error && (
        <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
          {save.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setConfirming(true)} disabled={!changed || save.pending} className={densePrimary}>
          {save.pending ? 'Saving…' : 'Save the limit'}
        </button>
        <button type="button" onClick={onClose} className={denseSoft}>
          Cancel
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Save the limit of ${promotion.code}`}
        description={changes.join(' ')}
        confirmLabel="Save the limit"
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
        busy={save.pending}
      />
    </div>
  );
}
