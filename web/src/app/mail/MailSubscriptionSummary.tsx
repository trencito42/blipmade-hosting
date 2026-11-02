/**
 * The summary of a mail subscription.
 *
 * It is compact on purpose: the plan, the state and the use of the
 * subscription, in one line of numbers. The everyday actions sit next to
 * it, and the ones that are rare or destructive sit in a menu of their own,
 * so a cancel is never one stray click away from the webmail.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../icons';
import type { MailServiceView } from '../../lib/api';
import { memLabel } from '../../lib/pricing';
import { ButtonLink, Panel, SoftButton, StatusPill } from '../../ui-app';
import { MailStat } from './MailStat';
import { MAIL_SERVICE_STATUS_LABELS, MAIL_SERVICE_STATUS_TONES, mailServiceDay } from './shared';

/**
 * The menu of the actions that are rare or destructive.
 *
 * It closes with Escape, when the customer clicks outside of it and when
 * the page changes.
 */
function MoreActions({
  children,
}: {
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onPointer);
    };
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 text-[14.5px] font-semibold text-ink transition-colors duration-[180ms] hover:border-acc/50 hover:bg-s3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
      >
        <Icon name="ellipsis" size={15} />
        More actions
      </button>      {open && (
        <div
          ref={panel}
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-line bg-s1 p-2"
        >
          {children(() => {
            setOpen(false);
            button.current?.focus();
          })}
        </div>
      )}
    </div>
  );
}

/** One entry of the menu of the rare actions. */
function MenuItem({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors duration-[180ms] disabled:cursor-not-allowed disabled:opacity-50 ${
        danger ? 'text-bad hover:bg-bad/10' : 'text-ink2 hover:bg-s3 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

export function MailSubscriptionSummary({
  service,
  title,
  onChangePlan,
  onCancel,
  onReactivate,
  onResume,
  busy,
}: {
  service: MailServiceView;
  /** The name of the panel. It carries the plan when there are several. */
  title?: string;
  /** The customer asked to change the plan. */
  onChangePlan?: () => void;
  /** The customer asked to cancel the service. */
  onCancel?: () => void;
  /** The customer asked to bring a cancelled service back. */
  onReactivate?: () => void;
  /** The customer asked to keep a service that is in its grace period. */
  onResume?: () => void;
  /** True while an action of the summary is running. */
  busy?: boolean;
}) {
  const webmailUrl = service.webmailUrl ?? service.domains.find((domain) => domain.webmailUrl)?.webmailUrl ?? null;

  return (
    <Panel
      title={title ?? 'Email hosting'}
      description="The plan, the state and the use of this subscription. Blipmade never edits your DNS, so you add the records at your registrar."
      action={
        <div className="flex flex-wrap items-center gap-2">
          {webmailUrl ? (
            <ButtonLink href={webmailUrl} target="_blank" rel="noreferrer noopener" variant="soft">
              <Icon name="mail" size={14} />
              Open webmail
            </ButtonLink>
          ) : (
            <span className="text-[13px] text-ink3">The webmail is not set up on this platform.</span>
          )}
          <SoftButton onClick={onChangePlan} disabled={busy || !onChangePlan}>
            Manage plan
          </SoftButton>
          <MoreActions>
            {(close) => (
              <>
                {service.status === 'GRACE' && (
                  <MenuItem
                    onClick={() => {
                      close();
                      onResume?.();
                    }}
                    disabled={busy}
                  >
                    Keep the service
                  </MenuItem>
                )}
                {service.status === 'SUSPENDED' && (
                  <p className="px-3 py-2.5 text-[13px] leading-relaxed text-ink2">
                    This service is suspended. If it was for an unpaid invoice, paying it brings it back. Otherwise,
                    write to support.
                  </p>
                )}
                {service.status === 'CANCELLED' ? (
                  <MenuItem
                    onClick={() => {
                      close();
                      onReactivate?.();
                    }}
                    disabled={busy}
                  >
                    Reactivate the service
                  </MenuItem>
                ) : (
                  <MenuItem
                    danger
                    onClick={() => {
                      close();
                      onCancel?.();
                    }}
                    disabled={busy}
                  >
                    Cancel the mail service
                  </MenuItem>
                )}
              </>
            )}
          </MoreActions>
        </div>
      }
      actionBelow
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <div className="min-w-0">
          <p className="text-[12.5px] text-ink3">Plan</p>
          <p className="mt-0.5 truncate text-[15px] font-semibold text-ink" title={service.plan.name}>
            {service.plan.name}
          </p>
          <div className="mt-1">
            <StatusPill
              status={MAIL_SERVICE_STATUS_TONES[service.status]}
              label={MAIL_SERVICE_STATUS_LABELS[service.status]}
            />
          </div>
        </div>
        <MailStat
          label="Mailboxes"
          value={`${service.usage.mailboxes} / ${service.limits.maxMailboxes}`}
          used={service.usage.mailboxes}
          limit={service.limits.maxMailboxes}
        />
        <MailStat
          label="Storage"
          value={`${memLabel(service.usage.storageMb)} / ${memLabel(service.usage.storageLimitMb)}`}
          used={service.usage.storageMb}
          limit={service.usage.storageLimitMb}
        />
        <MailStat
          label="Domains"
          value={`${service.usage.domains} / ${service.limits.maxDomains}`}
          used={service.usage.domains}
          limit={service.limits.maxDomains}
        />
      </div>

      {(service.graceUntil || service.suspendedAt || service.cancelledAt || service.retentionUntil) && (
        <ul className="mt-4 grid gap-1">
          {service.graceUntil && (
            <li className="text-[13px] text-ink2">The grace period ends on {mailServiceDay(service.graceUntil)}.</li>
          )}
          {service.suspendedAt && (
            <li className="text-[13px] text-ink2">The service was suspended on {mailServiceDay(service.suspendedAt)}.</li>
          )}
          {service.cancelledAt && (
            <li className="text-[13px] text-ink2">The service was cancelled on {mailServiceDay(service.cancelledAt)}.</li>
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
    </Panel>
  );
}
