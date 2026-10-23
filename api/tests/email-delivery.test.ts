import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The environment is read when the module is loaded, so the values the
 * modules need are set before anything is imported.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://blipmade:blipmade@127.0.0.1:5432/blipmade_test';
process.env.SESSION_SECRET ??= 'email-delivery-test-session-secret';

const { env } = await import('../src/env.js');
const {
  mailDeliveryRecords,
  mailLogLine,
  mailNotice,
  redactTokens,
  registrationNotice,
  sendMail,
  smtpTransportOptions,
  tokenReference,
} = await import('../src/lib/mailer.js');
const { passwordResetTemplate, verificationTemplate } = await import('../src/lib/email-templates.js');

const TOKEN = 'a-raw-token-that-must-never-be-written-down';

/** The place where the messages were written before the test. */
const originalBackupDir = env.BACKUP_DIR;

/** The place where the messages are written while no relay is configured. */
async function mailDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'blipmade-mail-'));
  (env as unknown as { BACKUP_DIR: string }).BACKUP_DIR = root;
  return root;
}

/** Everything the code wrote to the console while the action ran. */
function captureLogs(): { output: () => string; restore: () => void } {
  const lines: string[] = [];
  const spies = (['info', 'error', 'warn', 'log', 'debug'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((value) => (typeof value === 'string' ? value : JSON.stringify(value))).join(' '));
    }),
  );
  return {
    output: () => lines.join('\n'),
    restore: () => {
      for (const spy of spies) spy.mockRestore();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the delivery of a message', () => {
  it('says that a message was written to a file and not that it was delivered', async () => {
    await mailDirectory();
    const template = verificationTemplate('Ada', TOKEN);

    const result = await sendMail({
      to: 'ada@example.com',
      subject: template.subject,
      text: template.text,
      html: template.html,
      kind: 'verification',
    });

    expect(result.state).toBe('written-to-file');
    expect(result.state).not.toBe('delivered');
    expect(result.delivered).toBe(false);
    expect(result.transport).toBe('file');
    expect(result.attempts).toBe(1);
    expect(result.errorClass).toBeNull();
    expect(result.updatedAt).toBeTruthy();
  });

  it('writes the message to the disk', async () => {
    const root = await mailDirectory();
    const template = verificationTemplate('Ada', TOKEN);

    const result = await sendMail({
      to: 'ada@example.com',
      subject: template.subject,
      text: template.text,
      html: template.html,
      kind: 'verification',
    });

    const files = await readdir(join(root, 'mail'));
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(result.id);
  });

  it('keeps the token out of the file it writes', async () => {
    const root = await mailDirectory();
    const template = verificationTemplate('Ada', TOKEN);

    const result = await sendMail({
      to: 'ada@example.com',
      subject: template.subject,
      text: template.text,
      html: template.html,
      kind: 'verification',
    });

    // The name of the file carries no token.
    expect(result.id).not.toContain(TOKEN);

    // The file itself carries no token either: it cannot be replayed.
    const written = await readFile(join(root, 'mail', result.id), 'utf-8');
    expect(written).not.toContain(TOKEN);
    expect(written).toContain('[redacted]');
    expect(JSON.parse(written).state).toBe('written-to-file');
  });

  it('keeps the token out of the log lines', async () => {
    await mailDirectory();
    const template = verificationTemplate('Ada', TOKEN);
    const logs = captureLogs();
    try {
      await sendMail({
        to: 'ada@example.com',
        subject: template.subject,
        text: template.text,
        html: template.html,
        kind: 'verification',
      });
    } finally {
      logs.restore();
    }

    expect(logs.output()).not.toContain(TOKEN);
  });

  it('keeps the token out of the log lines of a reset', async () => {
    await mailDirectory();
    const template = passwordResetTemplate('Ada', TOKEN);
    const logs = captureLogs();
    try {
      await sendMail({
        to: 'ada@example.com',
        subject: template.subject,
        text: template.text,
        html: template.html,
        kind: 'reset',
      });
    } finally {
      logs.restore();
    }

    expect(logs.output()).not.toContain(TOKEN);
  });

  it('writes a log line that names the message and carries the reference', async () => {
    await mailDirectory();
    const template = verificationTemplate('Ada', TOKEN);
    const result = await sendMail({
      to: 'customer@example.com',
      subject: template.subject,
      text: template.text,
      html: template.html,
      kind: 'verification',
    });

    const line = mailLogLine('verification', result, 'customer@example.com', TOKEN);
    expect(line).not.toContain(TOKEN);
    expect(line).toContain('verification message');
    expect(line).toContain('customer@example.com');
    expect(line).toContain(`(reference ${tokenReference(TOKEN)})`);
    expect(line).toContain('[mail:file]');
    expect(line).toContain('written');

    const resetLine = mailLogLine('reset', { ...result, transport: 'smtp' }, 'customer@example.com', TOKEN);
    expect(resetLine).not.toContain(TOKEN);
    expect(resetLine).toContain('reset message');
    expect(resetLine).toContain(`(reference ${tokenReference(TOKEN)})`);
  });

  it('never writes the token down, only its hash', () => {
    const reference = tokenReference(TOKEN);
    expect(reference).toHaveLength(8);
    expect(reference).not.toContain(TOKEN);
    expect(reference).toMatch(/^[0-9a-f]{8}$/);
    expect(tokenReference(TOKEN)).toBe(reference);
    expect(tokenReference(`${TOKEN}x`)).not.toBe(reference);
  });

  it('removes the token from a link', () => {
    expect(redactTokens(`https://blipmade.com/verify-email?token=${TOKEN}`)).toBe(
      'https://blipmade.com/verify-email?token=[redacted]',
    );
    expect(redactTokens(`<a href="https://blipmade.com/reset-password?token=${TOKEN}">x</a>`)).not.toContain(TOKEN);
  });
});

describe('what the API tells the customer', () => {
  it('does not claim that a message was sent while the transport is a file', () => {
    expect(env.SMTP_URL).toBe('');
    for (const kind of ['verification', 'reset'] as const) {
      const message = mailNotice(kind);
      expect(message).not.toMatch(/\bsent\b/i);
      expect(message.toLowerCase()).toContain('not configured');
      expect(message.toLowerCase()).toContain('support');
    }
    expect(registrationNotice().toLowerCase()).toContain('not configured');
  });

  it('says the same thing for every address, so no account can be found', () => {
    expect(mailNotice('verification')).toBe(mailNotice('verification'));
    expect(mailNotice('reset')).toBe(mailNotice('reset'));
  });
});

describe('the state of the messages', () => {
  it('remembers the state, the number of attempts and the time', async () => {
    await mailDirectory();
    const template = verificationTemplate('Ada', TOKEN);
    const result = await sendMail({
      to: 'ada@example.com',
      subject: template.subject,
      text: template.text,
      html: template.html,
      kind: 'verification',
      idempotencyKey: 'verification-12345678',
    });

    const records = mailDeliveryRecords();
    const record = records.find((entry) => entry.key === 'verification-12345678');
    expect(record).toBeTruthy();
    expect(record!.state).toBe('written-to-file');
    expect(record!.attempts).toBe(1);
    expect(record!.errorClass).toBeNull();
    expect(record!.createdAt).toBeTruthy();
    expect(record!.updatedAt).toBeTruthy();
    expect(record!.deliveredAt).toBeNull();
    expect(record!.key).toBe('verification-12345678');
  });

  it('never sends the same message twice', async () => {
    const root = await mailDirectory();
    const template = verificationTemplate('Ada', TOKEN);
    const message = {
      to: 'ada@example.com',
      subject: template.subject,
      text: template.text,
      html: template.html,
      kind: 'verification',
      idempotencyKey: 'verification-abcdef01',
    };

    const first = await sendMail(message);
    const second = await sendMail(message);

    expect(first.state).toBe('written-to-file');
    expect(second.state).toBe('written-to-file');
    expect(second.attempts).toBe(1);
    expect((await readdir(join(root, 'mail')))).toHaveLength(1);
  });

  it('reports a message that could not be written as failed', async () => {
    const root = await mailDirectory();
    // A file where the directory of the messages should be: the write fails.
    const blocked = join(root, 'blocked');
    await writeFile(blocked, 'not a directory', 'utf-8');
    (env as unknown as { BACKUP_DIR: string }).BACKUP_DIR = blocked;

    const template = verificationTemplate('Ada', TOKEN);
    const logs = captureLogs();
    let result;
    try {
      result = await sendMail({
        to: 'ada@example.com',
        subject: template.subject,
        text: template.text,
        html: template.html,
        kind: 'verification',
      });
    } finally {
      logs.restore();
    }

    expect(result!.state).toBe('failed');
    expect(result!.delivered).toBe(false);
    expect(result!.errorClass).toBeTruthy();
    expect(result!.error).toBeTruthy();
  });
});

describe('the relay of the platform', () => {
  it('takes the URL of Brevo as it is', () => {
    const options = smtpTransportOptions('smtp://login:the-key@smtp-relay.brevo.com:587');
    expect(options.host).toBe('smtp-relay.brevo.com');
    expect(options.port).toBe(587);
    expect(options.secure).toBe(false);
    expect(options.auth).toEqual({ user: 'login', pass: 'the-key' });
  });

  it('takes the URL of Resend as it is, with the encryption of port 465', () => {
    const options = smtpTransportOptions('smtp://resend:the-key@smtp.resend.com:465');
    expect(options.host).toBe('smtp.resend.com');
    expect(options.port).toBe(465);
    // The port 465 only speaks TLS, so the connection is encrypted.
    expect(options.secure).toBe(true);
    expect(options.auth).toEqual({ user: 'resend', pass: 'the-key' });
  });

  it('keeps the URL of the relay out of the options that are logged', () => {
    const url = 'smtp://login:the-key@smtp-relay.brevo.com:587';
    const options = smtpTransportOptions(url);
    expect(JSON.stringify(options)).not.toContain(url);
  });
});
