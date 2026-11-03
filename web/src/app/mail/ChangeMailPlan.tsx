import { useMemo, useRef, useState } from 'react';
import { get, post, type MailPlanPrice, type MailPlanView, type MailServiceView } from '../../lib/api';
import { formatPrice, memLabel, periodLabel, periodSuffix } from '../../lib/pricing';
import { useAction, useAsync } from '../../lib/useAsync';
import { Link, useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../components/premium';
import { onSaleMailPlans } from './shared';

function priceOf(plan: MailPlanView | undefined): MailPlanPrice | null { return plan?.price ?? plan?.prices[0] ?? null; }
function priceLine(price: MailPlanPrice | null) { return price ? `${formatPrice(price.amount, price.currency)} ${periodSuffix(price.period)} · ${periodLabel(price.period)}` : 'Price unavailable'; }
function limitsLine(plan: MailPlanView) { return `${plan.limits.maxDomains} domains · ${plan.limits.maxMailboxes} mailboxes/domain · ${plan.limits.maxAliases} aliases/domain · ${memLabel(plan.limits.totalStorageMb)}`; }

export default function ChangeMailPlan() {
  const { serviceId = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const [slug, setSlug] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [recovery, setRecovery] = useState<{ id: string; number: string; message: string } | null>(null);
  const orderRef = useRef<{ id: string; number: string } | null>(null);
  const servicesState = useAsync((signal) => get<{ services: MailServiceView[] }>('/mail/services', undefined, signal), []);
  const plansState = useAsync((signal) => get<{ plans: MailPlanView[] }>('/mail/plans', undefined, signal), []);
  const service = servicesState.data?.services.find((item) => item.id === serviceId);
  const plans = plansState.data?.plans ?? [];
  const current = plans.find((plan) => plan.slug === service?.plan.slug);
  const choices = useMemo(() => onSaleMailPlans(plans).filter((plan) => plan.slug !== service?.plan.slug), [plans, service?.plan.slug]);
  const target = choices.find((plan) => plan.slug === slug);
  const backTo = '/app/mail';
  useUnsavedChangesGuard(Boolean(slug) && !redirecting, 'Discard this plan-change review? No order has been changed yet.');

  const blockers = useMemo(() => {
    if (!service || !target) return [];
    const result: string[] = [];
    if (service.usage.domains > target.limits.maxDomains) result.push(`Remove ${service.usage.domains - target.limits.maxDomains} domain(s) before changing to this plan.`);
    if (service.usage.storageMb > target.limits.totalStorageMb) result.push(`Current storage use (${memLabel(service.usage.storageMb)}) exceeds the new ${memLabel(target.limits.totalStorageMb)} limit.`);
    for (const domain of service.domains) {
      if (domain.mailboxCount > target.limits.maxMailboxes) result.push(`${domain.name} has ${domain.mailboxCount} mailboxes; the new limit is ${target.limits.maxMailboxes}.`);
      if (domain.aliasCount > target.limits.maxAliases) result.push(`${domain.name} has ${domain.aliasCount} aliases; the new limit is ${target.limits.maxAliases}.`);
    }
    return result;
  }, [service, target]);

  const checkout = useAction(async () => {
    if (!target) throw new Error('Choose a plan first.');
    let order = orderRef.current;
    if (!order) {
      order = (await post<{ order: { id: string; number: string } }>(`/mail/services/${encodeURIComponent(serviceId)}/plan`, { productSlug: target.slug })).order;
      orderRef.current = order;
    }
    const result = await post<{ url: string | null; message?: string }>(`/orders/${encodeURIComponent(order.id)}/checkout`);
    return { order, result };
  });
  const submit = async () => {
    if (!target || blockers.length) return;
    const answer = await checkout.run();
    if (!answer) return;
    if (!answer.result.url) {
      const message = answer.result.message ?? 'The order exists, but checkout could not be opened.';
      setRecovery({ ...answer.order, message }); toast.push(message, 'error'); return;
    }
    setRedirecting(true); toast.push('Plan-change checkout opened.');
    window.setTimeout(() => window.location.assign(answer.result.url!), 0);
  };
  const discard = () => { if (!slug || window.confirm('Discard this plan-change review?')) navigate(backTo); };
  const loading = servicesState.loading || plansState.loading;
  const failure = servicesState.error ?? plansState.error;

  return <PageEditorShell eyebrow="Email subscription" title={reviewing ? 'Review plan change' : 'Change email plan'} description="The service changes only after its order is paid. Selecting or reviewing a plan never changes billing by itself." backTo={backTo} backLabel="Back to email" dirty={Boolean(slug) && !redirecting}
    aside={<aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24"><h2 className="text-[16px] font-semibold text-ink">Current subscription</h2><p className="mt-2 text-[15px] font-semibold text-ink">{service?.plan.name ?? 'Loading…'}</p>{service && <dl className="mt-3 grid gap-2 text-[13px] text-ink2"><div>{service.usage.domains} of {service.limits.maxDomains} domains</div><div>{memLabel(service.usage.storageMb)} used</div><div>Status: {service.status.toLowerCase()}</div></dl>}<p className="mt-4 text-[12.5px] leading-relaxed text-ink3">Checkout is authoritative. Cancelling payment leaves the existing plan unchanged.</p></aside>}
    actions={<>{reviewing ? <SoftButton type="button" onClick={() => setReviewing(false)} disabled={checkout.pending}>Back</SoftButton> : <SoftButton type="button" onClick={discard}>Discard</SoftButton>}{reviewing ? <PrimaryButton type="button" onClick={() => void submit()} disabled={!target || blockers.length > 0 || checkout.pending}>{checkout.pending ? 'Opening checkout…' : 'Confirm and open checkout'}</PrimaryButton> : <PrimaryButton type="button" onClick={() => setReviewing(true)} disabled={!target}>Review change</PrimaryButton>}</>}
  >
    {loading ? <LoadingBlock rows={4} label="Loading email plans" /> : failure ? <ErrorState title="Could not load plan choices" message={failure.message} onRetry={() => { servicesState.reload(); plansState.reload(); }} /> : !service ? <ErrorState title="Email subscription not found" message="This subscription is not available to the signed-in customer." /> : reviewing && target ? <div className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-s2 p-4"><p className="text-[12px] text-ink3">Current</p><p className="font-semibold text-ink">{service.plan.name}</p><p className="mt-1 text-[13px] text-ink2">{priceLine(priceOf(current))}</p></div><div className="rounded-2xl bg-acc-bg p-4"><p className="text-[12px] text-ink3">After payment</p><p className="font-semibold text-ink">{target.name}</p><p className="mt-1 text-[13px] text-ink2">{priceLine(priceOf(target))}</p><p className="mt-1 text-[12px] text-ink3">{limitsLine(target)}</p></div></div>{blockers.length ? <ul role="alert" className="grid gap-2">{blockers.map((item) => <li key={item} className="rounded-xl bg-warn/10 p-3 text-[13px] text-ink2">{item}</li>)}</ul> : <p className="rounded-xl bg-ok/10 p-3 text-[13px] text-ink2">Current usage fits within the selected plan.</p>}{recovery && <div role="alert" className="rounded-2xl bg-warn/10 p-4 text-[13px] text-ink2"><p>{recovery.message}</p><Link to="/app/billing" className="mt-2 inline-block font-semibold text-acc underline">Open billing for order {recovery.number}</Link></div>}{checkout.error && <p role="alert" className="text-[13px] font-medium text-bad">{checkout.error}</p>}</div> : <fieldset className="grid gap-3"><legend className="mb-1 text-[14px] font-medium text-ink">Available plans</legend>{choices.length ? choices.map((plan) => <label key={plan.id} className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors motion-reduce:transition-none ${slug === plan.slug ? 'border-acc bg-acc/10' : 'border-line bg-card hover:bg-s3'}`}><input type="radio" name="mail-plan" value={plan.slug} checked={slug === plan.slug} onChange={() => { setSlug(plan.slug); setRecovery(null); }} className="mt-1 size-5 accent-[var(--color-acc)]"/><span><span className="block font-semibold text-ink">{plan.name}</span><span className="mt-1 block text-[13px] text-ink2">{priceLine(priceOf(plan))}</span><span className="mt-1 block text-[12px] text-ink3">{limitsLine(plan)}</span></span></label>) : <p className="rounded-2xl bg-s2 p-4 text-[13.5px] text-ink2">No other purchasable email plan is available.</p>}</fieldset>}
  </PageEditorShell>;
}
