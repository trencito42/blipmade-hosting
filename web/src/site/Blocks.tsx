import { Fragment, type ReactNode } from 'react';
import { Link } from '../router';
import { productBySlug, type Product } from './catalog';
import { eur, fmtDisk, fmtRam } from './pricing';
import { cx } from './ui';
import type { Block } from './data';

/**
 * The blocks of a page of the documentation.
 *
 * The documentation is written in files, not in markup: every page is a list
 * of sections and every section is a list of blocks. The blocks are drawn
 * here, in the design of the site, and the words of a block are written with
 * two kinds of marker:
 *
 *   - `{{planned}}` says that the thing is designed but not built yet;
 *   - `{{catalog.price}}` and `{{catalog.minResources}}` say that the number
 *     is the one of the catalog of the platform.
 *
 * The numbers of the catalog are never written by hand. They are read from
 * the snapshot of the API, so a price cannot drift away from the price the
 * platform charges.
 */

const TOKEN = /\{\{(planned|catalog\.price|catalog\.minResources)\}\}|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** The address of a page of the documentation, in the form the site uses. */
function docPath(id: string): string {
  return `/docs/${id}`;
}

/**
 * The address a link of the content points to.
 *
 * The content was written when a page of the documentation was named with a
 * question in the address (`/docs?p=upgrade`). The site names it with a part
 * of the address (`/docs/upgrade`), which is the form the search engines and
 * the crawler of the platform read. Every link of the content is written
 * here, so no link of the old form survives on the site.
 */
export function rewriteHref(href: string): string {
  const match = /^\/docs\?p=([^&]+)/.exec(href);
  if (!match) return href;
  return docPath(match[1]);
}

interface InlineProps {
  text: string;
  product?: Product;
}

/**
 * The words of a block, with the markers and the links of the content
 * resolved.
 */
export function Inline({ text, product }: InlineProps) {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(<Fragment key={key++}>{text.slice(last, at)}</Fragment>);
    const [whole, token, label, href] = match;
    if (token === 'planned') {
      parts.push(
        <span
          key={key++}
          className="mx-0.5 inline-flex translate-y-[-1px] items-center rounded-full border border-line bg-paper-2 px-2 py-0.5 align-middle text-[12px] font-semibold tracking-[0.01em] text-ink-2"
        >
          Planned
        </span>,
      );
    } else if (token === 'catalog.price') {
      parts.push(
        <span key={key++} className="font-medium text-ink">
          {product ? `from ${eur(product.minPrice)} a month` : 'the price of the catalog'}
        </span>,
      );
    } else if (token === 'catalog.minResources') {
      parts.push(
        <span key={key++} className="font-medium text-ink">
          {product
            ? `${fmtRam(product.min.ram)} RAM, ${product.min.cpu} vCPU, ${fmtDisk(product.min.disk)} disk`
            : 'the smallest size of the catalog'}
        </span>,
      );
    } else if (label !== undefined && href !== undefined) {
      const target = rewriteHref(href);
      if (target.startsWith('/')) {
        parts.push(
          <Link key={key++} to={target}>
            {label}
          </Link>,
        );
      } else {
        parts.push(
          <a key={key++} href={target} target="_blank" rel="noreferrer noopener">
            {label}
          </a>,
        );
      }
    }
    last = at + whole.length;
  }
  if (last < text.length) parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}

/** The name of the tone of a callout, and the colours it is drawn with. */
const CALLOUT: Record<string, { label: string; className: string }> = {
  note: { label: 'Note', className: 'border-line bg-paper-2 text-ink-2' },
  tip: { label: 'Good to know', className: 'border-green/30 bg-green/7 text-ink-2' },
  warning: { label: 'Careful', className: 'border-warn/35 bg-warn/8 text-ink-2' },
  danger: { label: 'Careful', className: 'border-bad/35 bg-bad/8 text-ink-2' },
  info: { label: 'Note', className: 'border-line bg-paper-2 text-ink-2' },
  success: { label: 'Good', className: 'border-green/35 bg-green/8 text-ink-2' },
};

export interface BlocksProps {
  blocks: Block[];
  /** The product of the page, when the page is about one product. */
  product?: Product;
  className?: string;
}

/**
 * The blocks of a section, drawn in the design of the site.
 *
 * The kinds of block are the ones the content is written with: a paragraph, a
 * list, a callout, a piece of code, the steps of a task, the answers of a
 * question and a table of specifications.
 */
export function Blocks({ blocks, product, className }: BlocksProps) {
  return (
    <div className={cx('grid gap-5', className)}>
      {blocks.map((block, index) => {
        const key = `${block.t}-${index}`;
        if (block.t === 'p') {
          return (
            <p key={key} className="text-[17px] leading-[1.7] text-ink-2">
              <Inline text={block.text} product={product} />
            </p>
          );
        }
        if (block.t === 'list') {
          return (
            <ul key={key} className="grid gap-2.5 text-[17px] leading-[1.65] text-ink-2">
              {block.items.map((item, at) => (
                <li key={at} className="flex gap-3">
                  <span aria-hidden="true" className="mt-[11px] size-1.5 shrink-0 rounded-full bg-green" />
                  <span>
                    <Inline text={item} product={product} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.t === 'callout' || block.t === 'note') {
          const tone = CALLOUT[block.tone ?? (block.t === 'note' ? 'note' : 'info')] ?? CALLOUT.note;
          return (
            <aside key={key} className={cx('rounded-[22px] border p-5 text-[16.5px] leading-[1.65]', tone.className)}>
              <p className="mb-1 font-display text-[15px] font-semibold tracking-[-0.01em] text-ink">{tone.label}</p>
              <Inline text={block.text} product={product} />
            </aside>
          );
        }
        if (block.t === 'code') {
          return (
            <pre
              key={key}
              className="num overflow-x-auto rounded-[22px] border border-line bg-night p-5 text-[14px] leading-[1.7] text-snow"
              data-lang={block.lang ?? 'text'}
            >
              <code>{block.code}</code>
            </pre>
          );
        }
        if (block.t === 'steps') {
          return (
            <ol key={key} className="grid gap-4">
              {block.items.map((step, at) => (
                <li key={at} className="grid gap-2 rounded-[22px] border border-line bg-card p-5 sm:grid-cols-[auto_1fr] sm:gap-5">
                  <span
                    aria-hidden="true"
                    className="num flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-paper-2 text-[13px] font-medium text-mint"
                  >
                    {at + 1}
                  </span>
                  <div className="grid gap-2">
                    <h3 className="font-display text-[19px] leading-snug font-semibold tracking-[-0.02em] text-ink">{step.title}</h3>
                    <p className="text-[16.5px] leading-[1.65] text-ink-2">
                      <Inline text={step.body} product={product} />
                    </p>
                    {step.result ? (
                      <p className="rounded-[14px] border border-green/25 bg-green/6 px-3.5 py-2.5 text-[15px] text-ink-2">
                        <span className="font-semibold text-green">Result. </span>
                        <Inline text={step.result} product={product} />
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          );
        }
        if (block.t === 'trouble') {
          return (
            <div key={key} className="grid gap-3">
              {block.items.map((item, at) => (
                <details key={at} className="group rounded-[22px] border border-line bg-card p-5">
                  <summary className="cursor-pointer list-none font-display text-[17px] font-semibold tracking-[-0.015em] text-ink marker:hidden">
                    <span className="flex items-start justify-between gap-4">
                      <span>{item.q}</span>
                      <span aria-hidden="true" className="mt-0.5 text-ink-3 transition-transform group-open:rotate-45">
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-3 text-[16.5px] leading-[1.65] text-ink-2">
                    <Inline text={item.a} product={product} />
                  </p>
                </details>
              ))}
            </div>
          );
        }
        // The block of a specification: two columns, the name of the thing and
        // its value.
        return (
          <div key={key} className="overflow-hidden rounded-[22px] border border-line">
            <dl className="divide-y divide-line">
              {block.rows.map((row, at) => (
                <div key={at} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-6">
                  <dt className="text-[15px] font-medium text-ink">{row.k}</dt>
                  <dd className="text-[15.5px] text-ink-2">
                    <Inline text={row.v} product={product} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
