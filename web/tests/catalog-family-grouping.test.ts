import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectPreparedFamilies } from '../src/app/catalog-family-grouping.ts';

const one = { slug: 'minecraft-forge', variants: [{ product: { orderable: true } }] };
const unavailable = { slug: 'rust', variants: [{ product: { orderable: false } }] };
const mixed = { slug: 'minecraft', variants: [{ product: { orderable: false } }, { product: { orderable: true } }] };
const empty = { slug: 'unprepared', variants: [] };

test('prepared single-variant families appear among ready family cards', () => {
  assert.deepEqual(selectPreparedFamilies([one, unavailable, mixed, empty], 'ready').map((family) => family.slug), [
    'minecraft-forge',
    'minecraft',
  ]);
});

test('all products mode retains unavailable families but not empty families', () => {
  assert.deepEqual(selectPreparedFamilies([one, unavailable, mixed, empty], 'all').map((family) => family.slug), [
    'minecraft-forge',
    'rust',
    'minecraft',
  ]);
});
