# 05 — Billing and commerce

Live money **configured**. No Checkout session created this audit. No Stripe Dashboard.

## Config vs money moved

| Claim | Evidence | Status |
|---|---|---|
| Live Stripe mode | Public health `stripe:"live"`; `PAYMENTS_ENABLED=true`; `STRIPE_SECRET_KEY` SET | VERIFIED config |
| Checkout would hit live API | `createCheckout` (`stripe.ts` 241–313) throws only when `paymentsEnabled` false; else `checkout.sessions.create` | VERIFIED code |
| A charge already happened | Stripe list 2026-11-06: 2 paid live charges | VERIFIED amounts; **owner: own test payments, not customers** |
| Test gateway | `stripeTestGateway()` not the production path when live keys + flag on | VERIFIED code |

`env.paymentsEnabled` = `PAYMENTS_ENABLED && STRIPE_SECRET_KEY.startsWith('sk_')` (`env.ts` ~562).

Safest owner action: set `PAYMENTS_ENABLED=false`. Do not rotate live keys from this audit. Do not disable Stripe account.

## Trace (code, not executed)

1. Customer UI → `POST` order (`orders.ts`).
2. Zero-total / promotion: `markOrderPaid` + `fulfilOrder` without Stripe (orders.ts ~426–428).
3. Paid: `createCheckout(order, email)` → Stripe session URL; order `stripeCheckoutSessionId`.
4. Webhook `checkout.session.completed` → instance create with `provisioningKey` `order:…:item:…:unit:…` → `enqueueProvisioning` (`webhooks.ts` 452–491). VPS lines via `fulfilVpsLine`. Mail via mail enqueue.
5. Worker consumes provision queue. Failure: line `FAILED`; order `PROVISIONING` until all lines terminal.
6. Unique `WebhookEvent @@unique([provider, eventId])`. Retry timer 5 min (`worker.ts`).

Partial-fail: paid order can leave `PROVISIONING` with some instances up. Refund vs that state not drilled.

## VAT / tax (BM-012)

Not a legal opinion.

- `STRIPE_TAX_ENABLED` UNSET → `automatic_tax` omitted.
- Quote: `flatRateCollected = !env.paymentsEnabled` (`catalog.ts` 592–624). Live quotes skip platform VAT; note can say “No VAT is added to this price.”
- Invoice helper: `taxApplies = !stripeTaxEnabled && taxRate && taxId` (`billing.ts` 453). If taxId empty, invoices carry no tax.
- Webhook `readSessionAmounts`: without Stripe Tax, `tax: 0` (`webhooks.ts` 133–139).

So VAT is **not calculated by Stripe and not added by the platform while payments are on**. Whether that is a documented business rule is UNVERIFIED (no owner tax memo found this pass).

## Financial risks

1. 59 orderable SKUs + live checkout (BM-015).  
2. VAT path empty (BM-012).  
3. No auditor-witnessed refund or failed-provision credit.  
4. Resize/credit in `upgrades.ts` with Stripe idempotency; live UI exposure UNVERIFIED.

## Tests

`stripe-sandbox-live.test.ts` gated `skipIf(!wanted || !isSandbox)`. Does not prove production live mode.
