/**
 * The truth of the catalog, checked without a screen.
 *
 * The audit found three ways in which the interface could say something the
 * server does not say:
 *
 *   1. the availability of a product was decided by the page instead of by
 *      the server, so a product that cannot be deployed could still get a
 *      deploy button;
 *   2. the configuration a price belongs to was not the configuration the
 *      control showed, so the slider displayed 4 GB while 5 GB was billed;
 *   3. the largest storage the catalog announces could not be reached in the
 *      control, so the advertised maximum could not be ordered.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  availabilityLabel,
  availabilityState,
  configurationFromQuery,
  cpuOptions,
  diskOptions,
  isOrderable,
  isUnavailable,
  orderBlockers,
  ramOptions,
  recommendedPreset,
  recommendedPrice,
  startingConfiguration,
  startingPrice,
  type AvailabilityState,
} from '../src/lib/pricing-contract.ts';
import type { CatalogProduct } from '../src/lib/api.ts';

/**
 * A product of the live catalog: 256 MB and 1 GB are the smallest, 50 GB is
 * the largest and 5 GB is what the catalog recommends.
 */
function discordBot(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 'p3',
    slug: 'discord-bot',
    name: 'Discord Bot',
    category: 'BOTS',
    description: 'A bot that stays online.',
    icon: 'bot',
    minRam: 256,
    minCpu: 1,
    minDisk: 1,
    defaultRam: 512,
    defaultCpu: 1,
    defaultDisk: 5,
    maxRam: 4096,
    maxCpu: 4,
    maxDisk: 50,
    visible: true,
    deployable: true,
    eggId: 15,
    docsUrl: null,
    price: { amount: 149, currency: 'EUR', period: 'MONTHLY' },
    pricing: {
      currency: 'EUR',
      period: 'MONTHLY',
      minimum: { ram: 256, cpu: 1, disk: 1, amount: 149 },
      recommended: { ram: 512, cpu: 1, disk: 5, amount: 179 },
    },
    availability: {
      state: 'DEPLOYABLE',
      enabled: true,
      installable: true,
      visible: true,
      orderable: true,
      blockers: [],
    },
    options: [],
    ...overrides,
  } as CatalogProduct;
}

/** The availability of a product in one of the four states of the server. */
function withState(state: AvailabilityState): Partial<CatalogProduct> {
  const orderable = state === 'DEPLOYABLE';
  return {
    availability: {
      state,
      enabled: orderable,
      installable: orderable,
      visible: state !== 'UNPUBLISHED',
      orderable,
      blockers: orderable ? [] : ['Its image is not installed on the panel yet.'],
    },
  };
}

// --- the availability decides what the interface does ------------------------

test('every state of the server has one wording and one answer', () => {
  const cases: [AvailabilityState, string, boolean][] = [
    ['DEPLOYABLE', 'Ready to deploy', true],
    ['COMING_SOON', 'Coming soon', false],
    ['TEMPORARILY_UNAVAILABLE', 'Temporarily unavailable', false],
    ['UNPUBLISHED', 'Not published', false],
  ];

  for (const [state, label, orderable] of cases) {
    const product = discordBot(withState(state));
    assert.equal(availabilityState(product), state);
    assert.equal(availabilityLabel(product), label);
    assert.equal(isOrderable(product), orderable);
    assert.equal(isUnavailable(product), !orderable);
    // A product that cannot be deployed says why, so the page can offer no
    // deploy button without leaving the customer in front of a dead end.
    assert.equal(orderBlockers(product).length > 0, !orderable);
  }
});

test('a product that cannot be deployed offers no deploy action', () => {
  // Listed and priced, but the panel cannot build it: the server refuses the
  // order, so the interface must not offer one.
  const blocked = discordBot(withState('TEMPORARILY_UNAVAILABLE'));
  assert.equal(isOrderable(blocked), false);
  assert.deepEqual(orderBlockers(blocked), ['Its image is not installed on the panel yet.']);

  // A product the operator has not validated yet is the same case.
  const coming = discordBot(withState('COMING_SOON'));
  assert.equal(isOrderable(coming), false);
  assert.equal(availabilityLabel(coming), 'Coming soon');
});

test('a server without a state falls back to the flag of the product', () => {
  const old = discordBot({ availability: undefined as never });
  assert.equal(availabilityState(old), 'DEPLOYABLE');
  assert.equal(isOrderable(old), true);

  const oldBlocked = discordBot({ deployable: false, availability: undefined as never });
  assert.equal(availabilityState(oldBlocked), 'COMING_SOON');
  assert.equal(isOrderable(oldBlocked), false);
});

// --- the price belongs to a configuration -------------------------------------

test('the price of the catalog is the price of the configuration it names', () => {
  const product = discordBot();
  const minimum = startingConfiguration(product);
  const recommended = recommendedPreset(product);

  // The configuration the starting price is the price of.
  assert.deepEqual(minimum, { ram: 256, cpu: 1, disk: 1 });
  assert.equal(startingPrice(product), product.pricing!.minimum.amount);

  // The configuration the recommended price is the price of.
  assert.deepEqual(recommended, { ram: 512, cpu: 1, disk: 5 });
  assert.equal(recommendedPrice(product), product.pricing!.recommended.amount);
  assert.notEqual(startingPrice(product), recommendedPrice(product));
});

test('the control can show both configurations the price book prices', () => {
  const product = discordBot();
  const minimum = startingConfiguration(product);
  const recommended = recommendedPreset(product);

  for (const configuration of [minimum, recommended]) {
    assert.ok(ramOptions(product).includes(configuration.ram), `memory ${configuration.ram} is not selectable`);
    assert.ok(cpuOptions(product).includes(configuration.cpu), `cpu ${configuration.cpu} is not selectable`);
    assert.ok(diskOptions(product).includes(configuration.disk), `disk ${configuration.disk} is not selectable`);
  }
});

test('the memory of the interface is written with one helper', () => {
  // The smallest configuration of the catalog is 256 MB. It is never written
  // as "0,3 GB": one helper writes every memory size of the interface.
  const product = discordBot();
  assert.equal(startingConfiguration(product).ram, 256);
  assert.equal(ramOptions(product)[0], 256);
});

// --- the storage control reaches the announced maximum -----------------------

test('the storage control reaches the maximum the catalog announces', () => {
  const product = discordBot();
  const options = diskOptions(product);

  // The biggest size the product allows is the last one of the grid, so the
  // control can select it and the server can order it.
  assert.equal(options[options.length - 1], product.maxDisk);
  assert.ok(options.includes(product.maxDisk));
  // And the smallest one is the first.
  assert.equal(options[0], product.minDisk);
  // The recommended size of the price book is on the grid too.
  assert.ok(options.includes(recommendedPreset(product).disk));
});

test('the storage grid holds the whole gigabytes the server accepts', () => {
  const product = discordBot();
  for (const option of diskOptions(product)) {
    assert.ok(Number.isInteger(option), `${option} is not a whole gigabyte`);
    assert.ok(option >= product.minDisk && option <= product.maxDisk);
  }
  // Every gigabyte between the two ends can be picked.
  assert.equal(diskOptions(product).length, product.maxDisk - product.minDisk + 1);
});

test('a size the control cannot show is moved onto the grid', () => {
  const product = discordBot();

  // The address may carry any whole number. The control shows the closest
  // size of the grid, so the slider and the estimate never disagree.
  const configuration = configurationFromQuery({ ram: '512', cpu: '1', disk: '5' }, product);
  assert.deepEqual(configuration, { ram: 512, cpu: 1, disk: 5 });
  assert.ok(diskOptions(product).includes(configuration.disk));
});
