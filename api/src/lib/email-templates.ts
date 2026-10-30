/**
 * The branded messages of the platform.
 *
 * Every template is inline HTML, because a mail client does not read a
 * stylesheet and most of them drop a `<style>` block. Every template also has
 * a plain-text version, because a client may show nothing else.
 *
 * The links are always built from the public origin of the platform. A link
 * that takes the host of the request would send a customer to an address that
 * only exists inside the network, so the origin is the only source here.
 */
import { env } from '../env.js';

export const BRAND = {
  /** The near-black the brand is built on. */
  ink: '#090a09',
  /** A flat surface, one step lighter than the background. */
  surface: '#0e1310',
  /** The green of the brand. */
  accent: '#6be598',
  /** The text on the dark surfaces. */
  text: '#f2f5f3',
  /** The quieter text, still well above the AA threshold on the ink. */
  muted: '#a8b0ab',
  /** The line between two parts of a message. */
  border: '#232725',
  /** The font stack of the platform. Every mail client knows these names. */
  font: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/** The origin every link of every message is built from. */
export function publicOrigin(): string {
  return env.publicWebUrl.replace(/\/+$/, '');
}

/**
 * Builds a link on the public origin.
 *
 * The path is always a path: the origin never comes from the caller, so a
 * link can never point at another host.
 */
export function publicLink(path: string): string {
  const base = publicOrigin();
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}

/** The link that confirms an email address. */
export function verificationLink(token: string): string {
  return `${publicLink('/verify-email')}?token=${encodeURIComponent(token)}`;
}

/** The link that opens the page where a new password is chosen. */
export function resetLink(token: string): string {
  return `${publicLink('/reset-password')}?token=${encodeURIComponent(token)}`;
}

/** The link that confirms a change of the address of an account. */
export function emailChangeLink(token: string): string {
  return `${publicLink('/app/settings')}?emailChange=${encodeURIComponent(token)}`;
}

/** The text that never comes from the customer is escaped before it is shown. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutInput {
  /** The line that is shown in the list of messages before one is opened. */
  preheader: string;
  heading: string;
  paragraphs?: string[];
  action?: { label: string; url: string };
  details?: Array<{ label: string; value: string }>;
  note?: string;
}

/**
 * The frame of every message.
 *
 * The same layout is used for the HTML and for the text, so the two never
 * drift apart: what a customer reads in a text client is what a customer
 * reads in a graphical one.
 */
function layout(input: LayoutInput): { html: string; text: string } {
  const origin = publicOrigin();
  const paragraphs = input.paragraphs ?? [];
  const details = input.details ?? [];

  const htmlParagraphs = paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-family:${BRAND.font};font-size:15px;line-height:1.6;color:${BRAND.text};">${escapeHtml(text)}</p>`,
    )
    .join('\n            ');

  const htmlDetails = details.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;border-collapse:collapse;">
            ${details
              .map(
                (row) => `<tr>
              <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};font-family:${BRAND.font};font-size:13px;line-height:1.4;color:${BRAND.muted};">${escapeHtml(row.label)}</td>
              <td align="right" style="padding:10px 0;border-bottom:1px solid ${BRAND.border};font-family:${BRAND.font};font-size:13px;line-height:1.4;color:${BRAND.text};font-weight:700;">${escapeHtml(row.value)}</td>
            </tr>`,
              )
              .join('\n            ')}
          </table>`
    : '';

  const htmlAction = input.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">
            <tr><td bgcolor="${BRAND.accent}" style="border-radius:10px;padding:13px 24px;font-family:${BRAND.font};font-size:15px;font-weight:700;line-height:1;text-align:center;">
              <a href="${escapeHtml(input.action.url)}" style="color:${BRAND.ink};text-decoration:none;display:inline-block;">${escapeHtml(input.action.label)}</a>
            </td></tr>
          </table>
          <p style="margin:0 0 20px;font-family:${BRAND.font};font-size:13px;line-height:1.6;color:${BRAND.muted};">
            The button does not work? Copy this link into your browser:<br>
            <a href="${escapeHtml(input.action.url)}" style="color:${BRAND.accent};text-decoration:underline;word-break:break-all;">${escapeHtml(input.action.url)}</a>
          </p>`
    : '';

  const htmlNote = input.note
    ? `<p style="margin:0 0 8px;font-family:${BRAND.font};font-size:12px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(input.note)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.ink};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid ${BRAND.border};">
                <span style="font-family:${BRAND.font};font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.accent};">Blipmade</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 20px;font-family:${BRAND.font};font-size:22px;font-weight:700;line-height:1.3;color:${BRAND.text};">${escapeHtml(input.heading)}</h1>
                ${htmlParagraphs}
                ${htmlAction}
                ${htmlDetails}
                ${htmlNote}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;border-top:1px solid ${BRAND.border};font-family:${BRAND.font};font-size:12px;line-height:1.7;color:${BRAND.muted};">
                You receive this message because you have an account on Blipmade.<br />
                <a href="${escapeHtml(origin)}" style="color:${BRAND.muted};text-decoration:underline;">${escapeHtml(origin)}</a> &middot; ${escapeHtml(env.MAIL_SUPPORT_EMAIL)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textDetails = details.length
    ? `\n${details.map((row) => `${row.label}: ${row.value}`).join('\n')}\n`
    : '';

  const textAction = input.action
    ? `\n${input.action.label}:\n${input.action.url}\n`
    : '';

  const textNote = input.note ? `\n${input.note}\n` : '';

  const text = `Blipmade

${input.heading}

${paragraphs.join('\n\n')}
${textAction}${textDetails}${textNote}
—
Blipmade · ${origin}
${env.MAIL_SUPPORT_EMAIL}`;

  return { html, text };
}

/** The message that asks a customer to confirm the address of the account. */
export function verificationTemplate(name: string | null, token: string): EmailTemplate {
  const url = verificationLink(token);
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return {
    subject: 'Confirm your Blipmade email address',
    ...layout({
      preheader: 'Confirm your email address to activate your Blipmade account.',
      heading: 'Confirm your email address',
      paragraphs: [
        `${greeting} welcome to Blipmade. Confirm your email address to activate your account.`,
        'The link works once and expires in 24 hours. If you did not create this account, ignore this message.',
      ],
      action: { label: 'Confirm my email address', url },
    }),
  };
}

/**
 * The message that carries the link to choose a new password.
 */
export function passwordResetTemplate(name: string | null, token: string): EmailTemplate {
  const url = resetLink(token);
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return {
    subject: 'Reset your Blipmade password',
    ...layout({
      preheader: 'Choose a new password for your Blipmade account.',
      heading: 'Reset your password',
      paragraphs: [
        `${greeting} a request was made to reset the password of your Blipmade account.`,
        'The link works once and expires in 1 hour. If you did not ask for it, nothing changed and you can ignore this message.',
      ],
      action: { label: 'Choose a new password', url },
    }),
  };
}

/**
 * The message that confirms a change of the address of an account.
 *
 * The link points at the settings page of the customer area, where the change
 * is finished. It is built by the same helper as every other link, so it can
 * never point at another host.
 */
export function emailChangeTemplate(name: string | null, token: string): EmailTemplate {
  const url = emailChangeLink(token);
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return {
    subject: 'Confirm the new address of your Blipmade account',
    ...layout({
      preheader: 'Confirm the new email address of your Blipmade account.',
      heading: 'Confirm your new email address',
      paragraphs: [
        `${greeting} a request was made to change the email address of your Blipmade account to this one.`,
        'The link works once and expires in 1 hour. If you did not ask for it, nothing changed and you can ignore this message.',
      ],
      action: { label: 'Confirm the new address', url },
    }),
  };
}

/** The copy a customer receives when a ticket was opened. */
export function ticketCreatedTemplate(input: {
  reference: string;
  subject: string;
  message: string;
}): EmailTemplate {
  return {
    subject: `We received your request: ${input.subject}`,
    ...layout({
      preheader: `Your request ${input.reference} was received.`,
      heading: 'We received your request',
      paragraphs: [
        'Our support team has your request and will answer on this address.',
        `Reference: ${input.reference}`,
        input.message,
      ],
      action: { label: 'Open my requests', url: publicLink('/app/tickets') },
      details: [
        { label: 'Subject', value: input.subject },
        { label: 'Reference', value: input.reference },
      ],
    }),
  };
}

/** The copy a customer receives when somebody answered on the ticket. */
export function ticketReplyTemplate(input: {
  reference: string;
  subject: string;
  message: string;
}): EmailTemplate {
  return {
    subject: `New reply on your request: ${input.subject}`,
    ...layout({
      preheader: `There is a new reply on your request ${input.reference}.`,
      heading: 'There is a new reply',
      paragraphs: [
        'Our support team answered on your request.',
        `Reference: ${input.reference}`,
        input.message,
      ],
      action: { label: 'Read the reply', url: publicLink('/app/tickets') },
      details: [
        { label: 'Subject', value: input.subject },
        { label: 'Reference', value: input.reference },
      ],
    }),
  };
}

/**
 * The copy that goes to the support inbox.
 *
 * It carries the message of the customer and the place where the ticket is
 * answered, so the team never has to search for the reference.
 */
export function supportTicketTemplate(input: {
  reference: string;
  subject: string;
  message: string;
  customerName: string;
  customerEmail: string;
}): EmailTemplate {
  return {
    subject: `[Blipmade] New ticket: ${input.subject}`,
    ...layout({
      preheader: `A new ticket ${input.reference} was opened.`,
      heading: 'A new ticket was opened',
      paragraphs: [
        input.message,
        `The customer is ${input.customerName} (${input.customerEmail}).`,
      ],
      action: { label: 'Open the support queue', url: publicLink('/admin/tickets') },
      details: [
        { label: 'Subject', value: input.subject },
        { label: 'Reference', value: input.reference },
        { label: 'Customer', value: input.customerEmail },
      ],
    }),
  };
}

/** The copy that goes to the customer when an invoice was paid. */
export function invoicePaidTemplate(input: {
  number: string;
  amount: string;
  periodEnd?: string | null;
}): EmailTemplate {
  return {
    subject: `Your invoice ${input.number} was paid`,
    ...layout({
      preheader: `Invoice ${input.number} was paid.`,
      heading: 'Your invoice was paid',
      paragraphs: [
        'We received the payment of your invoice. Everything is running as it should.',
        `The invoice is available on the billing page of your account.`,
      ],
      action: { label: 'Open my billing', url: publicLink('/app/billing') },
      details: [
        { label: 'Invoice', value: input.number },
        { label: 'Amount', value: input.amount },
        ...(input.periodEnd ? [{ label: 'Paid period', value: input.periodEnd }] : []),
      ],
    }),
  };
}

/** The copy that goes to the customer when an invoice could not be paid. */
export function invoiceFailedTemplate(input: {
  number: string;
  amount: string;
  periodEnd?: string | null;
  reason?: string | null;
}): EmailTemplate {
  return {
    subject: `Your invoice ${input.number} could not be paid`,
    ...layout({
      preheader: `Invoice ${input.number} could not be paid.`,
      heading: 'Your invoice could not be paid',
      paragraphs: [
        'The payment of your invoice did not go through. The service stays available while the invoice is open, but it can be suspended when the invoice stays unpaid.',
        'You can pay the invoice again on the billing page of your account.',
      ],
      action: { label: 'Open my billing', url: publicLink('/app/billing') },
      details: [
        { label: 'Invoice', value: input.number },
        { label: 'Amount', value: input.amount },
        ...(input.periodEnd ? [{ label: 'Paid period', value: input.periodEnd }] : []),
        ...(input.reason ? [{ label: 'Reason', value: input.reason }] : []),
      ],
    }),
  };
}

/** The copy that goes to the customer when a subscription changed. */
export function subscriptionChangedTemplate(input: {
  instanceName: string;
  status: string;
  periodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}): EmailTemplate {
  const ending = input.cancelAtPeriodEnd
    ? 'The subscription ends at the end of the paid period.'
    : 'The subscription stays active.';
  return {
    subject: `Your subscription for ${input.instanceName} changed`,
    ...layout({
      preheader: `The subscription for ${input.instanceName} changed.`,
      heading: 'Your subscription changed',
      paragraphs: [ending],
      action: { label: 'Open my billing', url: publicLink('/app/billing') },
      details: [
        { label: 'Service', value: input.instanceName },
        { label: 'Status', value: input.status },
        ...(input.periodEnd ? [{ label: 'Paid until', value: input.periodEnd }] : []),
      ],
    }),
  };
}

/** The copy that goes to the customer when a service is ready. */
export function instanceProvisionedTemplate(input: {
  instanceName: string;
  address?: string | null;
}): EmailTemplate {
  return {
    subject: `${input.instanceName} is ready`,
    ...layout({
      preheader: `${input.instanceName} is ready to use.`,
      heading: `${input.instanceName} is ready`,
      paragraphs: [
        'Your service has been created and is running. You can open it on the services page of your account.',
      ],
      action: { label: 'Open my services', url: publicLink('/app/instances') },
      details: [
        { label: 'Service', value: input.instanceName },
        ...(input.address ? [{ label: 'Address', value: input.address }] : []),
      ],
    }),
  };
}

/** The copy that goes to the customer when a service was stopped. */
export function instanceStoppedTemplate(input: {
  instanceName: string;
  reason?: string | null;
}): EmailTemplate {
  return {
    subject: `${input.instanceName} was stopped`,
    ...layout({
      preheader: `${input.instanceName} was stopped.`,
      heading: `${input.instanceName} was stopped`,
      paragraphs: [
        input.reason
          ? `Your service was stopped. ${input.reason}`
          : 'Your service was stopped. You can start it again from the services page of your account.',
      ],
      action: { label: 'Open my services', url: publicLink('/app/instances') },
      details: [{ label: 'Service', value: input.instanceName }],
    }),
  };
}

/**
 * The amount of money as it is shown to a customer.
 *
 * The platform stores the money in the smallest unit, so the amount is
 * divided before it is shown.
 */
export function formatAmount(amount: number, currency = 'EUR'): string {
  try {
    return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

/** A date as it is shown to a customer, without the time of the server. */
export function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}
