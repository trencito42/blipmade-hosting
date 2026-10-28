import type { ReactNode } from 'react';
import { Link } from '../router';
import { LEGAL_DOCUMENTS } from '../legal/documents';
import { LegalFooter } from '../legal/LegalFooter';
import { LEGAL_PAGES, legalUnresolved } from './legal';
import { Crumbs, Wrap, cx } from './ui';

/**
 * The legal pages of the platform.
 *
 * The text is ours and it stays ours: the six documents are written in
 * `src/legal/documents/` and this file only draws them in the design of the
 * site. The values the operator has still to supply are visible on the page
 * as a marker, and the page stays out of the index of the search engines until
 * every one of them is filled in.
 */

const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** One block of a legal document. */
function LegalBlock({ block }: { block: { t: string } & Record<string, unknown> }) {
  if (block.t === 'list') {
    const items = (block.items ?? []) as ReactNode[];
    return (
      <ul className="grid gap-2.5 text-[17px] leading-[1.65] text-ink-2">
        {items.map((item, index) => (
          <li key={index} className="flex gap-3">
            <span aria-hidden="true" className="mt-[11px] size-1.5 shrink-0 rounded-full bg-green" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (block.t === 'note') {
    const tone = block.tone === 'warning';
    return (
      <aside
        className={cx(
          'rounded-[22px] border p-5 text-[16.5px] leading-[1.65]',
          tone ? 'border-warn/35 bg-warn/8 text-ink-2' : 'border-line bg-paper-2 text-ink-2',
        )}
      >
        {block.text as ReactNode}
      </aside>
    );
  }
  return <p className="text-[17px] leading-[1.7] text-ink-2">{block.text as ReactNode}</p>;
}

/** The page of one legal document. */
export function LegalPage({ slug }: { slug: string }) {
  const document = LEGAL_DOCUMENTS.find((entry) => entry.to === `/${slug}`);
  const title = LEGAL_PAGES.find((entry) => entry.slug === slug)?.title ?? slug;
  const unresolved = legalUnresolved(slug);

  if (!document) {
    return (
      <Wrap className="grid justify-items-start gap-6 py-16 sm:py-24">
        <Crumbs items={[['Home', '/'], ['Legal', '/docs/support']]} />
        <h1 className="text-[clamp(38px,5.4vw,66px)] leading-[0.98] font-semibold tracking-[-0.045em]">This page is not here.</h1>
        <p className="max-w-[32em] text-[18px] text-ink-2">The address may have changed. The six legal pages are listed in the footer of the site.</p>
      </Wrap>
    );
  }

  return (
    <Wrap className="grid gap-10 pt-10 pb-24 sm:pt-14 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14">
      <nav aria-label="Legal documents" className="hidden lg:block">
        <div className="sticky top-24">
          <p className="mb-3 font-display text-[19px] font-semibold">Legal</p>
          <ul className="grid gap-px border-l border-line">
            {LEGAL_PAGES.map((page) => (
              <li key={page.slug}>
                <Link
                  to={`/${page.slug}`}
                  aria-current={page.slug === slug ? 'page' : undefined}
                  className={cx(
                    '-ml-px block border-l py-1.5 pl-3 text-[15px]',
                    page.slug === slug ? 'border-green font-semibold text-green' : 'border-transparent text-ink-2 hover:border-ink-3 hover:text-ink',
                  )}
                >
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <article className="min-w-0 max-w-[820px]">
        <Crumbs items={[['Home', '/'], [title, `/${slug}`]]} />
        <header className="mt-6 grid gap-4 border-b border-line pb-8">
          <h1 className="text-[clamp(38px,5.4vw,66px)] leading-[0.98] font-semibold tracking-[-0.045em]">{title}</h1>
          <p className="max-w-[38em] text-[19px] text-ink-2">{document.summary}</p>
          <p className="text-[14px] text-ink-3">
            Last updated <time dateTime={document.updated}>{fmt.format(new Date(document.updated))}</time>
          </p>
          {unresolved > 0 ? (
            <p className="rounded-[18px] border border-warn/30 bg-warn/8 px-4 py-3 text-[14.5px] text-ink-2">
              This page still carries {unresolved} {unresolved === 1 ? 'value' : 'values'} the operator has to publish. The markers are shown where
              they are, so nothing on this page is final yet.
            </p>
          ) : null}
        </header>
        <div className="mt-10 grid gap-10">
          {document.sections.map((section) => (
            <section key={section.id} aria-labelledby={`l-${section.id}`}>
              <h2 id={`l-${section.id}`} className="mb-4 scroll-mt-24 font-display text-[26px] leading-tight font-semibold tracking-[-0.03em]">
                {section.title}
              </h2>
              <div className="grid gap-5">
                {section.blocks.map((block, index) => (
                  <LegalBlock key={index} block={block} />
                ))}
              </div>
            </section>
          ))}
        </div>
        {/* The note of the footer of the platform: the identity of the operator
            is not settled yet, and the page says so. */}
        <div className="mt-14">
          <LegalFooter />
        </div>
      </article>
    </Wrap>
  );
}
