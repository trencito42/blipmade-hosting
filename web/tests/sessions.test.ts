/**
 * The list of the sessions of an account, checked without a browser.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The list shows the moment of the sign-in and the last activity of every
 * session. Two sessions of the same device, of the same address and of the
 * same day used to look exactly the same, so the two moments are what tells
 * them apart.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { relativeTime, sessionActivity, sessionSummary, type AccountSession } from '../src/lib/api.ts';

const NOW = Date.parse('2026-10-23T14:44:00.000Z');

function session(overrides: Partial<AccountSession> = {}): AccountSession {
  return {
    id: 'session-1',
    ip: '203.0.113.5',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
    device: 'Chrome on iOS 18.7 (iPhone)',
    createdAt: '2026-10-23T14:32:00.000Z',
    lastSeenAt: '2026-10-23T14:32:00.000Z',
    expiresAt: '2026-11-06T14:32:00.000Z',
    current: true,
    ...overrides,
  };
}

test('the last activity of a session is a moment in the past', () => {
  assert.equal(relativeTime('2026-10-23T14:32:00.000Z', NOW), '12 minutes ago');
  assert.equal(relativeTime('2026-10-23T14:43:00.000Z', NOW), '1 minute ago');
  assert.equal(relativeTime('2026-10-23T14:43:30.000Z', NOW), 'just now');
  assert.equal(relativeTime('2026-10-23T12:44:00.000Z', NOW), '2 hours ago');
  assert.equal(relativeTime('2026-10-21T14:44:00.000Z', NOW), '2 days ago');
});

test('a session that was never used again says so', () => {
  assert.equal(relativeTime(null, NOW), 'not known');
  assert.equal(sessionActivity({ lastSeenAt: null }, NOW), 'no activity recorded');
  assert.equal(sessionActivity({ lastSeenAt: '2026-10-23T14:32:00.000Z' }, NOW), 'active 12 minutes ago');
});

test('the line of a session shows the sign-in and the last activity', () => {
  const summary = sessionSummary(session(), NOW);
  assert.ok(summary.includes('203.0.113.5'), summary);
  assert.ok(summary.includes('signed in on'), summary);
  assert.ok(summary.includes('active 12 minutes ago'), summary);
});

test('two sessions of the same device do not look the same', () => {
  const morning = sessionSummary(
    session({ id: 'morning', createdAt: '2026-10-23T09:00:00.000Z', lastSeenAt: '2026-10-23T09:05:00.000Z' }),
    NOW,
  );
  const afternoon = sessionSummary(session({ id: 'afternoon' }), NOW);
  assert.notEqual(morning, afternoon);
});

test('a session without an address says that the address is not known', () => {
  const summary = sessionSummary(session({ ip: null }), NOW);
  assert.ok(summary.includes('Unknown address'), summary);
});
