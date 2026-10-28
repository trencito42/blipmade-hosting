import { Link } from '../router';
import { Button, Logo } from '../ui';
import { LegalFooter } from '../legal/LegalFooter';

export default function NotFound() {
  return (
    <div className="flex min-h-[100svh] flex-col bg-bg">
      <header className="px-5 py-5 sm:px-8">
        <Logo />
      </header>

      <main className="flex flex-1 items-center px-5 pb-20 sm:px-8">
        <div className="mx-auto w-full max-w-[640px] text-center">
          <p className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-acc-h">Error 404</p>
          <h1 className="mt-4 text-[clamp(40px,8vw,76px)] leading-[1] font-semibold tracking-[-0.045em] text-ink [text-wrap:balance]">
            Page not found
          </h1>
          <p className="mx-auto mt-5 max-w-[44ch] text-[16px] leading-relaxed text-ink2">
            The address you opened does not exist on Blipmade. It may have moved, or the link may be wrong.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button to="/" icon="arrowUR">
              Back to the homepage
            </Button>
            <Button to="/app" variant="soft">
              Go to your dashboard
            </Button>
          </div>
          <p className="mt-8 text-[14px] text-ink3">
            Looking for setup instructions?{' '}
            <Link to="/docs" className="font-medium text-ink underline underline-offset-4 transition-colors duration-200 hover:text-acc-h">
              Read the documentation
            </Link>
            .
          </p>
        </div>
      </main>

      <footer className="px-5 pb-10 sm:px-8">
        <div className="mx-auto w-full max-w-[640px]">
          <LegalFooter />
        </div>
      </footer>
    </div>
  );
}
