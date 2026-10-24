import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';

/**
 * The state of a message.
 *
 * `delivered` means the relay took the message. `written-to-file` means the
 * message was written to disk and nobody received it. The two are never the
 * same thing, so they are never the same word.
 */
export type MailDeliveryState = 'queued' | 'delivered' | 'written-to-file' | 'failed';

export type MailTransport = 'smtp' | 'file';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** What the message is about, so the messages can be told apart. */
  kind?: string;
  /** The key that makes a retry of the same message idempotent. */
  idempotencyKey?: string;
}

/** What a queued message carries. It holds everything the worker needs. */
export interface MailJobPayload {
  key: string;
  kind: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailSendResult {
  state: MailDeliveryState;
  /** True only when the relay took the message. */
  delivered: boolean;
  id: string;
  attempts: number;
  transport: MailTransport;
  kind: string;
  errorClass: string | null;
  error: string | null;
  queuedAt: string | null;
  deliveredAt: string | null;
  updatedAt: string;
}

/** What the platform remembers about a message. It never holds the body. */
export interface MailDeliveryRecord extends MailSendResult {
  key: string;
  to: string;
  createdAt: string;
}

/** The failure of an attempt, without anything secret in it. */
export class MailDeliveryError extends Error {
  readonly errorClass: string;

  constructor(errorClass: string, message: string) {
    super(message);
    this.name = 'MailDeliveryError';
    this.errorClass = errorClass;
  }
}

/**
 * The messages the platform remembers.
 *
 * The registry is a report, not a place to keep history: it is bounded, and
 * it never holds a body or a token.
 */
const registry = new Map<string, MailDeliveryRecord>();
const REGISTRY_LIMIT = 200;

function remember(record: MailDeliveryRecord): void {
  registry.set(record.key, record);
  while (registry.size > REGISTRY_LIMIT) {
    const oldest = registry.keys().next().value;
    if (oldest === undefined) break;
    registry.delete(oldest);
  }
}

/** Every message the platform remembers, the newest first. */
export function mailDeliveryRecords(): MailDeliveryRecord[] {
  return [...registry.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** What is known about one message. */
export function mailDeliveryRecord(key: string): MailDeliveryRecord | undefined {
  const record = registry.get(key);
  return record ? { ...record } : undefined;
}

/**
 * Records that a message was put on the queue.
 *
 * The worker is another process, so the API writes down what it queued. The
 * record holds no body and no token.
 */
export function noteQueued(payload: MailJobPayload, jobId: string): void {
  const existing = registry.get(payload.key);
  // A message that was already delivered stays delivered: a second request
  // must never make it look like it is still on its way.
  if (existing && (existing.state === 'delivered' || existing.state === 'written-to-file')) return;
  const now = new Date().toISOString();
  const record: MailDeliveryRecord = {
    key: payload.key,
    kind: payload.kind,
    to: payload.to,
    state: 'queued',
    delivered: false,
    id: jobId,
    attempts: existing?.attempts ?? 0,
    transport: mailTransportName(),
    errorClass: null,
    error: null,
    queuedAt: now,
    deliveredAt: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  remember(record);
  void persistRecord(record);
}

/** The transport that is in use: the relay, or the file that stands in for it. */
export function mailTransportName(): MailTransport {
  return env.SMTP_URL ? 'smtp' : 'file';
}

/**
 * Writes the state of a message in the database.
 *
 * The API and the worker are two processes, so the row is what they share:
 * the report of a message is the same everywhere and it survives a restart.
 *
 * The row never holds the body of the message and never holds a token.
 *
 * The row of a message that the file transport wrote says `written-to-file`
 * and names the transport `file`, so the operator reads there that the
 * message never left the system. The file itself is found by the reference of
 * the message, which is the middle of its name.
 *
 * A report is a report: a database that cannot be written never breaks the
 * message that triggered it, and the problem is logged without anything
 * secret in it.
 */
async function persistRecord(record: MailDeliveryRecord): Promise<void> {
  try {
    const { prisma } = await import('../db.js');
    await prisma.mailDelivery.upsert({
      where: { key: record.key },
      create: {
        key: record.key,
        kind: record.kind,
        to: record.to,
        state: record.state,
        transport: record.transport,
        attempts: record.attempts,
        lastErrorClass: record.errorClass,
        lastError: record.error,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
        deliveredAt: record.deliveredAt ? new Date(record.deliveredAt) : null,
      },
      update: {
        kind: record.kind,
        to: record.to,
        state: record.state,
        transport: record.transport,
        attempts: record.attempts,
        lastErrorClass: record.errorClass,
        lastError: record.error,
        updatedAt: new Date(record.updatedAt),
        deliveredAt: record.deliveredAt ? new Date(record.deliveredAt) : null,
      },
    });
  } catch (error) {
    console.warn(`[mail] the delivery record could not be written: ${errorClass(error)}`);
  }
}

/** The state of the messages that were written down, the newest first. */
export async function mailDeliveryRows(limit = 100): Promise<MailDeliveryRecord[]> {
  try {
    const { prisma } = await import('../db.js');
    const rows = await prisma.mailDelivery.findMany({ orderBy: { updatedAt: 'desc' }, take: limit });
    return rows.map((row) => ({
      key: row.key,
      kind: row.kind,
      to: row.to,
      state: row.state as MailDeliveryState,
      delivered: row.state === 'delivered',
      id: row.key,
      attempts: row.attempts,
      transport: row.transport as MailTransport,
      errorClass: row.lastErrorClass,
      error: row.lastError,
      queuedAt: row.createdAt.toISOString(),
      deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  } catch {
    // The rows are a report. A database that cannot be read leaves the memory
    // of the process as the only source.
    return [];
  }
}

/** True when a relay is configured and a message can really be delivered. */
export function mailEnabled(): boolean {
  return Boolean(env.SMTP_URL);
}

/**
 * The short reference of a token.
 *
 * A token is never written down. When a message has to be traced, the first
 * eight characters of the hash of the token are used: they identify the
 * message without being able to use it.
 */
export function tokenReference(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 8);
}

/** A link with a token in it. */
const TOKEN_IN_LINK = /([?&](?:token|access_token|code)=)[^&\s"'<>]+/gi;

/**
 * Removes the tokens from a message.
 *
 * The file that stands in for a relay must not be able to sign a customer in,
 * so the link it keeps is the link without its token.
 */
export function redactTokens(value: string): string {
  return value.replace(TOKEN_IN_LINK, '$1[redacted]');
}

/** The error of an attempt, without the credentials of the relay in it. */
function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, '$1[redacted]@')
    .replace(/\b(sk|pk|rk)_[A-Za-z0-9_]{8,}\b/g, '$1_[redacted]')
    .slice(0, 240);
}

/** The class of a failure, so the operator knows what kind of problem it is. */
function errorClass(error: unknown): string {
  if (!(error instanceof Error)) return 'Error';
  const name = error.name && error.name !== 'Error' ? error.name : error.constructor?.name ?? 'Error';
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' || typeof code === 'number') return `${name}/${code}`;
  return name;
}

interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

/**
 * The options of the configured relay.
 *
 * `SMTP_URL` is used as it is, so a relay of Brevo or of Resend works
 * without another setting. The only thing that is added is the implicit
 * encryption of port 465: Nodemailer reads `smtp://` as a plain connection,
 * and the port 465 of Resend only speaks TLS.
 */
export function smtpTransportOptions(url: string): SmtpOptions {
  const parsed = new URL(url);
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'smtps:' ? 465 : 587;
  const options: SmtpOptions = {
    host: parsed.hostname,
    port,
    secure: parsed.protocol === 'smtps:' || port === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
  if (parsed.username) {
    options.auth = {
      user: decodeURIComponent(parsed.username),
      pass: decodeURIComponent(parsed.password),
    };
  }
  return options;
}

let transporter: Transporter | null = null;
let transporterUrl: string | null = null;

function getTransporter(): Transporter {
  const url = env.SMTP_URL;
  if (transporter && transporterUrl === url) return transporter;
  transporter = nodemailer.createTransport(smtpTransportOptions(url));
  transporterUrl = url;
  return transporter;
}

/** A key for a message that has none of its own. */
function uniqueKey(): string {
  return `message-${randomBytes(6).toString('hex')}`;
}

/**
 * The bounds of the file transport.
 *
 * The file transport stands in for a relay that is not there: it writes the
 * message on the disk instead of delivering it. Without a bound the directory
 * grows until the disk is full, so the bound is a part of the transport and
 * not a thing of the maintenance.
 *
 * The bounds come from the environment, so the operator decides them:
 *
 *   MAIL_FILE_MAX_FILES      how many files are kept at most
 *   MAIL_FILE_MAX_AGE_HOURS  how long a file is kept at most
 *
 * A value that is not a positive number is ignored and the default is used,
 * so a mistake in the configuration never removes everything at once.
 */
export const DEFAULT_MAIL_FILE_MAX_FILES = 500;

/** How long a file of the file transport is kept, in hours. */
export const DEFAULT_MAIL_FILE_MAX_AGE_HOURS = 72;

export interface MailFileRetention {
  /** How many files of the transport are kept at most. */
  maxFiles: number;
  /** How long a file of the transport is kept at most, in milliseconds. */
  maxAgeMs: number;
}

/** Reads a positive whole number of the environment, or the default. */
function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

/** The bounds of the file transport that are in force right now. */
export function mailFileRetention(): MailFileRetention {
  return {
    maxFiles: numberFromEnv('MAIL_FILE_MAX_FILES', DEFAULT_MAIL_FILE_MAX_FILES),
    maxAgeMs: numberFromEnv('MAIL_FILE_MAX_AGE_HOURS', DEFAULT_MAIL_FILE_MAX_AGE_HOURS) * 60 * 60 * 1000,
  };
}

/** The directory where the file transport writes the messages. */
export function mailFileDirectory(): string {
  return join(env.BACKUP_DIR, 'mail');
}

/**
 * The name of a file of the transport.
 *
 * It holds the moment the file was written and the reference of the message,
 * so the file of a message can be found from the row of the delivery.
 */
const MAIL_FILE_NAME = /^(\d+)-([0-9a-f]{8})\.json$/;

/**
 * The messages the queue still has to deliver.
 *
 * The file of a message that waits on the queue is the copy of the message
 * that the worker still needs, so it is never removed. The set holds the
 * reference of every message that is waiting.
 *
 * `null` means the state of the queue is unknown. Nothing is removed then: a
 * file that cannot be checked is never removed.
 */
async function pendingMessageReferences(): Promise<Set<string> | null> {
  try {
    const { prisma } = await import('../db.js');
    const rows = await prisma.mailDelivery.findMany({ where: { state: 'queued' }, select: { key: true }, take: 1000 });
    return new Set(rows.map((row) => tokenReference(row.key)));
  } catch (error) {
    console.warn(`[mail] the state of the queue could not be read, so no file is removed: ${errorClass(error)}`);
    return null;
  }
}

/**
 * The message a file of the transport carries.
 *
 * The file holds the reference of its message, so the row of the delivery can
 * be found when the file is removed.
 */
async function messageKeyOf(path: string): Promise<string | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as { reference?: unknown };
    return typeof parsed.reference === 'string' ? parsed.reference : null;
  } catch {
    return null;
  }
}

/**
 * Marks the message of a file that was removed.
 *
 * The row of the delivery said that the message was written to a file. The
 * file is gone, so the row says that the message was not delivered: the
 * operator reads the truth in the table of the deliveries.
 */
async function markPrunedMessage(key: string): Promise<void> {
  try {
    const { prisma } = await import('../db.js');
    await prisma.mailDelivery.updateMany({
      where: { key, state: 'written-to-file' },
      data: {
        state: 'failed',
        lastErrorClass: 'MailFilePruned',
        lastError: 'The message was written to a file that was removed by the retention of the file transport.',
        deliveredAt: null,
      },
    });
  } catch (error) {
    console.warn(`[mail] the state of a removed message could not be written: ${errorClass(error)}`);
  }
}

/** Makes a file of the transport readable by its owner only. */
async function tightenMode(path: string, mode: number): Promise<void> {
  if ((mode & 0o777) === 0o600) return;
  await chmod(path, 0o600).catch(() => undefined);
}

/** What the pruning of the files did. */
export interface MailFilePruneReport {
  /** How many files of the transport were looked at. */
  scanned: number;
  /** The names of the files that were removed. */
  removed: string[];
  /** How many files were kept. */
  kept: number;
  /** How many files were kept because the queue still has to deliver them. */
  protectedCount: number;
}

/**
 * Removes the files of the transport that are not needed any more.
 *
 * Two bounds are in force: the number of files and their age. A file whose
 * message the queue still has to deliver is never removed, whatever its age
 * is, so the pruning can never take a message away from the worker.
 *
 * The state of the queue is read first. When it cannot be read, nothing is
 * removed: a file that cannot be checked is never removed.
 */
export async function pruneMailFiles(): Promise<MailFilePruneReport> {
  const dir = mailFileDirectory();
  const retention = mailFileRetention();

  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    // The directory does not exist yet: there is nothing to prune.
    return { scanned: 0, removed: [], kept: 0, protectedCount: 0 };
  }

  const files = names.filter((name) => MAIL_FILE_NAME.test(name));
  if (!files.length) return { scanned: 0, removed: [], kept: 0, protectedCount: 0 };

  const pending = await pendingMessageReferences();
  if (!pending) {
    return { scanned: files.length, removed: [], kept: files.length, protectedCount: 0 };
  }

  const entries = await Promise.all(
    files.map(async (name) => {
      const path = join(dir, name);
      const info = await stat(path).catch(() => null);
      return { name, path, mtimeMs: info?.mtimeMs ?? 0, mode: info?.mode ?? 0 };
    }),
  );

  // The newest files are kept: the bound of the number of files removes the
  // oldest ones first.
  const newestFirst = [...entries].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const keptByCount = new Set(newestFirst.slice(0, retention.maxFiles).map((entry) => entry.name));

  const now = Date.now();
  const removed: string[] = [];
  let protectedCount = 0;
  let kept = 0;

  for (const entry of newestFirst) {
    const reference = MAIL_FILE_NAME.exec(entry.name)?.[2] ?? '';
    if (pending.has(reference)) {
      // The queue still has to deliver this message, so its file stays.
      protectedCount += 1;
      kept += 1;
      continue;
    }
    const beyondCount = !keptByCount.has(entry.name);
    const tooOld = now - entry.mtimeMs >= retention.maxAgeMs;
    if (!beyondCount && !tooOld) {
      // The file is young enough and it is one of the newest ones. It is only
      // read by its owner.
      await tightenMode(entry.path, entry.mode);
      kept += 1;
      continue;
    }
    const key = await messageKeyOf(entry.path);
    await rm(entry.path, { force: true }).catch(() => undefined);
    if (key) await markPrunedMessage(key);
    removed.push(entry.name);
  }

  return { scanned: files.length, removed, kept, protectedCount };
}

/**
 * Prunes the files of the transport after a message was written.
 *
 * A test run does not prune: it can share the host with a deployment, and it
 * must never remove the files of the deployment. The pruning itself is
 * called by the tests, on a directory of their own.
 */
async function pruneWrittenFiles(): Promise<void> {
  if (env.isTest) return;
  const report = await pruneMailFiles();
  if (report.removed.length) {
    console.info(`[mail] the retention of the file transport removed ${report.removed.length} file(s)`);
  }
}

/**
 * Writes the message to the disk.
 *
 * The name of the file and the file itself never carry a token: the link is
 * kept without it, so the file cannot be replayed. It is the way the flow is
 * verified while no relay is configured.
 *
 * The file holds the address of the customer and the text of the message, so
 * it is written for the owner of the service only, and the directory that
 * holds it is closed to everybody else.
 */
async function writeMessageFile(payload: MailJobPayload): Promise<string> {
  const dir = mailFileDirectory();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // The mode of a directory that is already there is not changed by mkdir, so
  // it is set again: the messages of the customers are not read by everybody
  // on the host.
  await chmod(dir, 0o700).catch(() => undefined);
  const name = `${Date.now()}-${tokenReference(payload.key)}.json`;
  const file = {
    state: 'written-to-file',
    transport: 'file',
    // The reference of the message, so the file can be matched with the line
    // in the log and with the row in the database. It is a hash, so it cannot
    // be used to sign in.
    reference: payload.key,
    from: env.MAIL_FROM,
    to: payload.to,
    subject: payload.subject,
    text: redactTokens(payload.text),
    html: payload.html ? redactTokens(payload.html) : undefined,
    date: new Date().toISOString(),
    note: 'The link of this message was removed on purpose: this file cannot be used to sign in. Ask for a new message instead.',
  };
  const path = join(dir, name);
  // The file is written for the owner of the service only.
  await writeFile(path, JSON.stringify(file, null, 2), { encoding: 'utf-8', mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
  // The directory of the transport is bounded: the files that are not needed
  // any more are removed.
  await pruneWrittenFiles();
  return name;
}

/**
 * One attempt at delivering a message.
 *
 * A message that was already delivered is not sent again, so a retry of the
 * same message never sends it twice.
 */
async function attempt(payload: MailJobPayload): Promise<MailSendResult> {
  const now = new Date().toISOString();
  const existing = registry.get(payload.key);
  if (existing && (existing.state === 'delivered' || existing.state === 'written-to-file')) {
    return { ...existing };
  }

  const record: MailDeliveryRecord = existing ?? {
    key: payload.key,
    kind: payload.kind,
    to: payload.to,
    state: 'queued',
    delivered: false,
    id: '',
    attempts: 0,
    transport: mailTransportName(),
    errorClass: null,
    error: null,
    queuedAt: now,
    deliveredAt: null,
    createdAt: now,
    updatedAt: now,
  };
  record.attempts += 1;
  record.updatedAt = now;
  record.transport = mailTransportName();

  if (env.SMTP_URL) {
    try {
      const info = await getTransporter().sendMail({
        from: env.MAIL_FROM,
        to: record.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
      record.state = 'delivered';
      record.delivered = true;
      record.id = info.messageId ?? '';
      record.deliveredAt = new Date().toISOString();
      record.errorClass = null;
      record.error = null;
    } catch (error) {
      record.state = 'failed';
      record.delivered = false;
      record.errorClass = errorClass(error);
      record.error = safeError(error);
      remember(record);
      void persistRecord(record);
      throw new MailDeliveryError(record.errorClass, record.error ?? 'The relay refused the message.');
    }
  } else {
    try {
      record.id = await writeMessageFile(payload);
      record.state = 'written-to-file';
      record.delivered = false;
      record.errorClass = null;
      record.error = null;
    } catch (error) {
      record.state = 'failed';
      record.delivered = false;
      record.errorClass = errorClass(error);
      record.error = safeError(error);
      remember(record);
      void persistRecord(record);
      throw new MailDeliveryError(record.errorClass, record.error ?? 'The message could not be written to disk.');
    }
  }

  remember(record);
  void persistRecord(record);
  return { ...record };
}

/**
 * Sends a message right away.
 *
 * The call never throws: a message that cannot be delivered is reported as
 * failed, so the request that triggered it is never broken by the mail.
 */
export async function sendMail(message: MailMessage): Promise<MailSendResult> {
  const key = message.idempotencyKey ?? uniqueKey();
  try {
    return await attempt({
      key,
      kind: message.kind ?? 'message',
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    console.error(
      '[mail] the message could not be sent',
      error instanceof MailDeliveryError ? error.errorClass : errorClass(error),
      safeError(error),
    );
    const record = registry.get(key);
    if (record) return { ...record };
    return {
      state: 'failed',
      delivered: false,
      id: '',
      attempts: 1,
      transport: mailTransportName(),
      kind: message.kind ?? 'message',
      errorClass: errorClass(error),
      error: safeError(error),
      queuedAt: null,
      deliveredAt: null,
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Delivers a message that was queued.
 *
 * A failure is thrown, so the queue retries the message with a growing
 * pause. When the attempts are used up the job stays in the failed state and
 * can be read.
 */
export async function deliverMail(payload: MailJobPayload): Promise<MailSendResult> {
  return attempt(payload);
}

/**
 * The line that is written to the log when a message was triggered.
 *
 * The token is never in the line: only its short reference is, so the line
 * can be matched with the record of the message without being able to use
 * it. The line is built through the same redaction as a written message, so a
 * link can never leak a token into the log either.
 */
export function mailLogLine(kind: string, result: MailSendResult, to: string, token?: string): string {
  const reference = token ? tokenReference(token) : result.id.slice(0, 8);
  const verb =
    result.state === 'written-to-file'
      ? 'written'
      : result.state === 'queued'
        ? 'queued'
        : result.state === 'delivered'
          ? 'delivered'
          : 'not delivered';
  const transport = result.transport === 'file' ? 'mail:file' : 'mail';
  return redactTokens(`[${transport}] ${kind} message ${verb} for ${to} (reference ${reference})`);
}

/**
 * The words the API uses when a message was triggered.
 *
 * The text only depends on the transport and never on whether an account
 * exists, so the answer of the API can never be used to find out who has an
 * account.
 *
 * The words of a reset never say that a message was sent: the platform asks
 * for the message and the relay decides whether it leaves the system. The
 * answer says what the platform did and what the customer can do when
 * nothing arrives, so it is true whether the message left the system or not.
 */
export function mailNotice(kind: 'verification' | 'reset'): string {
  if (!mailEnabled()) {
    return kind === 'verification'
      ? 'Email delivery is not configured yet. Please contact support to confirm your email address.'
      : 'Email delivery is not configured yet. Please contact support to reset your password.';
  }
  return kind === 'verification'
    ? 'If an account exists for that address, a confirmation link is on its way.'
    : 'If an account exists for that address, a reset link has been asked for. If it does not arrive within a few minutes, contact support and we will reset your password by hand.';
}

/** The words the API uses right after an account was created. */
export function registrationNotice(): string {
  return mailEnabled()
    ? 'A confirmation link is on its way to your email address.'
    : 'Email delivery is not configured yet. Please contact support to confirm your email address.';
}

export interface MailDeliverySummary {
  transport: MailTransport;
  configured: boolean;
  counts: {
    queued: number;
    delivered: number;
    writtenToFile: number;
    failed: number;
  };
}

/**
 * What the health endpoint can show about the mail.
 *
 * It holds nothing but counters: no address, no body and no token.
 */
export function mailDeliverySummary(): MailDeliverySummary {
  const records = mailDeliveryRecords();
  const counts = { queued: 0, delivered: 0, writtenToFile: 0, failed: 0 };
  for (const record of records) {
    if (record.state === 'queued') counts.queued += 1;
    else if (record.state === 'delivered') counts.delivered += 1;
    else if (record.state === 'written-to-file') counts.writtenToFile += 1;
    else if (record.state === 'failed') counts.failed += 1;
  }
  return { transport: mailTransportName(), configured: mailEnabled(), counts };
}
