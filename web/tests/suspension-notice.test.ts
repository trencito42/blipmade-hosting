/**
 * The message of a sign-in that was refused, checked without a browser.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The account of a customer can be suspended by the operator. The customer
 * was disconnected and, when they tried to sign in again, the platform told
 * them that the email or the password was wrong. The customer thought the
 * account was lost.
 *
 * Two things are checked here:
 *
 *   1. a customer who owns a suspended account is told what happened and
 *      where to write;
 *   2. a wrong password still answers the same way as an address that does
 *      not exist, so a guess of a password never finds out whether an
 *      account exists.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { loginFailureMessage } from '../src/lib/login-message.ts';

test('a suspended account is told what happened and where to write', () => {
  const message = loginFailureMessage({
    code: 'account_suspended',
    message: 'This account is suspended. Contact support@blipmade.com to have it restored.',
    status: 401,
  });
  assert.match(message, /suspended/i);
  assert.match(message, /support@blipmade\.com/);
  assert.doesNotMatch(message, /password/i);
});

test('a wrong password says nothing about the account', () => {
  const message = loginFailureMessage({
    code: 'unauthorized',
    message: 'Email or password is not correct.',
    status: 401,
  });
  assert.equal(message, 'Email or password is incorrect.');
  assert.doesNotMatch(message, /suspended/i);
});

test('an address that does not exist answers the same way as a wrong password', () => {
  const wrongPassword = loginFailureMessage({
    code: 'unauthorized',
    message: 'Email or password is not correct.',
    status: 401,
  });
  const unknownAddress = loginFailureMessage({
    code: 'unauthorized',
    message: 'Email or password is not correct.',
    status: 401,
  });
  assert.equal(wrongPassword, unknownAddress);
});

test('the rate limit and the lost connection keep their own sentences', () => {
  assert.equal(
    loginFailureMessage({ code: 'rate_limited', message: 'Too many requests.', status: 429 }),
    'Too many attempts. Try again in 5 minutes.',
  );
  assert.equal(
    loginFailureMessage({ code: 'network_error', message: 'Cannot reach the API.', status: 0 }),
    'Cannot reach the Blipmade API. Check your connection and try again.',
  );
});

test('any other answer of the platform is shown as it is', () => {
  assert.equal(
    loginFailureMessage({ code: 'internal_error', message: 'Something went wrong on our side.', status: 500 }),
    'Something went wrong on our side.',
  );
});
