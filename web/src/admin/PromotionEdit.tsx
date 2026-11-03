import { useEffect, useState } from 'react';
import { get, patch } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { ConfirmDialog, ErrorState, Field, LoadingBlock, PrimaryButton, SoftButton, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, denseGhost, denseDanger, denseInput, useAdminSession } from './Overview';

interface Campaign {
  id: string; code: string; maxRedemptions: number | null; maxPerUser: number | null; active: boolean; startsAt: string | null; endsAt: string | null;
  stats: { reserved: number };
}
const localValue = (value: string | null) => (value ? new Date(value).toISOString().slice(0, 16) : '');
const isoValue = (value: string) => (value ? new Date(value).toISOString() : null);

/** The limits, availability and schedule of a campaign. The code and the value stay as they were created. */
export default function PromotionEdit() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'promotions.write');
  const backTo = `/admin/promotions/${encodeURIComponent(id)}`;
  const state = useAsync<{ promotion: Campaign }>((signal) => get(`/admin/promotions/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const promotion = state.data?.promotion;
  const [max, setMax] = useState('');
  const [perUser, setPerUser] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [active, setActive] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!promotion) return;
    setMax(promotion.maxRedemptions === null ? '' : String(promotion.maxRedemptions));
    setPerUser(promotion.maxPerUser === null ? '' : String(promotion.maxPerUser));
    setStartsAt(localValue(promotion.startsAt)); setEndsAt(localValue(promotion.endsAt)); setActive(promotion.active);
  }, [promotion]);
  const dirty = Boolean(promotion) && !saved && (
    max !== (promotion!.maxRedemptions === null ? '' : String(promotion!.maxRedemptions)) ||
    perUser !== (promotion!.maxPerUser === null ? '' : String(promotion!.maxPerUser)) ||
    startsAt !== localValue(promotion!.startsAt) || endsAt !== localValue(promotion!.endsAt) || active !== promotion!.active
  );
  useUnsavedChangesGuard(dirty, 'Discard the changes to this campaign?');
  const validLimit = (value: string) => value === '' || (/^\d+$/.test(value) && Number(value) >= 1);
  const valid = Boolean(promotion) && validLimit(max) && validLimit(perUser) &&
    (!startsAt || !endsAt || Date.parse(endsAt) > Date.parse(startsAt)) && (max === '' || Number(max) >= promotion!.stats.reserved);
  const save = useAction(async () =>
    patch(`/admin/promotions/${encodeURIComponent(id)}`, { maxRedemptions: max === '' ? null : Number(max), maxPerUser: perUser === '' ? null : Number(perUser), startsAt: isoValue(startsAt), endsAt: isoValue(endsAt), active }),
  );
  const submit = async () => {
    const result = await save.run();
    setConfirming(false);
    if (result === undefined || result === null) return;
    setSaved(true);
    toast.push('Campaign settings saved.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard the changes to this campaign?')) navigate(backTo);
  };
  return (
    <PageEditorShell
      eyebrow="Promotions"
      title={promotion ? `Edit ${promotion.code}` : 'Edit campaign'}
      description="The value and code stay as they were created. Limits, availability and schedule can change."
      backTo={backTo}
      backLabel="Back to campaign"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={save.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => setConfirming(true)} disabled={!mayWrite || !valid || !dirty || save.pending}>Review changes</PrimaryButton>
        </>
      }
    >
      {state.loading && !state.data ? <LoadingBlock rows={4} label="Loading the campaign" />
        : state.error || !promotion ? <ErrorState title="The campaign could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />
        : (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Total redemption cap" htmlFor="campaign-cap" hint={`At least ${promotion.stats.reserved}, or empty for no cap.`}><input id="campaign-cap" className={denseInput} inputMode="numeric" value={max} onChange={(event) => setMax(event.target.value)} /></Field>
              <Field label="Limit per account" htmlFor="campaign-per-user" hint="Empty means no account limit. Card identity still protects 100% campaigns."><input id="campaign-per-user" className={denseInput} inputMode="numeric" value={perUser} onChange={(event) => setPerUser(event.target.value)} /></Field>
              <Field label="Starts at" htmlFor="campaign-start"><input id="campaign-start" type="datetime-local" className={denseInput} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></Field>
              <Field label="Ends at" htmlFor="campaign-end"><input id="campaign-end" type="datetime-local" className={denseInput} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></Field>
            </div>
            <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={active} onClick={() => setActive((value) => !value)} className={active ? denseGhost : denseDanger}>{active ? 'Active — click to pause' : 'Paused — click to activate'}</button></div>
            {!valid && <p role="alert" className="text-[13px] text-bad">Use positive whole-number limits, keep the cap above current reservations, and make the end later than the start.</p>}
            {save.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{save.error}</p>}
            <ConfirmDialog open={confirming} title={`Save ${promotion.code}?`} description={`The campaign will be ${active ? 'active' : 'paused'}, with ${max || 'no'} total cap and ${perUser || 'no'} per-account limit.`} confirmLabel="Save campaign" busy={save.pending} onCancel={() => setConfirming(false)} onConfirm={() => void submit()} />
          </div>
        )}
    </PageEditorShell>
  );
}
