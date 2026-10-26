import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { get, type CatalogProduct } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { memLabel } from '../lib/pricing';
import { Icon, type IconName } from '../icons';
import { cn } from '../lib';
import { Link, scrollToId, useRouter } from '../router';
import { Logo } from '../ui';
import { Money, SoftButton } from '../ui-app';
import { LegalFooter } from '../legal/LegalFooter';
import {
  DOC_GROUP_BY_ID,
  DOC_GROUPS,
  DOC_PAGES,
  docGroupLabel,
  type DocBlock,
  type DocGroup,
  type DocPage,
  type DocStep,
} from '../content/docs/schema';

/**
 * The Blipmade documentation.
 *
 * The content is local on purpose: the docs must render even when the API is
 * having a bad day. It lives in two files of plain data, in
 * src/content/docs, and is checked before it is shown. Everything documented
 * here maps to an endpoint in docs/API_CONTRACT.md. Anything that is not live
 * is labelled "Planned".
 */

// --- the catalog ------------------------------------------------------------

/**
 * The price of a product comes from the catalog of the platform. The page of
 * a product is only published when the catalog offers the product, so the
 * price it shows is always a price the platform charges.
 */
function CatalogPrice({ product }: { product: CatalogProduct }) {
  if (!product.price) return <span className="text-ink2">Price on request</span>;
  return <Money amount={product.price.amount} currency={product.price.currency} period="month" />;
}

/** The smallest configuration of a product, taken from the catalog. */
function CatalogResources({ product }: { product: CatalogProduct }) {
  return <>{`${memLabel(product.minRam)} RAM · ${product.minDisk} GB disk`}</>;
}

// --- the tokens -------------------------------------------------------------

/**
 * The content holds tokens instead of the numbers of a product, so the same
 * page is right for every price the catalog has. The renderer gives them the
 * value of the catalog.
 *
 * The content may also hold a link, written as [the words](/the/address). A
 * link inside the site is a link of the router, and a link to another site
 * opens in a new tab. The validator checks that every link of the content
 * points at something that exists.
 */
const TOKEN = /\{\{(planned|catalog\.price|catalog\.minResources)\}\}|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Renders a text of the content, with the tokens and the links it holds. */
function renderText(text: string, product?: CatalogProduct): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = new RegExp(TOKEN.source, 'g');
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const key = `token-${index++}`;
    if (match[1] === 'planned') {
      parts.push(
        <span key={key} className="rounded-full bg-s3 px-2 py-0.5 align-middle text-[12px] font-bold text-ink2">
          Planned
        </span>,
      );
    } else if (match[1] === 'catalog.price') {
      parts.push(product ? <CatalogPrice key={key} product={product} /> : <span key={key}>—</span>);
    } else if (match[1] === 'catalog.minResources') {
      parts.push(product ? <CatalogResources key={key} product={product} /> : <span key={key}>—</span>);
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const label = match[2];
      const target = match[3];
      if (target.startsWith('/')) {
        parts.push(
          <Link key={key} to={target} className="text-acc hover:underline">
            {label}
          </Link>,
        );
      } else if (/^https?:\/\//.test(target)) {
        parts.push(
          <a key={key} href={target} target="_blank" rel="noreferrer noopener" className="text-acc hover:underline">
            {label}
          </a>,
        );
      } else {
        parts.push(label);
      }
    }
    last = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// --- the pages --------------------------------------------------------------

const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function fmtDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FMT.format(date);
}

/** A page of the documentation, with the product it belongs to. */
interface PublishedPage {
  page: DocPage;
  /** The product of the catalog, for the page of a product. */
  product?: CatalogProduct;
}

/**
 * The pages of the documentation.
 *
 * The page of a product is only published when the catalog of the platform
 * offers that product: a page for a product the platform does not sell would
 * send a customer to a dead end. The general pages are local and are always
 * there.
 */
function availablePages(products: CatalogProduct[]): PublishedPage[] {
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  return DOC_PAGES.flatMap((page) => {
    if (!page.catalogSlug) return [{ page }];
    const product = bySlug.get(page.catalogSlug);
    return product ? [{ page, product }] : [];
  });
}

// --- blocks ----------------------------------------------------------------

const CALLOUT: Record<'note' | 'tip' | 'warning' | 'danger', { icon: IconName; label: string; className: string }> = {
  note: { icon: 'doc', label: 'Note', className: 'bg-s2 text-ink2' },
  tip: { icon: 'bolt', label: 'Tip', className: 'bg-acc-bg text-acc' },
  warning: { icon: 'shield', label: 'Warning', className: 'bg-warn/12 text-warn' },
  danger: { icon: 'close', label: 'Danger', className: 'bg-bad/12 text-bad' },
};

function Callout({ tone, text }: { tone: 'note' | 'tip' | 'warning' | 'danger'; text: ReactNode }) {
  const spec = CALLOUT[tone];
  return (
    <aside className={cn('flex items-start gap-3 rounded-2xl px-4 py-3.5', spec.className)}>
      <span className="mt-0.5 shrink-0">
        <Icon name={spec.icon} size={17} />
      </span>
      <p className="min-w-0 text-[14px] leading-relaxed">
        <span className="font-bold">{spec.label}:</span> {text}
      </p>
    </aside>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="group overflow-hidden rounded-2xl bg-con p-4">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">{lang}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Code copied to the clipboard' : 'Copy the code to the clipboard'}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-s3 px-3 text-[12.5px] font-bold text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc md:h-9 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        >
          <Icon name={copied ? 'check' : 'doc'} size={14} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto">
        <code className="font-mono text-[13px] leading-relaxed text-con-ink">{code}</code>
      </pre>
    </div>
  );
}

function Steps({ items }: { items: DocStep[] }) {
  return (
    <ol className="grid gap-2.5">
      {items.map((step, index) => (
        <li key={step.title} className="rounded-2xl bg-s1 p-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-acc font-mono text-[13px] font-bold text-on-acc"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold tracking-[-0.02em] text-ink">{step.title}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink2">{step.body}</p>
              <p className="mt-2 flex items-start gap-2 text-[13.5px] leading-relaxed text-acc">
                <span className="mt-0.5 shrink-0">
                  <Icon name="check" size={15} />
                </span>
                <span>
                  <span className="font-bold">Expected:</span> {step.result}
                </span>
              </p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Trouble({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <details key={item.q} className="rounded-2xl bg-s1 px-4 py-3.5">
          <summary className="cursor-pointer list-none text-[14.5px] font-bold tracking-[-0.02em] text-ink marker:hidden">
            {item.q}
          </summary>
          <p className="mt-2 text-[14px] leading-relaxed text-ink2">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

function Spec({ rows }: { rows: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="grid gap-1.5">
      {rows.map((row) => (
        <div
          key={row.k}
          className="flex flex-col gap-0.5 rounded-2xl bg-s1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
        >
          <dt className="shrink-0 text-[13.5px] font-bold text-ink2 sm:w-52">{row.k}</dt>
          <dd className="min-w-0 break-words text-[14px] text-ink">{row.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function renderBlock(block: DocBlock, key: number, product?: CatalogProduct): ReactNode {
  switch (block.t) {
    case 'p':
      return (
        <p key={key} className="text-[15px] leading-relaxed text-ink2">
          {renderText(block.text, product)}
        </p>
      );
    case 'list':
      return (
        <ul key={key} className="grid gap-1.5">
          {block.items.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-ink2">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-acc" />
              <span className="min-w-0">{renderText(item, product)}</span>
            </li>
          ))}
        </ul>
      );
    case 'callout':
      return (
        <Callout
          key={key}
          tone={block.tone}
          text={renderText(block.text, product)}
        />
      );
    case 'code':
      return <CodeBlock key={key} lang={block.lang} code={block.code} />;
    case 'steps':
      return <Steps key={key} items={block.items} />;
    case 'trouble':
      return <Trouble key={key} items={block.items} />;
    case 'spec':
      return (
        <Spec
          key={key}
          rows={block.rows.map((row) => ({ k: row.k, v: renderText(row.v, product) }))}
        />
      );
    default:
      return null;
  }
}

// --- navigation ------------------------------------------------------------

function NavTree({
  groups,
  pages,
  activeId,
  onNavigate,
}: {
  groups: DocGroup[];
  pages: PublishedPage[];
  activeId: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Documentation" className="grid gap-5">
      {groups.map((group) => {
        const groupPages = pages.filter((entry) => entry.page.group === group.id);
        if (!groupPages.length) return null;
        return (
        <div key={group.id}>
          <p className="px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">{group.label}</p>
          <ul className="mt-2 grid gap-0.5">
            {groupPages.map((entry) => (
              <li key={entry.page.id}>
                <Link
                  to={`/docs?p=${entry.page.id}`}
                  onClick={onNavigate}
                  aria-current={entry.page.id === activeId ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[40px] items-center rounded-xl px-3 text-[14px] font-bold transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
                    entry.page.id === activeId ? 'bg-s2 text-ink' : 'text-ink2 hover:bg-s2 hover:text-ink',
                  )}
                >
                  {entry.page.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        );
      })}
    </nav>
  );
}

// --- page ------------------------------------------------------------------

export default function Docs() {
  const { query, navigate } = useRouter();
  const [term, setTerm] = useState('');
  const [contentsOpen, setContentsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const contentsButton = useRef<HTMLButtonElement>(null);
  const contentsSheet = useRef<HTMLDivElement>(null);

  // The catalog decides which product pages exist. A product the platform
  // does not offer has no page, so the documentation cannot advertise it.
  const catalog = useAsync<{ products: CatalogProduct[] }>((signal) =>
    get<{ products: CatalogProduct[] }>('/catalog/products', undefined, signal),
  );
  const products = catalog.data?.products ?? [];
  const pages = useMemo(() => availablePages(products), [products]);
  const pageById = useMemo(() => new Map(pages.map((entry) => [entry.page.id, entry])), [pages]);
  const catalogFailed = Boolean(catalog.error);

  const pageId = query.p && pageById.has(query.p) ? query.p : pages[0]?.page.id;
  const entry = (pageId ? pageById.get(pageId) : undefined) ?? pages[0]!;
  const page = entry.page;
  const product = entry.product;
  const group = DOC_GROUP_BY_ID.get(page.group);

  // The documentation is the only part of the site that says in the title of
  // the window and in the description of the page what it is about.
  useEffect(() => {
    const previousTitle = document.title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    const previousDescription = meta.getAttribute('content');
    document.title = `${page.title} — Blipmade documentation`;
    meta.setAttribute('content', page.summary);
    return () => {
      document.title = previousTitle;
      if (previousDescription !== null) meta.setAttribute('content', previousDescription);
    };
  }, [page.id, page.title, page.summary]);

  // The list of contents is a dialog on a phone: the focus goes into it, it
  // closes with Escape and the focus goes back to the button that opened it.
  useEffect(() => {
    if (!contentsOpen) return;
    const panel = contentsSheet.current;
    panel?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setContentsOpen(false);
        contentsButton.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [contentsOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const isK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isK || (event.key === '/' && !typing)) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return [];
    return pages
      .filter(
        (candidate) =>
          candidate.page.title.toLowerCase().includes(needle) ||
          docGroupLabel(candidate.page.group).toLowerCase().includes(needle) ||
          candidate.page.summary.toLowerCase().includes(needle) ||
          candidate.page.keywords.some((keyword) => keyword.includes(needle)),
      )
      .slice(0, 8);
  }, [term, pages]);

  const go = (id: string) => {
    setTerm('');
    setContentsOpen(false);
    navigate(`/docs?p=${id}`);
  };

  return (
    <div className="min-h-[100svh] bg-bg">
      <header className="sticky top-0 z-40 bg-bg">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <Logo />

            <div className="relative order-3 w-full lg:order-none lg:ml-6 lg:max-w-[420px] lg:flex-1">
              <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink3">
                <Icon name="search" size={16} />
              </span>
              <input
                ref={searchRef}
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setTerm('');
                  if (event.key === 'Enter' && results[0]) go(results[0].page.id);
                }}
                placeholder="Search the documentation"
                aria-label="Search the documentation"
                className="h-11 w-full rounded-full bg-s2 pl-10 pr-4 text-[16px] text-ink outline-none placeholder:text-ink3 focus:bg-s3 focus-visible:ring-2 focus-visible:ring-acc"
              />
              {term.trim() && (
                <div
                  role="region"
                  aria-live="polite"
                  aria-label="Search results"
                  className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-s1 p-1.5"
                >
                  {results.length === 0 ? (
                    <p className="px-3 py-3 text-[13.5px] text-ink3">Nothing matches “{term.trim()}”.</p>
                  ) : (
                    <ul className="grid gap-0.5">
                      {results.map((result) => (
                        <li key={result.page.id}>
                          <Link
                            to={`/docs?p=${result.page.id}`}
                            onClick={() => {
                              setTerm('');
                            }}
                            className="block rounded-xl px-3 py-2.5 transition-colors duration-[180ms] hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                          >
                            <span className="block text-[14px] font-bold text-ink">{result.page.title}</span>
                            <span className="block truncate text-[12.5px] text-ink3">
                              {docGroupLabel(result.page.group)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <nav aria-label="Main" className="ml-auto flex items-center gap-1">
              <Link
                to="/status"
                className="hidden h-11 items-center rounded-full px-2.5 text-[13.5px] font-bold text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc min-[380px]:inline-flex sm:px-4 sm:text-[15px]"
              >
                Status
              </Link>
              <Link
                to="/"
                className="hidden h-11 items-center rounded-full px-2.5 text-[13.5px] font-bold text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc min-[380px]:inline-flex sm:px-4 sm:text-[15px]"
              >
                Home
              </Link>
              <button
                ref={contentsButton}
                type="button"
                onClick={() => setContentsOpen(true)}
                aria-expanded={contentsOpen}
                aria-label="Contents"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-s2 px-3 text-[14.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-s3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:px-4 lg:hidden"
              >
                <Icon name="menu" size={16} />
                <span className="sr-only sm:not-sr-only">Contents</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1280px] gap-8 px-4 pb-16 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)_210px]">
        <aside className="hidden lg:block">
          <div className="sticky top-[84px] max-h-[calc(100svh-104px)] overflow-y-auto pb-6">
            <NavTree groups={DOC_GROUPS} pages={pages} activeId={page.id} />
          </div>
        </aside>

        <main className="min-w-0">
          {catalogFailed && (
            <div role="status" className="mb-7 grid gap-3 rounded-[24px] bg-s1 p-5">
              <p className="text-[15px] font-extrabold tracking-[-0.02em]">The catalog could not be loaded.</p>
              <p className="text-[14px] leading-relaxed text-ink2">
                The pages of the products are published from the catalog of the platform, so they are not listed while it is
                unreachable. The rest of the documentation is here.
              </p>
              <div>
                <SoftButton onClick={catalog.reload}>Try again</SoftButton>
              </div>
            </div>
          )}
          <article className="min-w-0 max-w-[72ch]">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-ink3">
              <Link
                to="/docs"
                className="rounded transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              >
                Documentation
              </Link>
              <span aria-hidden="true">/</span>
              <span className="font-mono text-[11.5px] uppercase tracking-[0.12em] text-ink3">
                {group?.label ?? page.group}
              </span>
              <span aria-hidden="true">/</span>
              <span className="text-ink2">{page.title}</span>
            </nav>
            <h1 className="mt-2 text-[clamp(30px,6vw,42px)] font-extrabold leading-[1.06] tracking-[-0.05em] text-ink">
              {page.title}
            </h1>
            <p className="mt-3 text-[16.5px] leading-relaxed text-ink2">{page.summary}</p>
            <p className="mt-4 text-[12.5px] text-ink3">Last updated {fmtDate(page.updated)}</p>

            {page.sections.map((section) => (
              <section key={section.id} className="mt-9">
                {/* The sticky header is two rows tall on a phone, so the
                    anchor needs to clear more space than on a desktop. */}
                <h2 id={section.id} className="scroll-mt-32 text-[21px] font-extrabold tracking-[-0.035em] text-ink">
                  {section.title}
                </h2>
                <div className="mt-3 grid gap-4">
                  {section.blocks.map((block, index) => renderBlock(block, index, product))}
                </div>
              </section>
            ))}

            {page.related.length > 0 && (
              <section aria-labelledby="related-pages" className="mt-12">
                <h2 id="related-pages" className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">
                  Related pages
                </h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                  {page.related.map((id) => {
                    const target = pageById.get(id);
                    if (!target) return null;
                    return (
                      <li key={id}>
                        <Link
                          to={`/docs?p=${id}`}
                          className="flex min-h-[72px] flex-col justify-center gap-0.5 rounded-2xl bg-s1 px-4 py-3 transition-colors duration-[180ms] hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                        >
                          <span className="block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink3">
                            {docGroupLabel(target.page.group)}
                          </span>
                          <span className="block text-[14px] font-bold leading-snug text-ink">{target.page.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {page.next.length > 0 && (
              <nav aria-label="Next pages" className="mt-12 grid gap-2 sm:grid-cols-2">
                {page.next.map((id) => {
                  const target = pageById.get(id);
                  if (!target) return null;
                  return (
                    <Link
                      key={id}
                      to={`/docs?p=${id}`}
                      className="flex min-h-[64px] items-center justify-between gap-3 rounded-2xl bg-s1 px-4 py-3 transition-colors duration-[180ms] hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                    >
                      <span className="min-w-0">
                        <span className="block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink3">Next</span>
                        <span className="block truncate text-[14.5px] font-bold text-ink" title={target.page.title}>
                          {target.page.title}
                        </span>
                      </span>
                      <Icon name="arrow" size={16} className="shrink-0 text-ink3" />
                    </Link>
                  );
                })}
              </nav>
            )}
          </article>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-[84px] pb-6">
            <p className="px-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">On this page</p>
            <ul className="mt-3 grid gap-1">
              {page.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      scrollToId(section.id);
                    }}
                    className="block rounded-lg px-1 py-1 text-[13.5px] leading-snug text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {contentsOpen && (
        <div
          ref={contentsSheet}
          className="fixed inset-0 z-50 overflow-y-auto bg-bg px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Documentation contents"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-[17px] font-extrabold tracking-[-0.03em] text-ink">Contents</p>
            <button
              type="button"
              onClick={() => {
                setContentsOpen(false);
                contentsButton.current?.focus();
              }}
              aria-label="Close the contents"
              className="grid size-11 place-items-center rounded-full bg-s2 text-ink2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          {/* On the narrowest phones the header only has room for the menu
              button, so the two public links live here as well. */}
          <nav aria-label="Main" className="mb-5 flex items-center gap-2 min-[380px]:hidden">
            <Link
              to="/status"
              className="inline-flex h-11 items-center rounded-full bg-s2 px-4 text-[14.5px] font-bold text-ink2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            >
              Status
            </Link>
            <Link
              to="/"
              className="inline-flex h-11 items-center rounded-full bg-s2 px-4 text-[14.5px] font-bold text-ink2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            >
              Home
            </Link>
          </nav>
          <NavTree
            groups={DOC_GROUPS}
            pages={pages}
            activeId={page.id}
            onNavigate={() => {
              setContentsOpen(false);
              contentsButton.current?.focus();
            }}
          />
        </div>
      )}

      <footer className="mx-auto w-full max-w-[1280px] px-4 pb-10 sm:px-6">
        <LegalFooter />
      </footer>
    </div>
  );
}
