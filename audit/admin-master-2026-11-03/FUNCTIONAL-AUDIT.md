# Functional audit of /admin: action and API trace inventory

**Source snapshot:** main `48df705f110b46f7d2a7d90ef33e0cd0a289f74c`, 2026-11-03 (after earlier UI migration). **Method:** static inspection of 48 API route files and 42+ admin page/detail/shared TSX files; extraction of literal routes and JSX action signatures. **No browser/API requests were executed against production or staging.** A matching control/API signature is NOT proof the workflow works.

### Quantitative coverage
- **486** literal API registrations extracted from 48 route files, including **121** administrative mutation registrations.
- **35/35** /admin registered URLs mapped to their owning React view. Some route wrappers delegate to nested components.
- **46** distinct admin React components analyzed in UI inventory (including secondary and shared components).
- All recorded routes and extracted component controls appear in [UI-SCAN-1](./UI-SCAN-1.md), [UI-SCAN-2](./UI-SCAN-2.md), [UI-SCAN-3](./UI-SCAN-3.md), [UI-SCAN-4](./UI-SCAN-4.md) and [API-SCAN-1](./API-SCAN-1.md) through [API-SCAN-4](./API-SCAN-4.md).

**Caution:** Counts derive from string patterns, not a compiler AST. Rendered controls can be emitted by shared components or assembled dynamically. The exact total of clickable controls is not certified. Do not interpret the 486 endpoint count as 486 tested endpoints.

## View-by-view static functional inspection

| Route | Component | Approx. JSX buttons/dialogs | Source API path literals | Main test requirement | Status |
|---|---|---:|---|---|---|
| `/admin` | `Overview` | 2 | /auth/session · /admin/overview | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; overview-specific workflows | **Static reviewed / browser untested** |
| `/admin/customers` | `Customers` | 6 | /admin/tags · /admin/customers · /admin/customers/bulk-tags | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; customers-specific workflows | **Static reviewed / browser untested** |
| `/admin/customers/:id` | `CustomerDetail` | 28 | /admin/customers/${customerId}/impersonate · /admin/customers/${customerId}/suspend · /admin/customers/${id} · /admin/customers/${customerId}/name · /admin | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; customers-specific workflows | **Static reviewed / browser untested** |
| `/admin/orders` | `Orders` | 7 | /admin/orders · /admin/orders/${order.id}/refund · /admin/orders/${partial.id}/partial-refund | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; orders-specific workflows | **Static reviewed / browser untested** |
| `/admin/orders/:id` | `OrderDetail` | 3 | /admin/orders/${id} | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; orders-specific workflows | **Static reviewed / browser untested** |
| `/admin/services` | `Services` | 5 | /admin/services · /admin/instances/${instanceId}/retry · /admin/instances/import | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; services-specific workflows | **Static reviewed / browser untested** |
| `/admin/services/:id` | `ServiceDetail` | 9 | /admin/services/${id} · /admin/instances/${service.id}/feature-limits · /admin/instances/${service.id}/retry · /admin/instances/${service.id}/reinstall · / | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; services-specific workflows | **Static reviewed / browser untested** |
| `/admin/vps` | `Vps` | 11 | /admin/vps/${id}/usage · /vps/plans · /admin/vps/${server.id}/plan-quote · /admin/vps/${server.id}/plan · /admin/vps/${server.id}/resources · /admin/vps ·  | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; vps-specific workflows | **Static reviewed / browser untested** |
| `/admin/products` | `Products` | 14 | /admin/products · /admin/products/${id} | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; products-specific workflows | **Static reviewed / browser untested** |
| `/admin/pricing` | `Pricing` | 7 | /admin/pricing · /admin/pricing/rates · /admin/pricing/${price.id} | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; pricing-specific workflows | **Static reviewed / browser untested** |
| `/admin/support/analytics` | `SupportAnalytics` | 3 | /admin/support/analytics · /admin/support/departments · /admin/support/sla · /admin/support/ratings | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; support-specific workflows | **Static reviewed / browser untested** |
| `/admin/support/automations` | `SupportAutomations` | 14 | /admin/support/automations · /admin/support/departments · /admin/support/automations/${rule.id} · /admin/support/automations/${id}/runs · /admin/support/au | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; support-specific workflows | **Static reviewed / browser untested** |
| `/admin/support/bots` | `SupportBots` | 25 | /admin/support/bots · /admin/support/bots/${id} · /admin/support/bots/${id}?force=true · /admin/support/departments · /admin/support/bots/${id}/draft · /ad | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; support-specific workflows | **Static reviewed / browser untested** |
| `/admin/support` | `Support` | 6 | /admin/support/conversations · /admin/support/departments · /admin/support/presence · /admin/support/departments/${department.id} · /admin/support/guest ·  | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; support-specific workflows | **Static reviewed / browser untested** |
| `/admin/tickets` | `tickets/TicketInbox` | 5 | /admin/tickets | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; tickets-specific workflows | **Static reviewed / browser untested** |
| `/admin/knowledge` | `Knowledge` | 6 | /admin/support/knowledge | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; knowledge-specific workflows | **Static reviewed / browser untested** |
| `/admin/tickets/:id` | `tickets/TicketDetail` | 4 | /tickets/${ticketId}/replies · /admin/support/replies · /tickets/${encodeURIComponent(ticketId)} · /admin/tickets · /admin/staff · /admin/support/departmen | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; tickets-specific workflows | **Static reviewed / browser untested** |
| `/admin/promotions` | `Promotions` | 7 | /admin/promotions · /admin/promotions/${promotion.id} | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; promotions-specific workflows | **Static reviewed / browser untested** |
| `/admin/promotions/:id` | `PromotionDetail` | 3 | /admin/promotions/${id} · /admin/promotions/${promotion.id} | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; promotions-specific workflows | **Static reviewed / browser untested** |
| `/admin/infrastructure` | `Infrastructure` | 2 | /admin/infrastructure · /admin/infrastructure/sync | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; infrastructure-specific workflows | **Static reviewed / browser untested** |
| `/admin/incidents` | `Incidents` | 7 | /admin/incidents/${incident.id}/updates · /admin/incidents/${incident.id} · /admin/incidents · /admin/announcements · /admin/announcements/${entry.id} | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; incidents-specific workflows | **Static reviewed / browser untested** |
| `/admin/reports` | `Reports` | 0 | /admin/reports | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; reports-specific workflows | **Static reviewed / browser untested** |
| `/admin/queues` | `Queues` | 3 | /admin/queues · /admin/queues/${queue.name}/failed · /admin/queues/${queue.name}/jobs/${job.id}/retry · /admin/queues/${queue.name}/jobs/${job.id} | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; queues-specific workflows | **Static reviewed / browser untested** |
| `/admin/abuse` | `abuse/AbuseInbox` | 5 | /admin/abuse | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; abuse-specific workflows | **Static reviewed / browser untested** |
| `/admin/abuse/:id` | `abuse/AbuseDetail` | 9 | /admin/abuse/${id} · /admin/abuse/${id}/action · /admin/abuse/${id}/notes | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; abuse-specific workflows | **Static reviewed / browser untested** |
| `/admin/ops` | `Ops` | 10 | /admin/backups/health · /admin/promotion-holds · /admin/customers/${encodeURIComponent(userId)}/promo-clearance · /admin/webhooks/failed · /admin/webhooks/ | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; ops-specific workflows | **Static reviewed / browser untested** |
| `/admin/mail` | `Mail` | 7 | /admin/mail/services/${encodeURIComponent(service.id)}/${action} · /admin/mail/services · /admin/mail/usage | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; mail-specific workflows | **Static reviewed / browser untested** |
| `/admin/mail/plans` | `MailProducts` | 10 | /admin/mail/plans · /admin/mail/plans/${encodeURIComponent(id)} | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; mail-specific workflows | **Static reviewed / browser untested** |
| `/admin/audit` | `Audit` | 2 | /admin/audit | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; audit-specific workflows | **Static reviewed / browser untested** |
| `/admin/staff` | `Staff` | 3 | /admin/staff · /admin/staff/${userId} | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; staff-specific workflows | **Static reviewed / browser untested** |
| `/admin/settings` | `Settings` | 8 | /admin/settings · /admin/settings/${encodeURIComponent(key)} | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; settings-specific workflows | **Static reviewed / browser untested** |
| `/admin/email-templates` | `EmailTemplates` | 2 | /admin/email-templates · /admin/email-templates/${encodeURIComponent(current.id)} | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; email-templates-specific workflows | **Static reviewed / browser untested** |
| `/admin/content` | `Content` | 5 | /admin/content · /admin/content/${encodeURIComponent(key)} | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; content-specific workflows | **Static reviewed / browser untested** |
| `/admin/tools` | `Tools` | 7 | /admin/dead-letters · /admin/dead-letters/${encodeURIComponent(target.entry.id)}/${target.action} · /admin/instances/reconcile-prices · /admin/email/delive | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; tools-specific workflows | **Static reviewed / browser untested** |
| `/admin/notifications` | `EmailNotifications` | 11 | /admin/notifications/deliveries · /admin/notifications/events · /admin/notifications/deliveries/${encodeURIComponent(delivery.key)}/retry · /admin/notifica | Navigation, create/read/update where applicable, filters, permissions, API errors, reverse links; notifications-specific workflows | **Static reviewed / browser untested** |

## Verified functional flaws or architectural limitations

1. **Customers value is incomplete:** `api/src/routes/admin.ts` calculates `monthlyValue` from non-cancelled `Instance.price`. VPS/mail subscriptions are outside its calculation. Replace with a customer-scoped normalized subscription summary and preserve currency distinctions. The current value MUST NOT be advertised as complete MRR.
2. **Customer total paid meaning ambiguous:** `GET /admin/customers/:id` aggregates `Payment{status:SUCCEEDED}` amounts but does not group by currency or explicitly subtract refunds. Need a provider-backed gross/refunded/net model.
3. **Customer detail loading:** relation arrays `invoices`, `tickets`, `orders`, `payments` each have a limit of 50. Counts are present, yet no universal paginated subcollection is part of the summary endpoint. Add separate scoped endpoints; only load active tab.
4. **Orders search:** current main has a validated order search by order number, customer and product, status and cursor; avoid repeating an outdated "search missing" recommendation. Verify UI search, filter reset and pagination on the actual deployed commit.
5. **Order audit scope:** order detail API `api/src/routes/admin-control.ts` selects `AuditLog` for both `targetType=order` and customer `targetType=user`. The UI may separate both, but source query still has a combined 100-row cap; order-specific events can be displaced by account events. Split into independent, paginated queries.
6. **Global search resource routing:** matches VPS by name/VMID but sends it to `/admin/vps` list, rather than `/admin/vps/:id`. Invoices/payments similarly fall back to order/customer because no ledger detail.
7. **Coverage vs navigation:** `Capacity.tsx` exists with `/admin/capacity` API but no registered page route. Find whether actively intended for staff and restore only after checking calculations.
8. **Support workflows:** support console and ticket inbox are both valid, but the console indicates more pages without exposing the same cursor mechanism as the newer TicketInbox; two lists need a shared model/role.
9. **Abuse lifecycle:** current main now has a separate AbuseInbox, AbuseDetail and server-side `actionAllowed` validation, including closed-case restriction. Supplied earlier screenshot represents an older UI; live deployment version requires confirmation. Do NOT regress the newer behavior.
10. **VPS admin route:** `GET /admin/vps/:id` backend already exists, but there is no dedicated React admin VPS detail. Add it to avoid power/reinstall/destroy actions in every list card.
11. **Admin UI consistency:** mixed `DataTable/CardList`, raw button lists, fixed card lists and inconsistent deep-link/state handling. A shared resource-grid/filter/navigation layer should wrap existing components, not replace everything.
12. **Provider actions:** API success can be "accepted/queued", not provider-completed. Every status-based action UI should distinguish intent, queued, running, succeeded, failed and reconcile against real provider state.

## Audit-action matrix required to certify functional completeness

For every mutating route in API-SCAN, validate all of:

- Endpoint and source file/line + linked UI control(s).
- Authentication mode (session/API key/system token) and effective role permission.
- Request schema, content limit, CSRF, rate limit, origin where relevant.
- Object ownership and `assertMayActOnAccount` checks.
- Idempotency and duplicate click/replay behavior.
- State-machine precondition and concurrent update behavior.
- Database transaction order, provider side effect and rollback/recovery.
- Audit entry (actor, subject/customer, resource, action, reason, result/correlation), or justified exception.
- Async job dispatch, polling/realtime update and final status.
- Error/loading/empty/timeout UI, safe toast and disabled button state.
- Direct URL, reload, browser back/forward, URL-synced filters.
- Responsive 320/390/768/1024/1440/1920 and keyboard/zoom.
- Evidence: unit test path, API integration test path, Playwright test path, actual run log.

No mutation may be labeled "fully validated" until its executed tests and evidence are recorded.

## Focused E2E journeys

1. Create/find customer, search beyond page 200, open customer, verify staff role masks and state, update names/tags/notes, suspend/reinstate, observe audit and sessions.
2. Order lifecycle from pending through checkout, paid/failed, fulfilled, partial/full refund (sandbox payments), invoice and notifications. Cross-verify Stripe state.
3. VPS/app provision/power/reinstall, resource changes, provider failure, delete confirmation, correlated job and audit; NEVER run destructive test against a production VM.
4. Mail creation and domain verification, mailbox/alias, quota and plan changes; compare with Mailcow and customer identity, use sandbox.
5. Support new chat, ticket, internal note, assignment, bot simulation, publish/rollback, automation dry-run, unread/presence, inbound email integration if configured.
6. Abuse dismissed/closed, old UI links, reopened reason, and blocked suspension in API for closed case.
7. Ops webhook replay, queue retry, alerts, backup/restore readiness on isolated fixtures.
8. Admin staff permission changes and cross-role access; verify server denies even if UI exposed.
9. Audit search/export & privacy, customer 360 and order timeline correlation.
10. Induce network error, stale response, 403, 429, 500 and rate-limit states without altering real customer data.

## Execution limitation
No authenticated browser context was available in the current tool session. Source files can be fetched through GitHub connector but a code checkout and staging credentials were not available for running `npm test`, Prisma/Postgres integration, billing provider mocks or Playwright. Consequently **this is a complete source-inventory audit and an explicit executable test contract, NOT a completed functional end-to-end certification**.