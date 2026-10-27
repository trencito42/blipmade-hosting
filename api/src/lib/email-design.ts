/**
 * The branded e-mail system of the platform.
 *
 * The file holds three things:
 *
 *   1. the design system: one layout, one palette, one way to write a
 *      message, so every message of the platform looks like it comes from
 *      the same company;
 *   2. the catalogue: one template per event of the notification engine, with
 *      the subject, the preheader, the copy and the facts each of them
 *      reads;
 *   3. the renderer: it turns a template and a payload into the subject, the
 *      preheader, the HTML and the plain text of a message.
 *
 * ## The contract with the platform
 *
 * A template never reads the payload of an event directly. It reads the
 * facts it declares, and every fact is bound to one key of the payload:
 *
 *     facts: [['order.number', 'number']]
 *
 * The first name is the semantic path of the fact, the one the copy of the
 * template uses (`{{order.number}}`). The second one is the key of the
 * payload that carries it (`number`). The catalogue publishes the semantic
 * paths, because they are the names the back office shows.
 *
 * ## The links
 *
 * Two kinds of link exist, and they are never mixed:
 *
 *   * a link the template builds itself, from a path of the platform
 *     (`/app/billing`). It is built with `publicLink()`, so it can only
 *     point at the public origin of the platform and never at the host of
 *     the request;
 *   * a link the platform builds, because it holds a secret. The platform
 *     puts the final URL in the payload under `action.url` and the label of
 *     the button under `action.label`.
 *
 * The second kind is the only way a secret reaches a message, and it is the
 * only way the template learns about it: the template never receives a
 * token, a password or a recovery code. The events that carry a secret
 * (`account.verification_requested`, `account.password_reset_requested`,
 * `account.email_change_requested`) give their token to the platform, the
 * platform builds the URL out of it, and only the URL is given to the
 * template. The same holds for the verification record of a domain: the
 * value is shown to the signed-in customer on the page of the domain and it
 * is never written in a message.
 *
 * A URL that comes from the outside is used as a link only when it is an
 * absolute URL of the configured origin. Anything else is dropped and the
 * text of the message is shown without a link, so a `javascript:` address or
 * the address of another host can never end up in a message.
 *
 * ## The values
 *
 * Every value that comes from the outside is escaped before it is written in
 * the HTML, so a value that carries markup is shown as text and never as
 * markup. A value that is not there is shown as a dash. The renderer never
 * throws on a value that is missing: `validateEmailTemplatePayload()` is
 * what tells the operator that a fact is missing.
 */
import { env } from '../env.js';
import { BRAND, publicLink, publicOrigin } from './email-templates.js';

/** A message of the platform, ready to be sent. */
export interface EmailTemplate {
  id: string;
  version: number;
  subject: string;
  preheader: string;
  text: string;
  html: string;
}

/** The group of a message, the one the preferences of the customer use. */
export type EmailTemplateCategory =
  | 'accountSecurity'
  | 'ordersBilling'
  | 'hostingServices'
  | 'support'
  | 'domainsEmail'
  | 'incidents'
  | 'operator';

/** What the back office shows about one template. */
export interface EmailTemplateDescriptor {
  id: string;
  version: number;
  /** The group of the message: accountSecurity | ordersBilling | hostingServices | support | domainsEmail | incidents | operator. */
  category: string;
  /** The subject with the placeholders as they are, e.g. "Your order {{order.number}}". */
  subject: string;
  /** The placeholders the template uses, e.g. ["order.number"]. */
  placeholders: string[];
}

/** What is shown when a fact is not there. */
const DASH = '—';

/**
 * The colours of the states.
 *
 * The palette of `BRAND` holds the surfaces, the text and the accent of the
 * platform. It has no colour for a broken thing and none for a thing that
 * needs an attention, and a message that shows a failed service in the same
 * green as a running one says nothing at all.
 *
 * The two colours below are the functional colours of the product, the tokens
 * `warn` and `bad` of the design of the platform. They are only ever used
 * for the state of a thing, never for decoration, and the state is always
 * written out as well: the colour is never the only thing that says it.
 */
const STATE_COLOURS = {
  neutral: BRAND.muted,
  positive: BRAND.accent,
  caution: '#F0B232',
  critical: '#FF6B6B',
} as const;

/** The tone of a state. */
type Tone = keyof typeof STATE_COLOURS;

/** A fact of a template, and the key of the payload that carries it. */
type FactBinding = readonly [path: string, key: string];

/** A paragraph of the body. */
interface ParagraphSpec {
  /** The paragraph is only shown when this fact is there. */
  when?: string;
  /** The paragraph is hidden when this fact is there. */
  unless?: string;
  /** The copy, with the placeholders as they are. */
  text: string;
}

/** A row of the table of the facts. */
interface DetailSpec {
  /** The row is only shown when this fact is there. */
  when?: string;
  /** The row is hidden when this fact is there. */
  unless?: string;
  label: string;
  /** The value, with the placeholders as they are. */
  value: string;
}

/** The call to action of a message. */
interface ActionSpec {
  /** The label of the button, with the placeholders as they are. */
  label: string;
  /** A path of the platform. The link is built from the public origin. */
  path?: string;
  /** The fact that carries the URL, when the platform builds the link. */
  urlFact?: string;
  /** The fact that carries the label of the button, when the platform builds it. */
  labelFact?: string;
}

/** The state a message shows. */
interface StatusSpec {
  tone: Tone;
  /** The label of the state, with the placeholders as they are. */
  label: string;
}

/** One template of the catalogue. */
interface TemplateDefinition {
  id: string;
  version: number;
  category: EmailTemplateCategory;
  /** True for the messages of the operator: one screen of text, no decoration. */
  operator?: boolean;
  /** The title of the message, with the placeholders as they are. */
  heading: string;
  /** The subject with the placeholders as they are. */
  subject: string;
  /** The line that is shown in the list of the messages before one is opened. */
  preheader: string;
  /** The facts the template reads, and the key of the payload that carries them. */
  facts: FactBinding[];
  /** The body of the message. */
  paragraphs: Array<string | ParagraphSpec>;
  /** The state of the message, when it has one. */
  status?: StatusSpec;
  /** The call to action, when there is one. */
  action?: ActionSpec;
  /** The facts that are worth a table of their own. */
  details?: DetailSpec[];
  /** A line under the facts. */
  note?: string;
}

/**
 * The catalogue: one template per event of the notification engine.
 *
 * The order of the list is the order of the messages of a day: the account,
 * the money, the services, the support, the domains and the operator.
 */
const CATALOGUE: TemplateDefinition[] = [
  // ------------------------------------------------------------------ account
  {
    id: 'account-welcome',
    version: 1,
    category: 'accountSecurity',
    heading: 'Welcome to Blipmade',
    subject: 'Welcome to Blipmade',
    preheader: 'Your Blipmade account is ready. Add a service and it starts in minutes.',
    facts: [['customer.firstName', 'name']],
    paragraphs: [
      { when: 'customer.firstName', text: 'Hi {{customer.firstName}},' },
      { unless: 'customer.firstName', text: 'Hi,' },
      'Your Blipmade account is ready. Add a service from the dashboard and it starts in minutes.',
      'Your billing, your services and your support requests are all in the same place.',
      'You can change your address, your password and the messages you receive at any time from the settings of your account.',
    ],
    action: { label: 'Open the dashboard', path: '/app' },
  },
  {
    id: 'account-verify-email',
    version: 1,
    category: 'accountSecurity',
    heading: 'Confirm your email address',
    subject: 'Confirm your email address',
    preheader: 'Confirm the address of your Blipmade account to receive every message about your services.',
    facts: [
      ['customer.firstName', 'name'],
      ['action.url', 'action.url'],
      ['action.label', 'action.label'],
    ],
    paragraphs: [
      { when: 'customer.firstName', text: 'Hi {{customer.firstName}},' },
      { unless: 'customer.firstName', text: 'Hi,' },
      'Confirm the address of your Blipmade account to finish the opening of it.',
      'The link works once and expires in 24 hours. If you did not create this account, ignore this message and nothing happens.',
    ],
    action: {
      label: 'Confirm my email address',
      urlFact: 'action.url',
      labelFact: 'action.label',
    },
  },
  {
    id: 'account-email-verified',
    version: 1,
    category: 'accountSecurity',
    heading: 'Your email address is confirmed',
    subject: 'Your email address is confirmed',
    preheader: 'The address of your Blipmade account is confirmed.',
    facts: [['customer.firstName', 'name']],
    paragraphs: [
      { when: 'customer.firstName', text: 'Hi {{customer.firstName}},' },
      { unless: 'customer.firstName', text: 'Hi,' },
      'The address of your Blipmade account is confirmed. Everything is ready.',
      'Every message about the services of the account reaches this address from now on.',
    ],
    action: { label: 'Open the dashboard', path: '/app' },
  },
  {
    id: 'account-password-reset',
    version: 1,
    category: 'accountSecurity',
    heading: 'Reset your password',
    subject: 'Reset your password',
    preheader: 'Choose a new password for your Blipmade account.',
    facts: [
      ['customer.firstName', 'name'],
      ['action.url', 'action.url'],
      ['action.label', 'action.label'],
    ],
    paragraphs: [
      { when: 'customer.firstName', text: 'Hi {{customer.firstName}},' },
      { unless: 'customer.firstName', text: 'Hi,' },
      'A request was made to reset the password of your Blipmade account.',
      'The link works once and expires in 1 hour. If you did not ask for it, nothing changed and you can ignore this message.',
    ],
    action: {
      label: 'Choose a new password',
      urlFact: 'action.url',
      labelFact: 'action.label',
    },
  },
  {
    id: 'account-password-changed',
    version: 1,
    category: 'accountSecurity',
    heading: 'Your password was changed',
    subject: 'Your password was changed',
    preheader: 'The password of your Blipmade account was changed.',
    facts: [['customer.firstName', 'name']],
    paragraphs: [
      { when: 'customer.firstName', text: 'Hi {{customer.firstName}},' },
      { unless: 'customer.firstName', text: 'Hi,' },
      'The password of your Blipmade account was changed.',
      'The sessions that were open on the other devices were closed.',
    ],
    action: { label: 'Open the settings', path: '/app/settings' },
    note: 'If you did not make this change, reset your password at once and write to the support.',
  },
  {
    id: 'account-email-change-requested',
    version: 1,
    category: 'accountSecurity',
    heading: 'Confirm your new email address',
    subject: 'Confirm your new email address',
    preheader: 'Confirm the new address of your Blipmade account.',
    facts: [
      ['customer.firstName', 'name'],
      ['customer.email', 'email'],
      ['action.url', 'action.url'],
      ['action.label', 'action.label'],
    ],
    paragraphs: [
      { when: 'customer.firstName', text: 'Hi {{customer.firstName}},' },
      { unless: 'customer.firstName', text: 'Hi,' },
      'A request was made to change the email address of your Blipmade account to {{customer.email}}.',
      'The link works once and expires in 1 hour. If you did not ask for it, nothing changed and you can ignore this message.',
    ],
    action: {
      label: 'Confirm the new address',
      urlFact: 'action.url',
      labelFact: 'action.label',
    },
    details: [{ label: 'New address', value: '{{customer.email}}' }],
  },
  {
    id: 'account-email-changed',
    version: 1,
    category: 'accountSecurity',
    heading: 'Your email address was changed',
    subject: 'Your email address was changed',
    preheader: 'The email address of your Blipmade account was changed.',
    facts: [
      ['customer.firstName', 'name'],
      ['customer.email', 'email'],
    ],
    paragraphs: [
      { when: 'customer.firstName', text: 'Hi {{customer.firstName}},' },
      { unless: 'customer.firstName', text: 'Hi,' },
      'The email address of your Blipmade account is now {{customer.email}}.',
      'Every message about the services of the account goes to this address from now on.',
    ],
    action: { label: 'Open the settings', path: '/app/settings' },
    details: [{ label: 'New address', value: '{{customer.email}}' }],
    note: 'The old address does not receive a message about the account from now on.',
  },
  {
    id: 'account-suspended',
    version: 1,
    category: 'accountSecurity',
    heading: 'Your account was suspended',
    subject: 'Your account was suspended',
    preheader: 'Your Blipmade account was suspended. Write to the support to have it restored.',
    facts: [
      ['customer.firstName', 'name'],
      ['account.reason', 'reason'],
    ],
    paragraphs: [
      { when: 'customer.firstName', text: 'Hi {{customer.firstName}},' },
      { unless: 'customer.firstName', text: 'Hi,' },
      'The account of your Blipmade account was suspended, so you cannot sign in at the moment and the sessions that were open are closed.',
      { when: 'account.reason', text: 'The reason given: {{account.reason}}' },
      'Write to the support of Blipmade to have the account restored. The address is in the footer of this message.',
    ],
    note: 'If you think this is a mistake, write to the support and we will look at the account.',
  },
  {
    id: 'account-reinstated',
    version: 1,
    category: 'accountSecurity',
    heading: 'Your account was put back',
    subject: 'Your account was put back',
    preheader: 'The suspension of your Blipmade account was lifted.',
    facts: [['customer.firstName', 'name']],
    paragraphs: [
      { when: 'customer.firstName', text: 'Hi {{customer.firstName}},' },
      { unless: 'customer.firstName', text: 'Hi,' },
      'The suspension of your Blipmade account was lifted and you can sign in again.',
      'The sessions that were open when the account was suspended are closed, so you sign in with your password.',
    ],
    action: { label: 'Sign in', path: '/login' },
  },
  {
    id: 'account-deletion-requested',
    version: 1,
    category: 'accountSecurity',
    heading: 'We received the request to close your account',
    subject: 'We received the request to close your account',
    preheader: 'The closing of your Blipmade account was asked for.',
    facts: [['customer.firstName', 'name']],
    paragraphs: [
      { when: 'customer.firstName', text: 'Hi {{customer.firstName}},' },
      { unless: 'customer.firstName', text: 'Hi,' },
      'We received the request to close your Blipmade account.',
      'The services of the account stay online until the request is confirmed. When the account is closed, the data of the services is deleted at the end of the retention.',
      'If you did not ask for this, write to the support at once.',
    ],
    action: { label: 'Open the settings', path: '/app/settings' },
  },

  // ------------------------------------------------------- orders and money
  {
    id: 'order-created',
    version: 1,
    category: 'ordersBilling',
    heading: 'Your order {{order.number}} was created',
    subject: 'Your order {{order.number}} was created',
    preheader: 'The order {{order.number}} is waiting for its payment.',
    facts: [
      ['order.number', 'number'],
      ['order.total.formatted', 'total'],
      ['order.currency', 'currency'],
    ],
    status: { tone: 'neutral', label: 'Waiting for payment' },
    paragraphs: [
      'We received your order {{order.number}}.',
      'A service is not provisioned until its order is paid. You can pay it from the billing page of your account.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Order', value: '{{order.number}}' },
      { label: 'Amount', value: '{{order.total.formatted}}' },
      { label: 'Currency', value: '{{order.currency}}' },
    ],
  },
  {
    id: 'order-payment-required',
    version: 1,
    category: 'ordersBilling',
    heading: 'Your order {{order.number}} waits for its payment',
    subject: 'Your order {{order.number}} waits for its payment',
    preheader: 'The order {{order.number}} is not started until it is paid.',
    facts: [
      ['order.number', 'number'],
      ['order.total.formatted', 'total'],
      ['order.currency', 'currency'],
    ],
    status: { tone: 'neutral', label: 'Payment required' },
    paragraphs: [
      'The order {{order.number}} is waiting for its payment.',
      'The service of the order is not provisioned until the payment is confirmed. The order stays open in the meantime.',
    ],
    action: { label: 'Pay the order', path: '/app/billing' },
    details: [
      { label: 'Order', value: '{{order.number}}' },
      { label: 'Amount', value: '{{order.total.formatted}}' },
      { label: 'Currency', value: '{{order.currency}}' },
    ],
  },
  {
    id: 'order-canceled',
    version: 1,
    category: 'ordersBilling',
    heading: 'Your order {{order.number}} was canceled',
    subject: 'Your order {{order.number}} was canceled',
    preheader: 'The order {{order.number}} was canceled and nothing was charged.',
    facts: [['order.number', 'number']],
    status: { tone: 'neutral', label: 'Canceled' },
    paragraphs: [
      'The order {{order.number}} was canceled.',
      'Nothing was charged. If you did not cancel it, write to the support.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [{ label: 'Order', value: '{{order.number}}' }],
  },
  {
    id: 'payment-succeeded',
    version: 1,
    category: 'ordersBilling',
    heading: 'Your payment of {{amount.formatted}} went through',
    subject: 'Your payment of {{amount.formatted}} went through',
    preheader: 'The payment of {{amount.formatted}} for the order {{payment.number}} was confirmed.',
    facts: [
      ['payment.number', 'number'],
      ['amount.formatted', 'amount'],
      ['payment.currency', 'currency'],
    ],
    status: { tone: 'positive', label: 'Payment received' },
    paragraphs: [
      'We received the payment of {{amount.formatted}} for the order {{payment.number}}.',
      'The service of the order is provisioned now. You receive a message when it is ready.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Order', value: '{{payment.number}}' },
      { label: 'Amount', value: '{{amount.formatted}}' },
      { label: 'Currency', value: '{{payment.currency}}' },
    ],
  },
  {
    id: 'payment-failed',
    version: 1,
    category: 'ordersBilling',
    heading: 'Your payment of {{amount.formatted}} did not go through',
    subject: 'Your payment of {{amount.formatted}} did not go through',
    preheader: 'The payment of {{amount.formatted}} for the order {{payment.number}} was refused.',
    facts: [
      ['payment.number', 'number'],
      ['amount.formatted', 'amount'],
      ['payment.currency', 'currency'],
      ['payment.reason', 'reason'],
    ],
    status: { tone: 'critical', label: 'Payment failed' },
    paragraphs: [
      'The payment of {{amount.formatted}} for the order {{payment.number}} did not go through.',
      'Nothing was charged and the order stays open. You can try again from the billing page of your account.',
    ],
    action: { label: 'Try again', path: '/app/billing' },
    details: [
      { label: 'Order', value: '{{payment.number}}' },
      { label: 'Amount', value: '{{amount.formatted}}' },
      { label: 'Currency', value: '{{payment.currency}}' },
      { when: 'payment.reason', label: 'Reason', value: '{{payment.reason}}' },
    ],
  },
  {
    id: 'payment-canceled',
    version: 1,
    category: 'ordersBilling',
    heading: 'The payment of the order {{payment.number}} was canceled',
    subject: 'The payment of the order {{payment.number}} was canceled',
    preheader: 'The payment of the order {{payment.number}} was canceled before it was confirmed.',
    facts: [['payment.number', 'number']],
    status: { tone: 'neutral', label: 'Payment canceled' },
    paragraphs: [
      'The payment of the order {{payment.number}} was canceled before it was confirmed.',
      'Nothing was charged. You can start the payment again from the billing page of your account.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [{ label: 'Order', value: '{{payment.number}}' }],
  },
  {
    id: 'payment-refunded',
    version: 1,
    category: 'ordersBilling',
    heading: 'The payment of {{amount.formatted}} was refunded',
    subject: 'The payment of {{amount.formatted}} was refunded',
    preheader: 'The payment of {{amount.formatted}} for the order {{payment.number}} was refunded.',
    facts: [
      ['payment.number', 'number'],
      ['amount.formatted', 'amount'],
      ['payment.currency', 'currency'],
    ],
    status: { tone: 'neutral', label: 'Refunded' },
    paragraphs: [
      'The payment of {{amount.formatted}} for the order {{payment.number}} was refunded.',
      'The amount is back on the card that paid it. Depending on the bank, it takes a few days to appear.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Order', value: '{{payment.number}}' },
      { label: 'Amount', value: '{{amount.formatted}}' },
      { label: 'Currency', value: '{{payment.currency}}' },
    ],
  },
  {
    id: 'invoice-issued',
    version: 1,
    category: 'ordersBilling',
    heading: 'Your invoice {{invoice.number}} was issued',
    subject: 'Your invoice {{invoice.number}} was issued',
    preheader: 'The invoice {{invoice.number}} is for {{amount.formatted}}.',
    facts: [
      ['invoice.number', 'number'],
      ['amount.formatted', 'amount'],
      ['invoice.currency', 'currency'],
      ['invoice.dueAt', 'dueAt'],
    ],
    status: { tone: 'neutral', label: 'Invoice issued' },
    paragraphs: [
      'The invoice {{invoice.number}} for {{amount.formatted}} was issued.',
      'You can read it and pay it from the billing page of your account.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Invoice', value: '{{invoice.number}}' },
      { label: 'Amount', value: '{{amount.formatted}}' },
      { label: 'Currency', value: '{{invoice.currency}}' },
      { when: 'invoice.dueAt', label: 'Due', value: '{{invoice.dueAt}}' },
    ],
  },
  {
    id: 'invoice-paid',
    version: 1,
    category: 'ordersBilling',
    heading: 'Your invoice {{invoice.number}} was paid',
    subject: 'Your invoice {{invoice.number}} was paid',
    preheader: 'The invoice {{invoice.number}} for {{amount.formatted}} was paid.',
    facts: [
      ['invoice.number', 'number'],
      ['amount.formatted', 'amount'],
      ['invoice.currency', 'currency'],
      ['invoice.periodEnd', 'periodEnd'],
    ],
    status: { tone: 'positive', label: 'Paid' },
    paragraphs: [
      'We received the payment of the invoice {{invoice.number}} for {{amount.formatted}}.',
      'Everything is running as it should. The receipt is on the billing page of your account.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Invoice', value: '{{invoice.number}}' },
      { label: 'Amount', value: '{{amount.formatted}}' },
      { label: 'Currency', value: '{{invoice.currency}}' },
      { when: 'invoice.periodEnd', label: 'Paid period', value: '{{invoice.periodEnd}}' },
    ],
  },
  {
    id: 'invoice-payment-failed',
    version: 1,
    category: 'ordersBilling',
    heading: 'The payment of the invoice {{invoice.number}} failed',
    subject: 'The payment of the invoice {{invoice.number}} failed',
    preheader: 'The invoice {{invoice.number}} for {{amount.formatted}} could not be paid.',
    facts: [
      ['invoice.number', 'number'],
      ['amount.formatted', 'amount'],
      ['invoice.currency', 'currency'],
      ['invoice.reason', 'reason'],
    ],
    status: { tone: 'critical', label: 'Payment failed' },
    paragraphs: [
      'The payment of the invoice {{invoice.number}} for {{amount.formatted}} did not go through.',
      'The service stays available while the invoice is open, but it can be suspended when the invoice stays unpaid.',
    ],
    action: { label: 'Try again', path: '/app/billing' },
    details: [
      { label: 'Invoice', value: '{{invoice.number}}' },
      { label: 'Amount', value: '{{amount.formatted}}' },
      { label: 'Currency', value: '{{invoice.currency}}' },
      { when: 'invoice.reason', label: 'Reason', value: '{{invoice.reason}}' },
    ],
  },
  {
    id: 'invoice-overdue',
    version: 1,
    category: 'ordersBilling',
    heading: 'Your invoice {{invoice.number}} is late',
    subject: 'Your invoice {{invoice.number}} is late',
    preheader: 'The invoice {{invoice.number}} for {{amount.formatted}} is past its due date.',
    facts: [
      ['invoice.number', 'number'],
      ['amount.formatted', 'amount'],
      ['invoice.currency', 'currency'],
      ['invoice.daysOverdue', 'daysOverdue'],
    ],
    status: { tone: 'critical', label: 'Overdue' },
    paragraphs: [
      'The invoice {{invoice.number}} for {{amount.formatted}} is past its due date.',
      'The service stays available while the invoice is open, but it can be suspended when the invoice stays unpaid.',
    ],
    action: { label: 'Pay the invoice', path: '/app/billing' },
    details: [
      { label: 'Invoice', value: '{{invoice.number}}' },
      { label: 'Amount', value: '{{amount.formatted}}' },
      { label: 'Currency', value: '{{invoice.currency}}' },
      { when: 'invoice.daysOverdue', label: 'Days late', value: '{{invoice.daysOverdue}}' },
    ],
  },
  {
    id: 'invoice-reminder-due',
    version: 1,
    category: 'ordersBilling',
    heading: 'Your invoice {{invoice.number}} is due',
    subject: 'Your invoice {{invoice.number}} is due',
    preheader: 'The invoice {{invoice.number}} for {{amount.formatted}} is due soon.',
    facts: [
      ['invoice.number', 'number'],
      ['amount.formatted', 'amount'],
      ['invoice.currency', 'currency'],
      ['invoice.dueAt', 'dueAt'],
    ],
    status: { tone: 'caution', label: 'Due soon' },
    paragraphs: [
      'The invoice {{invoice.number}} for {{amount.formatted}} is due.',
      { when: 'invoice.dueAt', text: 'It is due on {{invoice.dueAt}}.' },
      'You can pay it from the billing page of your account.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Invoice', value: '{{invoice.number}}' },
      { label: 'Amount', value: '{{amount.formatted}}' },
      { label: 'Currency', value: '{{invoice.currency}}' },
      { when: 'invoice.dueAt', label: 'Due', value: '{{invoice.dueAt}}' },
    ],
  },
  {
    id: 'subscription-activated',
    version: 1,
    category: 'ordersBilling',
    heading: 'The subscription of {{subscription.service}} started',
    subject: 'The subscription of {{subscription.service}} started',
    preheader: 'The subscription of {{subscription.service}} on the plan {{subscription.plan}} is active.',
    facts: [
      ['subscription.service', 'service'],
      ['subscription.plan', 'plan'],
    ],
    status: { tone: 'positive', label: 'Active' },
    paragraphs: [
      'The subscription of {{subscription.service}} on the plan {{subscription.plan}} is active.',
      'The service is provisioned now. You receive a message when it is ready.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Service', value: '{{subscription.service}}' },
      { label: 'Plan', value: '{{subscription.plan}}' },
    ],
  },
  {
    id: 'subscription-renewed',
    version: 1,
    category: 'ordersBilling',
    heading: 'The subscription of {{subscription.service}} was renewed',
    subject: 'The subscription of {{subscription.service}} was renewed',
    preheader: 'The subscription of {{subscription.service}} was renewed for {{amount.formatted}}.',
    facts: [
      ['subscription.service', 'service'],
      ['amount.formatted', 'amount'],
      ['subscription.currency', 'currency'],
      ['subscription.periodEnd', 'periodEnd'],
    ],
    status: { tone: 'positive', label: 'Renewed' },
    paragraphs: [
      'The subscription of {{subscription.service}} was renewed for {{amount.formatted}}.',
      { when: 'subscription.periodEnd', text: 'It stays active until {{subscription.periodEnd}}.' },
      {
        unless: 'subscription.periodEnd',
        text: 'It stays active for the period that was paid for.',
      },
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Service', value: '{{subscription.service}}' },
      { label: 'Amount', value: '{{amount.formatted}}' },
      { label: 'Currency', value: '{{subscription.currency}}' },
      { when: 'subscription.periodEnd', label: 'Paid until', value: '{{subscription.periodEnd}}' },
    ],
  },
  {
    id: 'subscription-changed',
    version: 1,
    category: 'ordersBilling',
    heading: 'The subscription of {{subscription.service}} changed',
    subject: 'The subscription of {{subscription.service}} changed',
    preheader: 'The subscription of {{subscription.service}} changed: {{subscription.change}}',
    facts: [
      ['subscription.service', 'service'],
      ['subscription.change', 'change'],
    ],
    status: { tone: 'neutral', label: 'Changed' },
    paragraphs: [
      'The subscription of {{subscription.service}} changed: {{subscription.change}}',
      'The change takes effect on the next renewal of the subscription.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Service', value: '{{subscription.service}}' },
      { label: 'Change', value: '{{subscription.change}}' },
    ],
  },
  {
    id: 'subscription-cancellation-scheduled',
    version: 1,
    category: 'ordersBilling',
    heading: 'The subscription of {{subscription.service}} will end',
    subject: 'The subscription of {{subscription.service}} will end',
    preheader: 'The subscription of {{subscription.service}} ends at the end of the period that was paid for.',
    facts: [
      ['subscription.service', 'service'],
      ['subscription.periodEnd', 'periodEnd'],
    ],
    status: { tone: 'caution', label: 'Ends at the end of the period' },
    paragraphs: [
      'The subscription of {{subscription.service}} ends at the end of the period that was paid for.',
      { when: 'subscription.periodEnd', text: 'It stays active until {{subscription.periodEnd}}.' },
      { unless: 'subscription.periodEnd', text: 'The service stays active until the end of the paid period.' },
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Service', value: '{{subscription.service}}' },
      { when: 'subscription.periodEnd', label: 'Ends on', value: '{{subscription.periodEnd}}' },
    ],
  },
  {
    id: 'subscription-canceled',
    version: 1,
    category: 'ordersBilling',
    heading: 'The subscription of {{subscription.service}} ended',
    subject: 'The subscription of {{subscription.service}} ended',
    preheader: 'The subscription of {{subscription.service}} ended. The data is kept for a while.',
    facts: [['subscription.service', 'service']],
    status: { tone: 'neutral', label: 'Ended' },
    paragraphs: [
      'The subscription of {{subscription.service}} ended.',
      'The data of the service is kept for a while. The service itself is not renewed.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [{ label: 'Service', value: '{{subscription.service}}' }],
  },
  {
    id: 'subscription-reactivated',
    version: 1,
    category: 'ordersBilling',
    heading: 'The subscription of {{subscription.service}} started again',
    subject: 'The subscription of {{subscription.service}} started again',
    preheader: 'The subscription of {{subscription.service}} started again.',
    facts: [['subscription.service', 'service']],
    status: { tone: 'positive', label: 'Active' },
    paragraphs: [
      'The subscription of {{subscription.service}} started again.',
      'The service is provisioned again. You receive a message when it is ready.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [{ label: 'Service', value: '{{subscription.service}}' }],
  },
  {
    id: 'subscription-grace-period',
    version: 1,
    category: 'ordersBilling',
    heading: 'The subscription of {{subscription.service}} is in its grace period',
    subject: 'The subscription of {{subscription.service}} is in its grace period',
    preheader: 'The service of {{subscription.service}} keeps working during the grace period.',
    facts: [
      ['subscription.service', 'service'],
      ['subscription.graceUntil', 'graceUntil'],
    ],
    status: { tone: 'caution', label: 'Grace period' },
    paragraphs: [
      'The payment of the subscription of {{subscription.service}} did not go through.',
      { when: 'subscription.graceUntil', text: 'The service keeps working until {{subscription.graceUntil}}.' },
      { unless: 'subscription.graceUntil', text: 'The service keeps working until the end of the grace period.' },
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Service', value: '{{subscription.service}}' },
      { when: 'subscription.graceUntil', label: 'Grace until', value: '{{subscription.graceUntil}}' },
    ],
  },
  {
    id: 'subscription-suspension-warning',
    version: 1,
    category: 'ordersBilling',
    heading: 'The subscription of {{subscription.service}} will be suspended',
    subject: 'The subscription of {{subscription.service}} will be suspended',
    preheader: 'The service of {{subscription.service}} is suspended at the end of the grace period.',
    facts: [
      ['subscription.service', 'service'],
      ['subscription.graceUntil', 'graceUntil'],
    ],
    status: { tone: 'critical', label: 'Suspended after the grace period' },
    paragraphs: [
      'The service of {{subscription.service}} is suspended at the end of the grace period.',
      { when: 'subscription.graceUntil', text: 'It happens on {{subscription.graceUntil}}.' },
      { unless: 'subscription.graceUntil', text: 'It happens at the end of the grace period.' },
      'Paying the invoice before that date keeps the service online.',
    ],
    action: { label: 'Pay now', path: '/app/billing' },
    details: [
      { label: 'Service', value: '{{subscription.service}}' },
      { when: 'subscription.graceUntil', label: 'Suspended on', value: '{{subscription.graceUntil}}' },
    ],
  },

  // ---------------------------------------------------------------- services
  {
    id: 'service-provisioning-started',
    version: 1,
    category: 'hostingServices',
    heading: '{{service.name}} is being built',
    subject: '{{service.name}} is being built',
    preheader: 'The service {{service.name}} on the plan {{service.plan}} is being built.',
    facts: [
      ['service.name', 'service'],
      ['service.plan', 'plan'],
    ],
    status: { tone: 'neutral', label: 'Provisioning' },
    paragraphs: [
      'The service {{service.name}} on the plan {{service.plan}} is being built.',
      'It takes a few minutes. You receive a message when the service answers.',
    ],
    details: [
      { label: 'Service', value: '{{service.name}}' },
      { label: 'Plan', value: '{{service.plan}}' },
    ],
  },
  {
    id: 'service-provisioning-failed',
    version: 1,
    category: 'hostingServices',
    heading: '{{service.name}} could not be built',
    subject: '{{service.name}} could not be built',
    preheader: 'The service {{service.name}} could not be built.',
    facts: [
      ['service.name', 'service'],
      ['service.reason', 'reason'],
    ],
    status: { tone: 'critical', label: 'Provisioning failed' },
    paragraphs: [
      'The service {{service.name}} could not be built.',
      'Reason: {{service.reason}}',
      'Nothing was charged for it. The support can build it again for you.',
    ],
    action: { label: 'Open the support', path: '/app/tickets' },
    details: [
      { label: 'Service', value: '{{service.name}}' },
      { label: 'Reason', value: '{{service.reason}}' },
    ],
  },
  {
    id: 'service-activated',
    version: 1,
    category: 'hostingServices',
    heading: '{{service.name}} is ready',
    subject: '{{service.name}} is ready',
    preheader: 'The service {{service.name}} is ready and it answers.',
    facts: [
      ['service.name', 'service'],
      ['service.address', 'address'],
    ],
    status: { tone: 'positive', label: 'Online' },
    paragraphs: [
      'The service {{service.name}} is ready and it answers.',
      'You can open it from the services page of your account.',
    ],
    action: { label: 'Open the service', path: '/app/instances' },
    details: [
      { label: 'Service', value: '{{service.name}}' },
      { when: 'service.address', label: 'Address', value: '{{service.address}}' },
    ],
  },
  {
    id: 'service-suspended',
    version: 1,
    category: 'hostingServices',
    heading: '{{service.name}} was suspended',
    subject: '{{service.name}} was suspended',
    preheader: 'The service {{service.name}} was suspended.',
    facts: [
      ['service.name', 'service'],
      ['service.reason', 'reason'],
    ],
    status: { tone: 'critical', label: 'Suspended' },
    paragraphs: [
      'The service {{service.name}} was suspended.',
      'Reason: {{service.reason}}',
      'It answers again as soon as the invoice behind it is paid. Write to the support when the reason is not the billing.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Service', value: '{{service.name}}' },
      { label: 'Reason', value: '{{service.reason}}' },
    ],
  },
  {
    id: 'service-unsuspended',
    version: 1,
    category: 'hostingServices',
    heading: '{{service.name}} works again',
    subject: '{{service.name}} works again',
    preheader: 'The service {{service.name}} was unsuspended and it answers again.',
    facts: [['service.name', 'service']],
    status: { tone: 'positive', label: 'Online' },
    paragraphs: [
      'The service {{service.name}} was unsuspended and it answers again.',
      'It runs with the plan and the resources it had before the suspension.',
    ],
    action: { label: 'Open the service', path: '/app/instances' },
    details: [{ label: 'Service', value: '{{service.name}}' }],
  },
  {
    id: 'service-expiring',
    version: 1,
    category: 'hostingServices',
    heading: '{{service.name}} ends soon',
    subject: '{{service.name}} ends soon',
    preheader: 'The service {{service.name}} ends at the end of its term.',
    facts: [
      ['service.name', 'service'],
      ['service.expiresAt', 'expiresAt'],
    ],
    status: { tone: 'caution', label: 'Ends soon' },
    paragraphs: [
      'The service {{service.name}} ends at the end of its term.',
      { when: 'service.expiresAt', text: 'It ends on {{service.expiresAt}}.' },
      { unless: 'service.expiresAt', text: 'The exact date is on the billing page of your account.' },
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Service', value: '{{service.name}}' },
      { when: 'service.expiresAt', label: 'Ends on', value: '{{service.expiresAt}}' },
    ],
  },
  {
    id: 'service-renewal-reminder',
    version: 1,
    category: 'hostingServices',
    heading: '{{service.name}} renews soon',
    subject: '{{service.name}} renews soon',
    preheader: 'The service {{service.name}} renews at the end of its term.',
    facts: [
      ['service.name', 'service'],
      ['service.renewsAt', 'renewsAt'],
    ],
    status: { tone: 'caution', label: 'Renews soon' },
    paragraphs: [
      'The service {{service.name}} renews at the end of its term.',
      { when: 'service.renewsAt', text: 'It renews on {{service.renewsAt}}.' },
      { unless: 'service.renewsAt', text: 'The exact date is on the billing page of your account.' },
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Service', value: '{{service.name}}' },
      { when: 'service.renewsAt', label: 'Renews on', value: '{{service.renewsAt}}' },
    ],
  },
  {
    id: 'service-expired',
    version: 1,
    category: 'hostingServices',
    heading: '{{service.name}} ended',
    subject: '{{service.name}} ended',
    preheader: 'The term of the service {{service.name}} ended. The data is kept for a while.',
    facts: [['service.name', 'service']],
    status: { tone: 'neutral', label: 'Ended' },
    paragraphs: [
      'The term of the service {{service.name}} ended.',
      'The data is kept for a while, so a renewal brings the service back with its content.',
    ],
    details: [{ label: 'Service', value: '{{service.name}}' }],
  },
  {
    id: 'service-canceled',
    version: 1,
    category: 'hostingServices',
    heading: 'The service {{service.name}} was canceled',
    subject: 'The service {{service.name}} was canceled',
    preheader: 'The service {{service.name}} was canceled. The data is kept until it is deleted.',
    facts: [['service.name', 'service']],
    status: { tone: 'neutral', label: 'Canceled' },
    paragraphs: [
      'The service {{service.name}} was canceled.',
      'The data is kept until the end of the retention. After that it is deleted.',
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [{ label: 'Service', value: '{{service.name}}' }],
  },
  {
    id: 'service-deleted',
    version: 1,
    category: 'hostingServices',
    heading: 'The data of {{service.name}} was deleted',
    subject: 'The data of {{service.name}} was deleted',
    preheader: 'The data of the service {{service.name}} was deleted at the end of its retention.',
    facts: [['service.name', 'service']],
    status: { tone: 'neutral', label: 'Deleted' },
    paragraphs: [
      'The data of the service {{service.name}} was deleted at the end of its retention.',
    ],
    details: [{ label: 'Service', value: '{{service.name}}' }],
    note: 'This cannot be undone. Write to the support at once when you did not ask for the deletion.',
  },
  {
    id: 'service-upgrade-completed',
    version: 1,
    category: 'hostingServices',
    heading: '{{service.name}} was changed',
    subject: '{{service.name}} was changed',
    preheader: 'The change of the service {{service.name}} went through.',
    facts: [
      ['service.name', 'service'],
      ['service.change', 'change'],
    ],
    status: { tone: 'positive', label: 'Change done' },
    paragraphs: [
      'The change of the service {{service.name}} went through: {{service.change}}',
      'The service was restarted for it and it answers again.',
    ],
    details: [
      { label: 'Service', value: '{{service.name}}' },
      { label: 'Change', value: '{{service.change}}' },
    ],
  },
  {
    id: 'service-upgrade-failed',
    version: 1,
    category: 'hostingServices',
    heading: 'The change of {{service.name}} did not go through',
    subject: 'The change of {{service.name}} did not go through',
    preheader: 'The change of the service {{service.name}} failed.',
    facts: [
      ['service.name', 'service'],
      ['service.reason', 'reason'],
    ],
    status: { tone: 'critical', label: 'Change failed' },
    paragraphs: [
      'The change of the service {{service.name}} did not go through.',
      'Reason: {{service.reason}}',
      'The service keeps the plan and the resources it had before the change.',
    ],
    action: { label: 'Open the support', path: '/app/tickets' },
    details: [
      { label: 'Service', value: '{{service.name}}' },
      { label: 'Reason', value: '{{service.reason}}' },
    ],
  },
  {
    id: 'service-incident',
    version: 1,
    category: 'incidents',
    heading: 'An incident touches {{service.name}}',
    subject: 'An incident touches {{service.name}}',
    preheader: 'An incident is open on the service {{service.name}}.',
    facts: [
      ['service.name', 'service'],
      ['service.message', 'message'],
    ],
    status: { tone: 'critical', label: 'Incident' },
    paragraphs: [
      'An incident touches the service {{service.name}}.',
      '{{service.message}}',
      'We follow the incident and we write as soon as it is over.',
    ],
    details: [{ label: 'Service', value: '{{service.name}}' }],
  },
  {
    id: 'service-restored',
    version: 1,
    category: 'incidents',
    heading: '{{service.name}} works again',
    subject: '{{service.name}} works again',
    preheader: 'The service {{service.name}} works again.',
    facts: [
      ['service.name', 'service'],
      ['service.message', 'message'],
    ],
    status: { tone: 'positive', label: 'Restored' },
    paragraphs: [
      'The service {{service.name}} works again.',
      '{{service.message}}',
    ],
    details: [{ label: 'Service', value: '{{service.name}}' }],
  },

  // ----------------------------------------------------------------- support
  {
    id: 'ticket-created',
    version: 1,
    category: 'support',
    heading: 'We received your request {{ticket.reference}}',
    subject: 'We received your request {{ticket.reference}}',
    preheader: 'The request {{ticket.reference}} is in the queue of the support.',
    facts: [
      ['ticket.reference', 'ticket'],
      ['ticket.subject', 'subject'],
    ],
    status: { tone: 'neutral', label: 'Open' },
    paragraphs: [
      'Our support team received your request {{ticket.reference}} and we answer on this address.',
      'The subject of the request is {{ticket.subject}}.',
    ],
    action: { label: 'Open the request', path: '/app/tickets' },
    details: [
      { label: 'Request', value: '{{ticket.reference}}' },
      { label: 'Subject', value: '{{ticket.subject}}' },
    ],
  },
  {
    id: 'ticket-assigned',
    version: 1,
    category: 'support',
    heading: 'The request {{ticket.reference}} was assigned to you',
    subject: 'The request {{ticket.reference}} was assigned to you',
    preheader: 'The request {{ticket.reference}} is yours to answer.',
    facts: [
      ['ticket.reference', 'ticket'],
      ['ticket.subject', 'subject'],
    ],
    status: { tone: 'neutral', label: 'Assigned' },
    paragraphs: [
      'The request {{ticket.reference}} was assigned to you.',
      'The subject of the request is {{ticket.subject}}.',
      'The customer waits for an answer.',
    ],
    details: [
      { label: 'Request', value: '{{ticket.reference}}' },
      { label: 'Subject', value: '{{ticket.subject}}' },
    ],
  },
  {
    id: 'ticket-opened-for-staff',
    version: 1,
    category: 'support',
    heading: 'A new request {{ticket.reference}} was opened',
    subject: 'A new request {{ticket.reference}} was opened',
    preheader: 'The request {{ticket.reference}} is in the queue of the support.',
    facts: [
      ['ticket.reference', 'ticket'],
      ['ticket.subject', 'subject'],
      ['ticket.customer', 'customer'],
    ],
    status: { tone: 'neutral', label: 'New' },
    paragraphs: [
      'A new request {{ticket.reference}} was opened by {{ticket.customer}}.',
      'The subject of the request is {{ticket.subject}}.',
      'The customer waits for an answer.',
    ],
    details: [
      { label: 'Request', value: '{{ticket.reference}}' },
      { label: 'Customer', value: '{{ticket.customer}}' },
      { label: 'Subject', value: '{{ticket.subject}}' },
    ],
  },
  {
    id: 'ticket-customer-replied',
    version: 1,
    category: 'support',
    heading: 'The customer answered on the request {{ticket.reference}}',
    subject: 'The customer answered on the request {{ticket.reference}}',
    preheader: 'There is a new answer from the customer on the request {{ticket.reference}}.',
    facts: [
      ['ticket.reference', 'ticket'],
      ['ticket.subject', 'subject'],
      ['ticket.excerpt', 'excerpt'],
    ],
    status: { tone: 'neutral', label: 'Answered' },
    paragraphs: [
      'The customer answered on the request {{ticket.reference}}.',
      '{{ticket.excerpt}}',
    ],
    details: [
      { label: 'Request', value: '{{ticket.reference}}' },
      { label: 'Subject', value: '{{ticket.subject}}' },
    ],
  },
  {
    id: 'ticket-reply-created',
    version: 1,
    category: 'support',
    heading: 'New answer in your request {{ticket.reference}}',
    subject: 'New answer in your request {{ticket.reference}}',
    preheader: 'There is a new answer on the request {{ticket.reference}}.',
    facts: [
      ['ticket.reference', 'ticket'],
      ['ticket.subject', 'subject'],
      ['ticket.excerpt', 'excerpt'],
    ],
    status: { tone: 'neutral', label: 'Answered' },
    paragraphs: [
      'Our support team answered on your request {{ticket.reference}}.',
      '{{ticket.excerpt}}',
    ],
    action: { label: 'Read the answer', path: '/app/tickets' },
    details: [
      { label: 'Request', value: '{{ticket.reference}}' },
      { label: 'Subject', value: '{{ticket.subject}}' },
    ],
  },
  {
    id: 'ticket-status-changed',
    version: 1,
    category: 'support',
    heading: 'Your request {{ticket.reference}} changed state',
    subject: 'Your request {{ticket.reference}} changed state',
    preheader: 'The state of the request {{ticket.reference}} is now {{ticket.status}}.',
    facts: [
      ['ticket.reference', 'ticket'],
      ['ticket.subject', 'subject'],
      ['ticket.status', 'status'],
    ],
    status: { tone: 'neutral', label: '{{ticket.status}}' },
    paragraphs: [
      'The state of your request {{ticket.reference}} is now {{ticket.status}}.',
      'The subject of the request is {{ticket.subject}}.',
    ],
    action: { label: 'Open the request', path: '/app/tickets' },
    details: [
      { label: 'Request', value: '{{ticket.reference}}' },
      { label: 'Subject', value: '{{ticket.subject}}' },
      { label: 'State', value: '{{ticket.status}}' },
    ],
  },
  {
    id: 'ticket-resolved',
    version: 1,
    category: 'support',
    heading: 'Your request {{ticket.reference}} was answered',
    subject: 'Your request {{ticket.reference}} was answered',
    preheader: 'The request {{ticket.reference}} was answered.',
    facts: [
      ['ticket.reference', 'ticket'],
      ['ticket.subject', 'subject'],
    ],
    status: { tone: 'positive', label: 'Resolved' },
    paragraphs: [
      'Your request {{ticket.reference}} was answered.',
      'If the answer did not solve the problem, reply on the request and it comes back to us.',
    ],
    action: { label: 'Open the request', path: '/app/tickets' },
    details: [
      { label: 'Request', value: '{{ticket.reference}}' },
      { label: 'Subject', value: '{{ticket.subject}}' },
    ],
  },
  {
    id: 'ticket-reopened',
    version: 1,
    category: 'support',
    heading: 'Your request {{ticket.reference}} was opened again',
    subject: 'Your request {{ticket.reference}} was opened again',
    preheader: 'The request {{ticket.reference}} was opened again.',
    facts: [
      ['ticket.reference', 'ticket'],
      ['ticket.subject', 'subject'],
    ],
    status: { tone: 'neutral', label: 'Open' },
    paragraphs: [
      'Your request {{ticket.reference}} was opened again.',
      'We read it again and we answer as soon as we can.',
    ],
    details: [
      { label: 'Request', value: '{{ticket.reference}}' },
      { label: 'Subject', value: '{{ticket.subject}}' },
    ],
  },
  {
    id: 'ticket-closed',
    version: 1,
    category: 'support',
    heading: 'Your request {{ticket.reference}} was closed',
    subject: 'Your request {{ticket.reference}} was closed',
    preheader: 'The request {{ticket.reference}} was closed.',
    facts: [
      ['ticket.reference', 'ticket'],
      ['ticket.subject', 'subject'],
    ],
    status: { tone: 'neutral', label: 'Closed' },
    paragraphs: [
      'Your request {{ticket.reference}} was closed.',
      'You can open a new request at any time from the support page of your account.',
    ],
    details: [
      { label: 'Request', value: '{{ticket.reference}}' },
      { label: 'Subject', value: '{{ticket.subject}}' },
    ],
  },

  // ----------------------------------------------------------- domains, mail
  {
    id: 'mailbox-created',
    version: 1,
    category: 'domainsEmail',
    heading: 'The mailbox {{mailbox.address}} is ready',
    subject: 'The mailbox {{mailbox.address}} is ready',
    preheader: 'The mailbox {{mailbox.address}} of {{mailbox.domain}} is ready.',
    facts: [
      ['mailbox.address', 'mailbox'],
      ['mailbox.domain', 'domain'],
    ],
    status: { tone: 'positive', label: 'Ready' },
    paragraphs: [
      'The mailbox {{mailbox.address}} of {{mailbox.domain}} is ready.',
      'You can open it in the mail area of your account.',
    ],
    action: { label: 'Open the mail', path: '/app/mail' },
    details: [
      { label: 'Mailbox', value: '{{mailbox.address}}' },
      { label: 'Domain', value: '{{mailbox.domain}}' },
    ],
  },
  {
    id: 'mailbox-provisioning-failed',
    version: 1,
    category: 'domainsEmail',
    heading: 'The mailbox {{mailbox.address}} could not be created',
    subject: 'The mailbox {{mailbox.address}} could not be created',
    preheader: 'The mailbox {{mailbox.address}} of {{mailbox.domain}} failed.',
    facts: [
      ['mailbox.address', 'mailbox'],
      ['mailbox.domain', 'domain'],
      ['mailbox.reason', 'reason'],
    ],
    status: { tone: 'critical', label: 'Failed' },
    paragraphs: [
      'The mailbox {{mailbox.address}} of {{mailbox.domain}} could not be created.',
      'Reason: {{mailbox.reason}}',
      'The support can create it again for you.',
    ],
    action: { label: 'Open the mail', path: '/app/mail' },
    details: [
      { label: 'Mailbox', value: '{{mailbox.address}}' },
      { label: 'Domain', value: '{{mailbox.domain}}' },
      { label: 'Reason', value: '{{mailbox.reason}}' },
    ],
  },
  {
    id: 'mailbox-password-reset',
    version: 1,
    category: 'domainsEmail',
    heading: 'The password of {{mailbox.address}} was changed',
    subject: 'The password of {{mailbox.address}} was changed',
    preheader: 'The password of the mailbox {{mailbox.address}} was changed.',
    facts: [
      ['mailbox.address', 'mailbox'],
      ['mailbox.domain', 'domain'],
    ],
    status: { tone: 'neutral', label: 'Password changed' },
    paragraphs: [
      'The password of the mailbox {{mailbox.address}} of {{mailbox.domain}} was changed.',
    ],
    details: [
      { label: 'Mailbox', value: '{{mailbox.address}}' },
      { label: 'Domain', value: '{{mailbox.domain}}' },
    ],
    note: 'The old password does not work any more. Write to the support at once when you did not ask for this change.',
  },
  {
    id: 'domain-verification-instructions',
    version: 1,
    category: 'domainsEmail',
    heading: 'Prove that {{domain.name}} is yours',
    subject: 'Prove that {{domain.name}} is yours',
    preheader: 'Publish the verification record of {{domain.name}} and we will host it.',
    facts: [
      ['domain.name', 'domain'],
      ['domain.host', 'host'],
    ],
    status: { tone: 'neutral', label: 'Verification' },
    paragraphs: [
      'To host {{domain.name}} on Blipmade, we have to know that the domain is yours.',
      'Publish the verification record on the host {{domain.host}}.',
      'The exact record to publish is shown on the domains page of your account, where only you can read it.',
      'As soon as the record is visible, the domain is checked and the hosting starts.',
    ],
    action: { label: 'Open the domains', path: '/app/domains' },
    details: [
      { label: 'Domain', value: '{{domain.name}}' },
      { label: 'Host', value: '{{domain.host}}' },
    ],
  },
  {
    id: 'domain-verified',
    version: 1,
    category: 'domainsEmail',
    heading: '{{domain.name}} is yours',
    subject: '{{domain.name}} is yours',
    preheader: 'The domain {{domain.name}} was proved and it is yours.',
    facts: [['domain.name', 'domain']],
    status: { tone: 'positive', label: 'Verified' },
    paragraphs: [
      'The domain {{domain.name}} was proved and it is yours.',
      'The hosting of the domain starts now. You can add the mailboxes and the DNS records from the domains page of your account.',
    ],
    action: { label: 'Open the domains', path: '/app/domains' },
    details: [{ label: 'Domain', value: '{{domain.name}}' }],
  },
  {
    id: 'domain-dns-incomplete',
    version: 1,
    category: 'domainsEmail',
    heading: 'The DNS of {{domain.name}} is not complete',
    subject: 'The DNS of {{domain.name}} is not complete',
    preheader: 'The domain {{domain.name}} is missing some DNS records.',
    facts: [
      ['domain.name', 'domain'],
      ['domain.missing', 'missing'],
    ],
    status: { tone: 'caution', label: 'DNS incomplete' },
    paragraphs: [
      'The DNS of {{domain.name}} does not carry every record the hosting needs.',
      'The records that are missing: {{domain.missing}}.',
      'The mail of the domain does not arrive until they are published.',
    ],
    action: { label: 'Open the domains', path: '/app/domains' },
    details: [
      { label: 'Domain', value: '{{domain.name}}' },
      { label: 'Missing records', value: '{{domain.missing}}' },
    ],
  },
  {
    id: 'mailhosting-activated',
    version: 1,
    category: 'domainsEmail',
    heading: 'The hosted mail of {{mailhosting.domain}} started',
    subject: 'The hosted mail of {{mailhosting.domain}} started',
    preheader: 'The plan {{mailhosting.plan}} of the hosted mail is active for {{mailhosting.domain}}.',
    facts: [
      ['mailhosting.service', 'service'],
      ['mailhosting.plan', 'plan'],
      ['mailhosting.domain', 'domain'],
    ],
    status: { tone: 'positive', label: 'Active' },
    paragraphs: [
      'The hosted mail of {{mailhosting.domain}} is active on the plan {{mailhosting.plan}}.',
      'You can add the mailboxes and the DNS records from the mail area of your account.',
    ],
    action: { label: 'Open the mail', path: '/app/mail' },
    details: [
      { label: 'Service', value: '{{mailhosting.service}}' },
      { label: 'Plan', value: '{{mailhosting.plan}}' },
      { label: 'Domain', value: '{{mailhosting.domain}}' },
    ],
  },
  {
    id: 'mailhosting-canceled',
    version: 1,
    category: 'domainsEmail',
    heading: 'The hosted mail of {{mailhosting.service}} was canceled',
    subject: 'The hosted mail of {{mailhosting.service}} was canceled',
    preheader: 'The hosted mail was canceled. The data is kept until the end of the retention.',
    facts: [
      ['mailhosting.service', 'service'],
      ['mailhosting.retentionUntil', 'retentionUntil'],
    ],
    status: { tone: 'neutral', label: 'Canceled' },
    paragraphs: [
      'The hosted mail of {{mailhosting.service}} was canceled.',
      {
        when: 'mailhosting.retentionUntil',
        text: 'The mailboxes and the data of the domain are kept until {{mailhosting.retentionUntil}}.',
      },
      {
        unless: 'mailhosting.retentionUntil',
        text: 'The mailboxes and the data of the domain are kept until the end of the retention.',
      },
    ],
    action: { label: 'Open the mail', path: '/app/mail' },
    details: [
      { label: 'Service', value: '{{mailhosting.service}}' },
      { when: 'mailhosting.retentionUntil', label: 'Data kept until', value: '{{mailhosting.retentionUntil}}' },
    ],
  },
  {
    id: 'mailhosting-renewal-reminder',
    version: 1,
    category: 'domainsEmail',
    heading: 'The hosted mail of {{mailhosting.service}} renews soon',
    subject: 'The hosted mail of {{mailhosting.service}} renews soon',
    preheader: 'The hosted mail of {{mailhosting.service}} renews at the end of its term.',
    facts: [
      ['mailhosting.service', 'service'],
      ['mailhosting.renewsAt', 'renewsAt'],
    ],
    status: { tone: 'caution', label: 'Renews soon' },
    paragraphs: [
      'The hosted mail of {{mailhosting.service}} renews at the end of its term.',
      { when: 'mailhosting.renewsAt', text: 'It renews on {{mailhosting.renewsAt}}.' },
      { unless: 'mailhosting.renewsAt', text: 'The exact date is on the billing page of your account.' },
    ],
    action: { label: 'Open the billing', path: '/app/billing' },
    details: [
      { label: 'Service', value: '{{mailhosting.service}}' },
      { when: 'mailhosting.renewsAt', label: 'Renews on', value: '{{mailhosting.renewsAt}}' },
    ],
  },

  // --------------------------------------------------------------- operator
  {
    id: 'ops-provisioning-stuck',
    version: 1,
    category: 'operator',
    operator: true,
    heading: 'Provisioning stuck: {{ops.service}}',
    subject: 'Provisioning stuck: {{ops.service}}',
    preheader: 'The provisioning of {{ops.service}} has been running for {{ops.minutes}} minutes.',
    facts: [
      ['ops.service', 'service'],
      ['ops.minutes', 'minutes'],
    ],
    paragraphs: [
      'The provisioning of {{ops.service}} has been running for {{ops.minutes}} minutes.',
      'The service has no answer yet. Check the job of the provisioning and the state of the node that carries it.',
    ],
    details: [
      { label: 'Service', value: '{{ops.service}}' },
      { label: 'Minutes', value: '{{ops.minutes}}' },
    ],
  },
  {
    id: 'ops-webhook-failures',
    version: 1,
    category: 'operator',
    operator: true,
    heading: '{{ops.count}} webhook(s) of the payment provider failed',
    subject: '{{ops.count}} webhook(s) of the payment provider failed',
    preheader: 'The events of the payment provider that failed are waiting for an operator.',
    facts: [['ops.count', 'count']],
    paragraphs: [
      'The events of the payment provider that failed are waiting for an operator.',
      'Count: {{ops.count}}.',
      'Replay the events of the provider and check the answers of the endpoint of the webhooks.',
    ],
    details: [{ label: 'Count', value: '{{ops.count}}' }],
  },
  {
    id: 'ops-delivery-failures',
    version: 1,
    category: 'operator',
    operator: true,
    heading: '{{ops.count}} message(s) could not be delivered',
    subject: '{{ops.count}} message(s) could not be delivered',
    preheader: 'The messages that could not be delivered are waiting for an operator.',
    facts: [['ops.count', 'count']],
    paragraphs: [
      'The messages that could not be delivered are waiting for an operator.',
      'Count: {{ops.count}}.',
      'Check the queue of the mail and the log of the relay. A message that keeps failing is tried four times and then stays in the failed queue.',
    ],
    details: [{ label: 'Count', value: '{{ops.count}}' }],
  },
  {
    id: 'ops-backup-failed',
    version: 1,
    category: 'operator',
    operator: true,
    heading: 'The backup failed: {{ops.target}}',
    subject: 'The backup failed: {{ops.target}}',
    preheader: 'The backup of {{ops.target}} failed.',
    facts: [
      ['ops.target', 'target'],
      ['ops.reason', 'reason'],
    ],
    paragraphs: [
      'The backup of {{ops.target}} failed.',
      'Reason: {{ops.reason}}',
      'The last good copy is the one before this failure. Check the space on the target and run the backup again.',
    ],
    details: [
      { label: 'Target', value: '{{ops.target}}' },
      { label: 'Reason', value: '{{ops.reason}}' },
    ],
  },
  {
    id: 'ops-offsite-backup-missing',
    version: 1,
    category: 'operator',
    operator: true,
    heading: 'The copy of the backup is missing: {{ops.target}}',
    subject: 'The copy of the backup is missing: {{ops.target}}',
    preheader: 'There is no copy of the backup of {{ops.target}} outside the machine.',
    facts: [['ops.target', 'target']],
    paragraphs: [
      'There is no copy of the backup of {{ops.target}} outside the machine.',
      'A backup that is only on the machine is not a backup. Check the copy of the target and run it again.',
    ],
    details: [{ label: 'Target', value: '{{ops.target}}' }],
  },
  {
    id: 'ops-restore-verification-failed',
    version: 1,
    category: 'operator',
    operator: true,
    heading: 'The restoration could not be verified: {{ops.target}}',
    subject: 'The restoration could not be verified: {{ops.target}}',
    preheader: 'The restoration of {{ops.target}} did not give back what it should.',
    facts: [
      ['ops.target', 'target'],
      ['ops.reason', 'reason'],
    ],
    paragraphs: [
      'The restoration of {{ops.target}} did not give back what it should.',
      'Reason: {{ops.reason}}',
      'A backup that cannot be restored is not a backup. Check the job of the restore and run it again.',
    ],
    details: [
      { label: 'Target', value: '{{ops.target}}' },
      { label: 'Reason', value: '{{ops.reason}}' },
    ],
  },
  {
    id: 'ops-recovered',
    version: 1,
    category: 'operator',
    operator: true,
    heading: 'The problem is over',
    subject: 'The problem is over',
    preheader: 'A problem of the platform is over.',
    facts: [
      ['ops.check', 'check'],
      ['ops.title', 'title'],
    ],
    paragraphs: [
      'A problem of the platform is over.',
      '{{ops.title}}',
      '{{ops.detail}}',
    ],
    details: [
      { label: 'Check', value: '{{ops.check}}' },
      { label: 'Problem', value: '{{ops.title}}' },
    ],
  },
  {
    id: 'ops-mailcow-unhealthy',
    version: 1,
    category: 'operator',
    operator: true,
    heading: 'The mail system does not answer',
    subject: 'The mail system does not answer',
    preheader: 'The mail system of the platform does not answer.',
    facts: [['ops.reason', 'reason']],
    paragraphs: [
      'The mail system of the platform does not answer.',
      'Reason: {{ops.reason}}',
      'Check the containers of the mail, the space on the disk and the state of the relay.',
    ],
    details: [{ label: 'Reason', value: '{{ops.reason}}' }],
  },
  {
    id: 'ops-incident',
    version: 1,
    category: 'operator',
    operator: true,
    heading: 'An incident of the platform',
    subject: 'An incident of the platform',
    preheader: 'An incident is open on the platform.',
    facts: [['ops.message', 'message']],
    paragraphs: [
      'An incident is open on the platform.',
      '{{ops.message}}',
    ],
    details: [{ label: 'Message', value: '{{ops.message}}' }],
  },
  {
    id: 'ops-capacity-critical',
    version: 1,
    category: 'operator',
    operator: true,
    heading: 'The capacity of {{ops.resource}} is critical',
    subject: 'The capacity of {{ops.resource}} is critical',
    preheader: 'The value of {{ops.resource}} is {{ops.value}}.',
    facts: [
      ['ops.resource', 'resource'],
      ['ops.value', 'value'],
    ],
    paragraphs: [
      'The capacity of {{ops.resource}} is critical.',
      'The value of {{ops.resource}} is {{ops.value}}.',
      'Check the node that carries the resource, free space or move the load.',
    ],
    details: [
      { label: 'Resource', value: '{{ops.resource}}' },
      { label: 'Value', value: '{{ops.value}}' },
    ],
  },
  {
    id: 'ops-panel-unreachable',
    version: 1,
    category: 'operator',
    operator: true,
    heading: 'The platform cannot talk to {{ops.subject}}',
    subject: 'The platform cannot talk to {{ops.subject}}',
    preheader: 'The platform could not reach the control panel with its key.',
    facts: [
      ['ops.subject', 'subject'],
      ['ops.reason', 'reason'],
    ],
    paragraphs: [
      'The platform cannot talk to {{ops.subject}}.',
      'Reason: {{ops.reason}}',
      'The services of the customers cannot be built until the platform reaches the panel. Apply the key of the panel with scripts/apply-panel-key.sh.',
    ],
    details: [
      { label: 'Subject', value: '{{ops.subject}}' },
      { label: 'Reason', value: '{{ops.reason}}' },
    ],
  },
  {
    id: 'ops-dns-certificate-failure',
    version: 1,
    category: 'operator',
    operator: true,
    heading: 'The certificate of {{ops.subject}} failed',
    subject: 'The certificate of {{ops.subject}} failed',
    preheader: 'The certificate of {{ops.subject}} could not be obtained or renewed.',
    facts: [
      ['ops.subject', 'subject'],
      ['ops.reason', 'reason'],
    ],
    paragraphs: [
      'The certificate of {{ops.subject}} could not be obtained or renewed.',
      'Reason: {{ops.reason}}',
      'Check the DNS record of the validation and the time that is left on the certificate.',
    ],
    details: [
      { label: 'Subject', value: '{{ops.subject}}' },
      { label: 'Reason', value: '{{ops.reason}}' },
    ],
  },
  {
    id: 'ops-security-change',
    version: 1,
    category: 'operator',
    operator: true,
    heading: 'A change of security: {{ops.subject}}',
    subject: 'A change of security: {{ops.subject}}',
    preheader: 'A change of security was made on the platform.',
    facts: [
      ['ops.subject', 'subject'],
      ['ops.detail', 'detail'],
    ],
    paragraphs: [
      'A change of security was made on the platform.',
      'Subject: {{ops.subject}}',
      'Detail: {{ops.detail}}',
    ],
    details: [
      { label: 'Subject', value: '{{ops.subject}}' },
      { label: 'Detail', value: '{{ops.detail}}' },
    ],
  },
];

/** The templates of the catalogue, by their identifier. */
const BY_ID = new Map<string, TemplateDefinition>(CATALOGUE.map((entry) => [entry.id, entry]));

/** The values of the facts of a template, by their semantic path. */
type ValueMap = Record<string, string | undefined>;

/** The text that never comes from the customer is escaped before it is shown. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The value of a fact as it is shown.
 *
 * A fact that is not there has no value at all: it is not an empty text and
 * it is not the word "undefined". A list of facts is shown as a list.
 */
function normalise(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (Array.isArray(raw)) {
    const parts = raw.map(normalise).filter((part): part is string => part !== undefined);
    return parts.length > 0 ? parts.join(', ') : undefined;
  }
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : undefined;
  if (typeof raw === 'boolean') return raw ? 'yes' : 'no';
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * The value of a fact in the payload.
 *
 * The key of the payload is read as it is. A key that holds a path is also
 * read as a path, so the platform can put the link it builds either under
 * `action.url` or under `action: { url }`.
 */
function readFact(payload: Record<string, unknown>, key: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(payload, key)) {
    return normalise(payload[key]);
  }
  const parts = key.split('.');
  if (parts.length > 1) {
    let current: unknown = payload;
    for (const part of parts) {
      if (typeof current !== 'object' || current === null) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return normalise(current);
  }
  return undefined;
}

/** The facts of a template, read in the payload. */
function resolveValues(definition: TemplateDefinition, payload: Record<string, unknown>): ValueMap {
  const values: ValueMap = {};
  for (const [path, key] of definition.facts) {
    values[path] = readFact(payload, key);
  }
  return values;
}

/** The placeholder of a fact: `{{order.number}}`. */
const PLACEHOLDER = /\{\{([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\}\}/g;

/**
 * The copy of a template with its facts.
 *
 * A fact that is not there is shown as a dash. Every value is escaped when it
 * goes in the HTML, and it is shown as it is in the plain text.
 */
function interpolate(copy: string, values: ValueMap, escape: (value: string) => string): string {
  return copy.replace(PLACEHOLDER, (_match, path: string) => {
    const value = values[path];
    return escape(value === undefined ? DASH : value);
  });
}

/**
 * True when a paragraph or a row has to be shown.
 *
 * A row without a condition is always shown. A row with a condition is only
 * shown when its fact is there.
 */
function isShown(values: ValueMap, when?: string, unless?: string): boolean {
  if (when !== undefined && values[when] === undefined) return false;
  if (unless !== undefined && values[unless] !== undefined) return false;
  return true;
}

/** The paragraphs of a message, without the ones whose fact is not there. */
function visibleParagraphs(definition: TemplateDefinition, values: ValueMap): ParagraphSpec[] {
  return definition.paragraphs
    .map((paragraph) => (typeof paragraph === 'string' ? { text: paragraph } : paragraph))
    .filter((paragraph) => isShown(values, paragraph.when, paragraph.unless));
}

/** The rows of the table of the facts, without the ones whose fact is not there. */
function visibleDetails(definition: TemplateDefinition, values: ValueMap): DetailSpec[] {
  return (definition.details ?? []).filter((row) => isShown(values, row.when, row.unless));
}

/**
 * True when the address is an absolute URL of the public origin of the
 * platform.
 *
 * Anything else is refused: the address of another host, a relative address
 * and an address that is not a URL at all, e.g. `javascript:`.
 */
function isPublicUrl(value: string): boolean {
  let candidate: URL;
  let origin: URL;
  try {
    candidate = new URL(value);
    origin = new URL(publicOrigin());
  } catch {
    return false;
  }
  if (candidate.protocol !== 'https:' && candidate.protocol !== 'http:') return false;
  if (candidate.origin !== origin.origin) return false;
  const base = origin.pathname.endsWith('/') ? origin.pathname : `${origin.pathname}/`;
  return candidate.pathname === origin.pathname || candidate.pathname.startsWith(base);
}

/**
 * The call to action of a message.
 *
 * A link that the template builds itself is always on the public origin. A
 * link that the platform builds is used only when it is on the public origin
 * as well: anything else is dropped and the text of the button is shown
 * without a link.
 */
function resolveAction(
  definition: TemplateDefinition,
  values: ValueMap,
): { label: string; url: string | null } | null {
  const spec = definition.action;
  if (!spec) return null;

  const label = (spec.labelFact ? values[spec.labelFact] : undefined) ?? spec.label;

  if (spec.urlFact) {
    const candidate = values[spec.urlFact];
    // The platform did not build the link: there is nothing to show.
    if (candidate === undefined) return null;
    // The link is not on the public origin: it is dropped, and the text of
    // the button is shown without a link.
    if (!isPublicUrl(candidate)) return { label, url: null };
    return { label, url: candidate };
  }

  if (spec.path) return { label, url: publicLink(spec.path) };
  return null;
}

/** A line of the plain text, wrapped so that it stays readable. */
function wrap(text: string, width = 72): string {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.length <= width) {
      lines.push(paragraph);
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!current) {
        current = word;
        continue;
      }
      if (current.length + 1 + word.length <= width) {
        current = `${current} ${word}`;
        continue;
      }
      lines.push(current);
      current = word;
    }
    if (current) lines.push(current);
  }
  return lines.join('\n');
}

/** A subject and a preheader are one line, without the control characters. */
function oneLine(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** The header of the messages: the mark of the platform and its name. */
function renderHeader(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="30" height="30" align="center" valign="middle" bgcolor="${BRAND.accent}" style="width:30px;height:30px;border-radius:7px;font-family:${BRAND.font};font-size:17px;font-weight:800;line-height:30px;color:${BRAND.ink};">B</td>
              <td style="padding-left:10px;font-family:${BRAND.font};font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.accent};">Blipmade</td>
            </tr>
          </table>`;
}

/** The state of a thing: a marker and the name of the state, never the colour alone. */
function renderStatus(tone: Tone, label: string): string {
  const colour = STATE_COLOURS[tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
            <tr>
              <td width="8" height="8" bgcolor="${colour}" style="width:8px;height:8px;border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>
              <td style="padding-left:8px;font-family:${BRAND.font};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${colour};">${label}</td>
            </tr>
          </table>`;
}

/** The button of the message, and the address to copy when it does not work. */
function renderAction(label: string, url: string): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
            <tr>
              <td align="center" bgcolor="${BRAND.accent}" style="border-radius:10px;padding:13px 24px;font-family:${BRAND.font};font-size:15px;font-weight:700;line-height:1;text-align:center;">
                <a href="${safeUrl}" style="color:${BRAND.ink};text-decoration:none;display:inline-block;">${safeLabel}</a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 20px;font-family:${BRAND.font};font-size:13px;line-height:1.6;color:${BRAND.muted};">
            The button does not work? Copy this link into your browser:<br />
            <a href="${safeUrl}" style="color:${BRAND.accent};text-decoration:underline;word-break:break-all;">${safeUrl}</a>
          </p>`;
}

/**
 * The text of a button whose link was dropped.
 *
 * The customer still reads what the message asks of him, and the message
 * carries no address that does not belong to the platform.
 */
function renderActionText(label: string): string {
  return `<p style="margin:0 0 20px;font-family:${BRAND.font};font-size:15px;line-height:1.6;color:${BRAND.text};font-weight:700;">${escapeHtml(label)}</p>`;
}

/** The table of the facts of a message. */
function renderDetailsTable(rows: Array<{ label: string; value: string }>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;border-collapse:collapse;">
            ${rows
              .map(
                (row) => `<tr>
              <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};font-family:${BRAND.font};font-size:13px;line-height:1.4;color:${BRAND.muted};">${row.label}</td>
              <td align="right" style="padding:10px 0;border-bottom:1px solid ${BRAND.border};font-family:${BRAND.font};font-size:13px;line-height:1.4;color:${BRAND.text};font-weight:700;">${row.value}</td>
            </tr>`,
              )
              .join('\n            ')}
          </table>`;
}

/** The facts of a message of the operator: plain lines, without a table. */
function renderDetailsLines(rows: Array<{ label: string; value: string }>): string {
  return rows
    .map(
      (row) =>
        `<p style="margin:0 0 6px;font-family:${BRAND.font};font-size:14px;line-height:1.5;color:${BRAND.text};">${row.label}: ${row.value}</p>`,
    )
    .join('\n            ');
}

/** The foot of a message: the address of the support and the legal line. */
function renderFooter(operator: boolean): string {
  const origin = escapeHtml(publicOrigin());
  const support = escapeHtml(env.MAIL_SUPPORT_EMAIL);
  const reason = operator
    ? 'This message goes to the operator of the platform.'
    : 'You receive this message because you have an account on Blipmade.';
  const linkStyle = `color:${BRAND.muted};text-decoration:underline;`;
  return `${reason}<br />
              Support: ${support}<br />
              <a href="${origin}/terms" style="${linkStyle}">Terms of service</a> &middot; <a href="${origin}/privacy" style="${linkStyle}">Privacy policy</a> &middot; <a href="${origin}/aup" style="${linkStyle}">Acceptable use policy</a><br />
              <a href="${origin}" style="${linkStyle}">${origin}</a>`;
}

/** The message of a template in HTML. */
function renderHtml(definition: TemplateDefinition, values: ValueMap): string {
  const heading = interpolate(definition.heading, values, escapeHtml);
  const preheader = interpolate(definition.preheader, values, escapeHtml);

  const paragraphs = visibleParagraphs(definition, values)
    .map((paragraph) => interpolate(paragraph.text, values, escapeHtml))
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-family:${BRAND.font};font-size:15px;line-height:1.6;color:${BRAND.text};">${text}</p>`,
    )
    .join('\n            ');

  const status = definition.status
    ? renderStatus(definition.status.tone, interpolate(definition.status.label, values, escapeHtml))
    : '';

  const action = resolveAction(definition, values);
  const actionHtml = action
    ? action.url === null
      ? renderActionText(action.label)
      : renderAction(action.label, action.url)
    : '';

  const rows = visibleDetails(definition, values).map((row) => ({
    label: interpolate(row.label, values, escapeHtml),
    value: interpolate(row.value, values, escapeHtml),
  }));
  const detailsHtml =
    rows.length === 0 ? '' : definition.operator ? renderDetailsLines(rows) : renderDetailsTable(rows);

  const note = definition.note ? interpolate(definition.note, values, escapeHtml) : '';
  const noteHtml = note
    ? `<p style="margin:0 0 8px;font-family:${BRAND.font};font-size:12px;line-height:1.6;color:${BRAND.muted};">${note}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.ink};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid ${BRAND.border};">
                ${renderHeader()}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 20px;font-family:${BRAND.font};font-size:22px;font-weight:700;line-height:1.3;color:${BRAND.text};">${heading}</h1>
                ${status}
                ${paragraphs}
                ${actionHtml}
                ${detailsHtml}
                ${noteHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;border-top:1px solid ${BRAND.border};font-family:${BRAND.font};font-size:12px;line-height:1.7;color:${BRAND.muted};">
                ${renderFooter(definition.operator === true)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

/** The message of a template in plain text, written for a text reader. */
function renderText(definition: TemplateDefinition, values: ValueMap): string {
  const origin = publicOrigin();
  const blocks: string[] = [];

  blocks.push('Blipmade');
  blocks.push(interpolate(definition.heading, values, (value) => value));

  if (definition.status) {
    blocks.push(`Status: ${interpolate(definition.status.label, values, (value) => value)}`);
  }

  for (const paragraph of visibleParagraphs(definition, values)) {
    blocks.push(wrap(interpolate(paragraph.text, values, (value) => value)));
  }

  const action = resolveAction(definition, values);
  if (action) {
    blocks.push(action.url === null ? action.label : `${action.label}:\n${action.url}`);
  }

  const detailLines = visibleDetails(definition, values).map(
    (row) =>
      `${interpolate(row.label, values, (value) => value)}: ${interpolate(row.value, values, (value) => value)}`,
  );
  if (detailLines.length > 0) blocks.push(detailLines.join('\n'));

  if (definition.note) {
    blocks.push(wrap(interpolate(definition.note, values, (value) => value)));
  }

  blocks.push(
    [
      '—',
      `Blipmade · ${origin}`,
      `Support: ${env.MAIL_SUPPORT_EMAIL}`,
      `Terms of service: ${origin}/terms`,
      `Privacy policy: ${origin}/privacy`,
    ].join('\n'),
  );

  return `${blocks.join('\n\n')}\n`;
}

/**
 * Renders a template.
 *
 * The identifier is the one the registry of the events names. An identifier
 * that the catalogue does not know is refused in words, so a template that
 * nobody decided about cannot slip into the platform.
 */
export function renderEmailTemplate(id: string, payload: Record<string, unknown>): EmailTemplate {
  const definition = BY_ID.get(id);
  if (!definition) {
    throw new Error(`Unknown email template: ${id}`);
  }
  const values = resolveValues(definition, payload ?? {});

  const subject = oneLine(interpolate(definition.subject, values, (value) => value));
  const preheader = oneLine(interpolate(definition.preheader, values, (value) => value));

  return {
    id: definition.id,
    version: definition.version,
    subject: subject.length > 0 ? subject : 'Blipmade',
    preheader: preheader.length > 0 ? preheader : subject,
    text: renderText(definition, values),
    html: renderHtml(definition, values),
  };
}

/** Every template id of the catalogue. */
export function emailTemplateIds(): string[] {
  return CATALOGUE.map((definition) => definition.id);
}

/** The catalogue, for the back office. */
export function emailTemplateCatalog(): EmailTemplateDescriptor[] {
  return CATALOGUE.map((definition) => ({
    id: definition.id,
    version: definition.version,
    category: definition.category,
    subject: definition.subject,
    placeholders: definition.facts.map(([path]) => path),
  }));
}

/**
 * The placeholders of a template that the payload does not carry.
 *
 * An empty array means the payload is complete. The names are the semantic
 * paths of the catalogue, so the operator reads the same names the back
 * office shows.
 */
export function validateEmailTemplatePayload(id: string, payload: Record<string, unknown>): string[] {
  const definition = BY_ID.get(id);
  if (!definition) {
    throw new Error(`Unknown email template: ${id}`);
  }
  const values = resolveValues(definition, payload ?? {});
  return definition.facts.filter(([path]) => values[path] === undefined).map(([path]) => path);
}
