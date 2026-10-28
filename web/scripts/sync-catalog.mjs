// Pulls the live catalog and keeps only what can be ordered today.
//
// Run before every release:  npm run sync
//
// The snapshot it writes is what the prerendered pages carry, so a page that
// is read by a crawler shows the products and the prices that are real. The
// browser asks the API for the live catalog when the page opens, and the
// snapshot is what it shows until the answer arrives.
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
const live = products
  .filter((p) => p.availability?.state === 'DEPLOYABLE' && p.availability?.orderable)
  .map((p) => ({
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
  }));

fs.mkdirSync('src/site/data', { recursive: true });
fs.writeFileSync('src/site/data/products.json', `${JSON.stringify(live, null, 2)}\n`);
console.log(`deployable: ${live.map((p) => p.slug).join(', ') || 'none'}`);
