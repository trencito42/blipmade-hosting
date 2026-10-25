/**
 * The stand-in for the resolver of the platform.
 *
 * The platform proves the ownership of a hostname with a TXT record that the
 * customer publishes. A record cannot be published from this host, so the
 * proof is given here: when a file holds a name and a token, the lookup of
 * that name answers with that token.
 *
 * Every other lookup is passed to the real resolver, so nothing else of the
 * platform is changed. The file is written by audit/_tools/r3-domain-probe.mjs
 * right before the proof is asked for.
 *
 * Usage: node --import ./audit/_tools/r3-dns-stub.mjs dist/index.js
 */
import { readFileSync } from 'node:fs';
import { Resolver } from 'node:dns/promises';

const FILE = process.env.R3_DNS_STUB_FILE ?? '/tmp/blipmade-r3/dns-stub.json';

const original = Resolver.prototype.resolveTxt;

Resolver.prototype.resolveTxt = async function resolveTxt(name) {
  let stub = null;
  try {
    stub = JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    stub = null;
  }
  if (stub && stub.host && String(name).toLowerCase() === String(stub.host).toLowerCase()) {
    return [[stub.token]];
  }
  return original.call(this, name);
};
