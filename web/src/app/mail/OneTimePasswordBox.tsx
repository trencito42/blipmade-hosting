/**
 * The box of a password that is shown once.
 *
 * The password is the only thing on the page the customer cannot ask for
 * again, so it is written in a box of its own and the note says plainly
 * that it has to be stored now.
 */

import { SoftButton, useToast } from '../../ui-app';
import { Icon } from '../../icons';

export function OneTimePasswordBox({
  address,
  password,
  onDismiss,
}: {
  address: string;
  password: string;
  onDismiss?: () => void;
}) {
  const { push } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      push('The password was copied.', 'ok');
    } catch {
      // The clipboard can be refused by the browser. The password is on the
      // screen, so the customer can still copy it by hand.
      push('Copy failed. Select the password and copy it by hand.', 'error');
    }
  };

  return (
    <div role="status" className="rounded-2xl bg-acc-bg p-4">
      <p className="text-[15px] font-semibold tracking-[-0.02em] text-ink">The password of {address}</p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-ink2">
        This password is shown only once. Copy it now and store it: it cannot be shown again, and nobody can read it
        for you.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 select-all break-all rounded-xl bg-s1 px-3.5 py-3 font-mono text-[15px] text-ink">
          {password}
        </p>
        <SoftButton surface="s1" onClick={() => void copy()} aria-label={`Copy the password of ${address}`}>
          <Icon name="copy" size={14} />
          Copy
        </SoftButton>
      </div>
      {onDismiss && (
        <div className="mt-3">
          <SoftButton onClick={onDismiss}>I have stored it</SoftButton>
        </div>
      )}
    </div>
  );
}
