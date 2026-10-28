/**
 * The price of the site and the price of the server, checked against each
 * other.
 *
 *     node --test web/tests/
 *
 * The site shows a price before an account exists: the home page, the catalog
 * and the configurator. That price has to be the price the server charges,
 * to the cent, for every product and for every size.
 *
 * The check is made in two ways:
 *
 *   1. the arithmetic of the site and the arithmetic of the server are
 *      compared on a grid of configurations, so a rounding that differs is
 *      found even when no product of the catalog uses it;
 *   2. the price of the smallest configuration and of the recommended
 *      configuration of every product of the catalog is compared with the
 *      numbers the server sent, `pricing.minimum.amount` and
 *      `pricing.recommended.amount`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  breakdownOfResources as siteBreakdown,
  DEFAULT_RATES,
  priceOfResources as sitePrice,
  type Rates,
  type Resources,
} from '../src/site/pricing.ts';
import {
  breakdownOfResources as apiBreakdown,
  DEFAULT_RESOURCE_RATES,
  PRICE_DENOMINATOR,
  priceOfResources as apiPrice,
} from '../../api/src/lib/resource-pricing.ts';

const here = dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(readFileSync(join(here, '..', 'src', 'site', 'data', 'products.json'), 'utf8')) as {
  slug: string;
  name: string;
  min: Resources;
  def: Resources;
  max: Resources;
  minPrice: number;
  recPrice: number;
  rates: Rates;
}[];

test('the rate card of the site is the rate card of the server', () => {
  assert.deepEqual(DEFAULT_RATES, DEFAULT_RESOURCE_RATES);
  assert.equal(DEFAULT_RATES.ramPerGb, 200);
  assert.equal(DEFAULT_RATES.cpuPerUnit, 75);
  assert.equal(DEFAULT_RATES.diskPerGb, 5);
  assert.equal(DEFAULT_RATES.baseFee, 49);
});

test('the price of the site is the price of the server, on a grid of configurations', () => {
  const rams = [256, 512, 1024, 1536, 2048, 4096, 8192, 16384];
  const cpus = [0.5, 1, 1.5, 2, 3, 4, 6, 8];
  const disks = [1, 5, 10, 20, 50, 100];

  let checked = 0;
  for (const ram of rams) {
    for (const cpu of cpus) {
      for (const disk of disks) {
        const config = { ram, cpu, disk };
        assert.equal(sitePrice(config), apiPrice(config), `the price of ${ram} MiB, ${cpu} vCPU and ${disk} GB differs`);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 300, `only ${checked} configurations were checked`);
});

test('the price of the site is the price of the server with the rate card of the operator', () => {
  const cards: Rates[] = [
    { ramPerGb: 200, cpuPerUnit: 75, diskPerGb: 5, baseFee: 49 },
    { ramPerGb: 300, cpuPerUnit: 120, diskPerGb: 9, baseFee: 99 },
    { ramPerGb: 1, cpuPerUnit: 1, diskPerGb: 1, baseFee: 0 },
    { ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, baseFee: 0 },
  ];
  for (const card of cards) {
    for (const config of [
      { ram: 256, cpu: 1, disk: 1 },
      { ram: 1024, cpu: 1, disk: 5 },
      { ram: 4096, cpu: 2, disk: 25 },
      { ram: 65536, cpu: 16, disk: 500 },
    ]) {
      assert.equal(sitePrice(config, card), apiPrice(config, card), `the price of ${JSON.stringify(config)} differs`);
    }
  }
});

test('the price of the catalog is the price the server sent', () => {
  assert.ok(snapshot.length > 0, 'the snapshot of the catalog is empty');
  for (const product of snapshot) {
    assert.equal(sitePrice(product.min, product.rates), product.minPrice, `the smallest price of ${product.slug} differs`);
    assert.equal(sitePrice(product.def, product.rates), product.recPrice, `the recommended price of ${product.slug} differs`);
  }
});

test('the price of the catalog is the price of the server, for every product', () => {
  for (const product of snapshot) {
    assert.equal(sitePrice(product.min), apiPrice(product.min), `the smallest price of ${product.slug} differs`);
    assert.equal(sitePrice(product.def), apiPrice(product.def), `the recommended price of ${product.slug} differs`);
  }
});

test('the parts of the price add up to the price, on both sides', () => {
  for (const product of snapshot) {
    for (const config of [product.min, product.def, product.max]) {
      const site = siteBreakdown(config, product.rates);
      const api = apiBreakdown(config, product.rates);
      assert.equal(site.ram + site.cpu + site.disk + site.base, site.total, `the parts of ${product.slug} do not add up`);
      assert.equal(api.ram + api.cpu + api.disk + api.base, api.total, `the parts of ${product.slug} do not add up on the server`);
      assert.deepEqual(site, api, `the breakdown of ${product.slug} differs`);
    }
  }
});

test('the price is rounded once, on the sum, and a half goes up', () => {
  // A configuration whose price ends in half a minor unit is rounded up, on
  // both sides and in the same way.
  const config = { ram: 1, cpu: 1, disk: 1 };
  const exact = 49 * PRICE_DENOMINATOR + 1 * 200 * 100 + 100 * 75 * 1024 + 1 * 5 * PRICE_DENOMINATOR;
  const rounded = Math.floor((exact + PRICE_DENOMINATOR / 2) / PRICE_DENOMINATOR);
  assert.equal(sitePrice(config), rounded);
  assert.equal(apiPrice(config), rounded);
});

test('a price is never a fraction of a cent', () => {
  for (const product of snapshot) {
    for (const ram of [256, 512, 1024, 3072, 5120, 8192, 12288, 16384]) {
      for (const cpu of [0.5, 1, 2, 4]) {
        for (const disk of [1, 5, 10, 20, 50]) {
          const price = sitePrice({ ram, cpu, disk }, product.rates);
          assert.equal(Number.isInteger(price), true, 'the price is not a whole number of cents');
        }
      }
    }
  }
});
