// Writes one static HTML file per route, plus sitemap.xml, robots.txt and 404.html.
//
// The site is written before it is served. Every address of the public site
// becomes a file that holds the page, the title, the description, the address
// of the page and the structured data. A reader without JavaScript and a
// crawler therefore read the same thing a browser reads.
//
// The pages of the dashboard are not written: they need a session and the
// answer of the API, so they are drawn by the browser alone.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { precompressFile } from '../src/lib/perf-precompress.mjs';

const dist = path.resolve('dist');
const ssrDir = path.resolve('dist-ssr');

if (!fs.existsSync(ssrDir)) {
  console.error('Missing dist-ssr. Run: npm run build');
  process.exit(1);
}

const entry = fs.readdirSync(ssrDir).find((file) => /^entry-server.*\.(m?js)$/.test(file));
if (!entry) {
  console.error('Missing the server bundle in dist-ssr. Run: npm run build');
  process.exit(1);
}

const { render, allRoutes, metaFor } = await import(pathToFileURL(path.join(ssrDir, entry)).href);
const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

if (!template.includes('<!--head-->') || !template.includes('<!--app-->')) {
  console.error('The template of the site has no place for the head and for the page.');
  process.exit(1);
}

// The title and the description of the template are the ones of the home
// page. Every page brings its own, so the ones of the template are taken out.
const base = template.replace(/[ \t]*<title>[\s\S]*?<\/title>\n/, '').replace(/[ \t]*<meta name="description"[^>]*>\n/, '');

/**
 * The page of an address, with the head that belongs to it.
 *
 * The title and the description of the template are the ones of the home
 * page. They are taken out before the head of the page is written, so a page
 * never carries two titles: a browser reads the first one it finds, and a
 * crawler reads the first one it finds too.
 */
const page = (route) => {
  const { html, head } = render(route);
  return base.replace('<!--head-->', head).replace('<!--app-->', html);
};

/**
 * Writes a file of the site, with its compressed forms.
 *
 * The build compresses the site before the pages are written, so the forms of
 * the file that is written here are the forms of the template. They are
 * written again, so the server hands out the page that was written and not the
 * page of the template.
 */
const write = (file, content) => {
  fs.writeFileSync(file, content);
  precompressFile(file);
};

const routes = allRoutes();
const urls = [];

for (const route of routes) {
  const out = route === '/' ? path.join(dist, 'index.html') : path.join(dist, route, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  write(out, page(route));
  if (!metaFor(route).noindex) urls.push(route);
}

// The page of an address that does not exist. The server sends it with the
// answer 404.
write(path.join(dist, '404.html'), page('/__404'));

const today = new Date().toISOString().slice(0, 10);
const priority = (route) =>
  route === '/' ? '1.0' : route === '/apps' || route.startsWith('/apps/') ? '0.9' : route === '/docs' ? '0.7' : '0.5';

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map(
    (route) =>
      `  <url><loc>https://blipmade.com${route === '/' ? '/' : route}</loc><lastmod>${today}</lastmod><priority>${priority(route)}</priority></url>`,
  ),
  '</urlset>',
  '',
].join('\n');

write(path.join(dist, 'sitemap.xml'), sitemap);

const robots = [
  'User-agent: *',
  'Allow: /',
  'Disallow: /app/',
  'Disallow: /admin/',
  '',
  'Sitemap: https://blipmade.com/sitemap.xml',
  '',
].join('\n');

write(path.join(dist, 'robots.txt'), robots);

console.log(`prerendered ${routes.length} pages, ${urls.length} in the sitemap`);
