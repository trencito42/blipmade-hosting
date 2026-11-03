import { useState } from 'react';
import { post } from '../lib/api';
import { useAction } from '../lib/useAsync';
import { useRouter } from '../router';
import { ConfirmDialog, Field, PrimaryButton, SoftButton, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, denseGhost, denseInput, denseSelect, useAdminSession } from './Overview';
import { fmtBasisPoints, parseLimit, toIso } from './Promotions';

const BACK_TO = '/admin/promotions';

/** A new promotion on its own page. */
export default function PromotionNew() {
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'promotions.write');
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState('');
  const [type, setType] = useState('percent');
  const [value, setValue] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [maxPerUser, setMaxPerUser] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [active, setActive] = useState(true);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);
  const dirty = !done && [code, value, maxRedemptions, maxPerUser, startsAt, endsAt].some((entry) => entry.trim() !== '');
  useUnsavedChangesGuard(dirty, 'Discard this promotion?');

  const create = useAction(async () =>
    post<{ promotion: { id: string; code: string } }>('/admin/promotions', {
      code: code.trim().toUpperCase(),
      type: type === 'percent' ? 'PERCENT' : 'FIXED',
      value: Number(value),
      maxRedemptions: maxRedemptions.trim() === '' ? null : Number(maxRedemptions),
      maxPerUser: parseLimit(maxPerUser) ?? null,
      startsAt: toIso(startsAt),
      endsAt: toIso(endsAt),
      active,
    }),
  );
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
  const valid = () =>
    code.trim().length >= 2 && /^\d+$/.test(value.trim()) && !(type === 'fixed' && Number(value.trim()) < 1) &&
    !(maxRedemptions.trim() !== '' && !/^\d+$/.test(maxRedemptions.trim())) && perUserLimit !== undefined;

  const review = () => {
    setTouched(true);
    if (valid()) setConfirming(true);
  };
  const submit = async () => {
    const result = await create.run();
    setConfirming(false);
    if (!result) return;
    setDone(true);
    toast.push(`Promotion ${result.promotion.code} created`, 'ok');
    navigate(`/admin/promotions/${result.promotion.id}`, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this promotion?')) navigate(BACK_TO);
  };
  const confirmation = [
    `The code ${code.trim().toUpperCase() || '(no code)'} is created.`,
    type === 'percent'
      ? `Every order that uses it is reduced by ${value ? fmtBasisPoints(Number(value)) : 'nothing yet'}.`
      : `Every order that uses it is reduced by ${value || 0} cents, and never by more than the order is worth.`,
    maxRedemptions.trim() === '' ? 'The code can be used as often as it is used.' : `The code can be used ${maxRedemptions.trim()} times.`,
    perUserLimit === null || perUserLimit === undefined
      ? 'One account may use the code as often as it likes.'
      : `One account may use the code ${perUserLimit} time${perUserLimit === 1 ? '' : 's'}.`,
    active ? 'The code works from the moment it is created.' : 'The code is created inactive and does not work yet.',
  ].join(' ');

  return (
    <PageEditorShell
      eyebrow="Promotions"
      title="New promotion"
      description="A code that takes a percentage or a fixed amount off an order."
      backTo={BACK_TO}
      backLabel="Back to promotions"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={create.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={review} disabled={create.pending || !mayWrite}>{create.pending ? 'Saving…' : 'Create promotion'}</PrimaryButton>
        </>
      }
    >
      {!mayWrite && <p className="mb-3 text-[13px] text-ink3">Your role does not hold &quot;promotions.write&quot;, so promotions are read-only for you.</p>}
      <div className="grid gap-3">
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
          <button type="button" aria-pressed={active} onClick={() => setActive((v) => !v)} className={active ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}>
            {active ? 'Active' : 'Inactive'}
          </button>
        </div>
        {create.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{create.error}</p>}
      </div>
      <ConfirmDialog open={confirming} title="Create the promotion" description={confirmation} confirmLabel="Create promotion" onConfirm={submit} onCancel={() => setConfirming(false)} busy={create.pending} />
    </PageEditorShell>
  );
}
