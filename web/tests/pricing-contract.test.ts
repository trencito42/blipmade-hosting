/**
 * The pricing contract between the catalog, the configurator, the review and
 * the checkout.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The module under test is pure, so every rule of the contract can be checked
 * directly: the price of the catalog belongs to one configuration, and the
 * configurator has to start from that configuration.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampConfiguration,
  configurationFromQuery,
  configurationToQuery,
  deployPathFor,
  isOrderable,
  minimumConfiguration,
  optionCodesFromQuery,
  orderBlockers,
  recommendedConfiguration,
  recommendedPreset,
  recommendedPrice,
  sameConfiguration,
  startingConfiguration,
  startingPrice,
  type ResourceConfiguration,
} from '../src/lib/pricing-contract.ts';
import type { CatalogProduct } from '../src/lib/api.ts';

/** A product of the live catalog: 512 MB and 5 GB are the smallest. */
function wordpress(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 'p1',
    slug: 'wordpress',
    name: 'WordPress',
    category: 'WEB_CMS',
    description: 'A website and blog platform.',
    icon: 'globe',
    minRam: 512,
    minCpu: 1,
    minDisk: 5,
    defaultRam: 1024,
    defaultCpu: 1,
    defaultDisk: 10,
    maxRam: 8192,
    maxCpu: 4,
    maxDisk: 100,
    visible: true,
    deployable: true,
    eggId: 3,
    docsUrl: null,
    price: { amount: 149, currency: 'EUR', period: 'MONTHLY' },
    pricing: {
      currency: 'EUR',
      period: 'MONTHLY',
      minimum: { ram: 512, cpu: 1, disk: 5, amount: 149 },
      recommended: { ram: 1024, cpu: 1, disk: 10, amount: 189 },
    },
    availability: { enabled: true, installable: true, blockers: [], orderable: true },
    options: [],
    ...overrides,
  } as CatalogProduct;
}

test('the smallest configuration is kept inside the limits', () => {
  assert.deepEqual(minimumConfiguration(wordpress()), { ram: 512, cpu: 1, disk: 5 });
  assert.equal(clampConfiguration(99999, 512, 8192), 8192);
  assert.equal(clampConfiguration(1, 512, 8192), 512);
});

test('the recommended configuration is the default, kept inside the limits', () => {
  assert.deepEqual(recommendedConfiguration(wordpress()), { ram: 1024, cpu: 1, disk: 10 });

  // A default outside the limits of the product is brought back inside.
  const broken = wordpress({ defaultRam: 99999, defaultDisk: 999 });
  assert.deepEqual(recommendedConfiguration(broken), { ram: 8192, cpu: 1, disk: 100 });
});

test('a deployment starts from the configuration the starting price is the price of', () => {
  const product = wordpress();
  const start = startingConfiguration(product);

  assert.deepEqual(start, { ram: 512, cpu: 1, disk: 5 });
  assert.equal(startingPrice(product), product.pricing!.minimum.amount);
  // The starting price is the price of that configuration and of no other.
  assert.equal(startingPrice(product), 149);
  assert.notEqual(startingPrice(product), recommendedPrice(product));
});

test('the price book of the server is the truth', () => {
  const product = wordpress();
  assert.deepEqual(recommendedPreset(product), { ram: 1024, cpu: 1, disk: 10 });
  assert.equal(recommendedPrice(product), 189);
});

test('a server without a price book falls back to the fields of the product', () => {
  const product = wordpress({ pricing: null });
  assert.deepEqual(startingConfiguration(product), { ram: 512, cpu: 1, disk: 5 });
  assert.deepEqual(recommendedPreset(product), { ram: 1024, cpu: 1, disk: 10 });
  assert.equal(startingPrice(product), 149);
  assert.equal(recommendedPrice(product), null);
});

test('the configuration of the address is read and clamped', () => {
  const product = wordpress();

  assert.deepEqual(configurationFromQuery({}, product), { ram: 512, cpu: 1, disk: 5 });
  assert.deepEqual(configurationFromQuery({ ram: '1024', cpu: '2', disk: '20' }, product), {
    ram: 1024,
    cpu: 2,
    disk: 20,
  });
  // A value outside the limits of the product is brought back inside.
  assert.deepEqual(configurationFromQuery({ ram: '99999' }, product), { ram: 8192, cpu: 1, disk: 5 });
  // A value that is not a whole number is ignored.
  assert.deepEqual(configurationFromQuery({ ram: '1.5' }, product), { ram: 512, cpu: 1, disk: 5 });
  assert.deepEqual(configurationFromQuery({ ram: 'abc' }, product), { ram: 512, cpu: 1, disk: 5 });
});

test('the configuration survives the address', () => {
  const config: ResourceConfiguration = { ram: 1024, cpu: 2, disk: 20 };
  const query = configurationToQuery(config, ['backup']);
  assert.deepEqual(query, { ram: '1024', cpu: '2', disk: '20', opts: 'backup' });

  const product = wordpress();
  assert.deepEqual(configurationFromQuery(query, product), config);
  assert.deepEqual(optionCodesFromQuery(query, product), []);
});

test('the address of the deploy page carries the configuration', () => {
  const path = deployPathFor('wordpress', { ram: 512, cpu: 1, disk: 5 }, [], { step: '2' });
  assert.match(path, /^\/app\/deploy\/wordpress\?/);
  assert.match(path, /ram=512/);
  assert.match(path, /cpu=1/);
  assert.match(path, /disk=5/);
  assert.match(path, /step=2/);
});

test('an add-on the product does not offer is dropped', () => {
  const product = wordpress({ options: [{ id: 'o1', code: 'backup', name: 'Backup', amount: 100, currency: 'EUR', active: true }] });
  assert.deepEqual(optionCodesFromQuery({ opts: 'backup' }, product), ['backup']);
  assert.deepEqual(optionCodesFromQuery({ opts: 'backup,unknown' }, product), ['backup']);
  assert.deepEqual(optionCodesFromQuery({ opts: 'unknown' }, product), []);
});

test('the answer of the server decides what can be ordered', () => {
  // The flag of the catalog says yes, the server says no: the server wins.
  const blocked = wordpress({
    deployable: true,
    availability: {
      enabled: true,
      installable: false,
      blockers: ['Its image is not installed on the panel yet.'],
      orderable: false,
    },
  });
  assert.equal(isOrderable(blocked), false);
  assert.deepEqual(orderBlockers(blocked), ['Its image is not installed on the panel yet.']);

  const allowed = wordpress();
  assert.equal(isOrderable(allowed), true);
  assert.deepEqual(orderBlockers(allowed), []);
});

test('an old server without an availability falls back to the flag', () => {
  const old = wordpress({ availability: undefined as never });
  assert.equal(isOrderable(old), true);

  const oldUnpriced = wordpress({ price: null, availability: undefined as never });
  assert.equal(isOrderable(oldUnpriced), false);
  assert.equal(orderBlockers(oldUnpriced).length, 1);
});

test('two configurations are the same when their resources are the same', () => {
  assert.equal(sameConfiguration({ ram: 512, cpu: 1, disk: 5 }, { ram: 512, cpu: 1, disk: 5 }), true);
  assert.equal(sameConfiguration({ ram: 512, cpu: 1, disk: 5 }, { ram: 1024, cpu: 1, disk: 5 }), false);
});
