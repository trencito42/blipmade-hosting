/**
 * The permission gates of the pricing screen.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The module under test is pure, so every gate can be checked directly: the
 * screen opens with "pricing.read", the form is editable with "pricing.write",
 * and an administrator holds every permission.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { can, pricingGate } from '../src/admin/permissions.ts';

test('an administrator holds every permission', () => {
  const admin = { role: 'ADMIN', permissions: [] };

  assert.equal(can(admin, 'pricing.read'), true);
  assert.equal(can(admin, 'pricing.write'), true);
  assert.equal(can(admin, 'staff.write'), true);
});

test('a staff member holds only the permissions that were granted', () => {
  const staff = { role: 'STAFF', permissions: ['pricing.read'] };

  assert.equal(can(staff, 'pricing.read'), true);
  assert.equal(can(staff, 'pricing.write'), false);
  assert.equal(can(staff, 'customers.write'), false);
});

test('an account without permissions holds none of them', () => {
  const staff = { role: 'STAFF', permissions: [] };

  assert.equal(can(staff, 'pricing.read'), false);
  assert.equal(can(staff, 'pricing.write'), false);
});

test('a missing account holds no permission at all', () => {
  assert.equal(can(null, 'pricing.read'), false);
  assert.equal(can(undefined, 'pricing.write'), false);
});

test('the pricing screen opens with pricing.read and is editable with pricing.write', () => {
  assert.deepEqual(pricingGate({ role: 'ADMIN', permissions: [] }), { mayRead: true, mayWrite: true });
  assert.deepEqual(pricingGate({ role: 'STAFF', permissions: ['pricing.read'] }), { mayRead: true, mayWrite: false });
  assert.deepEqual(pricingGate({ role: 'STAFF', permissions: ['pricing.write'] }), { mayRead: false, mayWrite: true });
  assert.deepEqual(pricingGate({ role: 'STAFF', permissions: [] }), { mayRead: false, mayWrite: false });
  assert.deepEqual(pricingGate(null), { mayRead: false, mayWrite: false });
});
