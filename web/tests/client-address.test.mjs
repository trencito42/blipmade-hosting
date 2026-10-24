/**
 * The address of the client, checked without a server.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The module under test is pure, so every rule can be checked directly. The
 * rule is the one the chain of `X-Forwarded-For` is built on: the edge writes
 * the address of the client at the END of the chain, so the chain is read from
 * the right and the address of the client is the last address of the chain
 * that is not a known proxy.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isTrustedAddress,
  parseTrustedProxies,
  resolveClientAddress,
} from '../src/lib/client-address.mjs';

const EDGE = parseTrustedProxies('172.64.0.0/13,162.158.0.0/16');

test('the last address of the chain is the address of the client', () => {
  // The edge writes the address of the client at the end of the chain.
  const address = resolveClientAddress('172.64.1.2', '203.0.113.5, 198.51.100.7', EDGE);
  assert.equal(address, '198.51.100.7');
});

test('the address of the proxy is never the address that is written down', () => {
  // The chain is read from the right, so the closest proxy is skipped.
  const address = resolveClientAddress('172.64.1.2', '203.0.113.5, 172.69.155.34', EDGE);
  assert.equal(address, '203.0.113.5');
});

test('a chain of trusted addresses ends at the address of the socket', () => {
  const address = resolveClientAddress('172.64.1.2', '172.69.155.34, 162.158.172.150', EDGE);
  assert.equal(address, '172.64.1.2');
});

test('a header from an unknown peer is not believed', () => {
  // The peer is not a proxy that is known, so the header is a forgery.
  const address = resolveClientAddress('203.0.113.9', '198.51.100.7', EDGE);
  assert.equal(address, '203.0.113.9');
});

test('an empty header ends at the address of the socket', () => {
  assert.equal(resolveClientAddress('172.64.1.2', '', EDGE), '172.64.1.2');
  assert.equal(resolveClientAddress('172.64.1.2', undefined, EDGE), '172.64.1.2');
  assert.equal(resolveClientAddress('172.64.1.2', '   ', EDGE), '172.64.1.2');
});

test('a list that is not set believes nobody', () => {
  const empty = parseTrustedProxies('');
  assert.deepEqual(empty, []);
  assert.equal(resolveClientAddress('172.64.1.2', '203.0.113.5', empty), '172.64.1.2');
  assert.equal(resolveClientAddress('172.64.1.2', '203.0.113.5'), '172.64.1.2');
});

test('a block of addresses is a list of addresses', () => {
  const trusted = parseTrustedProxies('172.16.0.0/12');
  assert.equal(isTrustedAddress('172.16.0.1', trusted), true);
  assert.equal(isTrustedAddress('172.31.255.254', trusted), true);
  assert.equal(isTrustedAddress('172.32.0.1', trusted), false);
  assert.equal(isTrustedAddress('203.0.113.5', trusted), false);

  // The address of the client is found behind the proxies of the block.
  const address = resolveClientAddress('172.20.1.5', '203.0.113.5, 172.20.1.5', trusted);
  assert.equal(address, '203.0.113.5');
});

test('an exact address is an address and a block is not an address', () => {
  const trusted = parseTrustedProxies('10.0.0.7');
  assert.equal(isTrustedAddress('10.0.0.7', trusted), true);
  assert.equal(isTrustedAddress('10.0.0.8', trusted), false);
});

test('an entry that is not an address is ignored', () => {
  const trusted = parseTrustedProxies('not-an-address, 10.0.0.7');
  assert.equal(trusted.length, 1);
  assert.equal(isTrustedAddress('10.0.0.7', trusted), true);
});

test('the address of an IPv4 socket is the address of the client', () => {
  const trusted = parseTrustedProxies('10.0.0.7');
  const address = resolveClientAddress('::ffff:10.0.0.7', '203.0.113.5', trusted);
  assert.equal(address, '203.0.113.5');
  // The socket of an IPv6 loopback is the same address as the loopback.
  assert.equal(isTrustedAddress('::1', parseTrustedProxies('::1')), true);
});

test('the chain of the header is read from the right, not from the left', () => {
  const trusted = parseTrustedProxies('10.0.0.7');
  // The last address of the chain is the client: the edge writes it there.
  const address = resolveClientAddress('10.0.0.7', '203.0.113.5, 198.51.100.7', trusted);
  assert.equal(address, '198.51.100.7');
});

test('a client that forges the head of the chain does not choose its address', () => {
  const trusted = parseTrustedProxies('10.0.0.7');
  // The client sends its own `X-Forwarded-For` and the edge keeps the value
  // and writes the real address at the end of the chain. The forged value is
  // at the head of the chain, so it is not the address of the client.
  const address = resolveClientAddress('10.0.0.7', '9.9.9.9, 198.51.100.7', trusted);
  assert.equal(address, '198.51.100.7');
  assert.notEqual(address, '9.9.9.9');
});

test('the address the edge writes alone is the address of the client', () => {
  // The case of the edge that replaces the header of the client.
  const trusted = parseTrustedProxies('10.0.0.7');
  const address = resolveClientAddress('10.0.0.7', '198.51.100.7', trusted);
  assert.equal(address, '198.51.100.7');
});
