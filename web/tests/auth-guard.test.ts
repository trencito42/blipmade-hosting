/**
 * The rules of the routing of the session, checked without a browser.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The module under test is pure, so every rule can be checked directly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizedNext,
  homeOf,
  isInternalPath,
  isStaff,
  loginRedirect,
  normalizePath,
  postLoginTarget,
} from '../src/auth-guard.ts';

test('only a path of this site is an internal destination', () => {
  assert.equal(isInternalPath('/app'), true);
  assert.equal(isInternalPath('/app/instances?status=online'), true);
  assert.equal(isInternalPath('/app#anchor'), true);

  // Another site.
  assert.equal(isInternalPath('https://evil.example/steal'), false);
  assert.equal(isInternalPath('http://blipmade.com/app'), false);
  // The protocol relative form is read as another site by the browser.
  assert.equal(isInternalPath('//evil.example/steal'), false);
  assert.equal(isInternalPath('/\\evil.example/steal'), false);
  // A scheme that is not a path.
  assert.equal(isInternalPath('javascript:alert(1)'), false);
  assert.equal(isInternalPath('data:text/html,x'), false);
  assert.equal(isInternalPath(''), false);
  assert.equal(isInternalPath(null), false);
  assert.equal(isInternalPath(undefined), false);
});

test('the path of a destination is written the way the browser reads it', () => {
  assert.equal(normalizePath('/app/instances'), '/app/instances');
  assert.equal(normalizePath('/app/./instances'), '/app/instances');
  assert.equal(normalizePath('/app/../admin/orders'), '/admin/orders');
  assert.equal(normalizePath('/app/%2e%2e/admin/orders'), '/admin/orders');
  assert.equal(normalizePath('/app/instances?status=online'), '/app/instances?status=online');
  assert.equal(normalizePath('/app/instances#a'), '/app/instances#a');
  assert.equal(normalizePath('/%zz'), null);
});

test('a customer is only sent to the customer area', () => {
  assert.equal(authorizedNext('CUSTOMER', '/app'), '/app');
  assert.equal(authorizedNext('CUSTOMER', '/app/instances'), '/app/instances');
  assert.equal(authorizedNext('CUSTOMER', '/app/deploy/discord-bot'), '/app/deploy/discord-bot');
  assert.equal(authorizedNext('CUSTOMER', '/app/instances?status=online'), '/app/instances?status=online');

  // The admin area is closed to a customer, and the traversal cannot open it.
  assert.equal(authorizedNext('CUSTOMER', '/admin'), null);
  assert.equal(authorizedNext('CUSTOMER', '/admin/orders'), null);
  assert.equal(authorizedNext('CUSTOMER', '/app/../admin/orders'), null);
  assert.equal(authorizedNext('CUSTOMER', '/app%2f..%2fadmin/orders'), null);
});

test('staff and administrators may open both areas', () => {
  assert.equal(authorizedNext('STAFF', '/admin/orders'), '/admin/orders');
  assert.equal(authorizedNext('ADMIN', '/admin'), '/admin');
  assert.equal(authorizedNext('STAFF', '/app/instances'), '/app/instances');
  assert.equal(isStaff('STAFF'), true);
  assert.equal(isStaff('ADMIN'), true);
  assert.equal(isStaff('CUSTOMER'), false);
});

test('a destination that would loop is refused', () => {
  for (const role of ['CUSTOMER', 'STAFF', 'ADMIN'] as const) {
    assert.equal(authorizedNext(role, '/login'), null);
    assert.equal(authorizedNext(role, '/register'), null);
    assert.equal(authorizedNext(role, '/login?next=/app'), null);
    assert.equal(authorizedNext(role, '/forgot-password'), null);
    assert.equal(authorizedNext(role, '/reset-password'), null);
    assert.equal(authorizedNext(role, '/verify-email'), null);
  }
});

test('another site is never a destination', () => {
  for (const role of ['CUSTOMER', 'STAFF', 'ADMIN'] as const) {
    assert.equal(authorizedNext(role, 'https://evil.example/steal'), null);
    assert.equal(authorizedNext(role, '//evil.example/steal'), null);
    assert.equal(authorizedNext(role, 'javascript:alert(1)'), null);
    assert.equal(authorizedNext(role, ''), null);
    assert.equal(authorizedNext(role, null), null);
    assert.equal(authorizedNext(role, undefined), null);
  }
});

test('a customer lands on the customer area, staff on the admin area', () => {
  assert.equal(homeOf('CUSTOMER'), '/app');
  assert.equal(homeOf('STAFF'), '/admin');
  assert.equal(homeOf('ADMIN'), '/admin');

  assert.equal(postLoginTarget('CUSTOMER', null), '/app');
  assert.equal(postLoginTarget('CUSTOMER', '/app/instances'), '/app/instances');
  assert.equal(postLoginTarget('CUSTOMER', '/admin/orders'), '/app');
  assert.equal(postLoginTarget('STAFF', null), '/admin');
  assert.equal(postLoginTarget('STAFF', '/admin/orders'), '/admin/orders');
  assert.equal(postLoginTarget('ADMIN', 'https://evil.example'), '/admin');
});

test('the login keeps the page the visitor wanted', () => {
  assert.equal(loginRedirect('/app/instances'), '/login?next=%2Fapp%2Finstances');
  assert.equal(
    loginRedirect('/app/deploy/discord-bot'),
    '/login?next=%2Fapp%2Fdeploy%2Fdiscord-bot',
  );
  assert.equal(
    loginRedirect('/app/instances', '?status=online'),
    '/login?next=%2Fapp%2Finstances%3Fstatus%3Donline',
  );
  // A destination that is not a path of this site is not remembered.
  assert.equal(loginRedirect('https://evil.example'), '/login?next=%2Fapp');
});
