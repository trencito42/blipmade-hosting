/**
 * The honesty of the billing page, checked without a screen.
 *
 * The audit found four ways in which the billing page could say something the
 * platform does not say:
 *
 *   1. the page offered a payment without asking whether one could be taken,
 *      so the customer always met a failure that nothing explained;
 *   2. the answer of the billing portal without a portal was shown as an
 *      error, although it is the normal answer for a customer who never paid;
 *   3. a subscription that ends said only that it ended, although the service
 *      keeps running until the end of the period that was paid for;
 *   4. the local test gateway was presented as a real payment.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The page is a TSX file, so Vite reads it for us, the same way the build
 * does, and the rules it follows are checked directly.
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');

interface PaymentState {
  enabled: boolean;
  simulated: boolean;
  reason: string | null;
}

interface Subscription {
  id: string;
  instanceId: string | null;
  instanceName: string | null;
  status: string;
  amount: number;
  currency: string;
  currentPeriodEnd: string | null;
  stripeManaged?: boolean;
  cancelAtPeriodEnd: boolean;
}

type PortalOutcome =
  | { kind: 'opened'; url: string }
  | { kind: 'notice'; message: string };

interface BillingPage {
  paymentAvailability: (
    state: PaymentState | null,
  ) => { available: boolean; simulated: boolean; reason: string | null };
  openPaymentMethod: (
    request: () => Promise<{ url: string | null; message: string | null }>,
    open: (url: string) => void,
  ) => Promise<PortalOutcome>;
  checkoutNotice: (options: {
    cancelled: boolean;
    succeeded: boolean;
    state: 'idle' | 'confirming' | 'confirmed' | 'failed';
    payments: PaymentState | null;
  }) => { title: string; description: string; body: string };
  subscriptionPeriod: (subscription: Subscription) => string;
  subscriptionAction: (subscription: Subscription) => 'resume' | 'cancel';
}

let page: BillingPage;
let server: ViteDevServer;
let source = '';

before(async () => {
  server = await createServer({
    root: webRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  page = (await server.ssrLoadModule('/src/app/Billing.tsx')) as BillingPage;
  source = await readFile(join(webRoot, 'src/app/Billing.tsx'), 'utf8');
});

after(async () => {
  await server.close();
});

/** A subscription that renews at the close of the period that was paid for. */
function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub_1',
    instanceId: 'inst_1',
    instanceName: 'Discord bot',
    status: 'active',
    amount: 1490,
    currency: 'EUR',
    currentPeriodEnd: '2026-11-15T12:00:00.000Z',
    stripeManaged: true,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

// --- the state of the payments ----------------------------------------------

test('the page asks the platform whether a payment can be taken', () => {
  // The state of the payments is read before a payment is offered.
  assert.match(source, /get<[^>]*>\('\/billing\/payment-state'/);
});

test('a payment that cannot be taken is not offered, and the server says why', () => {
  const off = page.paymentAvailability({
    enabled: false,
    simulated: false,
    reason: 'Payments are not available at the moment: no Stripe key is configured on this environment.',
  });
  assert.equal(off.available, false);
  assert.equal(off.reason, 'Payments are not available at the moment: no Stripe key is configured on this environment.');

  // The action of the page follows the answer of the server.
  assert.match(source, /disabled=\{[^}]*paymentAvailable/);

  // The reason of the server is the sentence the customer reads: the page
  // writes no reason of its own any more.
  assert.match(source, /availability\.reason/);
  assert.doesNotMatch(source, /billing is not configured in this environment/);
});

test('a payment that can be taken is offered', () => {
  const on = page.paymentAvailability({ enabled: true, simulated: false, reason: null });
  assert.equal(on.available, true);
  assert.equal(on.simulated, false);
  assert.equal(on.reason, null);
});

// --- the billing portal ------------------------------------------------------

test('the portal is only opened when the server gave an address', async () => {
  const opened: string[] = [];
  const outcome = await page.openPaymentMethod(
    async () => ({ url: 'https://billing.stripe.com/session/live_123', message: null }),
    (url) => opened.push(url),
  );

  assert.deepEqual(opened, ['https://billing.stripe.com/session/live_123']);
  assert.equal(outcome.kind, 'opened');
});

test('a customer without a payment method gets no portal and no error', async () => {
  const opened: string[] = [];
  const outcome = await page.openPaymentMethod(
    async () => ({ url: null, message: 'No payment method is on file yet.' }),
    (url) => opened.push(url),
  );

  // No portal is opened for an answer without an address.
  assert.deepEqual(opened, []);
  // The answer is a note and not a failure, and it is the sentence of the
  // server.
  assert.equal(outcome.kind, 'notice');
  if (outcome.kind === 'notice') {
    assert.equal(outcome.message, 'No payment method is on file yet.');
  }

  // The page shows that note as a status, and keeps the error for a request
  // that really failed.
  assert.match(source, /role="status"[\s\S]{0,200}\{paymentNotice\}/);
  assert.doesNotMatch(source, /role="alert"[\s\S]{0,200}\{paymentNotice\}/);
  assert.match(source, /role="alert"[\s\S]{0,200}\{paymentMethodAction\.error\}/);
});

// --- the payment the customer comes back from --------------------------------

test('a real payment is announced when the platform says it was real', () => {
  const real = page.checkoutNotice({
    cancelled: false,
    succeeded: true,
    state: 'confirmed',
    payments: { enabled: true, simulated: false, reason: null },
  });
  assert.equal(real.title, 'Payment received');
  assert.match(real.description, /Your payment was received/);
});

test('the local test gateway is never presented as a payment that was made', () => {
  const simulated = page.checkoutNotice({
    cancelled: false,
    succeeded: true,
    state: 'confirmed',
    payments: {
      enabled: false,
      simulated: true,
      reason: 'The local test gateway is in use, so no real payment is taken.',
    },
  });

  // Neither the title nor the sentence says that money was taken.
  assert.doesNotMatch(simulated.title, /received/i);
  assert.doesNotMatch(simulated.description, /payment was received/i);
  assert.doesNotMatch(simulated.description, /payment was confirmed/i);
  // The sentence of the server is the one the customer reads.
  assert.equal(simulated.description, 'The local test gateway is in use, so no real payment is taken.');
});

test('the test gateway never sends the customer looking for money', () => {
  const failed = page.checkoutNotice({
    cancelled: false,
    succeeded: false,
    state: 'failed',
    payments: {
      enabled: false,
      simulated: true,
      reason: 'The local test gateway is in use, so no real payment is taken.',
    },
  });
  assert.doesNotMatch(failed.body, /money/);
  assert.match(failed.body, /still waiting for the payment/);

  // A real payment that could not be confirmed still asks the customer to
  // write when the money left the account.
  const real = page.checkoutNotice({
    cancelled: false,
    succeeded: false,
    state: 'failed',
    payments: { enabled: true, simulated: false, reason: null },
  });
  assert.match(real.body, /the money left your account/);
});

test('the page does not claim that money was taken before the platform says so', () => {
  const unknown = page.checkoutNotice({ cancelled: false, succeeded: true, state: 'idle', payments: null });
  assert.doesNotMatch(unknown.description, /payment was received/i);
  assert.match(unknown.description, /Checking the state of your payment/);
});

test('a payment that was not made leaves the order waiting', () => {
  const cancelled = page.checkoutNotice({ cancelled: true, succeeded: false, state: 'idle', payments: null });
  assert.equal(cancelled.title, 'Payment cancelled');
  assert.match(cancelled.description, /still waiting for you/);
});

// --- the subscription that ends ---------------------------------------------

test('a subscription that ends keeps running until the end of the paid period', () => {
  const sentence = page.subscriptionPeriod(subscription({ cancelAtPeriodEnd: true }));

  assert.match(sentence, /Cancels at the end of the paid period/);
  assert.match(sentence, /Nov 2026/);
  assert.match(sentence, /keeps running until then/i);
  // A service that still runs is never called cancelled.
  assert.doesNotMatch(sentence, /cancelled/i);
});

test('a subscription that renews says that it renews', () => {
  const sentence = page.subscriptionPeriod(subscription());
  assert.match(sentence, /^Renews /);
  assert.doesNotMatch(sentence, /Cancels/);
});

test('a free first term does not claim an automatic renewal', () => {
  const sentence = page.subscriptionPeriod(subscription({ amount: 0, stripeManaged: false }));
  assert.match(sentence, /Paid through 15 Nov 2026/);
  assert.match(sentence, /Automatic renewal is not set up/);
  assert.doesNotMatch(sentence, /^Renews /);
});

test('the resume is offered only while the subscription ends at the close of the paid period', () => {
  assert.equal(page.subscriptionAction(subscription({ cancelAtPeriodEnd: true })), 'resume');
  assert.equal(page.subscriptionAction(subscription()), 'cancel');
});
