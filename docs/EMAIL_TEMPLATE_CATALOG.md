# The catalogue of the templates of the e-mail

Every message the platform sends is a template with a name. This file is the
catalogue: what exists, in which version, with which subject, and which facts
it reads.

The code is `api/src/lib/email-design.ts`. The catalogue is not written twice:
the table below is printed out of the code by the probe
`api/probe/notification-matrix.ts`, so it cannot drift away from what the
platform really sends.

---

## 1. The contract of a template

A template is a **template id**, a **version**, a **group**, a **subject**, a
**preheader**, some **paragraphs**, an optional **action** and optional
**facts**. It is not a string with holes in it, and it is not HTML.

| Piece | What it is |
|---|---|
| `id` | The name the event of the registry points at. It never changes |
| `version` | The version of the wording. It goes up when the wording changes |
| `category` | The group of the preferences the message belongs to |
| `subject` | The subject of the message, with its facts |
| `preheader` | The line that is shown under the subject in the list of the mailbox |
| `paragraphs` | The body, in words, without any tag |
| `action` | The button of the message: a label and a path of the platform |
| `facts` | The values that come from the event, e.g. the number of the order |
| `details` | The table of the facts at the bottom of the message |

### The rules the renderer holds

1. **Every template has a plain text version.** The HTML is the decoration
   of the text, never the other way round. A message that only exists as
   HTML is a message that cannot be read in a terminal.
2. **Every fact is escaped in the HTML.** A value that comes from a customer
   — a name, an address of a mailbox, an excerpt of a ticket — cannot become
   a tag. The test `api/tests/email-design.test.ts` renders every template
   with a hostile payload and checks that the tag never appears.
3. **A fact that is not there is a dash**, never the word `undefined`. A
   message with a missing fact is a message with a hole in it, and the hole
   is visible.
4. **The link of the message is built by the engine, not by the template.**
   The template asks for a path (`/app/billing`); the engine turns it into
   the public address of the platform. A template can never point at
   somewhere else, and it never sees the token of a link.
5. **A template never builds a link by itself.** The action of the
   verification, of the reset and of the change of the address is built by
   the registry (`emailLink`), and the template receives it under `action`.
6. **The version goes up, the id does not change.** The history of the
   wording is therefore readable, and a message that is in a mailbox keeps
   meaning what it meant when it was sent.

### The four kinds of placeholder

| Kind | Example | Where it comes from |
|---|---|---|
| Plain fact | `{{order.number}}` | The payload of the event |
| Formatted fact | `{{order.total.formatted}}` | The payload, already formatted |
| Condition | `when` on a paragraph or a row | The fact has to be there for the line to be shown |
| Action | `{{action.url}}`, `{{action.label}}` | The engine builds it from the registry |

---

## 2. The catalogue

**70 templates, one for every event of the registry.**

| Template | Version | Group | Subject | Facts it reads |
|---|---|---|---|---|
| `account-welcome` | v1 | Account and security | Welcome to Blipmade | `{{customer.firstName}}` |
| `account-verify-email` | v1 | Account and security | Confirm your email address | `{{customer.firstName}}`, `{{action.url}}`, `{{action.label}}` |
| `account-email-verified` | v1 | Account and security | Your email address is confirmed | `{{customer.firstName}}` |
| `account-password-reset` | v1 | Account and security | Reset your password | `{{customer.firstName}}`, `{{action.url}}`, `{{action.label}}` |
| `account-password-changed` | v1 | Account and security | Your password was changed | `{{customer.firstName}}` |
| `account-email-change-requested` | v1 | Account and security | Confirm your new email address | `{{customer.firstName}}`, `{{customer.email}}`, `{{action.url}}`, `{{action.label}}` |
| `account-email-changed` | v1 | Account and security | Your email address was changed | `{{customer.firstName}}`, `{{customer.email}}` |
| `account-deletion-requested` | v1 | Account and security | We received the request to close your account | `{{customer.firstName}}` |
| `order-created` | v1 | Orders and billing | Your order {{order.number}} was created | `{{order.number}}`, `{{order.total.formatted}}`, `{{order.currency}}` |
| `order-payment-required` | v1 | Orders and billing | Your order {{order.number}} waits for its payment | `{{order.number}}`, `{{order.total.formatted}}`, `{{order.currency}}` |
| `order-canceled` | v1 | Orders and billing | Your order {{order.number}} was canceled | `{{order.number}}` |
| `payment-succeeded` | v1 | Orders and billing | Your payment of {{amount.formatted}} went through | `{{payment.number}}`, `{{amount.formatted}}`, `{{payment.currency}}` |
| `payment-failed` | v1 | Orders and billing | Your payment of {{amount.formatted}} did not go through | `{{payment.number}}`, `{{amount.formatted}}`, `{{payment.currency}}`, `{{payment.reason}}` |
| `payment-canceled` | v1 | Orders and billing | The payment of the order {{payment.number}} was canceled | `{{payment.number}}` |
| `payment-refunded` | v1 | Orders and billing | The payment of {{amount.formatted}} was refunded | `{{payment.number}}`, `{{amount.formatted}}`, `{{payment.currency}}` |
| `invoice-issued` | v1 | Orders and billing | Your invoice {{invoice.number}} was issued | `{{invoice.number}}`, `{{amount.formatted}}`, `{{invoice.currency}}`, `{{invoice.dueAt}}` |
| `invoice-paid` | v1 | Orders and billing | Your invoice {{invoice.number}} was paid | `{{invoice.number}}`, `{{amount.formatted}}`, `{{invoice.currency}}`, `{{invoice.periodEnd}}` |
| `invoice-payment-failed` | v1 | Orders and billing | The payment of the invoice {{invoice.number}} failed | `{{invoice.number}}`, `{{amount.formatted}}`, `{{invoice.currency}}`, `{{invoice.reason}}` |
| `invoice-overdue` | v1 | Orders and billing | Your invoice {{invoice.number}} is late | `{{invoice.number}}`, `{{amount.formatted}}`, `{{invoice.currency}}`, `{{invoice.daysOverdue}}` |
| `invoice-reminder-due` | v1 | Orders and billing | Your invoice {{invoice.number}} is due | `{{invoice.number}}`, `{{amount.formatted}}`, `{{invoice.currency}}`, `{{invoice.dueAt}}` |
| `subscription-activated` | v1 | Orders and billing | The subscription of {{subscription.service}} started | `{{subscription.service}}`, `{{subscription.plan}}` |
| `subscription-renewed` | v1 | Orders and billing | The subscription of {{subscription.service}} was renewed | `{{subscription.service}}`, `{{amount.formatted}}`, `{{subscription.currency}}`, `{{subscription.periodEnd}}` |
| `subscription-changed` | v1 | Orders and billing | The subscription of {{subscription.service}} changed | `{{subscription.service}}`, `{{subscription.change}}` |
| `subscription-cancellation-scheduled` | v1 | Orders and billing | The subscription of {{subscription.service}} will end | `{{subscription.service}}`, `{{subscription.periodEnd}}` |
| `subscription-canceled` | v1 | Orders and billing | The subscription of {{subscription.service}} ended | `{{subscription.service}}` |
| `subscription-reactivated` | v1 | Orders and billing | The subscription of {{subscription.service}} started again | `{{subscription.service}}` |
| `subscription-grace-period` | v1 | Orders and billing | The subscription of {{subscription.service}} is in its grace period | `{{subscription.service}}`, `{{subscription.graceUntil}}` |
| `subscription-suspension-warning` | v1 | Orders and billing | The subscription of {{subscription.service}} will be suspended | `{{subscription.service}}`, `{{subscription.graceUntil}}` |
| `service-provisioning-started` | v1 | Hosting services | {{service.name}} is being built | `{{service.name}}`, `{{service.plan}}` |
| `service-provisioning-failed` | v1 | Hosting services | {{service.name}} could not be built | `{{service.name}}`, `{{service.reason}}` |
| `service-activated` | v1 | Hosting services | {{service.name}} is ready | `{{service.name}}`, `{{service.address}}` |
| `service-suspended` | v1 | Hosting services | {{service.name}} was suspended | `{{service.name}}`, `{{service.reason}}` |
| `service-unsuspended` | v1 | Hosting services | {{service.name}} works again | `{{service.name}}` |
| `service-expiring` | v1 | Hosting services | {{service.name}} ends soon | `{{service.name}}`, `{{service.expiresAt}}` |
| `service-expired` | v1 | Hosting services | {{service.name}} ended | `{{service.name}}` |
| `service-canceled` | v1 | Hosting services | The service {{service.name}} was canceled | `{{service.name}}` |
| `service-deleted` | v1 | Hosting services | The data of {{service.name}} was deleted | `{{service.name}}` |
| `service-upgrade-completed` | v1 | Hosting services | {{service.name}} was changed | `{{service.name}}`, `{{service.change}}` |
| `service-upgrade-failed` | v1 | Hosting services | The change of {{service.name}} did not go through | `{{service.name}}`, `{{service.reason}}` |
| `service-incident` | v1 | Incidents and maintenance | An incident touches {{service.name}} | `{{service.name}}`, `{{service.message}}` |
| `service-restored` | v1 | Incidents and maintenance | {{service.name}} works again | `{{service.name}}`, `{{service.message}}` |
| `ticket-created` | v1 | Support | We received your request {{ticket.reference}} | `{{ticket.reference}}`, `{{ticket.subject}}` |
| `ticket-assigned` | v1 | Support | The request {{ticket.reference}} was assigned to you | `{{ticket.reference}}`, `{{ticket.subject}}` |
| `ticket-opened-for-staff` | v1 | Support | A new request {{ticket.reference}} was opened | `{{ticket.reference}}`, `{{ticket.subject}}`, `{{ticket.customer}}` |
| `ticket-customer-replied` | v1 | Support | The customer answered on the request {{ticket.reference}} | `{{ticket.reference}}`, `{{ticket.subject}}`, `{{ticket.excerpt}}` |
| `ticket-reply-created` | v1 | Support | New answer in your request {{ticket.reference}} | `{{ticket.reference}}`, `{{ticket.subject}}`, `{{ticket.excerpt}}` |
| `ticket-status-changed` | v1 | Support | Your request {{ticket.reference}} changed state | `{{ticket.reference}}`, `{{ticket.subject}}`, `{{ticket.status}}` |
| `ticket-resolved` | v1 | Support | Your request {{ticket.reference}} was answered | `{{ticket.reference}}`, `{{ticket.subject}}` |
| `ticket-reopened` | v1 | Support | Your request {{ticket.reference}} was opened again | `{{ticket.reference}}`, `{{ticket.subject}}` |
| `ticket-closed` | v1 | Support | Your request {{ticket.reference}} was closed | `{{ticket.reference}}`, `{{ticket.subject}}` |
| `mailbox-created` | v1 | Domains and email hosting | The mailbox {{mailbox.address}} is ready | `{{mailbox.address}}`, `{{mailbox.domain}}` |
| `mailbox-provisioning-failed` | v1 | Domains and email hosting | The mailbox {{mailbox.address}} could not be created | `{{mailbox.address}}`, `{{mailbox.domain}}`, `{{mailbox.reason}}` |
| `mailbox-password-reset` | v1 | Domains and email hosting | The password of {{mailbox.address}} was changed | `{{mailbox.address}}`, `{{mailbox.domain}}` |
| `domain-verification-instructions` | v1 | Domains and email hosting | Prove that {{domain.name}} is yours | `{{domain.name}}`, `{{domain.host}}` |
| `domain-verified` | v1 | Domains and email hosting | {{domain.name}} is yours | `{{domain.name}}` |
| `domain-dns-incomplete` | v1 | Domains and email hosting | The DNS of {{domain.name}} is not complete | `{{domain.name}}`, `{{domain.missing}}` |
| `mailhosting-activated` | v1 | Domains and email hosting | The hosted mail of {{mailhosting.domain}} started | `{{mailhosting.service}}`, `{{mailhosting.plan}}`, `{{mailhosting.domain}}` |
| `mailhosting-canceled` | v1 | Domains and email hosting | The hosted mail of {{mailhosting.service}} was canceled | `{{mailhosting.service}}`, `{{mailhosting.retentionUntil}}` |
| `mailhosting-renewal-reminder` | v1 | Domains and email hosting | The hosted mail of {{mailhosting.service}} renews soon | `{{mailhosting.service}}`, `{{mailhosting.renewsAt}}` |
| `ops-provisioning-stuck` | v1 | operator | Provisioning stuck: {{ops.service}} | `{{ops.service}}`, `{{ops.minutes}}` |
| `ops-webhook-failures` | v1 | operator | {{ops.count}} webhook(s) of the payment provider failed | `{{ops.count}}` |
| `ops-delivery-failures` | v1 | operator | {{ops.count}} message(s) could not be delivered | `{{ops.count}}` |
| `ops-backup-failed` | v1 | operator | The backup failed: {{ops.target}} | `{{ops.target}}`, `{{ops.reason}}` |
| `ops-offsite-backup-missing` | v1 | operator | The copy of the backup is missing: {{ops.target}} | `{{ops.target}}` |
| `ops-restore-verification-failed` | v1 | operator | The restoration could not be verified: {{ops.target}} | `{{ops.target}}`, `{{ops.reason}}` |
| `ops-mailcow-unhealthy` | v1 | operator | The mail system does not answer | `{{ops.reason}}` |
| `ops-incident` | v1 | operator | An incident of the platform | `{{ops.message}}` |
| `ops-capacity-critical` | v1 | operator | The capacity of {{ops.resource}} is critical | `{{ops.resource}}`, `{{ops.value}}` |
| `ops-dns-certificate-failure` | v1 | operator | The certificate of {{ops.subject}} failed | `{{ops.subject}}`, `{{ops.reason}}` |
| `ops-security-change` | v1 | operator | A change of security: {{ops.subject}} | `{{ops.subject}}`, `{{ops.detail}}` |

---

## 3. The rules of the wording

The brief asks for a design that is not an AI template. The rules the
catalogue follows:

* **One system, one voice.** Every message is built by the same renderer,
  with the same header, the same footer and the same rules of the action.
  The footer carries the address of the operator, the address of the support
  and the address of the billing, and it says where the preferences are.
* **No decoration in a message of security.** The messages of the account
  and of the money carry a fact, a state and an action. They carry no
  gradient, no rounded card and no emoji.
* **The words of the customer are in his language.** The copy of the
  platform is in English, and the values that come from a customer are shown
  as they are.
* **Nothing in the message that the customer did not ask for.** The messages
  of the transactions carry what happened and what to do next, and nothing
  else. The marketing of the platform has its own group, its own agreement
  and its own way out.
* **The money is money.** The amounts are formatted with the currency of
  the invoice, and the dates are written without the time of the server.

---

## 4. The preview and the test message

The back office reads the catalogue of the same file the engine reads
(`/admin/notifications`, the panel **Templates**):

* **The preview** renders a template with a chosen payload and shows the
  subject, the preheader, the text and the HTML. It sends nothing.
* **The validation** tells which facts of the template the payload does not
  carry, so the operator sees the holes before a message goes out.
* **The test message** sends one message to one address that the operator
  types. It is the only place where the platform sends a message on demand,
  and it never sends to a list.

A preview that shows a message with a hole is a preview that tells the truth
about the message that would go out.
