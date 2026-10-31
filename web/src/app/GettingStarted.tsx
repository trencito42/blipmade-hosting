import { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { useSession } from '../session';
import { ButtonLink, Panel, SoftButton } from '../ui-app';

interface Done { emailVerified: boolean; service: boolean; billing: boolean; security: boolean }

/**
 * The first steps of a new account, with what is already done checked off. Everything shown comes
 * from the account itself, so a step is only checked when it really is done. The card goes away
 * when everything is done, or when the person closes it.
 */
export function GettingStarted({ hasServices }: { hasServices: boolean }) {
  const { user } = useSession();
  const [done, setDone] = useState<Done | null>(null);
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem('bm-getting-started-closed') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (closed) return;
    let alive = true;
    Promise.all([
      get<{ billingAddress: unknown | null }>('/settings').catch(() => null),
      get<{ twoFactor: { enabled: boolean }; passkeys: unknown[] }>('/settings/security').catch(() => null),
    ]).then(([settings, security]) => {
      if (!alive) return;
      setDone({
        emailVerified: Boolean(user?.emailVerified),
        service: hasServices,
        billing: Boolean(settings?.billingAddress),
        security: Boolean(security && (security.twoFactor.enabled || security.passkeys.length > 0)),
      });
    });
    return () => {
      alive = false;
    };
  }, [closed, hasServices, user?.emailVerified]);

  if (closed || !done) return null;
  const steps = [
    { key: 'emailVerified', done: done.emailVerified, title: 'Confirm your email address', text: 'We use it for invoices and for anything important about your services.', to: '/app/settings', label: 'Open settings' },
    { key: 'service', done: done.service, title: 'Deploy your first service', text: 'Pick an app, a database, a game server or a VPS. It starts in minutes.', to: '/app/deploy', label: 'Choose a service' },
    { key: 'billing', done: done.billing, title: 'Add your billing address', text: 'It is printed on your invoices, so you will not have to ask for a new one.', to: '/app/settings', label: 'Add the address' },
    { key: 'security', done: done.security, title: 'Protect your account', text: 'Turn on two-factor authentication or add a passkey.', to: '/app/settings?tab=security', label: 'Open security' },
  ] as const;
  if (steps.every((step) => step.done)) return null;
  const finished = steps.filter((step) => step.done).length;
  return (
    <Panel
      title="Get started"
      description={`${finished} of ${steps.length} done`}
      action={<SoftButton onClick={() => { setClosed(true); try { localStorage.setItem('bm-getting-started-closed', '1'); } catch { /* it comes back next time */ } }}>Hide</SoftButton>}
    >
      <ol className="grid gap-2">
        {steps.map((step) => (
          <li key={step.key} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-s2 px-4 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[12px] font-bold ${step.done ? 'bg-acc text-on-acc' : 'border border-line text-ink3'}`}>{step.done ? '✓' : ''}</span>
              <div className="min-w-0">
                <p className={`text-[14.5px] font-semibold ${step.done ? 'text-ink3 line-through' : 'text-ink'}`}>{step.title}</p>
                {!step.done && <p className="text-[13px] text-ink2">{step.text}</p>}
              </div>
            </div>
            {!step.done && <ButtonLink to={step.to} variant="soft">{step.label}</ButtonLink>}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
