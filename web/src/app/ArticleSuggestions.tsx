import { useEffect, useState } from 'react';
import { get } from '../lib/api';

/**
 * Pages of the documentation that match what the customer is writing, shown before they send a ticket.
 *
 * It only reads the public documentation: nothing the team keeps for itself is searched here. It waits for the customer to
 * stop typing, shows at most four pages, and says nothing when nothing matches.
 */
export function ArticleSuggestions({ text }: { text: string }) {
  const [articles, setArticles] = useState<{ title: string; url: string; summary: string }[]>([]);
  useEffect(() => {
    const query = text.trim();
    if (query.length < 4) {
      setArticles([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      get<{ articles: { title: string; url: string; summary: string }[] }>('/support/suggest', { q: query }, controller.signal)
        .then((res) => setArticles(res.articles))
        .catch(() => setArticles([]));
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text]);
  if (articles.length === 0) return null;
  return (
    <aside aria-label="Pages that may help" className="rounded-2xl border border-line bg-card p-3">
      <p className="mb-1 text-[13px] font-semibold text-ink">These pages may answer it before you send</p>
      <ul className="grid gap-0.5">
        {articles.map((article) => (
          <li key={article.url}>
            <a href={article.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 flex-col justify-center text-[13.5px] text-acc underline">
              {article.title}
              <span className="text-[12px] text-ink3 no-underline">{article.summary}</span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
