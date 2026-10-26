import { afterEach, describe, expect, it } from 'vitest';
import type { EventPayloadMap, NotificationEventType } from '../src/services/notification-events.js';

/**
 * The environment is read when the module is loaded, so the values the
 * modules need are set before anything is imported.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://blipmade:blipmade@127.0.0.1:5432/blipmade_test';
process.env.SESSION_SECRET ??= 'email-design-test-session-secret';

const { env } = await import('../src/env.js');
const { BRAND, publicLink } = await import('../src/lib/email-templates.js');
const { EVENT_DEFINITIONS } = await import('../src/services/notification-events.js');
const {
  emailTemplateCatalog,
  emailTemplateIds,
  renderEmailTemplate,
  validateEmailTemplatePayload,
} = await import('../src/lib/email-design.js');

/** The token the events that hold a secret carry in the tests. */
const TOKEN = 'the-secret-token-of-the-tests';

/** The links of a message. */
function linksOf(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!);
}

/** The addresses a text message shows. */
function addressesOf(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>")]+/g)].map((match) => match[0]!);
}

/**
 * An example of every event of the platform.
 *
 * The examples are written with the type of the registry, so the compiler
 * refuses an example that carries a fact the event does not have, and a
 * fact that the event has and the example does not.
 */
const EVENT_EXAMPLES = {
  'account.registered': { name: 'Ada Lovelace' },
  'account.verification_requested': { name: 'Ada Lovelace', token: TOKEN },
  'account.email_verified': { name: 'Ada Lovelace' },
  'account.password_reset_requested': { name: 'Ada Lovelace', token: TOKEN },
  'account.password_changed': { name: 'Ada Lovelace' },
  'account.suspended': { name: 'Ada Lovelace', reason: 'The invoice was not paid.' },
  'account.reinstated': { name: 'Ada Lovelace' },
  'account.email_change_requested': {
    name: 'Ada Lovelace',
    token: TOKEN,
    email: 'ada@example.com',
  },
  'account.email_changed': { name: 'Ada Lovelace', email: 'ada@example.com' },
  'account.deletion_requested': { name: 'Ada Lovelace' },

  'order.created': { number: 'BM-ORD-00001', total: 'EUR 12.00', currency: 'EUR' },
  'order.payment_required': { number: 'BM-ORD-00001', total: 'EUR 12.00', currency: 'EUR' },
  'order.canceled': { number: 'BM-ORD-00001' },
  'payment.succeeded': { number: 'BM-ORD-00001', amount: 'EUR 12.00', currency: 'EUR' },
  'payment.failed': {
    number: 'BM-ORD-00001',
    amount: 'EUR 12.00',
    currency: 'EUR',
    reason: 'The card was refused.',
  },
  'payment.canceled': { number: 'BM-ORD-00001' },
  'payment.refunded': { number: 'BM-ORD-00001', amount: 'EUR 12.00', currency: 'EUR' },

  'invoice.issued': {
    number: 'BM-INV-00001',
    amount: 'EUR 12.00',
    currency: 'EUR',
    dueAt: '2026-11-01',
  },
  'invoice.paid': {
    number: 'BM-INV-00001',
    amount: 'EUR 12.00',
    currency: 'EUR',
    periodEnd: '2026-11-01',
  },
  'invoice.payment_failed': {
    number: 'BM-INV-00001',
    amount: 'EUR 12.00',
    currency: 'EUR',
    reason: 'The card was refused.',
  },
  'invoice.overdue': {
    number: 'BM-INV-00001',
    amount: 'EUR 12.00',
    currency: 'EUR',
    daysOverdue: 5,
  },
  'invoice.reminder_due': {
    number: 'BM-INV-00001',
    amount: 'EUR 12.00',
    currency: 'EUR',
    dueAt: '2026-11-01',
  },

  'subscription.activated': { service: 'blog', plan: 'Business' },
  'subscription.renewed': {
    service: 'blog',
    amount: 'EUR 12.00',
    currency: 'EUR',
    periodEnd: '2026-11-01',
  },
  'subscription.changed': { service: 'blog', change: 'The plan changed to Business.' },
  'subscription.cancellation_scheduled': { service: 'blog', periodEnd: '2026-11-01' },
  'subscription.canceled': { service: 'blog' },
  'subscription.reactivated': { service: 'blog' },
  'subscription.grace_period': { service: 'blog', graceUntil: '2026-11-01' },
  'subscription.suspension_warning': { service: 'blog', graceUntil: '2026-11-01' },

  'service.provisioning_started': { service: 'blog', plan: 'Business' },
  'service.provisioning_failed': { service: 'blog', reason: 'The node had no space.' },
  'service.activated': { service: 'blog', address: 'blog.example.com' },
  'service.suspended': { service: 'blog', reason: 'The invoice was not paid.' },
  'service.unsuspended': { service: 'blog' },
  'service.expiring': { service: 'blog', expiresAt: '2026-11-01' },
  'service.renewal_reminder': { service: 'blog', renewsAt: '2026-11-01' },
  'service.expired': { service: 'blog' },
  'service.canceled': { service: 'blog' },
  'service.deleted': { service: 'blog' },
  'service.upgrade_completed': { service: 'blog', change: 'The plan changed to Business.' },
  'service.upgrade_failed': { service: 'blog', reason: 'The node had no space.' },
  'service.incident': { service: 'blog', message: 'The node was replaced.' },
  'service.restored': { service: 'blog', message: 'The node is back.' },

  'ticket.created': { ticket: 'BM-TIC-00001', subject: 'The server does not start' },
  'ticket.opened_for_staff': {
    ticket: 'BM-TIC-00001',
    subject: 'The server does not start',
    customer: 'Ada Lovelace',
  },
  'ticket.customer_replied': {
    ticket: 'BM-TIC-00001',
    subject: 'The server does not start',
    excerpt: 'I tried again and it still fails.',
  },
  'ticket.assigned': { ticket: 'BM-TIC-00001', subject: 'The server does not start' },
  'ticket.reply_created': {
    ticket: 'BM-TIC-00001',
    subject: 'The server does not start',
    excerpt: 'We are looking at it.',
  },
  'ticket.status_changed': {
    ticket: 'BM-TIC-00001',
    subject: 'The server does not start',
    status: 'In progress',
  },
  'ticket.resolved': { ticket: 'BM-TIC-00001', subject: 'The server does not start' },
  'ticket.reopened': { ticket: 'BM-TIC-00001', subject: 'The server does not start' },
  'ticket.closed': { ticket: 'BM-TIC-00001', subject: 'The server does not start' },

  'mailbox.created': { mailbox: 'ada@example.com', domain: 'example.com' },
  'mailbox.provisioning_failed': {
    mailbox: 'ada@example.com',
    domain: 'example.com',
    reason: 'The domain has no MX record.',
  },
  'mailbox.password_reset': { mailbox: 'ada@example.com', domain: 'example.com' },
  'domain.verification_instructions': {
    domain: 'example.com',
    host: '_blipmade.example.com',
    token: TOKEN,
  },
  'domain.verified': { domain: 'example.com' },
  'domain.dns_incomplete': { domain: 'example.com', missing: ['MX', 'TXT'] },
  'mailhosting.activated': { service: 'mail-example-com', plan: 'Business', domain: 'example.com' },
  'mailhosting.canceled': { service: 'mail-example-com', retentionUntil: '2026-12-01' },
  'mailhosting.renewal_reminder': { service: 'mail-example-com', renewsAt: '2026-11-01' },

  'ops.provisioning_stuck': { service: 'blog', minutes: 45 },
  'ops.webhook_failures': { count: 3 },
  'ops.delivery_failures': { count: 5 },
  'ops.backup_failed': { target: 'blog', reason: 'The disk was full.' },
  'ops.offsite_backup_missing': { target: 'blog' },
  'ops.restore_verification_failed': { target: 'blog', reason: 'The file was missing.' },
  'ops.mailcow_unhealthy': { reason: 'The container did not answer.' },
  'ops.incident': { message: 'The cluster lost a node.' },
  'ops.capacity_critical': { resource: 'disk', value: '92%' },
  'ops.dns_certificate_failure': { subject: 'example.com', reason: 'The DNS did not answer.' },
  'ops.security_change': { subject: 'The firewall', detail: 'The rule 42 was removed.' },
} satisfies { [Type in NotificationEventType]: EventPayloadMap[Type] };

/**
 * The links that the platform builds for the events that hold a secret.
 *
 * The token never reaches the template: the platform builds the address out
 * of it and gives only the address to the template.
 */
const PLATFORM_LINKS: Partial<
  Record<NotificationEventType, { url: string; label: string }>
> = {
  'account.verification_requested': {
    url: `${publicLink('/verify-email')}?token=${TOKEN}`,
    label: 'Confirm my email address',
  },
  'account.password_reset_requested': {
    url: `${publicLink('/reset-password')}?token=${TOKEN}`,
    label: 'Choose a new password',
  },
  'account.email_change_requested': {
    url: `${publicLink('/app/settings')}?emailChange=${TOKEN}`,
    label: 'Confirm the new address',
  },
};

/** The payload of every template, built from the facts of its event. */
const payloads: Record<string, Record<string, unknown>> = {};
for (const [type, definition] of Object.entries(EVENT_DEFINITIONS)) {
  const facts = EVENT_EXAMPLES[type as NotificationEventType] as Record<string, unknown>;
  const payload: Record<string, unknown> = { ...facts };
  const link = PLATFORM_LINKS[type as NotificationEventType];
  if (link) {
    payload['action.url'] = link.url;
    payload['action.label'] = link.label;
  }
  payloads[definition.template] = payload;
}

/** A payload that tries to break every template of the catalogue. */
function hostilePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const hostile: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'action.url') {
      hostile[key] = 'javascript:alert(1)" onerror="alert(1)';
      continue;
    }
    hostile[key] = Array.isArray(value)
      ? ['<script>alert(1)</script>']
      : '<script>alert(1)</script>';
  }
  return hostile;
}

/** The identifiers the catalogue has to hold. */
const REQUIRED_IDS = [
  'account-welcome',
  'account-verify-email',
  'account-email-verified',
  'account-password-reset',
  'account-password-changed',
  'account-suspended',
  'account-reinstated',
  'account-email-change-requested',
  'account-email-changed',
  'account-deletion-requested',
  'order-created',
  'order-payment-required',
  'order-canceled',
  'payment-succeeded',
  'payment-failed',
  'payment-canceled',
  'payment-refunded',
  'invoice-issued',
  'invoice-paid',
  'invoice-payment-failed',
  'invoice-overdue',
  'invoice-reminder-due',
  'subscription-activated',
  'subscription-renewed',
  'subscription-changed',
  'subscription-cancellation-scheduled',
  'subscription-canceled',
  'subscription-reactivated',
  'subscription-grace-period',
  'subscription-suspension-warning',
  'service-provisioning-started',
  'service-provisioning-failed',
  'service-activated',
  'service-suspended',
  'service-unsuspended',
  'service-expiring',
  'service-renewal-reminder',
  'service-expired',
  'service-canceled',
  'service-deleted',
  'service-upgrade-completed',
  'service-upgrade-failed',
  'service-incident',
  'service-restored',
  'ticket-created',
  'ticket-opened-for-staff',
  'ticket-assigned',
  'ticket-customer-replied',
  'ticket-reply-created',
  'ticket-status-changed',
  'ticket-resolved',
  'ticket-reopened',
  'ticket-closed',
  'mailbox-created',
  'mailbox-provisioning-failed',
  'mailbox-password-reset',
  'domain-verification-instructions',
  'domain-verified',
  'domain-dns-incomplete',
  'mailhosting-activated',
  'mailhosting-canceled',
  'mailhosting-renewal-reminder',
  'ops-provisioning-stuck',
  'ops-webhook-failures',
  'ops-delivery-failures',
  'ops-backup-failed',
  'ops-offsite-backup-missing',
  'ops-restore-verification-failed',
  'ops-mailcow-unhealthy',
  'ops-incident',
  'ops-capacity-critical',
  'ops-dns-certificate-failure',
  'ops-security-change',
];

const originalOrigin = env.publicWebUrl;

afterEach(() => {
  (env as unknown as { publicWebUrl: string }).publicWebUrl = originalOrigin;
});

describe('the catalogue of the templates', () => {
  it('holds exactly the templates the events of the platform expect', () => {
    expect(REQUIRED_IDS).toHaveLength(73);
    expect([...emailTemplateIds()].sort()).toEqual([...REQUIRED_IDS].sort());
    expect(emailTemplateCatalog().map((entry) => entry.id).sort()).toEqual([...REQUIRED_IDS].sort());
    expect(emailTemplateCatalog()).toHaveLength(73);
  });

  it('holds the same templates as the registry of the events', () => {
    const expected = Object.values(EVENT_DEFINITIONS).map((definition) => definition.template);
    expect(expected).toHaveLength(73);
    expect([...emailTemplateIds()].sort()).toEqual([...expected].sort());
  });

  it('tells the back office the subject and the placeholders of every template', () => {
    const categories = new Set([
      'accountSecurity',
      'ordersBilling',
      'hostingServices',
      'support',
      'domainsEmail',
      'incidents',
      'operator',
    ]);
    for (const entry of emailTemplateCatalog()) {
      expect(entry.version, entry.id).toBeGreaterThan(0);
      expect(categories.has(entry.category), entry.id).toBe(true);
      expect(entry.subject.length, entry.id).toBeGreaterThan(0);
      expect(entry.placeholders.length, entry.id).toBeGreaterThan(0);
      for (const placeholder of entry.placeholders) {
        expect(placeholder, entry.id).toMatch(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/);
      }
      // The subject keeps its placeholders as they are, and every one of them
      // is a placeholder the template declares.
      const inSubject = [...entry.subject.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]!);
      for (const placeholder of inSubject) {
        expect(entry.placeholders, entry.id).toContain(placeholder);
      }
    }
  });

  it('refuses an identifier that nobody decided about', () => {
    expect(() => renderEmailTemplate('not-a-template', {})).toThrow(/Unknown email template/);
    expect(() => validateEmailTemplatePayload('not-a-template', {})).toThrow(/Unknown email template/);
  });
});

describe('the rendering of the templates', () => {
  it('renders every template of the catalogue', () => {
    for (const id of emailTemplateIds()) {
      const template = renderEmailTemplate(id, payloads[id]!);
      expect(template.id, id).toBe(id);
      expect(template.version, id).toBeGreaterThan(0);
      expect(template.subject.length, id).toBeGreaterThan(0);
      expect(template.preheader.length, id).toBeGreaterThan(0);
      expect(template.text.length, id).toBeGreaterThan(0);
      expect(template.html.length, id).toBeGreaterThan(0);
      expect(template.html, id).toContain('<!doctype html>');
      expect(template.html, id).toContain('</html>');
      expect(template.text, id).toContain('Blipmade');
    }
  });

  it('writes a subject and a preheader without a leftover placeholder', () => {
    for (const id of emailTemplateIds()) {
      const template = renderEmailTemplate(id, payloads[id]!);
      expect(template.subject.length, id).toBeGreaterThan(0);
      expect(template.subject, id).not.toContain('{{');
      expect(template.preheader.length, id).toBeGreaterThan(0);
      expect(template.preheader, id).not.toContain('{{');
      expect(template.html, id).not.toContain('{{');
      expect(template.text, id).not.toContain('{{');
    }
  });

  it('renders a template even when the payload carries nothing', () => {
    for (const id of emailTemplateIds()) {
      expect(() => renderEmailTemplate(id, {}), id).not.toThrow();
      const template = renderEmailTemplate(id, {});
      expect(template.subject.length, id).toBeGreaterThan(0);
      expect(template.text.length, id).toBeGreaterThan(0);
      expect(template.html, id).not.toContain('undefined');
      expect(template.text, id).not.toContain('undefined');
    }
  });

  it('reads only the facts that the events carry', () => {
    for (const id of emailTemplateIds()) {
      expect(validateEmailTemplatePayload(id, payloads[id]!), id).toEqual([]);
    }
  });

  it('uses the colours and the font of the brand', () => {
    for (const id of emailTemplateIds()) {
      const template = renderEmailTemplate(id, payloads[id]!);
      expect(template.html, id).toContain(BRAND.ink);
      expect(template.html, id).toContain(BRAND.accent);
      expect(template.html, id).toContain(BRAND.surface);
      expect(template.html, id).toContain(BRAND.font);
      expect(template.html, id).not.toContain('@font-face');
      expect(template.html, id).not.toContain('fonts.googleapis.com');
      // The layout is a table, so every mail client reads it.
      expect(template.html, id).toContain('role="presentation"');
      expect(template.html, id).toContain('cellpadding="0"');
      expect(template.html, id).toContain('max-width:600px');
    }
  });

  it('never sends a link away from the public origin', () => {
    for (const id of emailTemplateIds()) {
      const template = renderEmailTemplate(id, payloads[id]!);
      for (const link of linksOf(template.html)) {
        expect(link.startsWith(env.publicWebUrl), `${id} -> ${link}`).toBe(true);
        expect(link, `${id} -> ${link}`).not.toContain('127.0.0.1');
        expect(link, `${id} -> ${link}`).not.toContain('localhost');
      }
      for (const address of addressesOf(template.text)) {
        expect(address.startsWith(env.publicWebUrl), `${id} -> ${address}`).toBe(true);
      }
    }
  });

  it('builds the links from the configured origin', () => {
    (env as unknown as { publicWebUrl: string }).publicWebUrl = 'https://example.test';
    const template = renderEmailTemplate('payment-succeeded', payloads['payment-succeeded']!);
    expect(template.html).toContain('href="https://example.test/app/billing"');
    expect(template.text).toContain('https://example.test/app/billing');
  });

  it('writes a text that a text reader can read', () => {
    for (const id of emailTemplateIds()) {
      const template = renderEmailTemplate(id, payloads[id]!);
      expect(template.text, id).not.toContain('<');
      for (const line of template.text.split('\n')) {
        if (/https?:\/\//.test(line)) continue;
        expect(line.length, `${id} -> ${line}`).toBeLessThanOrEqual(80);
      }
    }
  });
});

describe('the safety of the templates', () => {
  it('escapes what comes from the outside', () => {
    const template = renderEmailTemplate('payment-succeeded', {
      number: 'BM-ORD-00001',
      amount: '<script>alert(1)</script>',
      currency: 'EUR',
    });
    expect(template.html).not.toContain('<script>');
    expect(template.html).toContain('&lt;script&gt;');
    // The plain text shows the value as it is: it is text, never markup.
    expect(template.text).toContain('<script>alert(1)</script>');
  });

  it('never writes markup, a handler or a dangerous address in the HTML', () => {
    for (const id of emailTemplateIds()) {
      const template = renderEmailTemplate(id, hostilePayload(payloads[id]!));
      expect(template.html, id).not.toContain('<script');
      expect(template.html, id).not.toContain('onerror=');
      expect(template.html, id).not.toContain('javascript:');
      expect(template.html, id).not.toContain('undefined');
    }
  });

  it('never turns a link of another origin into a link', () => {
    const template = renderEmailTemplate('account-verify-email', {
      name: 'Ada Lovelace',
      'action.url': 'https://evil.example.com/verify-email?token=abc',
      'action.label': 'Confirm my email address',
    });
    expect(template.html).not.toContain('evil.example.com');
    expect(template.text).not.toContain('evil.example.com');
    // The text of the button is shown, but without a link.
    expect(template.html).toContain('Confirm my email address');
    for (const link of linksOf(template.html)) {
      expect(link.startsWith(env.publicWebUrl), link).toBe(true);
    }
  });

  it('never turns a dangerous address into a link', () => {
    const template = renderEmailTemplate('account-verify-email', {
      name: 'Ada Lovelace',
      'action.url': 'javascript:alert(1)',
      'action.label': 'Confirm my email address',
    });
    expect(template.html).not.toContain('javascript:');
    expect(template.text).not.toContain('javascript:');
    expect(template.html).not.toContain('href="javascript');
  });

  it('never writes a token, a password or a recovery code', () => {
    for (const id of emailTemplateIds()) {
      const template = renderEmailTemplate(id, payloads[id]!);
      // A token is only ever in the link the platform built, and nowhere
      // else: not in the copy, not in a table, not in a subject.
      const html = template.html.replace(/href="[^"]*"/g, '').replace(/https?:\/\/\S+/g, '');
      expect(html, id).not.toContain(TOKEN);
      const text = template.text.replace(/https?:\/\/\S+/g, '');
      expect(text, id).not.toContain(TOKEN);
    }
    // The token of a verification is only in the link the platform built.
    const verification = renderEmailTemplate('account-verify-email', payloads['account-verify-email']!);
    const withoutLinks = verification.html
      .replace(/href="[^"]*"/g, '')
      .replace(/https?:\/\/\S+/g, '');
    expect(withoutLinks).not.toContain(TOKEN);
    expect(verification.html).toContain(`token=${TOKEN}`);
  });

  it('never writes the verification record of a domain', () => {
    const template = renderEmailTemplate(
      'domain-verification-instructions',
      payloads['domain-verification-instructions']!,
    );
    expect(template.html).not.toContain(TOKEN);
    expect(template.text).not.toContain(TOKEN);
    expect(template.text).toContain('_blipmade.example.com');
  });

  it('shows a dash for a fact that is not there and names it', () => {
    const missing = validateEmailTemplatePayload('payment-succeeded', { number: 'BM-ORD-00001' });
    expect(missing).toContain('amount.formatted');
    expect(missing).toContain('payment.currency');
    expect(missing).not.toContain('payment.number');

    const template = renderEmailTemplate('payment-succeeded', { number: 'BM-ORD-00001' });
    expect(template.html).toContain('—');
    expect(template.text).toContain('—');
    expect(template.html).not.toContain('undefined');
    expect(template.text).not.toContain('undefined');
  });
});

describe('the tone of the templates', () => {
  it('writes a note under the facts of a message', () => {
    const template = renderEmailTemplate('account-password-changed', payloads['account-password-changed']!);
    expect(template.html).toContain('If you did not make this change');
    expect(template.text).toContain('If you did not make this change');
  });

  it('never sells anything in the messages of the account and of the money', () => {
    const forbidden = ['offer', 'discount', 'upgrade your plan'];
    for (const entry of emailTemplateCatalog()) {
      if (entry.category !== 'accountSecurity' && entry.category !== 'ordersBilling') continue;
      const template = renderEmailTemplate(entry.id, payloads[entry.id]!);
      const copy = `${template.subject}\n${template.preheader}\n${template.text}\n${template.html}`.toLowerCase();
      for (const word of forbidden) {
        expect(copy, `${entry.id} -> ${word}`).not.toContain(word);
      }
    }
  });

  it('keeps the messages of the account sober', () => {
    for (const entry of emailTemplateCatalog()) {
      if (entry.category !== 'accountSecurity') continue;
      const template = renderEmailTemplate(entry.id, payloads[entry.id]!);
      // No state marker: a message about the account does not sell a state.
      expect(template.html, entry.id).not.toContain('text-transform:uppercase');
    }
  });

  it('shows the state of a service', () => {
    for (const entry of emailTemplateCatalog()) {
      if (entry.category !== 'hostingServices' && entry.category !== 'incidents') continue;
      const template = renderEmailTemplate(entry.id, payloads[entry.id]!);
      expect(template.html, entry.id).toContain('text-transform:uppercase');
    }
  });

  it('shows the money and the period of the messages of the billing', () => {
    const template = renderEmailTemplate('invoice-paid', payloads['invoice-paid']!);
    expect(template.html).toContain('Amount');
    expect(template.html).toContain('EUR 12.00');
    expect(template.html).toContain('Paid period');
    expect(template.html).toContain('2026-11-01');
    expect(template.text).toContain('Amount: EUR 12.00');
    expect(template.text).toContain('Paid period: 2026-11-01');
  });

  it('writes the messages of the operator as one screen of text', () => {
    for (const entry of emailTemplateCatalog()) {
      if (entry.category !== 'operator') continue;
      const template = renderEmailTemplate(entry.id, payloads[entry.id]!);
      expect(template.html, entry.id).not.toContain('Copy this link into your browser');
      expect(template.html, entry.id).not.toContain('text-transform:uppercase');
      expect(template.text, entry.id).toContain('Blipmade');
    }
  });
});
