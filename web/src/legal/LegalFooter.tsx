import { cn } from '../lib';
import { Link } from '../router';
import { LEGAL_PAGE_LIST } from './links';
import { OperatorPlaceholder } from './OperatorPlaceholder';

/**
 * The legal links, and the note that says the identity of the operator is not
 * settled yet.
 *
 * The section is the same on every page of the site, so the footer of the
 * site and the pages of the app cannot drift apart. It is not a `<footer>`
 * element: the pages that already have one put this section inside it, and
 * the pages that do not wrap it in one.
 */
export function LegalFooter({ className }: { className?: string }) {
  const link =
    'inline-flex min-h-11 items-center text-[13.5px] text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc';
  return (
    <div className={cn('border-t border-line', className)}>
      <nav aria-label="Legal documents" className="flex flex-wrap gap-x-5 gap-y-1">
        {LEGAL_PAGE_LIST.map((page) => (
          <Link key={page.to} to={page.to} className={link}>
            {page.nav}
          </Link>
        ))}
      </nav>
      <p className="mt-2 max-w-[72ch] text-[12.5px] leading-relaxed text-ink3">
        The legal identity of the operator is still to be confirmed:{' '}
        <OperatorPlaceholder label="TODO(operator): the legal name of the operator" />
      </p>
    </div>
  );
}
