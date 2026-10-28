import { SITE, type Meta } from './seo';

/**
 * The head of the pages.
 *
 * The head is written twice: once when the page is written to the disk, and
 * once when the visitor moves to another page without a load. The first one
 * is what a crawler and a reader without JavaScript see, the second one keeps
 * the title and the address of the page right while the visitor reads.
 */

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const OG = `${SITE}/og.png`;

/** The head of a page, as it is written into the file of the page. */
export function headHtml(meta: Meta): string {
  const title = esc(meta.title);
  const description = esc(meta.description);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${meta.canonical}" />`,
    `<meta name="robots" content="${meta.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large'}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Blipmade" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${meta.canonical}" />`,
    `<meta property="og:image" content="${OG}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${OG}" />`,
    ...meta.jsonld.map((json) => `<script type="application/ld+json">${JSON.stringify(json).replace(/</g, '\\u003c')}</script>`),
  ].join('\n    ');
}

/** Keeps the head right when the visitor moves to another page without a load. */
export function applyMeta(meta: Meta) {
  if (typeof document === 'undefined') return;
  document.title = meta.title;

  const set = (selector: string, make: () => HTMLElement, attribute: string, value: string) => {
    let element = document.head.querySelector<HTMLElement>(selector);
    if (!element) {
      element = make();
      document.head.appendChild(element);
    }
    element.setAttribute(attribute, value);
  };

  const metaTag = (key: 'name' | 'property', name: string, content: string) =>
    set(
      `meta[${key}="${name}"]`,
      () => {
        const element = document.createElement('meta');
        element.setAttribute(key, name);
        return element;
      },
      'content',
      content,
    );

  metaTag('name', 'description', meta.description);
  metaTag('name', 'robots', meta.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large');
  metaTag('property', 'og:title', meta.title);
  metaTag('property', 'og:description', meta.description);
  metaTag('property', 'og:url', meta.canonical);
  metaTag('property', 'og:image', OG);
  metaTag('name', 'twitter:title', meta.title);
  metaTag('name', 'twitter:description', meta.description);
  metaTag('name', 'twitter:image', OG);
  set(
    'link[rel="canonical"]',
    () => {
      const element = document.createElement('link');
      element.rel = 'canonical';
      return element;
    },
    'href',
    meta.canonical,
  );

  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((node) => node.remove());
  for (const json of meta.jsonld) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(json);
    document.head.appendChild(script);
  }
}
