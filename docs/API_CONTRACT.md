# Blipmade API Contract (v1)

Base URL: `/api` (proxied) or `http://127.0.0.1:3100` directly.
All responses are JSON. Errors: `{ "error": { "code": string, "message": string, "requestId"?: string, "fields"?: Record<string,string> } }`.
Money is always an **integer number of minor units** (EUR cents). Never a float. Format on the client.

## Auth & session

- `POST /api/auth/register` → `{ email, password, name? }` → `201 { user }`, sets session cookie.
- `POST /api/auth/login` → `{ email, password }` → `200 { user }`, sets session cookie.
- `POST /api/auth/logout` → `204`.
- `GET  /api/auth/session` → `200 { user: User | null }`.
- `POST /api/auth/verify-email` → `{ token }` → `204`.
- `POST /api/auth/resend-verification` → `204` (always 204, never reveals existence).
- `POST /api/auth/forgot-password` → `{ email }` → `204` (always 204).
- `POST /api/auth/reset-password` → `{ token, password }` → `204`.
- `POST /api/auth/enroll-admin` → `{ email, password, enrollmentKey }` → `200 { user }`. Only works while there is no admin in the database.

`User = { id, email, name, role: "CUSTOMER"|"STAFF"|"ADMIN", emailVerified: boolean }`

Cookies: `bm_session` (HttpOnly, SameSite=Lax, Secure in production), `bm_csrf` (readable by JS).
CSRF: send `X-CSRF-Token` header on every state-changing request, value = `bm_csrf` cookie.

## Catalog

- `GET /api/catalog/products?category=&search=` → `200 { products: Product[] }`
- `GET /api/catalog/products/:slug` → `200 { product: Product }`
- `POST /api/catalog/quote` → body `{ items: [{ productSlug, ram, cpu, disk, optionCodes?, quantity? }], promotionCode? }`
  → `200 { items: QuoteItem[], subtotal, discount, total, currency, promotion?: { code, valid, reason } }`

```
Product = {
  id, slug, name, category, description, icon,
  minRam, minCpu, minDisk, defaultRam, defaultCpu, defaultDisk, maxRam, maxCpu, maxDisk,
  visible, deployable, docsUrl,
  price: { amount, currency, period } | null,      // monthly base for the min config
  options: { code, name, description, amount, currency }[]
}
QuoteItem = { productSlug, name, ram, cpu, disk, optionCodes, quantity, unitAmount, total, currency }
```

Pricing is computed **server-side only**. The client never computes a price; it renders the quote.

## Orders

- `POST /api/orders` → body `{ items: QuoteItemInput[], promotionCode? }` → `201 { order }`
- `GET /api/orders` → `200 { orders: Order[] }`
- `GET /api/orders/:id` → `200 { order }`
- `POST /api/orders/:id/checkout` → `200 { url }` (Stripe Checkout URL) or `{ url: null, message }` when Stripe is not configured.
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
- `POST /api/instances/:id/power` → `{ action: "start"|"stop"|"restart" }` → `202 { instance }`
- `GET /api/instances/:id/metrics` → `200 { metrics: { state, cpuAbsolute, memoryBytes, networkRx, networkTx, diskBytes, uptimeMs } | null }`
- `GET /api/instances/:id/console` → `200 { token, websocket }` (console WebSocket credentials; never exposes privileged keys)
- `GET /api/instances/:id/files?path=` → `200 { entries: FileEntry[] }`
- `GET /api/instances/:id/file?path=&encoding=` → `200 { content, encoding }`
- `PUT /api/instances/:id/file` → `{ path, content }` → `204`
- `DELETE /api/instances/:id/file` → `{ path }` → `204`
- `PUT /api/instances/:id/startup` → `{ startup, environment }` → `200 { instance }`
- `PUT /api/instances/:id/resources` → `{ ram, cpu, disk }` → `200 { instance, priceDelta }`
- `GET /api/instances/:id/events` → `200 { events: InstanceEvent[] }`
- `POST /api/instances/:id/cancel` → `204` (cancel at period end)
- `POST /api/instances/:id/rename` → `{ name }` → `200 { instance }`

```
Instance = {
  id, name, status, product: { slug, name, icon }, ram, cpu, disk,
  price, currency, url, createdAt, node: { name } | null, subscription: { status, currentPeriodEnd } | null
}
FileEntry = { name, isDirectory, size, modifiedAt, mode }
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
- `GET /api/admin/pricing` → `200 { prices: ProductPrice[] }`
- `PUT /api/admin/pricing/:id` → body → `200 { price }`
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
