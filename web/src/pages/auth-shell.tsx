import type { CSSProperties, ReactNode } from 'react';
import { Logo } from '../ui';
import { LegalFooter } from '../legal/LegalFooter';
import { cn } from '../lib';

/**
 * The shell of the pages of the account.
 *
 * Two panels: the picture on the left, the form on the right. The picture is
 * decorative and it is hidden on a narrow screen, because a page that only
 * holds a form must not push the form below the fold of a phone.
 */
export function AuthArt({ title, text }: { title: string; text: string }) {
  return (
    <aside aria-hidden="true" data-decorative className="dots relative hidden overflow-hidden rounded-3xl border border-line bg-s1 min-[900px]:block">
      <div className="absolute inset-0 grid place-items-center">
        <div className="relative size-[420px] max-w-full">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="ring absolute inset-0 rounded-full border border-acc/60" style={{ ['--i' as string]: i }} />
          ))}
          <span className="absolute inset-0 m-auto size-6 rounded-full bg-acc shadow-[0_0_40px_#22c55e80]" />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 grid gap-3 bg-gradient-to-t from-bg via-bg/80 to-transparent p-10 pt-32">
        <p className="max-w-md text-[clamp(32px,3.4vw,48px)] leading-[1.02] font-semibold tracking-[-0.04em]">{title}</p>
        <p className="max-w-sm text-[16px] text-ink2">{text}</p>
      </div>
    </aside>
  );
}

/** The panel that holds the form. */
export function AuthPanel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid content-between rounded-3xl border border-line bg-s1 p-8 sm:p-12" aria-label={label}>
      <Logo />
      {children}
      <LegalFooter className="mt-8" />
    </section>
  );
}

/**
 * The title of a screen of the account.
 *
 * The title of the reference is one line, one size, and the line under it
 * says what the screen is for. The blocks rise one after the other, so the
 * screen assembles itself in front of the visitor.
 */
export function AuthHead({ title, text, index = 0 }: { title: string; text?: string; index?: number }) {
  return (
    <div className="auth-in" style={{ ['--i' as string]: index } as CSSProperties}>
      <h1 className="text-[34px] leading-tight font-semibold tracking-[-0.04em]">{title}</h1>
      {text ? <p className="mt-1.5 text-[15px] text-ink2">{text}</p> : null}
    </div>
  );
}

/**
 * A block of the form that rises with the title.
 *
 * The blocks of a screen of the account are numbered from the top, so the
 * order of the rise is the order of the screen.
 */
export function AuthBlock({ index, children, className }: { index: number; children: ReactNode; className?: string }) {
  return (
    <div
      style={{ ['--i' as string]: index } as CSSProperties}
      className={cn('auth-in grid gap-4', className)}
    >
      {children}
    </div>
  );
}

/**
 * The answer of the server, and the answer of the page.
 *
 * The words of the server are shown as they came. The green box is for an
 * answer that carries good news, the red box for an answer that does not.
 */
export function AuthAlert({ kind = 'bad', children }: { kind?: 'good' | 'bad'; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl px-4 py-3 text-[14px] leading-relaxed',
        kind === 'good' ? 'bg-acc-bg text-acc-h' : 'bg-bad/10 text-bad',
      )}
    >
      {children}
    </div>
  );
}

/** The quiet answer of the server, in a live region. */
export function AuthNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-xl bg-acc-bg px-4 py-3 text-[14px] leading-relaxed text-acc-h">
      {children}
    </p>
  );
}

/**
 * The page of an account screen.
 *
 * The picture is the same on every screen of the account, and the panel of
 * the form is the same too, so the pages of the account look like one thing.
 */
export function AuthShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <main
      id="main"
      className="grid min-h-[100svh] gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] min-[900px]:grid-cols-[minmax(0,1fr)_minmax(380px,520px)]"
    >
      <AuthArt title="Start small, scale freely." text="Apps, databases and game servers on one account, with billing you can read." />
      <AuthPanel label={label}>{children}</AuthPanel>
    </main>
  );
}
