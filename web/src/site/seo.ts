import { LEGAL_PAGES, legalUnresolved } from './legal';
import { isOrderable, productBySlug, productsNow } from './catalog';
import { APP_COPY, faqFor } from './content';
import { DEFAULT_RATES, eur } from './pricing';
import summary from './data/meta.json' with { type: 'json' };

/**
 * The meta of the pages of the site.
 *
 * Every page has a title, a description, an address of its own, and the
 * structured data a search engine reads. The meta is written here and not in
 * the pages, so the page that is written to the disk and the page the browser
 * draws say the same thing.
 *
 * A legal page that still waits for a value of the operator stays out of the
 * index of the search engines. It is not hidden from a reader: it is still
 * linked from the footer and it is still open.
 */

export const SITE = 'https://blipmade.com';
export const BRAND = 'Blipmade';

export type Meta = {
  title: string;
  description: string;
  canonical: string;
  noindex: boolean;
  jsonld: object[];
};

const org = { '@type': 'Organization', '@id': `${SITE}/#org`, name: BRAND, url: SITE, logo: `${SITE}/favicon.svg` };

const crumbs = (items: [string, string][]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, itemPath], index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name,
    item: `${SITE}${itemPath}`,
  })),
});

/** Cuts a sentence to a number of characters, on a word. */
const cut = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`);

/** Every product the platform lists, the ones that can be ordered and the ones that are coming. */
const products = productsNow();

/** The products that can be ordered today. */
const orderable = products.filter((product) => isOrderable(product));

/**
 * The pages of the documentation, as the head needs them.
 *
 * The head of a page names the page, and it needs the name of the page, the
 * line under it, the group it belongs to and the day it was written. The
 * summary of the documentation holds exactly that, and it is small enough to
 * travel with the rest of the site.
 */
interface ArticleMeta {
  id: string;
  title: string;
  summary: string;
  group: string;
  groupLabel: string;
  keywords: string[];
  updated: string;
  catalogSlug?: string;
}

const articles = summary as ArticleMeta[];

const articleById = (id: string): ArticleMeta | undefined => articles.find((article) => article.id === id);

/**
 * The pages of the documentation that are published.
 *
 * The page of a product is published when the product can be ordered: the
 * site does not describe how to deploy something that cannot be deployed yet.
 */
const published = articles.filter((article) => {
  if (!article.catalogSlug) return true;
  const product = productBySlug(article.catalogSlug);
  return Boolean(product && isOrderable(product));
});

const fromPrice = orderable.length ? Math.min(...orderable.map((product) => product.minPrice)) : 0;

/**
 * The one line of every legal page.
 *
 * The text of the legal pages lives in the documents themselves, in markup, so
 * it cannot be read as a string here. The one line under the title of each
 * page is written here, and the test of the legal pages checks that it is the
 * same one the page shows.
 */
const LEGAL_SUMMARY: Record<string, string> = {
  terms: 'The rules of the use of the Blipmade platform: the account, the orders, the payments and the end of the contract.',
  privacy: 'What the platform knows about you, why it needs it, how long it keeps it and what you can ask it to do.',
  cookies: 'The cookies the site and the dashboard use, what each one is for and how long it stays.',
  aup: 'What is not allowed on the platform, and what happens when it is done anyway.',
  'refund-policy': 'When a customer can have the money back, how the refund is made and how long it takes.',
  sla: 'What the platform promises about the availability of the service, and what a customer gets when it is missed.',
};

/** The meta of one address of the site. */
export function metaFor(path: string): Meta {
  const base = { canonical: `${SITE}${path === '/' ? '/' : path}`, noindex: false, jsonld: [] as object[] };

  if (path === '/') {
    return {
      ...base,
      title: 'Blipmade: hosting for bots, apps and databases',
      description: `Host Discord bots, apps and databases on Pterodactyl. Pick your RAM, CPU and disk, see the price live, from ${eur(fromPrice)} a month.`,
      jsonld: [
        {
          '@context': 'https://schema.org',
          '@graph': [
            org,
            { '@type': 'WebSite', '@id': `${SITE}/#site`, url: SITE, name: BRAND, publisher: { '@id': `${SITE}/#org` }, inLanguage: 'en' },
            {
              '@type': 'Service',
              name: 'Container hosting',
              provider: { '@id': `${SITE}/#org` },
              serviceType: 'Application hosting',
              areaServed: 'Worldwide',
              offers: { '@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: (fromPrice / 100).toFixed(2), offerCount: orderable.length },
            },
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqFor(products[0]?.rates ?? DEFAULT_RATES).map((entry) => ({
            '@type': 'Question',
            name: entry.q,
            acceptedAnswer: { '@type': 'Answer', text: entry.a },
          })),
        },
      ],
    };
  }

  if (path === '/apps') {
    const coming = products.length - orderable.length;
    return {
      ...base,
      title: `The catalogue: ${products.length} apps, one price card | Blipmade`,
      description: `${orderable.length} apps can be deployed today and ${coming} more are coming soon. One card of rates for every app, from ${eur(fromPrice)} a month.`,
      jsonld: [
        crumbs([['Home', '/'], ['Apps', '/apps']]),
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          itemListElement: products.map((product, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: `${SITE}/apps/${product.slug}`,
            name: product.name,
          })),
        },
      ],
    };
  }

  if (path.startsWith('/apps/')) {
    const product = productBySlug(path.slice(6));
    if (product) {
      const copy = APP_COPY[product.slug];
      const open = isOrderable(product);
      const reason = product.availability.blockers[0] ?? 'It is not on sale yet.';
      return {
        ...base,
        title: open ? `${product.name} hosting from ${eur(product.minPrice)} a month | Blipmade` : `${product.name} hosting: coming soon | Blipmade`,
        description: cut(open ? `${copy?.tagline ?? product.description} ${copy?.lead ?? ''}`.trim() : `${product.description} ${reason}`, 158),
        jsonld: [
          crumbs([['Home', '/'], ['Apps', '/apps'], [product.name, `/apps/${product.slug}`]]),
          {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: `${product.name} hosting`,
            description: copy?.lead ?? product.description,
            brand: { '@type': 'Brand', name: BRAND },
            offers: {
              '@type': 'Offer',
              priceCurrency: 'EUR',
              price: (product.minPrice / 100).toFixed(2),
              availability: open ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              url: `${SITE}/apps/${product.slug}`,
              priceSpecification: {
                '@type': 'UnitPriceSpecification',
                price: (product.minPrice / 100).toFixed(2),
                priceCurrency: 'EUR',
                unitCode: 'MON',
              },
            },
          },
        ],
      };
    }
  }

  if (path === '/docs') {
    return {
      ...base,
      title: 'Documentation: deploy and manage an instance | Blipmade',
      description: `${published.length} guides covering accounts, deployments, resources, files and console, domains, backups and support on Blipmade.`,
      jsonld: [crumbs([['Home', '/'], ['Docs', '/docs']])],
    };
  }

  if (path.startsWith('/docs/')) {
    const article = articleById(path.slice(6));
    if (article && published.some((entry) => entry.id === article.id)) {
      return {
        ...base,
        title: `${article.title} | Blipmade docs`,
        description: cut(article.summary, 158),
        jsonld: [
          crumbs([['Home', '/'], ['Docs', '/docs'], [article.title, path]]),
          {
            '@context': 'https://schema.org',
            '@type': 'TechArticle',
            headline: article.title,
            description: article.summary,
            dateModified: article.updated,
            articleSection: article.groupLabel,
            keywords: article.keywords.join(', '),
            publisher: { '@id': `${SITE}/#org` },
            mainEntityOfPage: base.canonical,
          },
        ],
      };
    }
  }

  const legal = LEGAL_PAGES.find((page) => `/${page.slug}` === path);
  if (legal) {
    return {
      ...base,
      title: `${legal.title} | Blipmade`,
      description: cut(LEGAL_SUMMARY[legal.slug] ?? 'The legal pages of the Blipmade platform.', 158),
      // A page that still waits for a value of the operator stays out of the
      // index of the search engines, but it stays open for a reader.
      noindex: legalUnresolved(legal.slug) > 0,
      jsonld: [crumbs([['Home', '/'], [legal.title, path]])],
    };
  }

  const auth: Record<string, [string, string]> = {
    '/login': ['Log in', 'Log in to your Blipmade account to manage your instances, billing and tickets.'],
    '/register': ['Create account', 'Create a Blipmade account to deploy a container sized to your needs.'],
    '/forgot-password': ['Forgot password', 'Get a link to choose a new Blipmade password.'],
    '/reset-password': ['Choose a new password', 'Choose a new password for your Blipmade account.'],
    '/verify-email': ['Confirm your email', 'Confirm the email address of your Blipmade account.'],
  };
  if (auth[path]) {
    return { ...base, title: `${auth[path][0]} | Blipmade`, description: auth[path][1], noindex: true };
  }

  if (path === '/status') {
    return {
      ...base,
      title: 'Service status | Blipmade',
      description: 'The live state of the components of the Blipmade platform, and the incidents of the last days.',
      jsonld: [crumbs([['Home', '/'], ['Status', '/status']])],
    };
  }

  if (path === '/email') {
    return {
      ...base,
      title: 'Hosted mail on your own domain | Blipmade',
      description: 'Mail hosting for the domains you own, with the limits and the price of the platform.',
      jsonld: [crumbs([['Home', '/'], ['Hosted mail', '/email']])],
    };
  }

  return { ...base, title: 'Page not found | Blipmade', description: 'This page does not exist.', noindex: true, canonical: SITE };
}

/**
 * Every address of the site that is written to the disk.
 *
 * Every product of the catalog has its own page, the ones that can be
 * ordered today and the ones that are still coming, so a crawler and a
 * visitor read the same catalogue.
 */
export function allRoutes(): string[] {
  return [
    '/',
    '/apps',
    ...products.map((product) => `/apps/${product.slug}`),
    '/docs',
    ...published.map((article) => `/docs/${article.id}`),
    ...LEGAL_PAGES.map((page) => `/${page.slug}`),
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/status',
    '/email',
  ];
}
