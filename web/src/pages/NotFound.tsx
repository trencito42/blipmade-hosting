import { Link } from '../router';
import { Button, Logo } from '../ui';
import { LegalFooter } from '../legal/LegalFooter';

export default function NotFound() {
  return (
    <div className="flex min-h-[100svh] flex-col bg-bg">
      <header className="px-4 py-4 sm:px-6">
        <Logo />
      </header>

      <main className="flex flex-1 items-center px-4 pb-20 sm:px-6">
        <div className="mx-auto w-full max-w-[560px] text-center">
          <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink3">Error 404</p>
          <h1 className="mt-3 text-[clamp(34px,9vw,56px)] font-extrabold leading-[1.02] tracking-[-0.055em] text-ink">
            Page not found
          </h1>
          <p className="mx-auto mt-4 max-w-[42ch] text-[16px] leading-relaxed text-ink2">
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
            <Link to="/docs" className="font-bold text-acc hover:underline">
              Read the documentation
            </Link>
            .
          </p>
        </div>
      </main>

      <footer className="px-4 pb-10 sm:px-6">
        <div className="mx-auto w-full max-w-[560px]">
          <LegalFooter />
        </div>
      </footer>
    </div>
  );
}
