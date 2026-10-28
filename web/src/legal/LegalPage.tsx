import { Fragment, type ReactNode } from 'react';
import { cn } from '../lib';
import { Link, scrollToId } from '../router';
import { Logo } from '../ui';
import { LegalFooter } from './LegalFooter';
import type { LegalBlock, LegalDocument, LegalSection } from './types';

/**
 * The shell of a legal page.
 *
 * All six pages have the same anatomy: a title, the date of the text, a list
 * of the sections and the sections themselves. The content of a page lives in
 * its own file under `documents/`, so this file stays the same whatever the
 * page says.
 *
 * The page is one column and it works at 320 px: the text wraps, the list of
 * the sections becomes two columns on a wide screen, and nothing has a fixed
 * width.
 */

const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FMT.format(date);
}

const NOTE_TONE = {
  note: 'border-line bg-card text-ink2',
  warning: 'border-warn/40 bg-warn/10 text-ink2',
} as const;

function Block({ block }: { block: LegalBlock }) {
  if (block.t === 'p') {
    return <p className="text-[15.5px] leading-[1.75] text-ink2">{block.text}</p>;
  }
  if (block.t === 'list') {
    return (
      <ul className="grid gap-2.5">
        {block.items.map((item, index) => (
          <li key={index} className="flex gap-3 text-[15.5px] leading-[1.7] text-ink2">
            <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-acc" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <aside className={cn('rounded-2xl border px-4 py-3.5', NOTE_TONE[block.tone ?? 'note'])}>
      <p className="text-[14.5px] leading-relaxed">{block.text}</p>
    </aside>
  );
}

function Section({ section }: { section: LegalSection }) {
  return (
    <section>
      <h2 id={section.id} className="scroll-mt-24 text-[22px] font-semibold tracking-tight text-ink">
        {section.title}
      </h2>
      <div className="mt-3 grid gap-4">
        {section.blocks.map((block, index) => (
          <Fragment key={index}>
            <Block block={block} />
          </Fragment>
        ))}
      </div>
    </section>
  );
}

export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-bg">
      <header className="px-5 py-5 sm:px-8">
        <div className="mx-auto flex w-full max-w-[900px] items-center justify-between gap-3">
          <Logo />
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-[14px] font-medium text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
          >
            Back to the site
          </Link>
        </div>
      </header>

      <main className="flex-1 px-5 pb-14 sm:px-8">
        <div className="mx-auto w-full max-w-[760px]">
          <p className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-acc-h">Legal</p>
          <h1 className="mt-4 text-[clamp(32px,6vw,56px)] leading-[1.05] font-semibold tracking-[-0.045em] text-ink">
            {document.label}
          </h1>
          <p className="mt-3 text-[17px] leading-relaxed text-ink2">{document.summary}</p>
          <p className="mt-4 text-[12.5px] text-ink3">Last updated {formatDate(document.updated)}</p>

          {document.sections.length > 1 && (
            <nav aria-label="On this page" className="mt-9 rounded-2xl border border-line bg-card px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">On this page</p>
              <ul className="mt-2.5 grid gap-1 sm:grid-cols-2">
                {document.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      onClick={(event) => {
                        event.preventDefault();
                        scrollToId(section.id);
                      }}
                      className="block rounded-lg px-1 py-1.5 text-[13.5px] leading-snug text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div className="mt-11 grid gap-10">
            {document.sections.map((section) => (
              <Section key={section.id} section={section} />
            ))}
          </div>
        </div>
      </main>

      <footer className="px-5 pb-10 sm:px-8">
        <div className="mx-auto w-full max-w-[760px] pt-6">
          <LegalFooter />
        </div>
      </footer>
    </div>
  );
}
