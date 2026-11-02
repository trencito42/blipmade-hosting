/**
 * The dialog of the mail area.
 *
 * The shared `ConfirmDialog` of the design system is made for a destructive
 * action: its button is red and it cannot carry a form. The dialogs of the
 * mail area carry forms, so they have a shell of their own.
 *
 * The shell keeps the promises of the design system: the dialog is a dialog
 * for the readers of the screen, it closes with Escape, the focus stays
 * inside it while it is open, it comes back to the control that opened it
 * and the page behind it does not scroll.
 */

import { useEffect, useId, useRef, type ReactNode } from 'react';

export function MailDialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  /**
   * When it is true, Escape does not close the dialog. It is used when the
   * dialog holds a password that is only shown once: the customer has to say
   * that they stored it.
   */
  closeBlocked = false,
  labelledBy,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  /** The actions of the dialog, at the foot of the panel. */
  footer?: ReactNode;
  closeBlocked?: boolean;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const openerRef = useRef<HTMLElement | null>(null);
  // The parent passes a new function on every render. Keeping it in a ref
  // stops the effect below from running again on each keystroke, which took
  // the focus out of the fields of the dialog.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    // The control that opened the dialog keeps the focus, so it can be given
    // back when the dialog closes.
    openerRef.current = document.activeElement as HTMLElement | null;
    // The focus goes to the panel, so the dialog is announced and the action
    // is not focused before it can be used.
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (closeBlocked) return;
        onCloseRef.current();
        return;
      }
      // The focus stays inside the dialog: Tab walks the actions of the
      // dialog and comes back to the first one.
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
      // The focus goes back to the control that opened the dialog.
      openerRef.current?.focus?.();
    };
  }, [open, closeBlocked]);

  // The page behind the dialog must not scroll.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy ?? titleId}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        // The dialog fits the screen: the body scrolls, the actions stay.
        className="flex max-h-[calc(100svh-1.5rem)] w-full max-w-[460px] flex-col rounded-2xl border border-line bg-card p-5 focus:outline-none"
      >
        <h2 id={titleId} className="text-[18px] font-semibold tracking-[-0.03em] text-ink">
          {title}
        </h2>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {description && <div className="text-[14.5px] leading-relaxed text-ink2">{description}</div>}
          {children}
        </div>
        {footer && <div className="mt-5 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}
