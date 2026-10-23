import { afterEach, describe, expect, it } from 'vitest';

/**
 * The environment is read when the module is loaded, so the values the
 * modules need are set before anything is imported.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://blipmade:blipmade@127.0.0.1:5432/blipmade_test';
process.env.SESSION_SECRET ??= 'email-templates-test-session-secret';

const { env } = await import('../src/env.js');
const {
  BRAND,
  emailChangeLink,
  emailChangeTemplate,
  formatAmount,
  instanceProvisionedTemplate,
  instanceStoppedTemplate,
  invoiceFailedTemplate,
  invoicePaidTemplate,
  passwordResetTemplate,
  publicLink,
  publicOrigin,
  resetLink,
  subscriptionChangedTemplate,
  supportTicketTemplate,
  ticketCreatedTemplate,
  ticketReplyTemplate,
  verificationLink,
  verificationTemplate,
} = await import('../src/lib/email-templates.js');

/** The links of a message. */
function linksOf(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!);
}

/** The addresses a text message shows. */
function addressesOf(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>")]+/g)].map((match) => match[0]!);
}

const templates = {
  verification: verificationTemplate('Ada Lovelace', 'a-token-for-the-tests'),
  reset: passwordResetTemplate('Ada Lovelace', 'a-token-for-the-tests'),
  emailChange: emailChangeTemplate('Ada Lovelace', 'a-token-for-the-tests'),
  ticketCreated: ticketCreatedTemplate({
    reference: 'BM-TIC-00001',
    subject: 'The server does not start',
    message: 'It stops after a minute.',
  }),
  ticketReply: ticketReplyTemplate({
    reference: 'BM-TIC-00001',
    subject: 'The server does not start',
    message: 'We are looking at it.',
  }),
  support: supportTicketTemplate({
    reference: 'BM-TIC-00001',
    subject: 'The server does not start',
    message: 'It stops after a minute.',
    customerName: 'Ada Lovelace',
    customerEmail: 'ada@example.com',
  }),
  invoicePaid: invoicePaidTemplate({ number: 'BM-INV-00001', amount: '€12.00', periodEnd: '2026-11-01' }),
  invoiceFailed: invoiceFailedTemplate({
    number: 'BM-INV-00001',
    amount: '€12.00',
    periodEnd: '2026-11-01',
    reason: 'The card was refused.',
  }),
  subscription: subscriptionChangedTemplate({
    instanceName: 'blog',
    status: 'cancelled at the end of the paid period',
    periodEnd: '2026-11-01',
    cancelAtPeriodEnd: true,
  }),
  provisioned: instanceProvisionedTemplate({ instanceName: 'blog', address: 'blog.example.com' }),
  stopped: instanceStoppedTemplate({ instanceName: 'blog', reason: 'The invoice was not paid.' }),
};

const originalOrigin = env.publicWebUrl;
const originalAppUrl = env.APP_PUBLIC_URL;

afterEach(() => {
  (env as unknown as { publicWebUrl: string }).publicWebUrl = originalOrigin;
  (env as unknown as { APP_PUBLIC_URL: string }).APP_PUBLIC_URL = originalAppUrl;
});

describe('the templates of the platform', () => {
  it('renders every message in HTML and in plain text', () => {
    for (const [name, template] of Object.entries(templates)) {
      expect(template.subject.length, name).toBeGreaterThan(0);
      expect(template.html, name).toContain('<!doctype html>');
      expect(template.text, name).toContain('Blipmade');
      expect(template.text, name).not.toContain('<');
      expect(template.text.length, name).toBeGreaterThan(40);
    }
  });

  it('uses the colours and the font of the brand', () => {
    for (const [name, template] of Object.entries(templates)) {
      expect(template.html, name).toContain(BRAND.ink);
      expect(template.html, name).toContain(BRAND.accent);
      expect(template.html, name).toContain(BRAND.surface);
      expect(template.html, name).toContain(BRAND.font);
      // The web font of the site is not used: a mail client does not have it.
      expect(template.html, name).not.toContain('@font-face');
      expect(template.html, name).not.toContain('fonts.googleapis.com');
    }
  });

  it('never sends a link away from the public origin', () => {
    for (const [name, template] of Object.entries(templates)) {
      for (const link of linksOf(template.html)) {
        expect(link.startsWith(env.publicWebUrl), `${name} -> ${link}`).toBe(true);
        expect(link.startsWith('http://localhost'), `${name} -> ${link}`).toBe(false);
        expect(link.startsWith('http://127.0.0.1'), `${name} -> ${link}`).toBe(false);
      }
      for (const address of addressesOf(template.text)) {
        expect(address.startsWith(env.publicWebUrl), `${name} -> ${address}`).toBe(true);
      }
    }
  });

  it('builds the links from the public origin and not from a fixed address', () => {
    (env as unknown as { publicWebUrl: string }).publicWebUrl = 'https://example.test';
    expect(publicOrigin()).toBe('https://example.test');
    expect(publicLink('/app/tickets')).toBe('https://example.test/app/tickets');
    expect(publicLink('app/tickets')).toBe('https://example.test/app/tickets');
    expect(verificationLink('a-token')).toBe('https://example.test/verify-email?token=a-token');
    expect(resetLink('a-token')).toBe('https://example.test/reset-password?token=a-token');

    const template = verificationTemplate('Ada', 'a-token');
    expect(template.html).toContain('https://example.test/verify-email?token=a-token');
    expect(template.text).toContain('https://example.test/verify-email?token=a-token');
  });

  it('shows the link of a verification and of a reset in both forms', () => {
    const verification = templates.verification;
    expect(verification.html).toContain(`href="${verificationLink('a-token-for-the-tests')}"`);
    expect(verification.text).toContain(verificationLink('a-token-for-the-tests'));
    expect(verification.subject).toContain('Confirm');

    const reset = templates.reset;
    expect(reset.html).toContain(`href="${resetLink('a-token-for-the-tests')}"`);
    expect(reset.text).toContain(resetLink('a-token-for-the-tests'));
    expect(reset.subject).toContain('password');
  });

  it('keeps the link of a change of the address inside the link only', () => {
    const token = 'a-token-for-an-address-change';
    const template = emailChangeTemplate('Ada', token);
    const link = emailChangeLink(token);

    expect(link.startsWith(env.publicWebUrl)).toBe(true);
    expect(link).toBe(`${env.publicWebUrl}/app/settings?emailChange=${encodeURIComponent(token)}`);
    expect(template.html).toContain(link);
    expect(template.text).toContain(link);
    expect(template.subject).toContain('Confirm');

    // The token is nowhere but in the link.
    const htmlWithoutLinks = template.html.replace(/href="[^"]*"/g, '').replace(/https?:\/\/\S+/g, '');
    expect(htmlWithoutLinks).not.toContain(token);
    const textWithoutLinks = template.text.replace(/https?:\/\/\S+/g, '');
    expect(textWithoutLinks).not.toContain(token);
  });

  it('never takes the address of the application for a link', () => {
    // The address of the application points at the server itself in the
    // deployed environment. A link must never come from it.
    (env as unknown as { APP_PUBLIC_URL: string }).APP_PUBLIC_URL = 'http://127.0.0.1:3000';

    const verification = verificationTemplate('Ada', 'a-token-for-the-tests');
    const reset = passwordResetTemplate('Ada', 'a-token-for-the-tests');
    const change = emailChangeTemplate('Ada', 'a-token-for-the-tests');

    for (const template of [verification, reset, change]) {
      for (const link of linksOf(template.html)) {
        expect(link.startsWith(env.publicWebUrl), link).toBe(true);
        expect(link).not.toContain('127.0.0.1');
        expect(link).not.toContain('localhost');
      }
      for (const address of addressesOf(template.text)) {
        expect(address.startsWith(env.publicWebUrl), address).toBe(true);
        expect(address).not.toContain('127.0.0.1');
        expect(address).not.toContain('localhost');
      }
    }

    expect(verification.html).toContain(verificationLink('a-token-for-the-tests'));
    expect(reset.html).toContain(resetLink('a-token-for-the-tests'));
    expect(change.html).toContain(emailChangeLink('a-token-for-the-tests'));
  });

  it('sends the ticket to the customer and to the support inbox', () => {
    expect(templates.ticketCreated.subject).toContain('The server does not start');
    expect(templates.ticketCreated.html).toContain('/app/tickets');
    expect(templates.ticketCreated.text).toContain('BM-TIC-00001');

    // The copy of the support inbox carries the customer and the queue.
    expect(templates.support.subject).toContain('[Blipmade] New ticket');
    expect(templates.support.html).toContain('/admin/tickets');
    expect(templates.support.text).toContain('ada@example.com');
    expect(templates.support.text).toContain('BM-TIC-00001');
  });

  it('escapes what the customer wrote', () => {
    const template = ticketCreatedTemplate({
      reference: 'BM-TIC-00002',
      subject: '<script>alert(1)</script>',
      message: 'Hello',
    });
    expect(template.html).not.toContain('<script>');
    expect(template.html).toContain('&lt;script&gt;');
  });

  it('shows the money the way the platform stores it', () => {
    expect(formatAmount(1200, 'EUR')).toContain('12');
    expect(formatAmount(1200, 'EUR')).toContain('€');
    expect(formatAmount(0, 'EUR')).toContain('0');
  });
});
