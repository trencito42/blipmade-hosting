import { useMemo, useState } from 'react';
import { Icon } from '../icons';
import { Link } from '../router';
import { articleById, articles, docGroups, type Article } from './data';
import { isOrderable, productBySlug } from './catalog';
import { Blocks } from './Blocks';
import { Btn, Crumbs, Lead, Wrap, cx } from './ui';

/**
 * The documentation of the platform.
 *
 * The content is ours: the groups, the pages and the blocks of a page come
 * from the same files the dashboard reads. What this file adds is the design
 * of the site, the way a page is found and the way a page is read.
 */

/**
 * The pages that are published.
 *
 * A page that is about a product is published when the product can be
 * ordered: a page about a product the platform cannot deploy yet would
 * describe something that cannot be ordered, so it stays out of the site.
 */
export function publishedArticles(): Article[] {
  return articles.filter((article) => {
    if (!article.catalogSlug) return true;
    const product = productBySlug(article.catalogSlug);
    return Boolean(product && isOrderable(product));
  });
}

/** The pages of a group, in the order they are read. */
function articlesOfGroup(groupId: string): Article[] {
  return publishedArticles()
    .filter((article) => article.group === groupId)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** The index of the documentation. */
export function DocsIndex() {
  // A search that comes from another page (the support page of the dashboard) arrives as ?q=.
  const initial = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('q') ?? '' : '';
  const [query, setQuery] = useState(initial);
  const groups = docGroups;
  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return publishedArticles().filter(
      (article) =>
        article.title.toLowerCase().includes(needle) ||
        article.summary.toLowerCase().includes(needle) ||
        article.keywords.some((keyword) => keyword.toLowerCase().includes(needle)),
    );
  }, [query]);

  return (
    <>
      <section aria-labelledby="docs-h">
        <Wrap className="grid gap-6 pt-14 pb-12 sm:pt-20">
          <Crumbs items={[['Home', '/'], ['Docs', '/docs']]} />
          <h1 id="docs-h" className="max-w-[12em] text-[clamp(44px,7vw,92px)] leading-[0.95] font-semibold tracking-[-0.05em]">
            The documentation of the platform.
          </h1>
          <Lead>
            Everything a customer needs to run an app on Blipmade: the first deployment, the resources, the domains, the backups, the billing and the
            support. The pages are written by the same people who run the platform.
          </Lead>
        </Wrap>
      </section>

      <Wrap className="pb-8">
        <label className="grid gap-2">
          <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-ink-2">Search the documentation</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="upgrade, backups, dns, invoices…"
            className="w-full rounded-[18px] border border-line bg-card px-5 py-3.5 text-[16px] text-ink placeholder:text-ink-3 focus:border-mint focus:outline-none"
          />
        </label>
      </Wrap>

      {found ? (
        <Wrap className="pb-24">
          <h2 className="mb-4 font-display text-[22px] font-semibold tracking-[-0.02em]">
            {found.length} {found.length === 1 ? 'page' : 'pages'} for “{query.trim()}”
          </h2>
          {found.length === 0 ? (
            <p className="text-[17px] text-ink-2">Nothing matches that word. Write to the support and the question will be answered there.</p>
          ) : (
            <ul className="grid gap-3">
              {found.map((article) => (
                <li key={article.id} className="rounded-[22px] border border-line bg-card p-5">
                  <Link to={`/docs/${article.id}`} className="font-display text-[19px] font-semibold tracking-[-0.02em] text-ink">
                    {article.title}
                  </Link>
                  <p className="mt-1 text-[16px] text-ink-2">{article.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </Wrap>
      ) : (
        <Wrap className="pb-24">
          <ul className="grid gap-4 md:grid-cols-2">
            {groups.map((group) => {
              const pages = articlesOfGroup(group.id);
              if (pages.length === 0) return null;
              return (
                <li key={group.id} className="grid content-start gap-4 rounded-[28px] border border-line bg-card p-6 sm:p-7">
                  <div className="grid gap-2">
                    <h2 className="font-display text-[24px] leading-tight font-semibold tracking-[-0.03em]">{group.label}</h2>
                    <p className="text-[16px] leading-relaxed text-ink-2">{group.description}</p>
                  </div>
                  <ul className="grid gap-1.5">
                    {pages.map((article) => (
                      <li key={article.id}>
                        <Link
                          to={`/docs/${article.id}`}
                          className="flex items-baseline justify-between gap-4 rounded-[14px] px-3 py-2 text-[16px] text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
                        >
                          <span>{article.title}</span>
                          <Icon name="arrow" size={13} className="shrink-0 text-ink-3" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </Wrap>
      )}
    </>
  );
}

/** The page of one article of the documentation. */
export function DocsArticle({ id }: { id: string }) {
  const article = articleById(id);
  const product = article?.catalogSlug ? productBySlug(article.catalogSlug) : undefined;

  if (!article) {
    return (
      <section aria-labelledby="doc-h">
        <Wrap className="grid justify-items-start gap-6 py-16 sm:py-24">
          <Crumbs items={[['Home', '/'], ['Docs', '/docs']]} />
          <h1 id="doc-h" className="text-[clamp(40px,6.4vw,80px)] leading-[0.95] font-semibold tracking-[-0.05em]">
            This page is not here.
          </h1>
          <p className="max-w-[32em] text-[18px] text-ink-2">The address may have changed. The index of the documentation lists every page that exists.</p>
          <Btn to="/docs" variant="outline">
            The documentation
          </Btn>
        </Wrap>
      </section>
    );
  }

  const group = docGroups.find((entry) => entry.id === article.group);
  const pages = articlesOfGroup(article.group);
  const position = pages.findIndex((entry) => entry.id === article.id);
  const next = position >= 0 ? pages[position + 1] : undefined;

  return (
    <section aria-labelledby="doc-h">
      <Wrap className="grid items-start gap-12 pt-10 pb-24 sm:pt-14 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="The documentation" className="lg:sticky lg:top-24">
          <Crumbs items={[['Home', '/'], ['Docs', '/docs'], [article.title, `/docs/${article.id}`]]} />
          <p className="mt-6 mb-3 font-display text-[13px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{group?.label ?? 'Documentation'}</p>
          <ul className="grid gap-1">
            {pages.map((entry) => (
              <li key={entry.id}>
                <Link
                  to={`/docs/${entry.id}`}
                  aria-current={entry.id === article.id ? 'page' : undefined}
                  className={cx(
                    'block rounded-[12px] px-3 py-1.5 text-[15px] transition-colors',
                    entry.id === article.id ? 'bg-paper-2 font-medium text-ink' : 'text-ink-2 hover:bg-paper-2 hover:text-ink',
                  )}
                >
                  {entry.title}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-7 grid gap-2 border-t border-line pt-5">
            <p className="font-display text-[13px] font-semibold tracking-[0.08em] text-ink-3 uppercase">On this page</p>
            <ul className="grid gap-1.5">
              {article.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="block text-[14.5px] text-ink-3 transition-colors hover:text-ink-2">
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="grid content-start gap-8">
          <header className="grid gap-4">
            <h1 id="doc-h" className="text-[clamp(36px,5.4vw,64px)] leading-[1.02] font-semibold tracking-[-0.045em]">
              {article.title}
            </h1>
            <p className="max-w-[42em] text-[19px] leading-[1.6] text-ink-2">{article.summary}</p>
            <p className="num text-[13px] text-ink-3">Updated {article.updated}</p>
          </header>

          {article.sections.map((section) => (
            <section key={section.id} className="grid gap-5 scroll-mt-28">
              <h2 id={section.id} className="scroll-mt-28 text-[26px] leading-tight font-semibold tracking-[-0.03em]">
                {section.title}
              </h2>
              <Blocks blocks={section.blocks} product={product} />
            </section>
          ))}

          {product ? (
            <div className="mt-4 grid gap-4 rounded-[28px] bg-night p-6 sm:flex sm:items-center sm:justify-between sm:p-8">
              <div>
                <h2 className="font-display text-[24px] font-semibold tracking-[-0.03em] text-snow">Ready to run {product.name}?</h2>
                <p className="mt-1 max-w-[32em] text-[16.5px] text-snow-2">Size the instance and see what it costs before you order anything.</p>
              </div>
              <Btn to={`/apps/${product.slug}`} variant="mint">
                Size {product.name}
              </Btn>
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
            {next ? (
              <Link to={`/docs/${next.id}`} className="group grid gap-1">
                <span className="text-[13px] text-ink-3">Next</span>
                <span className="font-display text-[19px] font-semibold tracking-[-0.02em] text-ink group-hover:text-mint">{next.title}</span>
              </Link>
            ) : (
              <Link to="/docs" className="group grid gap-1">
                <span className="text-[13px] text-ink-3">Back</span>
                <span className="font-display text-[19px] font-semibold tracking-[-0.02em] text-ink group-hover:text-mint">The documentation</span>
              </Link>
            )}
            <Link to="/docs/tickets" className="text-[15.5px] text-ink-2 underline underline-offset-4 hover:text-ink">
              Something is missing? Open a ticket.
            </Link>
          </div>
        </div>
      </Wrap>
    </section>
  );
}
