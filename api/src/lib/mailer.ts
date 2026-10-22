import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | null = null;
let usingFileTransport = false;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  if (env.SMTP_URL) {
    transporter = nodemailer.createTransport(env.SMTP_URL);
  } else {
    // No SMTP configured: messages are written to disk so the flow can be
    // verified end to end without sending real mail. This is reported by the
    // health endpoint so the limitation is never hidden.
    usingFileTransport = true;
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

export function mailTransportName(): 'smtp' | 'file' {
  return env.SMTP_URL ? 'smtp' : 'file';
}

export async function sendMail(message: MailMessage): Promise<{ delivered: boolean; id: string }> {
  const from = env.MAIL_FROM;
  const transport = getTransporter();

  if (usingFileTransport) {
    const dir = join(env.BACKUP_DIR, 'mail');
    try {
      await mkdir(dir, { recursive: true });
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        date: new Date().toISOString(),
      };
      await writeFile(join(dir, `${id}.json`), JSON.stringify(payload, null, 2), 'utf-8');
      return { delivered: false, id };
    } catch (error) {
      // A mailbox that cannot be written must never break the request that
      // triggered the message. The problem is logged so it stays visible.
      console.error('[mail] could not write the message to disk', (error as Error).message);
      return { delivered: false, id: 'not-written' };
    }
  }

  const info = await transport.sendMail({ from, ...message });
  return { delivered: true, id: info.messageId };
}

export function verificationEmail(name: string | null, url: string): MailMessage {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return {
    to: '',
    subject: 'Confirm your Blipmade email address',
    text: `${greeting}\n\nConfirm your email address to activate your Blipmade account:\n${url}\n\nThe link expires in 24 hours. If you did not create this account, ignore this message.`,
  };
}

export function resetEmail(name: string | null, url: string): MailMessage {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return {
    to: '',
    subject: 'Reset your Blipmade password',
    text: `${greeting}\n\nUse this link to choose a new Blipmade password:\n${url}\n\nThe link expires in 1 hour. If you did not ask for it, nothing changed and you can ignore this message.`,
  };
}

export function ticketEmail(subject: string, body: string): MailMessage {
  return {
    to: '',
    subject: `[Blipmade] ${subject}`,
    text: body,
  };
}
