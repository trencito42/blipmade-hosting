/**
 * The overview of the email hosting.
 *
 * The page is short on purpose: what the customer pays for, what it uses
 * and the domains they own. Everything else lives in the page of a domain,
 * which the table of the domains leads to.
 *
 * The domains of two subscriptions are never read as one list: every
 * subscription has its own table.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  get,
  listMailDomains,
  post,
  type MailDomainView,
  type MailPlanView,
  type MailServiceView,
} from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { ButtonLink, EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, useToast } from '../../ui-app';
import { Icon } from '../../icons';
import { MailAddDomainDialog } from './MailAddDomainDialog';
import { MailDomainList } from './MailDomainList';
import { MailPlanChangeDialog } from './MailPlanChangeDialog';
import { MailServiceCancelDialog } from './MailServiceCard';
import { MailSubscriptionSummary } from './MailSubscriptionSummary';
import { groupDomains } from './shared';

/** The storefront of hosted mail, where the plans are. */
const EMAIL_STOREFRONT = '/email';

export default function MailOverview() {
  const { push } = useToast();

  const servicesState = useAsync<{ services: MailServiceView[] }>(
    (signal) => get<{ services: MailServiceView[] }>('/mail/services', undefined, signal),
    [],
  );
  const domainsState = useAsync<{ domains: MailDomainView[] }>((signal) => listMailDomains(signal), []);
  const plansState = useAsync<{ plans: MailPlanView[] }>(
    (signal) => get<{ plans: MailPlanView[] }>('/mail/plans', undefined, signal),
    [],
  );

  const services = useMemo(() => servicesState.data?.services ?? [], [servicesState.data]);
  const domains = useMemo(() => domainsState.data?.domains ?? [], [domainsState.data]);
  // Every plan the platform publishes is read, so the price of the plan the
  // customer has is known even when that plan is not on sale any more. The
  // plans that can be bought are chosen by the dialog.
  const plans = useMemo(() => plansState.data?.plans ?? [], [plansState.data]);

  const [adding, setAdding] = useState(false);
  const [changingPlan, setChangingPlan] = useState<MailServiceView | null>(null);
  const [pendingCancel, setPendingCancel] = useState<MailServiceView | null>(null);

  // The domains of every subscription, and the ones that belong to no plan.
  const { rowsOfService, rowsWithoutService } = useMemo(
    () => groupDomains(services, domains),
    [services, domains],
  );

  const cancel = useAction(async (service: MailServiceView) => {
    try {
      await post(`/mail/services/${encodeURIComponent(service.id)}/cancel`);
    } catch (err) {
      // The dialog closes, so the failure is readable instead of hidden
      // behind it.
      setPendingCancel(null);
      throw err;
    }
    setPendingCancel(null);
    servicesState.reload();
    push('The mail service is cancelled. Its data is kept until the retention ends.');
  });

  const reactivate = useAction(async (serviceId: string) => {
    await post(`/mail/services/${encodeURIComponent(serviceId)}/reactivate`);
    servicesState.reload();
    push('The mail service is active again.');
  });

  const resume = useAction(async (serviceId: string) => {
    await post(`/mail/services/${encodeURIComponent(serviceId)}/resume`);
    servicesState.reload();
    push('The mail service works again.');
  });

  const busy = cancel.pending || reactivate.pending || resume.pending;

  // The service of the dialog of the plan is read again when the list
  // changes, so the dialog never shows a plan that is not the one of the
  // service any more.
  useEffect(() => {
    if (!changingPlan) return;
    const fresh = services.find((service) => service.id === changingPlan.id);
    if (!fresh) {
      setChangingPlan(null);
      return;
    }
    if (fresh.plan.slug !== changingPlan.plan.slug || fresh.status !== changingPlan.status) setChangingPlan(fresh);
  }, [services, changingPlan]);

  const loading = servicesState.loading || domainsState.loading;
  const failure = servicesState.error ?? domainsState.error ?? null;

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[19px] font-semibold tracking-[-0.035em] text-ink">Email</h2>
          <p className="text-[13.5px] text-ink3">Manage your email hosting, domains, and mailboxes.</p>
        </div>
        <PrimaryButton onClick={() => setAdding(true)} className="w-full sm:w-auto">
          <Icon name="plus" size={15} />
          Add domain
        </PrimaryButton>
      </header>

      {loading ? (
        // The name of the section is there while it loads, so the page does
        // not change its shape under the eyes of the customer.
        <Panel title="Email hosting">
          <LoadingBlock rows={2} label="Loading your email hosting" />
        </Panel>
      ) : failure ? (
        <ErrorState
          title="Could not load your email hosting"
          message={failure.message}
          onRetry={() => {
            servicesState.reload();
            domainsState.reload();
          }}
        />
      ) : (
        <div className="grid gap-4">
          {!services.length && (
            <EmptyState
              title="No hosted mail yet"
              description="You have not bought a plan of hosted mail. The storefront shows the plans, their limits and their price."
              action={<ButtonLink to={EMAIL_STOREFRONT}>See the plans of hosted mail</ButtonLink>}
            />
          )}

          {services.map((service) => (
            <div key={service.id} className="grid gap-3">
              <MailSubscriptionSummary
                service={service}
                title={services.length > 1 ? `Email hosting · ${service.plan.name}` : 'Email hosting'}
                busy={busy}
                onChangePlan={() => setChangingPlan(service)}
                onCancel={() => setPendingCancel(service)}
                onReactivate={() => void reactivate.run(service.id)}
                onResume={() => void resume.run(service.id)}
              />
              <MailDomainList
                domains={rowsOfService.get(service.id) ?? []}
                title={services.length > 1 ? `Email domains · ${service.plan.name}` : 'Email domains'}
                description="Every domain of this subscription. Open one to manage its mailboxes, its aliases and its DNS."
              />
            </div>
          ))}

          {rowsWithoutService.length > 0 && (
            <MailDomainList
              domains={rowsWithoutService}
              title="Domains without a plan"
              description="These hostnames carry mail without a plan of hosted mail. Open one to manage its mailboxes, its aliases and its DNS."
            />
          )}
        </div>
      )}

      {cancel.error && (
        <p role="alert" className="text-[13.5px] font-medium text-bad">
          {cancel.error}
        </p>
      )}

      <MailAddDomainDialog
        open={adding}
        services={services}
        existingDomains={domains.map((domain) => domain.name.toLowerCase())}
        onClose={() => setAdding(false)}
        onAdded={() => {
          domainsState.reload();
          servicesState.reload();
        }}
      />

      {changingPlan && (
        <MailPlanChangeDialog
          open
          service={changingPlan}
          plans={plans}
          onClose={() => setChangingPlan(null)}
          onChanged={() => servicesState.reload()}
        />
      )}

      <MailServiceCancelDialog
        request={pendingCancel}
        busy={cancel.pending}
        onCancel={() => setPendingCancel(null)}
        onConfirm={() => {
          if (pendingCancel) void cancel.run(pendingCancel);
        }}
      />
    </div>
  );
}
