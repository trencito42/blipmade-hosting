// Pulls the live catalog and keeps every product the platform lists.
//
// Run before every release:  npm run sync
//
// The snapshot it writes is what the prerendered pages carry, so a page that
// is read by a crawler shows the products and the prices that are real. The
// browser asks the API for the live catalog when the page opens, and the
// snapshot is what it shows until the answer arrives.
//
// The snapshot holds the whole catalogue: the products that can be ordered
// today and the products that are still coming, each one with the state the
// server gives it. A product that is not published is not in the catalog of
// the platform and is not in the snapshot.
//
// The prices are the ones the API sends, exactly: `pricing.minimum.amount`
// and `pricing.recommended.amount`. Nothing is calculated here.
//
// The address of the API comes from BLIPMADE_API. A file can be given with
// CATALOG_FILE instead, which is how a release is built without a network.
import fs from 'node:fs';

let json;
if (process.env.CATALOG_FILE) {
  json = JSON.parse(fs.readFileSync(process.env.CATALOG_FILE, 'utf8'));
} else {
  const url = process.env.BLIPMADE_API ?? 'https://blipmade.com/api/catalog/products';
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  json = await res.json();
}

const { products } = json;

// The products the platform lists. A product that is not published is not
// shown to anyone, so it is not in the snapshot either.
const listed = products.filter((p) => (p.availability?.state ?? 'DEPLOYABLE') !== 'UNPUBLISHED');

// A product without a price book is not an offer: the API does not publish
// one for it. Such a product is left out of the snapshot, because the site
// has no price of it to show.
const priced = listed.filter((p) => p.pricing);
const withoutPrice = listed.length - priced.length;

const catalogue = priced.map((p) => ({
  slug: p.slug,
  name: p.name,
  category: p.category,
  description: p.description,
  min: { ram: p.minRam, cpu: p.minCpu, disk: p.minDisk },
  def: { ram: p.defaultRam, cpu: p.defaultCpu, disk: p.defaultDisk },
  max: { ram: p.maxRam, cpu: p.maxCpu, disk: p.maxDisk },
  minPrice: p.pricing.minimum.amount,
  recPrice: p.pricing.recommended.amount,
  rates: p.pricing.rates,
  currency: p.pricing.currency,
  availability: {
    state: p.availability?.state ?? 'DEPLOYABLE',
    orderable: Boolean(p.availability?.orderable),
    blockers: p.availability?.blockers ?? [],
  },
}));

const orderable = catalogue.filter((p) => p.availability.orderable);

fs.mkdirSync('src/site/data', { recursive: true });
fs.writeFileSync('src/site/data/products.json', `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`catalogue: ${catalogue.length} products, ${orderable.length} orderable, ${catalogue.length - orderable.length} coming`);
if (withoutPrice) console.log(`skipped: ${withoutPrice} products without a price book`);
