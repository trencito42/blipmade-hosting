# The matrix of the events

Every message of the platform starts with an event. This file says which
events exist, what each one is for, and **where it is really published**.

The rule of this matrix is simple: a row that has a trigger is a row the
platform really uses. A row without a trigger is a message that is written
down and ready, but that nothing publishes yet. Nothing here claims a
coverage the code does not have.

The registry of the events is `api/src/services/notification-events.ts`. It is
typed: an event that is not in it cannot be published, and the publisher
throws in words when it meets one.

---

## 1. The columns

| Column | What it means |
|---|---|
| Event | The kind of the event, the name the business uses |
| Template | The template of the message, the one of `api/src/lib/email-design.ts` |
| Group | The group of the preferences the message belongs to |
| Kind | `essential` (it always goes out), `optional` (the customer chooses) or `marketing` (it needs an agreement) |
| Audience | `customer`, `staff` or `operator` |
| Channels | `email`, `in_app`, or both |
| Secret | `yes` when the payload holds a token. The engine empties the payload as soon as the message is on the queue |
| Trigger | The place of the code that publishes the event |
| Where | The function that publishes it |

The identity of an occurrence is `type:subject:occurrence`. The occurrence is
what keeps two occurrences of the same state apart: a service that is
suspended twice has two keys, and therefore two messages.

---

## 2. The events that are published

**68 of the 73 events of the registry have a trigger.**

| Event | Template | Group | Kind | Audience | Channels | Secret | Trigger | Where |
|---|---|---|---|---|---|---|---|---|
| `account.registered` | `account-welcome` | Account and security | essential | customer | email+in_app | — | POST /api/auth/register | notifications.ts → notifyAccountRegistered |
| `account.verification_requested` | `account-verify-email` | Account and security | essential | customer | email | yes | POST /api/auth/register, POST /api/auth/resend-verification | notifications.ts → notifyVerificationRequested (secret) |
| `account.email_verified` | `account-email-verified` | Account and security | essential | customer | email+in_app | — | POST /api/auth/verify-email | notifications.ts → notifyEmailVerified |
| `account.password_reset_requested` | `account-password-reset` | Account and security | essential | customer | email | yes | POST /api/auth/forgot-password | notifications.ts → notifyPasswordResetRequested (secret) |
| `account.password_changed` | `account-password-changed` | Account and security | essential | customer | email+in_app | — | POST /api/auth/reset-password | notifications.ts → notifyPasswordChanged |
| `account.email_changed` | `account-email-changed` | Account and security | essential | customer | email+in_app | — | POST /api/settings/email-change/confirm | notifications.ts → notifyEmailChanged |
| `account.suspended` | `account-suspended` | Account and security | essential | customer | email+in_app | — | POST /api/admin/customers/:id/suspend | routes/admin.ts → notifyAccountSuspended |
| `account.reinstated` | `account-reinstated` | Account and security | essential | customer | email+in_app | — | POST /api/admin/customers/:id/suspend (put back) | routes/admin.ts → notifyAccountReinstated |
| `account.deletion_requested` | `account-deletion-requested` | Account and security | essential | customer | email | — | POST /api/settings/account/closure | routes/settings.ts → notifyAccountDeletionRequested |
| `order.created` | `order-created` | Orders and billing | optional | customer | email+in_app | — | POST /api/orders | notifications.ts → notifyOrderCreated |
| `order.payment_required` | `order-payment-required` | Orders and billing | essential | customer | email+in_app | — | POST /api/orders/:id/checkout | notifications.ts → notifyPaymentRequired |
| `order.canceled` | `order-canceled` | Orders and billing | optional | customer | email+in_app | — | POST /api/orders/:id/cancel | notifications.ts → notifyOrderCanceled |
| `payment.succeeded` | `payment-succeeded` | Orders and billing | essential | customer | email+in_app | — | Stripe: checkout.session.completed, checkout.session.async_payment_succeeded | routes/webhooks.ts → notifyPaymentSucceeded |
| `payment.failed` | `payment-failed` | Orders and billing | essential | customer | email+in_app | — | Stripe: checkout.session.async_payment_failed, payment_intent.payment_failed | routes/webhooks.ts → notifyPaymentFailed |
| `payment.canceled` | `payment-canceled` | Orders and billing | optional | customer | email | — | Stripe: checkout.session.expired | routes/webhooks.ts → notifyPaymentCanceled |
| `payment.refunded` | `payment-refunded` | Orders and billing | essential | customer | email+in_app | — | POST /api/admin/orders/:id/refund | routes/admin.ts → notifyPaymentRefunded |
| `invoice.issued` | `invoice-issued` | Orders and billing | essential | customer | email+in_app | — | services/billing.ts → renew() | notifications.ts → notifyInvoiceIssued |
| `invoice.paid` | `invoice-paid` | Orders and billing | essential | customer | email+in_app | — | Stripe: invoice.paid | routes/webhooks.ts → notifyInvoicePaid |
| `invoice.payment_failed` | `invoice-payment-failed` | Orders and billing | essential | customer | email+in_app | — | Stripe: invoice.payment_failed | routes/webhooks.ts → notifyInvoiceFailed |
| `invoice.overdue` | `invoice-overdue` | Orders and billing | essential | customer | email+in_app | — | services/billing.ts → sweepSubscriptions() | notifications.ts → notifyInvoiceOverdue |
| `invoice.reminder_due` | `invoice-reminder-due` | Orders and billing | optional | customer | email+in_app | — | services/billing.ts → sweepSubscriptions() | notifications.ts → notifyInvoiceReminderDue |
| `subscription.activated` | `subscription-activated` | Orders and billing | optional | customer | email+in_app | — | services/stripe.ts → markOrderPaid() | notifications.ts → notifySubscriptionActivated |
| `subscription.renewed` | `subscription-renewed` | Orders and billing | essential | customer | email+in_app | — | services/billing.ts → applyRenewalToSubscription() | notifications.ts → notifySubscriptionRenewed |
| `subscription.changed` | `subscription-changed` | Orders and billing | optional | customer | email+in_app | — | Stripe: customer.subscription.updated, customer.subscription.deleted | routes/webhooks.ts → notifySubscriptionChanged |
| `subscription.cancellation_scheduled` | `subscription-cancellation-scheduled` | Orders and billing | essential | customer | email+in_app | — | POST /api/billing/subscriptions/:id/cancel | routes/billing.ts → notifySubscriptionCancellationScheduled |
| `subscription.canceled` | `subscription-canceled` | Orders and billing | essential | customer | email+in_app | — | services/billing.ts → sweepSubscriptions() | notifications.ts → notifySubscriptionCanceled |
| `subscription.reactivated` | `subscription-reactivated` | Orders and billing | optional | customer | email+in_app | — | POST /api/billing/subscriptions/:id/reactivate | routes/billing.ts → notifySubscriptionReactivated |
| `subscription.grace_period` | `subscription-grace-period` | Orders and billing | essential | customer | email+in_app | — | services/billing.ts → sweepSubscriptions() | notifications.ts → notifySubscriptionGracePeriod |
| `subscription.suspension_warning` | `subscription-suspension-warning` | Orders and billing | essential | customer | email+in_app | — | services/billing.ts → sweepSubscriptions() | notifications.ts → notifySubscriptionSuspensionWarning |
| `service.provisioning_started` | `service-provisioning-started` | Hosting services | optional | customer | email | — | services/provisioning.ts → provisionInstance() | services/notifications.ts → notifyProvisioningStarted |
| `service.provisioning_failed` | `service-provisioning-failed` | Hosting services | essential | customer | email+in_app | — | services/provisioning.ts → failProvisioning() | services/notifications.ts → notifyProvisioningFailed |
| `service.activated` | `service-activated` | Hosting services | essential | customer | email+in_app | — | services/provisioning.ts → provisionInstance() | services/notifications.ts → notifyInstanceProvisioned |
| `service.suspended` | `service-suspended` | Hosting services | essential | customer | email+in_app | — | services/billing.ts → sweepSubscriptions() | services/notifications.ts → notifyInstanceStopped |
| `service.unsuspended` | `service-unsuspended` | Hosting services | essential | customer | email+in_app | — | POST /api/instances/:id/power (start) | routes/instances.ts → notifyInstanceUnsuspended |
| `service.expiring` | `service-expiring` | Hosting services | optional | customer | email+in_app | — | services/billing.ts → sweepSubscriptions() | notifications.ts → notifyInstanceExpiring |
| `service.renewal_reminder` | `service-renewal-reminder` | Hosting services | optional | customer | email+in_app | — | services/billing.ts → sweepSubscriptions() | notifications.ts → notifyInstanceRenewalReminder |
| `service.expired` | `service-expired` | Hosting services | essential | customer | email+in_app | — | services/billing.ts → renew(), withdraw() | notifications.ts → notifyInstanceExpired |
| `service.canceled` | `service-canceled` | Hosting services | essential | customer | email+in_app | — | POST /api/instances/:id/cancel | routes/instances.ts → notifyInstanceCanceled |
| `service.deleted` | `service-deleted` | Hosting services | essential | customer | email | — | services/billing.ts → processCancelledInstances() | notifications.ts → notifyInstanceDeleted |
| `service.upgrade_completed` | `service-upgrade-completed` | Hosting services | optional | customer | email+in_app | — | services/upgrades.ts → applyUpgradeOrder() | notifications.ts → notifyUpgradeCompleted |
| `service.upgrade_failed` | `service-upgrade-failed` | Hosting services | essential | customer | email+in_app | — | services/upgrades.ts → applyUpgradeOrder() | notifications.ts → notifyUpgradeFailed |
| `ticket.created` | `ticket-created` | Support | essential | customer | email+in_app | — | POST /api/tickets | notifications.ts → notifyTicketCreated |
| `ticket.opened_for_staff` | `ticket-opened-for-staff` | Support | optional | staff | email | — | POST /api/tickets | notifications.ts → notifyTicketOpenedForStaff |
| `ticket.assigned` | `ticket-assigned` | Support | optional | staff | email | — | POST /api/admin/tickets/:id/assign | routes/admin.ts → notifyTicketAssigned |
| `ticket.reply_created` | `ticket-reply-created` | Support | essential | customer | email+in_app | — | POST /api/tickets/:id/replies (staff writes) | notifications.ts → notifyTicketReplyCreated |
| `ticket.customer_replied` | `ticket-customer-replied` | Support | essential | staff | email | — | POST /api/tickets/:id/replies (customer writes) | notifications.ts → notifyTicketCustomerReplied |
| `ticket.status_changed` | `ticket-status-changed` | Support | optional | customer | email+in_app | — | POST /api/tickets/:id/status | notifications.ts → notifyTicketStatusChanged |
| `ticket.reopened` | `ticket-reopened` | Support | optional | customer | email | — | POST /api/tickets/:id/status (CLOSED → other) | notifications.ts → notifyTicketReopened |
| `ticket.closed` | `ticket-closed` | Support | optional | customer | email+in_app | — | POST /api/tickets/:id/status (→ CLOSED) | notifications.ts → notifyTicketClosed |
| `mailbox.created` | `mailbox-created` | Domains and email hosting | essential | customer | email+in_app | — | POST /api/mail/domains/:id/mailboxes | services/mail.ts → notifyMailboxCreated |
| `mailbox.provisioning_failed` | `mailbox-provisioning-failed` | Domains and email hosting | essential | customer | email+in_app | — | services/mail.ts → createMailbox() | notifications.ts → notifyMailboxProvisioningFailed |
| `mailhosting.activated` | `mailhosting-activated` | Domains and email hosting | essential | customer | email+in_app | — | services/mail-commerce.ts → provisionMailService() | notifications.ts → notifyMailhostingActivated |
| `mailhosting.canceled` | `mailhosting-canceled` | Domains and email hosting | essential | customer | email+in_app | — | services/mail-commerce.ts → cancelMailService() | notifications.ts → notifyMailhostingCanceled |
| `mailhosting.renewal_reminder` | `mailhosting-renewal-reminder` | Domains and email hosting | optional | customer | email+in_app | — | services/mail-commerce.ts → sweepMailServices() | notifications.ts → notifyMailhostingRenewalReminder |
| `domain.verification_instructions` | `domain-verification-instructions` | Domains and email hosting | essential | customer | email+in_app | yes | POST /api/instances/:id/domains | routes/domains.ts → notifyDomainVerificationInstructions (secret) |
| `domain.verified` | `domain-verified` | Domains and email hosting | essential | customer | email+in_app | — | POST /api/domains/:id/verify | routes/domains.ts → notifyDomainVerified |
| `domain.dns_incomplete` | `domain-dns-incomplete` | Domains and email hosting | optional | customer | email+in_app | — | POST /api/domains/:id/verify (proof missing), POST /api/mail/domains | routes/domains.ts, services/mail.ts → notifyDomainDnsIncomplete |

| `ops.provisioning_stuck` | `ops-provisioning-stuck` | Incidents and maintenance | essential | operator | email | — | services/ops-health.ts → publishFinding() | notifications.ts → notifyOpsProvisioningStuck |
| `ops.webhook_failures` | `ops-webhook-failures` | Incidents and maintenance | essential | operator | email | — | services/ops-health.ts → publishFinding() | notifications.ts → notifyOpsWebhookFailures |
| `ops.delivery_failures` | `ops-delivery-failures` | Incidents and maintenance | essential | operator | email | — | services/ops-health.ts → publishFinding() | notifications.ts → notifyOpsDeliveryFailures |
| `ops.backup_failed` | `ops-backup-failed` | Incidents and maintenance | essential | operator | email | — | services/ops-health.ts → publishFinding() | notifications.ts → notifyOpsBackupFailed |
| `ops.offsite_backup_missing` | `ops-offsite-backup-missing` | Incidents and maintenance | essential | operator | email | — | services/ops-health.ts → publishFinding() | notifications.ts → notifyOpsOffsiteBackupMissing |
| `ops.restore_verification_failed` | `ops-restore-verification-failed` | Incidents and maintenance | essential | operator | email | — | services/ops-health.ts → publishFinding() | notifications.ts → notifyOpsRestoreVerificationFailed |
| `ops.mailcow_unhealthy` | `ops-mailcow-unhealthy` | Incidents and maintenance | essential | operator | email | — | services/ops-health.ts → publishFinding() | notifications.ts → notifyOpsMailcowUnhealthy |
| `ops.incident` | `ops-incident` | Incidents and maintenance | essential | operator | email | — | services/ops-health.ts → publishFinding() | notifications.ts → notifyOpsIncident |
| `ops.capacity_critical` | `ops-capacity-critical` | Incidents and maintenance | essential | operator | email | — | services/ops-health.ts → publishFinding() | notifications.ts → notifyOpsCapacityCritical |
| `ops.dns_certificate_failure` | `ops-dns-certificate-failure` | Incidents and maintenance | essential | operator | email | — | services/ops-health.ts → publishFinding() | notifications.ts → notifyOpsDnsCertificateFailure |
| `ops.security_change` | `ops-security-change` | Incidents and maintenance | essential | operator | email | — | services/ops-health.ts → publishFinding() | notifications.ts → notifyOpsSecurityChange |

---

## 3. The events that are written down and not published yet

These messages exist in the registry and in the catalogue of the templates, so
the wording is decided and the back office can show them. Nothing publishes
them yet, so **no customer ever receives them**. They are listed here so the
gap is visible and not hidden behind a claim of coverage.

| Event | Template | Group | Kind | Audience | Channels | Secret | Trigger | Where |
|---|---|---|---|---|---|---|---|---|
| `account.email_change_requested` | `account-email-change-requested` | Account and security | essential | customer | email | yes | — | — |
| `service.incident` | `service-incident` | Incidents and maintenance | essential | customer | email+in_app | — | — | — |
| `service.restored` | `service-restored` | Incidents and maintenance | essential | customer | email+in_app | — | — | — |
| `ticket.resolved` | `ticket-resolved` | Support | essential | customer | email+in_app | — | — | — |
| `mailbox.password_reset` | `mailbox-password-reset` | Domains and email hosting | essential | customer | email | — | — | — |


### Why they are not published

The platform has no place where these moments happen yet, or the moment
exists but carries no decision yet:

* `account.email_change_requested` — the route of the change of the address
  sends the message on its own, with the hand-written template of
  `api/src/lib/email-templates.ts`. The event of the registry would be a
  second message about the same change, so it is left unwritten.
* `service.incident`, `service.restored` — the platform has no incident of a
  service and no moment where it is restored: the health of a container is
  shown in the panel and nothing is published about it.
* `ticket.resolved` — the platform has no "resolved" state. The moment the
  request is answered is published as `ticket.reply_created`.
* `mailbox.password_reset` — the platform does not reset the password of a
  mailbox. The customer asks for a new password of the account, and that
  moment is published as `account.password_reset_requested`.

### The events that are deliberately not doubled

* `order.created` and `order.payment_required` are two moments: the order
  exists, then the customer is sent to the checkout. A customer who never
  checks out receives only the first one.
* `ticket.reply_created` (the staff answered) and `ticket.customer_replied`
  (the customer answered) are two moments and two audiences. **The author of
  a reply is never the recipient of the message about that reply.**
* `ticket.resolved` is not published: the platform has no "resolved" state.
  The moment the request is answered is published as `ticket.reply_created`,
  and publishing `ticket.resolved` as well would send the customer two
  messages for one answer.
* `domain.dns_incomplete` is published once per hostname and per scope.
  Checking the proof of ownership ten times does not send ten messages.
* `subscription.grace_period` and `subscription.suspension_warning` are two
  moments of the same week: the grace is told when it starts, the warning
  when the end of the grace is near. The window of the warning is shorter
  than the grace itself, so the two messages never fall on the same day.
* `service.expiring` and `service.renewal_reminder` are the two sides of the
  same term: the term of a service that is cancelled for the end of the
  period ends, the term of the other one goes on. A customer receives the
  message that is true for their service, never both.
* The reminders are written once per period. The occurrence holds the period
  or the invoice, so a sweep that runs again does not send the message of
  yesterday a second time.

---

## 4. What is checked

The matrix is not a promise, it is a description. These files prove it:

| File | What it proves |
|---|---|
| `api/tests/notification-ticket-events.test.ts` | The author of a reply is never notified about their own reply, in both directions, and the message goes to the right address |
| `api/tests/notification-account-events.test.ts` | The request of the closing of an account is told to the customer, and the message goes out even when the customer closed the group of the account |
| `api/tests/notification-subscription-events.test.ts` | The change of a subscription, the grace, the warning of the suspension and the invoice that is due are told once per period, and the optional ones follow the group of the customer |
| `api/tests/notification-service-events.test.ts` | The life of a service — the building, the term, the cancellation, the deletion, the start again and the change of the resources — is told to the customer, once |
| `api/tests/notification-mail-events.test.ts` | The mailbox that could not be made, the hosted mail that starts, that is canceled and that renews soon are told to the customer, once |
| `api/tests/notification-engine-rules.test.ts` | The rules of the groups, the idempotency of the occurrence, the emptying of the secret, the isolation between the customers |
| `api/tests/email-design.test.ts` | The catalogue holds exactly the templates of the registry, and every template reads only the facts the events carry |
| `api/tests/notification-template-wiring.test.ts` | Every template that is not written down as out of reach has a publisher that is called |
| `api/tests/admin-notifications.test.ts` | The back office shows the events, the deliveries and the state of every channel |

The probe `api/probe/notification-matrix.ts` prints this matrix out of the
code, so the table and the registry cannot drift apart:

```bash
cd api && npx tsx probe/notification-matrix.ts
```
