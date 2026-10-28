# Blipmade API Contract (v1)

Base URL: `/api` (proxied) or `http://127.0.0.1:3100` directly.
All responses are JSON. Errors: `{ "error": { "code": string, "message": string, "requestId"?: string, "fields"?: Record<string,string> } }`.
Money is always an **integer number of minor units** (EUR cents). Never a float. Format on the client.

## Auth & session

- `POST /api/auth/register` → `{ email, password, name? }` → `201 { user, mail: { state, message } }`, sets session cookie.
- `POST /api/auth/login` → `{ email, password }` → `200 { user }`, sets session cookie.
- `POST /api/auth/logout` → `204`.
- `GET  /api/auth/session` → `200 { user: User | null }`.
- `POST /api/auth/verify-email` → `{ token }` → `204`.
- `POST /api/auth/resend-verification` → `200 { message, mail: { configured } }` (the same answer for every address, never reveals existence).
- `POST /api/auth/forgot-password` → `{ email }` → `200 { message, mail: { configured } }` (the same answer for every address).
- `POST /api/auth/reset-password` → `{ token, password }` → `204`.
- `POST /api/auth/enroll-admin` → `{ email, password, enrollmentKey }` → `200 { user }`. Only works while there is no admin in the database.

`User = { id, email, name, role: "CUSTOMER"|"STAFF"|"ADMIN", emailVerified: boolean }`

The answers of `resend-verification` and `forgot-password` say whether the message could really leave. While
`SMTP_URL` is empty the message is written to a file and nobody receives it, and the answer says so instead of
claiming that a message is on its way. The answer is the same for an address that has an account and for one that
has not, so it never tells whether an account exists.

## Settings

All of these need a session.

- `GET    /api/settings` → `200 { profile, pendingEmail, preferences, sessions, account }`
- `PATCH  /api/settings/profile` → `{ firstName, lastName }` → `200 { firstName, lastName }`
- `POST   /api/settings/email` → `{ email }` → `200 { pendingEmail, expiresAt, delivery, delivered, message }`. The address of the account changes only after the link is opened.
- `POST   /api/settings/email/confirm` → `{ token }` → `200 { email }`
- `POST   /api/settings/password` → `{ currentPassword, newPassword }` → `200 { changed, closedSessions }`. The other sessions of the account end.
- `GET    /api/settings/sessions` → `200 { sessions }`
- `DELETE /api/settings/sessions/:id` → `200 { revoked, current }`
- `GET    /api/settings/notifications` → `200 { preferences }`
- `PUT    /api/settings/notifications` → `{ productUpdates, billing, support, incidents, marketing }` → `200 { preferences }`
- `POST   /api/settings/account/closure` → `{ password, confirmation: "CLOSE MY ACCOUNT" }` → `200 { requestedAt, services, subscriptions, message }`. The request is recorded; nothing is deleted.
- `DELETE /api/settings/account/closure` → `200 { requestedAt: null }`

Cookies: `bm_session` (HttpOnly, SameSite=Lax, Secure in production), `bm_csrf` (readable by JS).
CSRF: send `X-CSRF-Token` header on every state-changing request, value = `bm_csrf` cookie.

## Catalog

- `GET /api/catalog/products?category=&search=` → `200 { products: Product[] }`
- `GET /api/catalog/products/:slug` → `200 { product: Product }`
- `POST /api/catalog/quote` → body `{ items: [{ productSlug, ram, cpu, disk, optionCodes?, quantity? }], promotionCode?, period? }`
  → `200 { items: QuoteItem[], subtotal, discount, total, currency, promotion?: { code, valid, reason }, tax: QuoteTax }`

The processor of a line is a share of a processor and it may be a half: `cpu`
is a number, not a whole number. The quote carries the parts of the price of
every line of a server and the tax of the invoice, so the configurator shows
the breakdown and the tax without calculating anything of its own.

```
Product = {
  id, slug, name, category, description, icon,
  minRam, minCpu, minDisk, defaultRam, defaultCpu, defaultDisk, maxRam, maxCpu, maxDisk,
  visible, deployable, docsUrl,
  price: { amount, currency, period } | null,      // monthly base for the min config
  pricing: PriceBook | null,                       // the book of the two configurations
  availability: Availability,
  options: { code, name, description, amount, currency }[]
}
QuoteItem = { productSlug, name, ram, cpu, disk, optionCodes, quantity, unitAmount, total, currency, fulfilment, breakdown: Breakdown | null }

// Every amount is in minor units (cents) of the currency of the row.
PriceBook = {
  currency, period,
  minimum:    { ram, cpu, disk, amount },   // the configuration the starting price is for
  recommended: { ram, cpu, disk, amount },  // a bigger configuration, with its own price
  rates: ResourceRates,                     // the card of the platform that priced it
  breakdown: { minimum: Breakdown, recommended: Breakdown }
}

// The card of the platform, for a month. One card for every server.
ResourceRates = { ramPerGb, cpuPerUnit, diskPerGb, baseFee }

// The parts of the price of a configuration. The parts add up to the total.
Breakdown = { ram, cpu, disk, base, options, total }

// The tax of the invoice of the platform. It is added to the invoices the
// platform writes itself, and only when there is a rate and a tax identifier.
QuoteTax = { rate: number | null, amount, applies, note: string | null, total }
Availability = {
  state: 'DEPLOYABLE' | 'COMING_SOON' | 'TEMPORARILY_UNAVAILABLE' | 'UNPUBLISHED',
  enabled,        // the operator marked the product as validated
  installable,    // the product has an egg mapping on the panel
  visible,        // the product is published
  orderable,      // the only state in which an order is accepted
  blockers: string[]
}
```

Pricing is computed **server-side only**. The client never computes a price; it renders the quote.

The starting price of a product is the price of its **minimum** configuration, and the
configurator has to start from exactly that configuration. The recommended configuration is a
bigger one and it has its own price, which is never the same number under two meanings. Both
numbers come from the same function that prices an order, so the catalogue and the quote cannot
drift apart.

The availability is **derived**, never set by hand: a product is orderable when it is published,
validated and has an egg mapping on the panel. A product that exists in the catalogue is not
therefore orderable, and the server refuses the order with the same states the interface shows.

## Orders

- `POST /api/orders` → body `{ items: QuoteItemInput[], promotionCode? }` → `201 { order }`
- `GET /api/orders` → `200 { orders: Order[] }`
- `GET /api/orders/:id` → `200 { order }`
- `POST /api/orders/:id/checkout` → `200 { url }` (Stripe Checkout URL) or `{ url: null, message }` when Stripe is not configured.
  An order that a promotion covers completely costs nothing, so it is confirmed and provisioned
  without a payment provider: `200 { url: null, sessionId: null, message, free: true }`.
- `POST /api/orders/:id/cancel` → `204`

```
Order = { id, number, status, total, discount, currency, createdAt, items: OrderItem[] }
OrderItem = { id, name, productSlug, quantity, unitAmount, total, config }
```

## Billing

- `GET /api/billing/summary` → `200 { currency, monthlyEstimate, currentPeriodEnd, paymentMethod, subscriptions: Subscription[] }`
- `GET /api/billing/invoices` → `200 { invoices: Invoice[] }`
- `GET /api/billing/subscriptions` → `200 { subscriptions: Subscription[] }`
- `POST /api/billing/subscriptions/:id/cancel` → `200 { subscription }` (cancel at period end)
- `POST /api/billing/subscriptions/:id/resume` → `200 { subscription }`
- `POST /api/billing/payment-method` → `200 { url }` (Stripe billing portal session)

```
Subscription = { id, instanceId, instanceName, status, amount, currency, currentPeriodEnd, cancelAtPeriodEnd }
Invoice = { id, number, status, amount, tax, total, currency, hostedUrl, pdfUrl, createdAt, periodStart, periodEnd }
```

## Instances

All routes enforce ownership. Any other customer's id returns `404`.

- `GET /api/instances` → `200 { instances: Instance[] }`
- `GET /api/instances/:id` → `200 { instance: Instance }`
- `POST /api/instances/:id/power` → `{ signal: "start"|"stop"|"restart"|"kill" }` → `202 { instanceId, accepted }`
- `POST /api/instances/:id/command` → `{ command }` → `200 { sent: true }`
- `GET /api/instances/:id/metrics` → `200 { metrics: { state, cpuAbsolute, memoryBytes, networkRx, networkTx, diskBytes, uptimeMs } | null }`
- `GET /api/instances/:id/resources` → `200 { resources: { state, is_suspended, cpu_absolute, memory_bytes, network: { rx, tx }, disk: { used }, uptime } }`
- `GET /api/instances/:id/server` → `200 { server: { uuid, identifier, name, state, isSuspended, limits, features, createdAt } }`
- `GET /api/instances/:id/activity` → `200 { activity: [{ user, action, meta, createdAt }] }`
- `GET /api/instances/:id/console` → `200 { websocket: "/api/instances/:id/console/stream" }` — the path of the relay on Blipmade. The address of the node and the token of the console never leave the server.
- `GET /api/instances/:id/console/stream` → WebSocket, the relay to the console of the node. The session of the customer is checked when it opens.
- `GET /api/instances/:id/files?path=` → `200 { files: FileEntry[], entries: FileEntry[], path }`
- `GET /api/instances/:id/file?path=` → `200 { content, encoding }`
- `PUT /api/instances/:id/file` → `{ path, content }` → `204`
- `DELETE /api/instances/:id/file` → `?path=` → `204`
- `POST /api/instances/:id/files/rename` → `{ path, to }` → `200 { renamed: true }`
- `POST /api/instances/:id/files/move` → `{ path, to }` → `200 { moved: true }`
- `POST /api/instances/:id/files/copy` → `{ path, to }` → `200 { copied: true }`
- `POST /api/instances/:id/files/compress` → `{ paths, format: "tar"|"zip" }` → `200 { compressed: true }` (also `/files/archive`)
- `POST /api/instances/:id/files/decompress` → `{ path, format }` → `200 { decompressed: true }` (also `/files/unarchive`)
- `POST /api/instances/:id/files/chmod` → `{ path, mode }` → `200 { chmodded: true }`
- `POST /api/instances/:id/files/upload` → `{ path, name, content }` as JSON, or the raw bytes with `?directory=&filename=` → `204`
- `GET /api/instances/:id/files/download?path=` → the file
- `GET /api/instances/:id/databases` → `200 { databases: [{ id, name, username, host, port, database, password }] }`
- `POST /api/instances/:id/databases` → `{ database, username, password, remote }` → `201 { created: true }`
- `PATCH /api/instances/:id/databases/:databaseId` → `{ password?, remote? }` → `200 { updated: true }`
- `DELETE /api/instances/:id/databases/:databaseId` → `204`
- `GET /api/instances/:id/databases/:databaseId/credentials` → `200 { credentials: { username, password, host, port, database } }`
- `GET /api/instances/:id/backups` → `200 { backups: [{ id, name, size, created_at, is_locked }] }`
- `POST /api/instances/:id/backups` → `{ name, locked }` → `201 { backup: { id, name } }`
- `GET /api/instances/:id/backups/:backupId/download` → the archive
- `POST /api/instances/:id/backups/:backupId/restore` → `200 { restored: true }`
- `DELETE /api/instances/:id/backups/:backupId` → `204`
- `GET /api/instances/:id/allocations` → `200 { allocations: [{ id, ip, port, alias, is_default }] }`
- `POST /api/instances/:id/allocations` → `{ ip, port, alias? }` → `201 { created: true }`
- `PUT /api/instances/:id/allocations` → `{ primary }` → `200 { updated: true }`
- `PATCH /api/instances/:id/allocations/:allocationId` → `{ isDefault?, alias? }` → `200 { updated: true }`
- `DELETE /api/instances/:id/allocations/:allocationId` → `204`
- `GET /api/instances/:id/startup` → `200 { image, command, environment }`
- `PUT /api/instances/:id/startup` (or `PATCH`) → `{ image?, command?, environment? }` → `200 { image, command, environment }`
- `GET /api/instances/:id/schedules` → `200 { schedules: [{ id, name, cron, action, active, payload, last_run, next_run }] }`
- `POST /api/instances/:id/schedules` → `{ name, cron, action, active, payload }` → `201 { created: true }`
- `PATCH /api/instances/:id/schedules/:scheduleId` → `{ name?, cron?, active?, payload? }` → `200 { updated: true }`
- `DELETE /api/instances/:id/schedules/:scheduleId` → `204`
- `POST /api/instances/:id/schedules/:scheduleId/run` → `200 { ran: true }`
- `GET /api/instances/:id/settings` → `200 { name, description, suspended, can_reinstall, egg, docker_image, limits }`
- `PATCH /api/instances/:id/settings` → `{ name?, description? }` → `200 { name, description, suspended, can_reinstall, egg, docker_image }`
- `POST /api/instances/:id/suspend` → `{ suspended }` → `200 { suspended }`
- `POST /api/instances/:id/settings/reinstall` → `{ confirm: true }` → `200 { reinstalled: true }`
- `PUT /api/instances/:id/resources` → `{ ram, cpu, disk }` → `200 { instance, priceDelta }`
- `GET /api/instances/:id/events` → `200 { events: InstanceEvent[] }`
- `POST /api/instances/:id/cancel` → `204` (cancel at period end)
- `POST /api/instances/:id/rename` → `{ name }` → `200 { instance }`

The routes that act on the server of the customer use the client key of that
customer on the panel. When the panel cannot issue one, they answer `503` with
`error.code = "unavailable"` and a message that says why. The administrative
key of the panel is never sent to the browser.

```
Instance = {
  id, name, status, product: { slug, name, icon }, ram, cpu, disk,
  price, currency, url, createdAt, node: { name } | null, subscription: { status, currentPeriodEnd } | null
}
FileEntry = { name, isDirectory, isFile, isSymlink, size, modifiedAt, createdAt, mode }
```

`status` is one of `pending|provisioning|online|restarting|stopped|degraded|failed|suspended|cancelled`.

## Domains

- `GET /api/domains` → `200 { domains: Domain[] }`
- `POST /api/instances/:id/domains` → `{ hostname }` → `201 { domain }`
- `POST /api/domains/:id/verify` → `200 { domain }`
- `DELETE /api/domains/:id` → `204`

```
Domain = { id, instanceId, instanceName, hostname, status, targetPort, dnsRecords: { name, type, value }[], lastError }
```
`status` is one of `pending_dns|verifying|active|error`.

## Tickets

- `GET /api/tickets` → `200 { tickets: Ticket[] }`
- `POST /api/tickets` → `{ subject, category, priority, body, instanceId? }` → `201 { ticket }`
- `GET /api/tickets/:id` → `200 { ticket }` (staff see internal notes, customers do not)
- `POST /api/tickets/:id/replies` → `{ body, internal? }` → `201 { message }`
- `POST /api/tickets/:id/status` → `{ status }` → `200 { ticket }`
- `GET /api/tickets/categories` → `200 { categories: { id, label }[] }`

```
Ticket = { id, number, subject, category, priority, status, instanceId, instanceName, createdAt, updatedAt, lastReplyAt, assignedTo, messageCount }
TicketMessage = { id, body, internal, author: { id, name, role }, createdAt, attachments: { name, size, type }[] }
```

## Admin (STAFF or ADMIN; each route also checks a permission)

- `GET /api/admin/overview` → `200 { overview }` — real counts only: `{ customers, instances, activeInstances, openTickets, ordersToday, revenueMonth, provisioningFailures, mrr }`
- `GET /api/admin/customers` → `200 { customers: AdminCustomer[] }`
- `GET /api/admin/customers/:id` → `200 { customer }` — `{ id, email, name, role, createdAt, instances, invoices, tickets, totalSpent }`
- `POST /api/admin/customers/:id/suspend` → `{ suspended: boolean, reason?: string }` → `200 { customer: { id, suspended } }` — suspending ends the account's sessions.
- `GET /api/admin/orders` → `200 { orders: Order[] }`
- `GET /api/admin/services` → `200 { services: Instance[] }`
- `GET /api/admin/products` → `200 { products: Product[] }`
- `POST /api/admin/products` → body → `201 { product }`
- `PATCH /api/admin/products/:id` → body → `200 { product }`
- `DELETE /api/admin/products/:id` → `204`
- `GET /api/admin/pricing` → `200 { rates: ResourceRates, prices: ProductPrice[] }`
- `PUT /api/admin/pricing/rates` → body `{ ramPerGb?, cpuPerUnit?, diskPerGb?, baseFee? }` → `200 { rates: ResourceRates }`
- `PUT /api/admin/pricing/:id` → body → `200 { price }`
- `GET /api/admin/capacity` → `200 { nodes, totals, policy, revenue, costs, margin }`
- `POST /api/admin/instances/reconcile-prices` → `200 { checked, corrected, differences }`
- `GET /api/admin/tickets` → `200 { tickets: Ticket[] }`
- `GET /api/admin/promotions` → `200 { promotions: Promotion[] }`
- `POST /api/admin/promotions` → body → `201 { promotion }`
- `GET /api/admin/infrastructure` → `200 { nodes: Node[], eggs: Egg[], stats }`
- `POST /api/admin/infrastructure/sync` → `200 { nodes, eggs }`
- `GET /api/admin/audit` → `200 { logs: AuditLog[] }`
- `GET /api/admin/staff` → `200 { staff: StaffMember[] }`
- `PUT /api/admin/staff/:userId` → `{ permissions, title }` → `200 { staff }`
- `GET /api/admin/settings` → `200 { settings: Record<string, unknown> }`
- `PUT /api/admin/settings` → body → `200 { settings }`
- `POST /api/admin/instances/:id/retry` → `202 { instance }` — retry provisioning (idempotent)
- `POST /api/admin/instances/:id/import` → `{ pterodactylServerId, userId }` → `200 { instance }` — import an existing Pterodactyl server and assign it to a customer.

## Webhooks

- `POST /api/webhooks/stripe` → raw Stripe body, `Stripe-Signature` header. Always `200`; processing is idempotent via the `WebhookEvent` ledger.

## Misc

- `GET /api/health` → `200 { status, service, version, uptimeSeconds, database, redis }`
- `GET /api/status` → `200 { components: { id, name, state }[], updatedAt }` — real checks only.
