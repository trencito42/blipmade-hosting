import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui';
import { OperatorPlaceholder } from './legal/OperatorPlaceholder';
import { LegalFooter } from './legal/LegalFooter';
import logo from './logo.svg';

/**
 * The boundary of the interface.
 *
 * A render error inside the application used to leave a blank screen: the
 * page was there, but nothing of it was. This boundary catches the error and
 * shows a page that says what happened, how to get back, and where to write
 * about it.
 *
 * The boundary sits inside the router, so the links of the page it falls
 * back to are still the links of the site. The way back to the homepage is a
 * plain anchor and not a link of the router: after a crash, a page that is
 * drawn again from the start is worth more than a page that is drawn by the
 * code that just failed.
 */

interface ErrorPageProps {
  /** The code that is written above the title. */
  code: string;
  /** The title of the page. */
  title: string;
  /** The explanation, in plain words. */
  message: ReactNode;
  /** The technical detail. It is folded away, but it is there. */
  detail?: string;
  /** What the page is about: a crash of the interface, or a failure of the server. */
  kind: 'client' | 'server';
  /** The action that tries the page again, when there is one. */
  onRetry?: () => void;
}

/**
 * The page that is shown when something went wrong.
 *
 * The message is inside a region that is announced, and the focus is put on
 * the title, so a person who uses a screen reader hears what happened and a
 * person who uses the keyboard knows where the page begins.
 */
export function ErrorPage({ code, title, message, detail, kind, onRetry }: ErrorPageProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  // The focus lands on the title: the page takes the place of the one that
  // crashed, and the person has to be told that it did.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className="flex min-h-[100svh] flex-col bg-bg">
      <header className="px-5 py-5 sm:px-8">
        <a
          href="/"
          className="inline-flex items-center gap-2.5 rounded-lg text-[17px] font-semibold tracking-tight text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
        >
          <img src={logo} alt="" width={164} height={148} className="h-6 w-auto" />
          blipmade
        </a>
      </header>

      <main className="flex flex-1 items-center px-5 pb-20 sm:px-8">
        <div className="mx-auto w-full max-w-[640px] text-center">
          <p className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-acc-h">{code}</p>
          <h1
            ref={heading}
            tabIndex={-1}
            className="mt-4 text-[clamp(40px,8vw,76px)] leading-[1] font-semibold tracking-[-0.045em] text-ink [text-wrap:balance]"
          >
            {title}
          </h1>

          <div role="alert" className="mx-auto mt-5 max-w-[48ch]">
            <p className="text-[16px] leading-relaxed text-ink2">{message}</p>
          </div>

          {detail && (
            <details className="mx-auto mt-6 max-w-[48ch] rounded-2xl border border-line bg-card px-4 py-3 text-left">
              <summary className="cursor-pointer text-[13.5px] font-medium text-ink2">Technical detail</summary>
              <p className="mt-2 break-words font-mono text-[12px] leading-relaxed text-ink3">{detail}</p>
            </details>
          )}

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/">Back to the homepage</Button>
            {kind === 'client' ? (
              <Button variant="soft" onClick={onRetry}>
                Try again
              </Button>
            ) : (
              <Button variant="soft" onClick={() => location.reload()}>
                Try again
              </Button>
            )}
          </div>

          <p className="mx-auto mt-8 max-w-[48ch] text-[14px] leading-relaxed text-ink3">
            If this keeps happening, write to <OperatorPlaceholder label="TODO(operator): the support email address" />.
          </p>
        </div>
      </main>

      {/* The legal pages are on the page of the error as well: a visitor who
          lands here is still a visitor of the site. */}
      <footer className="px-5 pb-10 sm:px-8">
        <div className="mx-auto w-full max-w-[640px]">
          <LegalFooter />
        </div>
      </footer>
    </div>
  );
}

interface BoundaryProps {
  children: ReactNode;
}

interface BoundaryState {
  error: Error | null;
}

/**
 * The boundary of the application.
 *
 * React asks the boundary for its state when a child throws, and the
 * boundary shows the page above instead of the children. The state is derived
 * from the error, so the page is shown after an error and not before.
 */
export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The error is written to the console of the browser: the interface has
    // no other place to put it, and a person who opens the console can then
    // tell what went wrong.
    console.error('[ui] a render error was caught', error, info.componentStack);
  }

  /** Puts the children back, so the page is drawn again from the start. */
  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ErrorPage
        code="Error 500"
        title="Something went wrong"
        message={
          <>
            The page could not be shown because of an error in the interface. Nothing on your account was changed: no order was
            placed, no payment was taken and no server was touched.
          </>
        }
        detail={error.message}
        kind="client"
        onRetry={this.reset}
      />
    );
  }
}
