import { Arrow, Button, Reveal, Wrap } from '../ui';
import { Link, useRouter } from '../router';
import { useSession } from '../session';
import { homeOf } from '../auth-guard';
import { LegalFooter } from '../legal/LegalFooter';

/**
 * The closing of the public site, and the footer.
 *
 * The footer carries the links of the legal pages of the platform: they are
 * the rules the customer agrees to, and they are on every page.
 */
export function Closing() {
  const { navigate } = useRouter();
  return (
    <section aria-label="Get started" className="py-24">
      <Wrap>
        <Reveal>
          <div className="dots relative overflow-hidden rounded-3xl border border-line bg-s1 p-10 sm:p-16">
            <div aria-hidden="true" data-decorative className="pointer-events-none absolute -right-16 -bottom-16 size-72">
              {[0, 1, 2].map((i) => (
                <span key={i} className="ring absolute inset-0 rounded-full border border-acc/50" style={{ ['--i' as string]: i }} />
              ))}
            </div>
            <div className="relative grid gap-8">
              <h2 className="max-w-2xl text-[clamp(36px,5.4vw,72px)] leading-[1] font-semibold tracking-[-0.045em] [text-wrap:balance]">
                Start hosting with Blipmade today.
              </h2>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" onClick={() => navigate('/register')}>
                  Get started <Arrow />
                </Button>
                <Button size="lg" variant="soft" onClick={() => navigate('/apps')}>
                  View plans
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </Wrap>
    </section>
  );
}

export function Footer() {
  const link = 'text-[14px] text-ink2 transition-colors hover:text-ink';
  const { user } = useSession();
  return (
    <footer className="border-t border-line py-12">
      <Wrap className="flex flex-wrap items-start justify-between gap-10">
        <div className="grid gap-3">
          <p className="max-w-xs text-[14px] text-ink3">Hosting for the things you run, on one account and one bill.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-10 gap-y-3">
          <Link to="/apps" className={link}>Apps</Link>
          <Link to="/docs" className={link}>Docs</Link>
          <Link to="/status" className={link}>Status</Link>
          <Link to={user ? homeOf(user.role) : '/login'} className={link}>{user ? 'Dashboard' : 'Sign in'}</Link>
          <Link to="/register" className={link}>Create account</Link>
        </nav>
      </Wrap>
      <Wrap className="mt-10 text-[13px] text-ink3">
        <p>© {new Date().getFullYear()} Blipmade. All rights reserved.</p>
        <LegalFooter />
      </Wrap>
    </footer>
  );
}
