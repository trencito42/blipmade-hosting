# 15 — Database integrity

Live `migrate diff` not run. Schema vs production drift UNVERIFIED.

## Uniques that exist (schema)

- `Order.number`; `Order.stripeCheckoutSessionId`.  
- `Payment.stripePaymentIntentId`; `Payment.stripeInvoiceId`.  
- `WebhookEvent @@unique([provider, eventId])`.  
- Promotion redemption `@@unique([promotionId, cardFingerprintHash])`.  
- Catalog preset `@@unique([presetId, version])`.  
- Instance `provisioningKey` used as idempotency for webhook units.

## Cascade

`Order.user` `onDelete: Cascade` — delete user deletes orders. `Payment.order` `onDelete: SetNull`. Financial history can vanish with the account. Account-export policy not read. Treat as P2 product/compliance, not a new BM (dedupe).

## Migrations

CI job `schema-drift` compares Prisma schema to migration history. Current Actions run UNVERIFIED. Pre-deploy SQL dumps on VM103 exist for `8b07cd2d`.

## WAL / PITR

Not seen inside the Postgres container this pass. RPO is dump-based (~24h + deploy dumps).
