/**
 * The card of a mail service.
 *
 * It is the card of the whole subscription: the plan, the state, the use and
 * the domains of the service. The overview of the mail now shows a compact
 * summary of the subscription and one table of domains, so this card is
 * kept for the places that still read a service as one block.
 */

import { useState } from 'react';
import {
  post,
  type MailPlanView,
  type MailServiceDnsView,
  type MailServiceDomainView,
  type MailServiceView,
} from '../../lib/api';
import { validateMailDomainName } from '../../lib/mail-domain';
import { categoryLabel, memLabel } from '../../lib/pricing';
import {
  ButtonLink,
  ConfirmDialog,
  DangerButton,
  InputWithButton,
  PrimaryButton,
  Select,
  SoftButton,
  StatusPill,
} from '../../ui-app';
import {
  MAIL_OWNERSHIP_LABELS,
  MAIL_OWNERSHIP_TONES,
  MAIL_SERVICE_STATUS_LABELS,
  MAIL_SERVICE_STATUS_TONES,
  mailDomainStatusLabel,
  mailPlanOptionLabel,
  mailServiceDay,
} from './shared';

/**
 * Cancels a mail service, but only when the customer confirmed it.
 *
 * The request is null until the customer confirms, so a click that never
 * reached the dialog cannot cancel anything.
 */
export async function runMailServiceCancel(request: MailServiceView | null): Promise<boolean> {
  if (!request) return false;
  await post(`/mail/services/${encodeURIComponent(request.id)}/cancel`);
  return true;
}

/**
 * The confirmation of the cancel of a mail service.
 *
 * The mail stops at once, but the data is kept until the retention of the
 * platform ends, and the dialog says so before anything happens.
 */
export function MailServiceCancelDialog({
  request,
  busy,
  onCancel,
  onConfirm,
}: {
  request: MailServiceView | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!request) return null;
  const retention = request.retentionUntil ? mailServiceDay(request.retentionUntil) : null;
  return (
    <ConfirmDialog
      open
      title="Cancel this mail service?"
      description={
        retention
          ? `The mail of ${request.plan.name} stops at once. The data of the service is kept until ${retention}, when it is deleted.`
          : `The mail of ${request.plan.name} stops at once. The data of the service is kept until the retention of the platform ends, when it is deleted.`
      }
      confirmLabel="Cancel the service"
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

/**
 * The proof of ownership of a domain.
 *
 * The platform never writes the DNS of a customer: it shows the record to
 * publish and the token of it, and the customer asks the server to look at the
 * proof when the record is in place. A proof that is refused is an explanation
 * of what is missing, never an error page.
 */
export function MailOwnershipProof({
  domain,
  answer,
  busy,
  onCheck,
}: {
  domain: MailServiceDomainView;
  /** The answer of the last look at the proof. */
  answer?: { verified: boolean; message: string };
  busy?: boolean;
  onCheck?: () => void;
}) {
  const proved = domain.ownershipStatus === 'VERIFIED';
  return (
    <div className="mt-3 rounded-2xl bg-s3 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusPill
          status={MAIL_OWNERSHIP_TONES[domain.ownershipStatus]}
          label={MAIL_OWNERSHIP_LABELS[domain.ownershipStatus]}
        />
        {!proved && onCheck && (
          <SoftButton onClick={onCheck} disabled={busy}>
            {busy ? 'Checking…' : 'Check the proof'}
          </SoftButton>
        )}
      </div>

      {!proved && (domain.verificationHost || domain.verificationToken) && (
        <dl className="mt-3 grid gap-2">
          {domain.verificationHost && (
            <div>
              <dt className="text-[11px] uppercase tracking-[0.08em] text-ink3">The record to publish</dt>
              <dd className="mt-0.5 break-all font-mono text-[12.5px] text-ink">{domain.verificationHost}</dd>
            </div>
          )}
          {domain.verificationToken && (
            <div>
              <dt className="text-[11px] uppercase tracking-[0.08em] text-ink3">The token</dt>
              <dd className="mt-0.5 break-all font-mono text-[12.5px] text-ink">{domain.verificationToken}</dd>
            </div>
          )}
        </dl>
      )}

      {answer && (
        <p
          role="status"
          data-proof-state={answer.verified ? 'verified' : 'refused'}
          className="mt-3 rounded-xl bg-s2 px-3 py-2.5 text-[13px] leading-relaxed text-ink2"
        >
          <span className="font-bold text-ink">
            {answer.verified ? 'The proof is accepted.' : 'The proof is not accepted yet.'}
          </span>{' '}
          {answer.message}
        </p>
      )}
    </div>
  );
}

/** What the card of a mail service needs to know. */
export interface MailServiceCardProps {
  service: MailServiceView;
  /** The plans the platform sells right now. */
  plans: MailPlanView[];
  /**
   * The words under the choice of the plan, when the page has something to say
   * about the sale of hosted mail.
   */
  plansNote?: string;
  /** The records of DNS, when the customer asked for them. */
  dns?: MailServiceDnsView[];
  /** The answer of the last look at the proof, by domain. */
  proof?: Record<string, { verified: boolean; message: string }>;
  /** True while an action of the card is running. */
  busy?: boolean;
  onAddDomain?: (serviceId: string, name: string) => void;
  onVerifyDomain?: (serviceId: string, domainId: string) => void;
  onLoadDns?: (serviceId: string) => void;
  onSuspend?: (serviceId: string) => void;
  onResume?: (serviceId: string) => void;
  /** The customer asked to cancel: the card only asks, the dialog confirms. */
  onRequestCancel?: (serviceId: string) => void;
  onReactivate?: (serviceId: string) => void;
  onChangePlan?: (serviceId: string, productSlug: string) => void;
}

/**
 * One mail service of the customer.
 *
 * The card shows the plan, the state of the service, the use of it, the life of
 * it and the domains it holds. Everything it shows comes from the platform.
 */
export function MailServiceCard({
  service,
  plans,
  plansNote,
  dns,
  proof,
  busy,
  onAddDomain,
  onVerifyDomain,
  onLoadDns,
  onSuspend,
  onResume,
  onRequestCancel,
  onReactivate,
  onChangePlan,
}: MailServiceCardProps) {
  const [newDomain, setNewDomain] = useState('');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [planSlug, setPlanSlug] = useState('');
  const [showDns, setShowDns] = useState(false);

  const submitDomain = () => {
    const hostname = newDomain.trim().toLowerCase();
    const problem = validateMailDomainName(hostname);
    if (problem) {
      setDomainError(problem);
      return;
    }
    setDomainError(null);
    onAddDomain?.(service.id, hostname);
    setNewDomain('');
  };

  // The webmail comes from the platform. When the platform does not give one,
  // the page says that it is not set up instead of inventing an address.
  const webmailUrl =
    service.webmailUrl ?? service.domains.find((domain) => domain.webmailUrl)?.webmailUrl ?? null;

  return (
    <article data-service={service.id} className="rounded-2xl bg-s2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-[16px] font-semibold tracking-[-0.02em] text-ink">{service.plan.name}</p>
          <p className="mt-0.5 text-[13px] text-ink3">{categoryLabel(service.plan.category)}</p>
        </div>
        {/* The state gets a line of its own on a phone, so the name of the plan
            is not cut to make room for the pill. */}
        <div className="w-full sm:w-auto">
          <StatusPill
            status={MAIL_SERVICE_STATUS_TONES[service.status]}
            label={MAIL_SERVICE_STATUS_LABELS[service.status]}
          />
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13.5px] text-ink2">
        <div className="flex gap-1.5">
          <dt className="text-ink3">Mailboxes</dt>
          <dd className="font-mono font-semibold text-ink">{service.usage.mailboxes} / {service.limits.maxMailboxes}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-ink3">Space</dt>
          <dd className="font-mono font-semibold text-ink">{memLabel(service.usage.storageMb)} of {memLabel(service.usage.storageLimitMb)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-ink3">Domains</dt>
          <dd className="font-mono font-semibold text-ink">{service.usage.domains} / {service.limits.maxDomains}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {webmailUrl ? (
          <ButtonLink href={webmailUrl} target="_blank" rel="noreferrer noopener" variant="soft">
            Open webmail
          </ButtonLink>
        ) : (
          <span className="text-[13px] text-ink3">The webmail is not set up on this platform.</span>
        )}
        <SoftButton
          onClick={() => {
            setShowDns((open) => !open);
            if (!showDns) onLoadDns?.(service.id);
          }}
        >
          {showDns ? 'Hide the records' : 'DNS records'}
        </SoftButton>
        {/* Suspending is not offered: a customer who wants the mail off cancels it, and a service that
            the platform suspended (an unpaid invoice, a report) is brought back by paying or by the team. */}
        {service.status === 'GRACE' && (
          <SoftButton onClick={() => onResume?.(service.id)} disabled={busy}>
            Keep the service
          </SoftButton>
        )}
        {service.status === 'SUSPENDED' && (
          <p className="text-[13px] text-ink2">This service is suspended. If it was for an unpaid invoice, paying it brings it back. Otherwise, write to support.</p>
        )}
        {service.status !== 'CANCELLED' && (
          <DangerButton onClick={() => onRequestCancel?.(service.id)} disabled={busy}>
            Cancel
          </DangerButton>
        )}
        {service.status === 'CANCELLED' && (
          <SoftButton onClick={() => onReactivate?.(service.id)} disabled={busy}>
            Reactivate
          </SoftButton>
        )}
      </div>

      {showDns && (
        <div className="mt-3 grid">
          {!dns ? (
            <p className="rounded-2xl bg-s3 px-3.5 py-3 text-[13.5px] text-ink2">The records are on their way.</p>
          ) : !dns.length ? (
            <p className="rounded-2xl bg-s3 px-3.5 py-3 text-[13.5px] text-ink2">
              This service has no domain yet, so it has no records.
            </p>
          ) : (
            dns.map((entry) => (
              <div key={entry.id} className="border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
                <p className="break-all text-[14px] font-medium text-ink">{entry.name}</p>
                <p className="mt-0.5 text-[12.5px] text-ink3">
                  {entry.verified
                    ? 'The server has seen the records of this domain.'
                    : 'The server has not seen all the records of this domain yet.'}
                </p>
                <ul className="mt-2 grid gap-1.5">
                  {entry.records.map((record) => (
                    <li
                      key={`${record.name}-${record.type}-${record.value}`}
                      className="break-all font-mono text-[12px] text-ink2"
                    >
                      {record.name} {record.type} {record.value}
                      {record.priority === undefined ? '' : ` (${record.priority})`}
                      {record.purpose ? ` — ${record.purpose}` : ''}
                    </li>
                  ))}
                </ul>
                {Array.isArray(entry.missing) && entry.missing.length > 0 && (
                  <p className="mt-2 text-[12.5px] text-ink3">Still missing: {entry.missing.join(', ')}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {(service.graceUntil || service.suspendedAt || service.cancelledAt || service.retentionUntil) && (
        <ul className="mt-3 grid gap-1">
          {service.graceUntil && (
            <li className="text-[13px] text-ink2">The grace period ends on {mailServiceDay(service.graceUntil)}.</li>
          )}
          {service.suspendedAt && (
            <li className="text-[13px] text-ink2">
              The service was suspended on {mailServiceDay(service.suspendedAt)}.
            </li>
          )}
          {service.cancelledAt && (
            <li className="text-[13px] text-ink2">
              The service was cancelled on {mailServiceDay(service.cancelledAt)}.
            </li>
          )}
          {service.retentionUntil && (
            <li className="text-[13px] text-ink2">
              The data of the service is kept until {mailServiceDay(service.retentionUntil)}.
            </li>
          )}
        </ul>
      )}

      {service.lastError && (
        <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-3.5 py-2.5 text-[13.5px] text-ink2">
          <span className="font-bold text-bad">Last error: </span>
          {service.lastError}
        </p>
      )}

      <div className="mt-4 grid">
        {service.domains.length === 0 ? (
          <p className="rounded-2xl bg-s3 px-3.5 py-3 text-[13.5px] leading-relaxed text-ink2">
            This service has no domain yet. Add the hostname that will carry the mail.
          </p>
        ) : (
          service.domains.map((domain) => (
            <div key={domain.id} className="border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="break-all text-[14.5px] font-medium text-ink">{domain.name}</p>
                <StatusPill status={domain.status.toLowerCase()} label={mailDomainStatusLabel(domain.status)} />
              </div>
              {domain.lastError && (
                <p role="alert" className="mt-2 text-[13px] text-ink2">
                  <span className="font-bold text-bad">Last error: </span>
                  {domain.lastError}
                </p>
              )}
              <MailOwnershipProof
                domain={domain}
                answer={proof?.[domain.id]}
                busy={busy}
                onCheck={onVerifyDomain ? () => onVerifyDomain(service.id, domain.id) : undefined}
              />
            </div>
          ))
        )}
      </div>

      <div className="mt-4">
        <InputWithButton
          label="Add a domain"
          value={newDomain}
          onChange={(event) => {
            setNewDomain(event.target.value);
            if (domainError) setDomainError(null);
          }}
          error={domainError ?? undefined}
          hint="The hostname you own and that will carry the mail."
          placeholder="acme.ro"
          autoComplete="off"
          spellCheck={false}
          button={
            <PrimaryButton onClick={submitDomain} disabled={busy || newDomain.trim() === ''}>
              Add domain
            </PrimaryButton>
          }
        />
      </div>

      {plans.length === 0 && !plansNote ? (
        <p className="mt-4 text-[13px] text-ink3">Plan changes are not available right now.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end">
          <Select
            label="Change the plan"
            value={planSlug}
            onChange={(event) => setPlanSlug(event.target.value)}
            hint={
              plansNote ??
              (plans.length
                ? 'The new plan is bought with an order, so the price is the one of the platform.'
                : 'The sale of hosted mail is closed at the moment, so the plan cannot be changed.')
            }
          >
            <option value="">Keep the current plan ({service.plan.name})</option>
            {plans
              .filter((plan) => plan.slug !== service.plan.slug)
              .map((plan) => (
                <option key={plan.slug} value={plan.slug}>
                  {mailPlanOptionLabel(plan)}
                </option>
              ))}
          </Select>
          <div>
            <PrimaryButton
              onClick={() => {
                if (planSlug) onChangePlan?.(service.id, planSlug);
              }}
              disabled={busy || !planSlug}
              className="w-full sm:w-auto"
            >
              Change the plan
            </PrimaryButton>
          </div>
        </div>
      )}
    </article>
  );
}
