import { useMemo, useState } from 'react';
import { get, post, type Subscription } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { ErrorState, LoadingBlock, Money, PrimaryButton, SoftButton, StatusPill, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from './components/premium';
import { formatDate, subscriptionPeriod } from './Billing';

const BACK_TO = '/app/billing';

type Mode = 'cancel' | 'resume';

/** The subscription of the customer, found in the list the billing page already uses. */
function useSubscription(id: string) {
  const list = useAsync<{ subscriptions: Subscription[] }>(
    (signal) => get<{ subscriptions: Subscription[] }>('/billing/subscriptions', undefined, signal),
    [],
  );
  const subscription = useMemo(() => list.data?.subscriptions.find((row) => row.id === id), [list.data, id]);
  return { list, subscription };
}

function Summary({ subscription }: { subscription: Subscription }) {
  return (
    <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
      <h2 className="break-words text-[16px] font-semibold text-ink">{subscription.instanceName ?? 'Subscription'}</h2>
      <dl className="mt-4 grid gap-3 text-[13px]">
        <div>
          <dt className="text-ink3">Status</dt>
          <dd className="mt-1"><StatusPill status={subscription.status} label={subscription.status} /></dd>
        </div>
        <div>
          <dt className="text-ink3">Price this period</dt>
          <dd className="mt-0.5 font-mono text-ink"><Money amount={subscription.amount} currency={subscription.currency} /></dd>
        </div>
        <div>
          <dt className="text-ink3">Paid through</dt>
          <dd className="mt-0.5 font-mono text-ink">{formatDate(subscription.currentPeriodEnd)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-[12.5px] leading-relaxed text-ink3">{subscriptionPeriod(subscription)}</p>
    </aside>
  );
}

function SubscriptionChange({ mode }: { mode: Mode }) {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const { list, subscription } = useSubscription(id);
  const [acknowledged, setAcknowledged] = useState(false);
  const [touched, setTouched] = useState(false);
  const cancelling = mode === 'cancel';
  const name = subscription?.instanceName ?? 'this service';
  useUnsavedChangesGuard(acknowledged, 'Discard this confirmation?');

  // The platform decides what can change: a subscription that already ends cannot be cancelled again,
  // and one that renews cannot be resumed.
  const applicable = Boolean(subscription && (cancelling ? !subscription.cancelAtPeriodEnd : subscription.cancelAtPeriodEnd));
  const send = useAction(async () => post(`/billing/subscriptions/${encodeURIComponent(id)}/${mode}`));

  const submit = async () => {
    setTouched(true);
    if (!subscription || !applicable || (cancelling && !acknowledged)) return;
    const result = await send.run();
    if (!result) return;
    toast.push(
      cancelling
        ? 'The service keeps running until the end of the paid period.'
        : 'The subscription will renew at the close of the current period.',
      'ok',
    );
    navigate(BACK_TO, { replace: true });
  };
  const discard = () => {
    if (!acknowledged || window.confirm('Discard this confirmation?')) navigate(BACK_TO);
  };

  return (
    <PageEditorShell
      eyebrow="Billing"
      title={cancelling ? 'Cancel subscription' : 'Resume subscription'}
      description={
        cancelling
          ? 'Review what happens at the end of the paid period before you confirm.'
          : 'Turn automatic renewal back on for this subscription.'
      }
      backTo={BACK_TO}
      backLabel="Back to billing"
      dirty={acknowledged}
      aside={subscription ? <Summary subscription={subscription} /> : undefined}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton>
          <PrimaryButton
            type="button"
            onClick={() => void submit()}
            disabled={send.pending || list.loading || !applicable || (cancelling && !acknowledged)}
          >
            {send.pending ? 'Working…' : cancelling ? 'Cancel subscription' : 'Resume subscription'}
          </PrimaryButton>
        </>
      }
    >
      {list.loading ? (
        <LoadingBlock rows={3} label="Loading the subscription" />
      ) : list.error ? (
        <ErrorState title="Could not load your subscriptions" message={list.error.message} onRetry={list.reload} />
      ) : !subscription ? (
        <ErrorState title="Subscription not found" message="It does not exist or it does not belong to this account." />
      ) : !applicable ? (
        <ErrorState
          title={cancelling ? 'Already set to cancel' : 'Already renewing'}
          message={
            cancelling
              ? `${name} already ends on ${formatDate(subscription.currentPeriodEnd)}. You can resume it from the billing page.`
              : `${name} renews on ${formatDate(subscription.currentPeriodEnd)}. There is nothing to resume.`
          }
        />
      ) : cancelling ? (
        <div className="grid gap-5">
          <div role="alert" className="rounded-2xl border border-bad/25 bg-bad/10 p-4">
            <h2 className="text-[14px] font-semibold text-bad">{name} stops at the end of the paid period</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink2">
              It keeps running until {formatDate(subscription.currentPeriodEnd)}. After that date it is stopped and no longer billed.
              Download what you need before then: backups and files are not kept for a stopped service.
            </p>
          </div>
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-3.5 text-[13.5px] text-ink2">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 size-5 accent-[var(--color-acc)]"
            />
            <span>
              <strong className="block text-ink">I understand the service ends on {formatDate(subscription.currentPeriodEnd)}</strong>
              You can resume the subscription any time before that date.
            </span>
          </label>
          {touched && !acknowledged && (
            <p role="alert" className="text-[13px] font-medium text-bad">Acknowledge the end of the service before cancelling.</p>
          )}
          {send.error && <p role="alert" className="rounded-2xl bg-bad/10 p-4 text-[13.5px] font-medium text-bad">{send.error}</p>}
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="text-[14px] leading-relaxed text-ink2">
            {name} will renew on {formatDate(subscription.currentPeriodEnd)} and the payment method on file is charged then.
            Nothing is charged now.
          </p>
          {send.error && <p role="alert" className="rounded-2xl bg-bad/10 p-4 text-[13.5px] font-medium text-bad">{send.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}

export function CancelSubscription() {
  return <SubscriptionChange mode="cancel" />;
}

export function ResumeSubscription() {
  return <SubscriptionChange mode="resume" />;
}
