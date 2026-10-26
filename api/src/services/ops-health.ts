import { createHash, createHmac } from 'node:crypto';
import { appendFile, mkdir, readFile, statfs } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { connect as tlsConnect, type PeerCertificate, type TLSSocket } from 'node:tls';
import nodemailer from 'nodemailer';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { redis } from '../redis.js';
import { mailDeliverySummary, smtpTransportOptions } from '../lib/mailer.js';
import { certificateTargets as certificateTargetsOf, type CertificateTarget } from '../lib/ops-certificate-targets.js';
import {
  notifyOpsBackupFailed,
  notifyOpsCapacityCritical,
  notifyOpsDeliveryFailures,
  notifyOpsDnsCertificateFailure,
  notifyOpsIncident,
  notifyOpsMailcowUnhealthy,
  notifyOpsOffsiteBackupMissing,
  notifyOpsProvisioningStuck,
  notifyOpsRestoreVerificationFailed,
  notifyOpsSecurityChange,
  notifyOpsWebhookFailures,
} from './notifications.js';
import type { NotificationEventType } from './notification-events.js';

/**
 * The health of the platform itself.
 *
 * The platform sends the messages of the customers and takes their money, and
 * it does that on a machine that no one is watching. The checks here are the
 * ones that answer the questions an operator asks at night: is the mail
 * server there, did the backup run, is the copy that leaves the host there,
 * did the restore drill work, are the messages delivered, are the webhooks of
 * the payment provider failing, is a provisioning stuck, is the disk filling
 * up, does a certificate expire soon, is there an incident, did something
 * change that touches the security of the platform.
 *
 * Every check answers with a state and, when something is wrong, with one or
 * more findings. A finding carries the event that is published for it, so the
 * catalogue of the platform and the dashboard never drift apart.
 *
 * Two rules make the whole thing usable:
 *
 * - An alert is not sent every time the sweep runs. A finding that was
 *   already reported is repeated only after a growing pause, and a check
 *   that stays broken for a week does not send an email every five minutes.
 * - An alert does not only travel by mail. The mail server is one of the
 *   things that is watched, so an alarm about the mail server cannot be sent
 *   by the mail server. Every alert is written in a journal on the host and
 *   can be pushed to an address of the operator that has nothing to do with
 *   the mail of the platform.
 */

/** The checks of the platform. */
export type OpsCheckId =
  | 'provisioning'
  | 'webhooks'
  | 'delivery'
  | 'backup'
  | 'offsite'
  | 'restore'
  | 'mailcow'
  | 'capacity'
  | 'certificate'
  | 'incident'
  | 'security';

/** How much a finding matters. */
export type OpsSeverity = 'critical' | 'warning';

/** The state of a check. */
export type OpsState = 'ok' | 'warning' | 'critical';

/**
 * The state of a channel.
 *
 * A channel that is not there is not a channel that is broken, so it has a
 * state of its own: an operator has to be able to see that a channel is
 * switched off, and not only that it is broken.
 */
export type OpsChannelState = OpsState | 'off';

/** Something that is wrong, with the event that tells the operator about it. */
export interface OpsFinding {
  /** What makes this finding the same finding and not another one. */
  fingerprint: string;
  severity: OpsSeverity;
  title: string;
  detail: string;
  /** The event of the catalogue that carries the finding. */
  type: NotificationEventType;
  /** The identity of the thing the event is about. */
  subject: string;
  /** The facts of the event. */
  payload: Record<string, unknown>;
}

/** The answer of one check. */
export interface OpsCheckResult {
  id: OpsCheckId;
  title: string;
  state: OpsState;
  summary: string;
  detail: string;
  checkedAt: string;
  durationMs: number;
  findings: OpsFinding[];
}

/** An alert that was sent. */
export interface OpsAlert {
  at: string;
  check: OpsCheckId;
  fingerprint: string;
  severity: OpsSeverity;
  title: string;
  detail: string;
  channels: { journal: boolean; webhook: 'sent' | 'skipped' | 'failed'; discord: 'sent' | 'skipped' | 'failed' };
}

import {
  backoffMinutes,
  decideAlert,
  type AlertDecision,
  type OpsAlertState,
} from '../lib/ops-alert-policy.js';
import { notifyOpsRecovered } from './notifications.js';
import {
  discordWebhookUrl,
  sendDiscordAlert,
  toDiscordAlert,
  type DiscordSeverity,
} from './ops-alert-discord.js';

export { backoffMinutes, decideAlert };
export type { AlertDecision, OpsAlertState };

/** The key under which the state of a finding is remembered. */
function stateKey(check: string, fingerprint: string): string {
  const hash = createHash('sha1').update(fingerprint).digest('hex').slice(0, 16);
  return `ops:state:${check}:${hash}`;
}

/** The key under which the number of alarms of the hour is counted. */
const RATE_KEY = 'ops:alerts:hour';

/**
 * The journal of the alerts.
 *
 * The journal is the channel that does not depend on the mail server: it is
 * a file on the host, it is written before anything else is tried, and it is
 * read by the dashboard and by the operator over the ordinary web address of
 * the platform.
 */
function journalPath(): string {
  return env.opsAlertLog;
}

/**
 * Reads a receipt of the host.
 *
 * The receipts are written by the scripts of the backups, which run on the
 * host, and the platform reads them from a directory that both the host and
 * the containers see. A receipt that is not there is not an answer, so it is
 * reported as unknown and not as a failure.
 */
async function readReceipt(name: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(join(env.opsStatusDir, name), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The moment a receipt says it was written at. */
function receiptTime(receipt: Record<string, unknown> | null): Date | null {
  if (!receipt) return null;
  const raw = receipt.runAt ?? receipt.at ?? receipt.timestamp;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** How old a moment is, in hours. */
function ageHours(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return (now.getTime() - date.getTime()) / 3_600_000;
}

/* ------------------------------------------------------------------ checks */

/**
 * The provisioning of a service that never finished.
 *
 * A service that is being built for longer than it should be is a service
 * that a customer is waiting for. The check looks at the services that are
 * in the state of being built, and at how long they have been there.
 */
async function checkProvisioning(now: Date): Promise<OpsCheckResult> {
  const started = new Date(now.getTime() - env.OPS_STUCK_MINUTES * 60_000);
  const stuck = await prisma.instance.findMany({
    where: { status: 'PROVISIONING', updatedAt: { lt: started } },
    select: { id: true, name: true, updatedAt: true },
    orderBy: { updatedAt: 'asc' },
    take: 25,
  });

  const findings: OpsFinding[] = stuck.map((instance) => {
    const minutes = Math.round((now.getTime() - instance.updatedAt.getTime()) / 60_000);
    return {
      fingerprint: `provisioning:${instance.id}`,
      severity: 'critical' as const,
      title: `The provisioning of ${instance.name} is stuck`,
      detail: `The service has been building for ${minutes} minutes.`,
      type: 'ops.provisioning_stuck' as const,
      subject: instance.name,
      payload: { service: instance.name, minutes },
    };
  });

  return {
    id: 'provisioning',
    title: 'Provisioning',
    state: findings.length > 0 ? 'critical' : 'ok',
    summary:
      findings.length > 0
        ? `${findings.length} service(s) are stuck in the building.`
        : 'Every service that is being built is building.',
    detail: findings.length > 0 ? findings.map((f) => f.title).join(' · ') : '',
    checkedAt: now.toISOString(),
    durationMs: 0,
    findings,
  };
}

/**
 * The events of the payment provider that could not be processed.
 *
 * An event that fails stays in the ledger of the platform until it succeeds
 * or until an operator closes it. A provider that stops being answered is a
 * customer who paid and whose service is not running.
 */
async function checkWebhooks(now: Date): Promise<OpsCheckResult> {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const failed = await prisma.webhookEvent.count({
    where: { provider: 'stripe', status: { in: ['failed', 'deferred'] }, createdAt: { gte: since } },
  });

  const findings: OpsFinding[] =
    failed > 0
      ? [
          {
            fingerprint: 'webhooks:stripe',
            severity: 'critical',
            title: `${failed} webhook(s) of the payment provider failed`,
            detail: 'The events of the provider that failed are waiting for an operator.',
            type: 'ops.webhook_failures',
            subject: 'stripe',
            payload: { count: failed },
          },
        ]
      : [];

  return {
    id: 'webhooks',
    title: 'Payment webhooks',
    state: findings.length > 0 ? 'critical' : 'ok',
    summary: findings.length > 0 ? `${failed} event(s) of the provider are waiting.` : 'Every event of the provider was processed.',
    detail: '',
    checkedAt: now.toISOString(),
    durationMs: 0,
    findings,
  };
}

/**
 * The messages that could not be delivered.
 *
 * The mail of the platform is what the customers read. A message that failed
 * four times and stays in the failed queue is a customer who waits for a
 * password that never arrives.
 */
async function checkDelivery(): Promise<OpsCheckResult> {
  const summary = mailDeliverySummary();
  const failed = summary.counts.failed;

  const findings: OpsFinding[] =
    failed > 0
      ? [
          {
            fingerprint: 'delivery:failed',
            severity: 'warning',
            title: `${failed} message(s) could not be delivered`,
            detail: 'The messages that failed four times are waiting for an operator.',
            type: 'ops.delivery_failures',
            subject: 'mail',
            payload: { count: failed },
          },
        ]
      : [];

  return {
    id: 'delivery',
    title: 'Delivery of the messages',
    state: findings.length > 0 ? 'warning' : 'ok',
    summary: findings.length > 0 ? `${failed} message(s) are in the failed queue.` : 'Every message was delivered or is on its way.',
    detail: `delivered ${summary.counts.delivered} · queued ${summary.counts.queued} · failed ${summary.counts.failed} · transport ${summary.transport}`,
    checkedAt: new Date().toISOString(),
    durationMs: 0,
    findings,
  };
}

/**
 * The backup of the platform.
 *
 * The host uses RAID 0, so a copy that stays on the host is not a backup.
 * The receipt is written by the script of the backup, and the platform reads
 * it. A backup that is too old is a backup that does not exist.
 */
async function checkBackup(now: Date): Promise<OpsCheckResult> {
  const receipt = await readReceipt('backup.json');
  const at = receiptTime(receipt);
  const age = ageHours(at, now);
  const result = typeof receipt?.result === 'string' ? receipt.result : null;
  const reason = typeof receipt?.reason === 'string' ? receipt.reason : '';
  const target = typeof receipt?.archive === 'string' ? receipt.archive : 'the local backup';

  const findings: OpsFinding[] = [];

  if (result && result !== 'success') {
    findings.push({
      fingerprint: 'backup:failed',
      severity: 'critical',
      title: `The backup failed: ${target}`,
      detail: reason || 'The backup of the night did not finish.',
      type: 'ops.backup_failed',
      subject: target,
      payload: { target, reason: reason || 'the backup did not finish' },
    });
  } else if (age !== null && age > env.OPS_BACKUP_MAX_AGE_HOURS) {
    findings.push({
      fingerprint: 'backup:stale',
      severity: 'critical',
      title: 'The backup is too old',
      detail: `The newest backup is ${Math.round(age)} hours old.`,
      type: 'ops.backup_failed',
      subject: target,
      payload: { target, reason: `the newest backup is ${Math.round(age)} hours old` },
    });
  }

  return {
    id: 'backup',
    title: 'Backup',
    state: findings.length > 0 ? 'critical' : 'ok',
    summary: findings.length > 0
      ? findings[0].title
      : age !== null
        ? `The last backup is ${Math.round(age)} hours old.`
        : 'No receipt of a backup has been read yet.',
    detail: at ? `the last backup ran at ${at.toISOString()}` : 'the scripts of the backup write no receipt yet',
    checkedAt: now.toISOString(),
    durationMs: 0,
    findings,
  };
}

/**
 * The copy of the backup that leaves the host.
 *
 * It is the only copy that survives the loss of the machine, and it is the
 * one that is written from another provider, so it is the one that matters
 * most and the one that is checked apart.
 */
async function checkOffsite(now: Date): Promise<OpsCheckResult> {
  const receipt = await readReceipt('offsite.json');
  const at = receiptTime(receipt);
  const age = ageHours(at, now);
  const result = typeof receipt?.result === 'string' ? receipt.result : null;
  const verified = receipt?.verified === true;
  const target = typeof receipt?.target === 'string' ? receipt.target : 'the off-site target';

  const findings: OpsFinding[] = [];

  if (result && result !== 'success') {
    findings.push({
      fingerprint: 'offsite:failed',
      severity: 'critical',
      title: 'The copy of the backup is missing',
      detail: typeof receipt?.reason === 'string' ? receipt.reason : 'The copy that leaves the host did not succeed.',
      type: 'ops.offsite_backup_missing',
      subject: target,
      payload: { target },
    });
  } else if (!verified && receipt) {
    findings.push({
      fingerprint: 'offsite:unverified',
      severity: 'warning',
      title: 'The copy of the backup was not verified',
      detail: 'The copy that leaves the host was not read back on the target.',
      type: 'ops.offsite_backup_missing',
      subject: target,
      payload: { target },
    });
  } else if (age !== null && age > env.OPS_OFFSITE_MAX_AGE_HOURS) {
    findings.push({
      fingerprint: 'offsite:stale',
      severity: 'warning',
      title: 'The copy of the backup is too old',
      detail: `The newest copy that leaves the host is ${Math.round(age)} hours old.`,
      type: 'ops.offsite_backup_missing',
      subject: target,
      payload: { target },
    });
  }

  return {
    id: 'offsite',
    title: 'Copy off the host',
    state: findings.length > 0 ? (findings[0].severity === 'critical' ? 'critical' : 'warning') : 'ok',
    summary: findings.length > 0
      ? findings[0].title
      : age !== null
        ? `The last copy that left the host is ${Math.round(age)} hours old.`
        : 'No receipt of a copy that leaves the host has been read yet.',
    detail: at ? `the copy was made at ${at.toISOString()}` : 'the scripts of the backup write no receipt yet',
    checkedAt: now.toISOString(),
    durationMs: 0,
    findings,
  };
}

/**
 * The drill of the restore.
 *
 * A backup that was never restored is a hope and not a backup. The drill
 * writes what it found, and a drill that failed is an alarm.
 */
async function checkRestore(): Promise<OpsCheckResult> {
  const receipt = await readReceipt('restore-drill.json');
  const result = typeof receipt?.result === 'string' ? receipt.result : null;
  const source = typeof receipt?.source === 'string' ? receipt.source : 'the backup';
  const reason = typeof receipt?.reason === 'string' ? receipt.reason : '';
  const checks = Array.isArray(receipt?.checks) ? (receipt?.checks as unknown[]) : [];

  const findings: OpsFinding[] =
    result && result !== 'success'
      ? [
          {
            fingerprint: 'restore:failed',
            severity: 'critical',
            title: 'The restore drill failed',
            detail: reason || 'The copy could not be restored.',
            type: 'ops.restore_verification_failed',
            subject: source,
            payload: { target: source, reason: reason || 'the copy could not be restored' },
          },
        ]
      : [];

  return {
    id: 'restore',
    title: 'Restore drill',
    state: findings.length > 0 ? 'critical' : 'ok',
    summary: findings.length > 0
      ? findings[0].title
      : result === 'success'
        ? 'The last drill restored the copy.'
        : 'No drill has been recorded yet.',
    detail: checks.length > 0 ? `${checks.length} check(s) of the drill` : '',
    checkedAt: new Date().toISOString(),
    durationMs: 0,
    findings,
  };
}

/**
 * The mail server.
 *
 * The check asks the relay the same question the platform asks it when it
 * sends a message: can you take a session from me? The certificate of the
 * relay is verified against the certificate the operator wrote down, and the
 * verification is never turned off.
 */
async function checkMailcow(): Promise<OpsCheckResult> {
  const now = new Date();
  const url = env.SMTP_URL.trim();
  if (!url) {
    return {
      id: 'mailcow',
      title: 'Mail server',
      state: 'warning',
      summary: 'No relay is configured.',
      detail: 'SMTP_URL is not set, so the platform cannot send anything.',
      checkedAt: now.toISOString(),
      durationMs: 0,
      findings: [
        {
          fingerprint: 'mailcow:not-configured',
          severity: 'warning',
          title: 'No mail relay is configured',
          detail: 'The platform cannot send a message.',
          type: 'ops.mailcow_unhealthy',
          subject: 'smtp',
          payload: { reason: 'no relay is configured' },
        },
      ],
    };
  }

  let reason = '';
  try {
    const options = smtpTransportOptions(url, await relayCertificate());
    const transport = nodemailer.createTransport(options);
    await transport.verify();
    transport.close();
  } catch (error) {
    reason = (error as Error).message.slice(0, 300);
  }

  const findings: OpsFinding[] = reason
    ? [
        {
          fingerprint: 'mailcow:unreachable',
          severity: 'critical',
          title: 'The mail server did not answer',
          detail: reason,
          type: 'ops.mailcow_unhealthy',
          subject: 'smtp',
          payload: { reason },
        },
      ]
    : [];

  return {
    id: 'mailcow',
    title: 'Mail server',
    state: findings.length > 0 ? 'critical' : 'ok',
    summary: findings.length > 0 ? 'The relay did not take the session.' : 'The relay took the session.',
    detail: '',
    checkedAt: now.toISOString(),
    durationMs: 0,
    findings,
  };
}

/**
 * The certificate of the relay, as the operator wrote it down.
 */
async function relayCertificate(): Promise<string | undefined> {
  const file = env.SMTP_CA_FILE.trim();
  if (!file) return undefined;
  try {
    return await readFile(file, 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * The room that is left on the machine.
 *
 * A disk that is full takes PostgreSQL down, and PostgreSQL down takes the
 * platform down. The check reads the disk and the memory of the host, and
 * the number of connections of the database.
 */
async function checkCapacity(now: Date): Promise<OpsCheckResult> {
  const findings: OpsFinding[] = [];
  const parts: string[] = [];

  try {
    const info = await statfs('/');
    const total = Number(info.blocks) * Number(info.bsize);
    const free = Number(info.bfree) * Number(info.bsize);
    const usedPercent = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
    parts.push(`disk ${usedPercent}%`);
    if (usedPercent >= env.OPS_DISK_MAX_PERCENT) {
      findings.push({
        fingerprint: 'capacity:disk',
        severity: 'critical',
        title: 'The disk of the machine is filling up',
        detail: `${usedPercent}% of the disk is used.`,
        type: 'ops.capacity_critical',
        subject: 'disk',
        payload: { resource: 'disk', value: `${usedPercent}%` },
      });
    }
  } catch (error) {
    parts.push(`disk unknown (${(error as Error).message.slice(0, 80)})`);
  }

  try {
    const memory = await readFile('/proc/meminfo', 'utf-8');
    const total = Number(/MemTotal:\s+(\d+)/.exec(memory)?.[1] ?? 0) * 1024;
    const available = Number(/MemAvailable:\s+(\d+)/.exec(memory)?.[1] ?? 0) * 1024;
    const usedPercent = total > 0 ? Math.round(((total - available) / total) * 100) : 0;
    parts.push(`memory ${usedPercent}%`);
    if (usedPercent >= env.OPS_MEMORY_MAX_PERCENT) {
      findings.push({
        fingerprint: 'capacity:memory',
        severity: 'warning',
        title: 'The memory of the machine is running out',
        detail: `${usedPercent}% of the memory is used.`,
        type: 'ops.capacity_critical',
        subject: 'memory',
        payload: { resource: 'memory', value: `${usedPercent}%` },
      });
    }
  } catch {
    parts.push('memory unknown');
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM pg_stat_activity WHERE datname = current_database();
    `;
    const connections = Number(rows[0]?.count ?? 0);
    parts.push(`connections ${connections}`);
  } catch {
    parts.push('connections unknown');
  }

  return {
    id: 'capacity',
    title: 'Capacity',
    state: findings.length > 0 ? (findings[0].severity === 'critical' ? 'critical' : 'warning') : 'ok',
    summary: findings.length > 0 ? findings[0].title : 'The machine has room.',
    detail: parts.join(' · '),
    checkedAt: now.toISOString(),
    durationMs: 0,
    findings,
  };
}

/**
 * The name of the holder of a certificate.
 *
 * The type of the subject of a certificate says that the name may be a list,
 * and a list has no place in a sentence.
 */
function commonName(certificate: PeerCertificate): string | null {
  const name = certificate.subject?.CN;
  if (Array.isArray(name)) return name[0] ?? null;
  return name ?? null;
}

/**
 * The addresses whose certificate belongs to the platform.
 *
 * The relay of the mail is in the list since its name is published in the DNS
 * and its certificate is signed by an authority the machine trusts. A relay
 * that cannot be verified is reported by the check of the mail server, which
 * verifies it against the certificate of the operator.
 */
function certificateTargets(): CertificateTarget[] {
  return certificateTargetsOf([
    ['the public address', env.APP_PUBLIC_URL],
    ['the control panel', env.PTERODACTYL_URL],
    ['the mail server', env.MAILCOW_API_URL],
  ]);
}

/**
 * Reads the certificate of an address and says how many days are left.
 *
 * The verification of the certificate is never turned off. An address whose
 * certificate cannot be verified is an address that cannot be checked, and
 * the check says so instead of pretending that it is fine.
 */
async function readCertificate(target: CertificateTarget): Promise<{
  ok: boolean;
  daysLeft?: number;
  subject?: string;
  reason?: string;
}> {
  return new Promise((resolve) => {
    let socket: TLSSocket | null = null;
    const done = (value: { ok: boolean; daysLeft?: number; subject?: string; reason?: string }) => {
      try {
        socket?.destroy();
      } catch {
        // The socket is already gone.
      }
      resolve(value);
    };
    const timer = setTimeout(() => done({ ok: false, reason: 'the address did not answer in time' }), 8000);
    try {
      socket = tlsConnect({
        host: target.host,
        port: target.port,
        servername: target.host,
        ca: target.ca,
        rejectUnauthorized: true,
      });
      socket.once('secureConnect', () => {
        clearTimeout(timer);
        const certificate = socket?.getPeerCertificate() as PeerCertificate | undefined;
        if (!certificate || !certificate.valid_to) {
          done({ ok: false, reason: 'the certificate carries no date' });
          return;
        }
        const validTo = new Date(certificate.valid_to);
        const daysLeft = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);
        done({
          ok: true,
          daysLeft,
          subject: commonName(certificate) ?? target.host,
        });
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        done({ ok: false, reason: (error as Error).message.slice(0, 200) });
      });
    } catch (error) {
      clearTimeout(timer);
      done({ ok: false, reason: (error as Error).message.slice(0, 200) });
    }
  });
}

/**
 * The certificates of the addresses of the platform.
 */
async function checkCertificates(now: Date): Promise<OpsCheckResult> {
  const targets = certificateTargets();
  const findings: OpsFinding[] = [];
  const parts: string[] = [];

  for (const target of targets) {
    const result = await readCertificate(target);
    if (!result.ok) {
      parts.push(`${target.label}: unknown (${result.reason ?? 'no answer'})`);
      continue;
    }
    const days = result.daysLeft ?? 0;
    parts.push(`${target.label}: ${days} day(s) left`);
    if (days < env.OPS_CERT_MIN_DAYS) {
      findings.push({
        fingerprint: `certificate:${target.host}`,
        severity: days < 7 ? 'critical' : 'warning',
        title: `The certificate of ${target.label} expires in ${days} day(s)`,
        detail: `The certificate of ${result.subject ?? target.host} is valid until it expires in ${days} day(s).`,
        type: 'ops.dns_certificate_failure',
        subject: target.host,
        payload: {
          subject: target.host,
          reason: `the certificate expires in ${days} day(s)`,
        },
      });
    }
  }

  return {
    id: 'certificate',
    title: 'Certificates',
    state: findings.length > 0 ? (findings[0].severity === 'critical' ? 'critical' : 'warning') : 'ok',
    summary:
      findings.length > 0
        ? findings[0].title
        : targets.length === 0
          ? 'No address with a certificate is configured.'
          : 'Every certificate of the platform has room.',
    detail: parts.join(' · '),
    checkedAt: now.toISOString(),
    durationMs: 0,
    findings,
  };
}

/**
 * An incident that the operator declared.
 *
 * The incident is written in a file by the operator, and the platform turns
 * it into an alarm. It is the one thing an operator can say to the platform
 * without the platform having to find the problem by itself.
 */
async function checkIncident(now: Date): Promise<OpsCheckResult> {
  const receipt = await readReceipt('incident.json');
  const until = receipt && typeof receipt.until === 'string' ? new Date(receipt.until) : null;
  const message = receipt && typeof receipt.message === 'string' ? receipt.message : '';
  const active = Boolean(receipt && message) && (!until || Number.isNaN(until.getTime()) || until.getTime() > now.getTime());

  const findings: OpsFinding[] = active
    ? [
        {
          fingerprint: 'incident:active',
          severity: 'critical',
          title: 'There is an incident',
          detail: message,
          type: 'ops.incident',
          subject: 'platform',
          payload: { message },
        },
      ]
    : [];

  return {
    id: 'incident',
    title: 'Incident',
    state: active ? 'critical' : 'ok',
    summary: active ? message : 'There is no incident.',
    detail: '',
    checkedAt: now.toISOString(),
    durationMs: 0,
    findings,
  };
}

/**
 * The changes that touch the security of the platform.
 *
 * A new administrator, a changed set of rights, a new key of a customer and
 * a changed setting are the four changes that matter. The check looks at the
 * journal of the platform and says what changed in the last hour.
 */
const SECURITY_ACTIONS = [
  'auth.admin_enrolled',
  'auth.password_reset',
  'staff.role_updated',
  'staff.permissions_updated',
  'customer.panel_credential_stored',
  'settings.updated',
];

/**
 * The changes of the last hour that touch the security of the platform.
 */
async function checkSecurity(now: Date): Promise<OpsCheckResult> {
  const since = new Date(now.getTime() - 3_600_000);
  const entries = await prisma.auditLog.findMany({
    where: { action: { in: SECURITY_ACTIONS }, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { action: true, actorEmail: true, createdAt: true },
  });

  const findings: OpsFinding[] = entries.map((entry) => ({
    fingerprint: `security:${entry.action}:${entry.actorEmail ?? 'system'}:${entry.createdAt.toISOString()}`,
    severity: 'warning' as const,
    title: `The security of the platform changed: ${entry.action}`,
    detail: `${entry.actorEmail ?? 'the system'} made the change at ${entry.createdAt.toISOString()}.`,
    type: 'ops.security_change' as const,
    subject: entry.action,
    payload: {
      subject: entry.action,
      detail: `${entry.actorEmail ?? 'the system'} at ${entry.createdAt.toISOString()}`,
    },
  }));

  return {
    id: 'security',
    title: 'Security',
    state: findings.length > 0 ? 'warning' : 'ok',
    summary: findings.length > 0 ? `${findings.length} change(s) in the last hour.` : 'Nothing that touches the security changed.',
    detail: entries.map((entry) => `${entry.action} (${entry.actorEmail ?? 'system'})`).join(' · '),
    checkedAt: now.toISOString(),
    durationMs: 0,
    findings,
  };
}

/* ------------------------------------------------------------------ sweep */

/** The checks, in the order they are run. */
const CHECKS: Array<{ id: OpsCheckId; run: (now: Date) => Promise<OpsCheckResult> }> = [
  { id: 'provisioning', run: checkProvisioning },
  { id: 'webhooks', run: checkWebhooks },
  { id: 'delivery', run: checkDelivery },
  { id: 'backup', run: checkBackup },
  { id: 'offsite', run: checkOffsite },
  { id: 'restore', run: checkRestore },
  { id: 'mailcow', run: checkMailcow },
  { id: 'capacity', run: checkCapacity },
  { id: 'certificate', run: checkCertificates },
  { id: 'incident', run: checkIncident },
  { id: 'security', run: checkSecurity },
];

/**
 * Runs every check and says what the state of the platform is.
 *
 * The checks are independent of each other, and one of them that fails does
 * not keep the others from running: an operator wants to know everything that
 * is wrong at once, not the first thing that broke.
 */
export async function runOpsChecks(now: Date = new Date()): Promise<OpsCheckResult[]> {
  const results: OpsCheckResult[] = [];
  for (const check of CHECKS) {
    const started = Date.now();
    try {
      const result = await check.run(now);
      result.durationMs = Date.now() - started;
      results.push(result);
    } catch (error) {
      results.push({
        id: check.id,
        title: check.id,
        state: 'warning',
        summary: 'The check could not be run.',
        detail: (error as Error).message.slice(0, 300),
        checkedAt: now.toISOString(),
        durationMs: Date.now() - started,
        findings: [],
      });
    }
  }
  return results;
}

/** The state of the platform, with the summary of the checks. */
export interface OpsHealthSnapshot {
  overall: OpsState;
  checkedAt: string;
  summary: { total: number; ok: number; warning: number; critical: number };
  checks: OpsCheckResult[];
}

/**
 * The state of the platform.
 *
 * The state of the platform is the worst state of its checks. A platform
 * with a warning is not in an outage, and a platform with a critical check
 * is not serving.
 */
export async function opsHealthSnapshot(): Promise<OpsHealthSnapshot> {
  const checks = await runOpsChecks();
  const summary = {
    total: checks.length,
    ok: checks.filter((c) => c.state === 'ok').length,
    warning: checks.filter((c) => c.state === 'warning').length,
    critical: checks.filter((c) => c.state === 'critical').length,
  };
  const overall: OpsState = summary.critical > 0 ? 'critical' : summary.warning > 0 ? 'warning' : 'ok';
  return { overall, checkedAt: new Date().toISOString(), summary, checks };
}

/**
 * The state that is remembered about a finding.
 */
async function readState(check: OpsCheckId, fingerprint: string): Promise<OpsAlertState | null> {
  try {
    const raw = await redis.get(stateKey(check, fingerprint));
    if (!raw) return null;
    return JSON.parse(raw) as OpsAlertState;
  } catch {
    return null;
  }
}

/**
 * Remembers the state of a finding.
 *
 * The state is kept for a month: a finding that was closed a year ago does
 * not have to be remembered, and a platform that was down for a week comes
 * back with a clean memory.
 */
async function writeState(state: OpsAlertState): Promise<void> {
  try {
    await redis.set(stateKey(state.check, state.fingerprint), JSON.stringify(state), 'EX', 30 * 24 * 3600);
  } catch (error) {
    console.error('[ops] the state of a finding could not be remembered', (error as Error).message);
  }
}

/**
 * The number of alarms that were sent in the last hour.
 *
 * A platform that breaks in many places at once must not turn into a flood
 * of alarms. The counter is kept for an hour, so the cap is really the cap
 * of an hour and not the cap of a run.
 */
async function claimAlertSlot(): Promise<boolean> {
  try {
    const count = await redis.incr(RATE_KEY);
    if (count === 1) await redis.expire(RATE_KEY, 3600);
    return count <= env.OPS_ALERT_MAX_PER_HOUR;
  } catch {
    // Without the counter the alarms are sent anyway: an operator who hears
    // about a problem too often is better off than an operator who hears
    // about nothing.
    return true;
  }
}

/**
 * The alarms of the platform, as they were sent.
 *
 * The journal is read from the end, so the newest alarm is the first one.
 */
export async function listOpsAlerts(limit = 50): Promise<{ alerts: OpsAlert[]; states: OpsAlertState[] }> {
  const alerts: OpsAlert[] = [];
  try {
    const raw = await readFile(journalPath(), 'utf-8');
    const lines = raw.split('\n').filter((line) => line.trim() !== '');
    for (const line of lines.slice(-limit).reverse()) {
      try {
        alerts.push(JSON.parse(line) as OpsAlert);
      } catch {
        // A line that is not a record is skipped: the journal is written by
        // the platform and a broken line must not hide the other ones.
      }
    }
  } catch {
    // No journal yet.
  }

  const states: OpsAlertState[] = [];
  try {
    const keys = await redis.keys('ops:state:*');
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      try {
        states.push(JSON.parse(raw) as OpsAlertState);
      } catch {
        // A state that cannot be read is not a state.
      }
    }
  } catch {
    // No cache.
  }
  states.sort((a, b) => (a.since < b.since ? 1 : -1));

  return { alerts, states };
}

/**
 * Says where a channel lives, without saying the secret of the channel.
 *
 * The address of a webhook carries the token that lets anybody write in the
 * channel of the operator. The dashboard shows the host of the address and
 * nothing else, so the address cannot be read from a screen that is not the
 * one of the operator.
 */
function describeAddress(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'the configured address';
  }
}

/**
 * The channels an alarm can travel by.
 *
 * The list is shown to the operator, because the question "will I hear about
 * it if the mail server is down?" has to have an answer that does not depend
 * on the mail server.
 */
export async function opsChannels(): Promise<{
  channels: Array<{ id: string; name: string; state: OpsChannelState; detail: string }>;
}> {
  const channels: Array<{ id: string; name: string; state: OpsChannelState; detail: string }> = [];

  let journalState: OpsState = 'ok';
  let journalDetail = `the journal of the alerts is written in ${journalPath()}`;
  try {
    await mkdir(dirname(journalPath()), { recursive: true });
    await appendFile(journalPath(), '', { flag: 'a' });
  } catch (error) {
    journalState = 'critical';
    journalDetail = `the journal cannot be written: ${(error as Error).message.slice(0, 160)}`;
  }
  channels.push({ id: 'journal', name: 'Journal on the host', state: journalState, detail: journalDetail });

  const webhook = env.OPS_ALERT_WEBHOOK_URL.trim();
  channels.push(
    webhook
      ? {
          id: 'webhook',
          name: 'Webhook of the operator',
          state: 'ok',
          // The address of the webhook carries the secret that lets anybody
          // write in the channel of the operator, so only its host is shown.
          detail: `the alarms are pushed to ${describeAddress(webhook)}`,
        }
      : {
          id: 'webhook',
          name: 'Webhook of the operator',
          state: 'off',
          detail:
            'no address is configured, so an alarm can only leave the host by the mail of the platform',
        },
  );

  const discord = discordWebhookUrl();
  channels.push(
    discord
      ? {
          id: 'discord',
          name: 'Discord channel of the operator',
          state: 'ok',
          // The address of the webhook carries the token of the channel, so
          // only its host is shown, never the address itself.
          detail: `the alarms are pushed to ${describeAddress(discord)}`,
        }
      : {
          id: 'discord',
          name: 'Discord channel of the operator',
          state: 'off',
          detail:
            'no Discord channel is configured, so an alarm leaves the host by the journal, by the webhook and by the mail of the platform',
        },
  );

  channels.push(
    env.mailEnabled
      ? {
          id: 'email',
          name: 'Mail of the platform',
          state: 'ok',
          detail: `the alarms are also sent to ${env.MAIL_OPERATOR_EMAIL || env.MAIL_SUPPORT_EMAIL}`,
        }
      : {
          id: 'email',
          name: 'Mail of the platform',
          state: 'off',
          detail: 'no relay is configured',
        },
  );

  return { channels };
}

/**
 * Writes an alarm in the journal of the alerts.
 *
 * The journal is written before anything else is tried, because it is the
 * channel that does not need anything else to work.
 */
async function writeJournal(alert: OpsAlert): Promise<boolean> {
  try {
    await mkdir(dirname(journalPath()), { recursive: true });
    await appendFile(journalPath(), `${JSON.stringify(alert)}\n`, { mode: 0o640 });
    return true;
  } catch (error) {
    console.error('[ops] the alarm could not be written in the journal', (error as Error).message);
    return false;
  }
}

/**
 * Pushes an alarm to the address of the operator.
 *
 * The address is a webhook of the operator: a chat room, a service of
 * incidents, a script of the operator. It has nothing to do with the mail of
 * the platform, so an alarm about the mail server can still leave the host.
 * The body is signed, so the operator can tell that it comes from the
 * platform and not from somewhere else.
 */
async function pushWebhook(alert: OpsAlert): Promise<'sent' | 'skipped' | 'failed'> {
  const url = env.OPS_ALERT_WEBHOOK_URL.trim();
  if (!url) return 'skipped';
  const body = JSON.stringify(alert);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'blipmade-ops/1',
    'x-blipmade-event': 'ops.alert',
  };
  const secret = env.OPS_ALERT_WEBHOOK_SECRET.trim();
  if (secret) {
    headers['x-blipmade-signature'] = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) return 'sent';
      console.error(`[ops] the webhook of the operator answered ${response.status}`);
    } catch (error) {
      console.error('[ops] the webhook of the operator could not be reached', (error as Error).message);
    }
  }
  return 'failed';
}

/**
 * Pushes the alarm to the Discord channel of the operator.
 *
 * Discord does not take the body of the platform, so the channel has an
 * adapter of its own. The journal of the alarms and the message by mail are
 * not touched: this is a channel more, and a channel that is down must not
 * stop the sweep.
 */
async function pushDiscord(alert: OpsAlert, severity: DiscordSeverity = alert.severity): Promise<'sent' | 'skipped' | 'failed'> {
  const delivery = await sendDiscordAlert(
    toDiscordAlert({
      severity,
      title: alert.title,
      detail: alert.detail,
      check: alert.check,
      fingerprint: alert.fingerprint,
      occurredAt: new Date(alert.at),
      dashboardUrl: opsDashboardUrl(),
    }),
  );
  return delivery.status;
}

/**
 * The page of the operations that the operator opens.
 *
 * The link is in the message of Discord, so the operator does not have to
 * look for the page. The address of the platform is taken from the
 * environment, and it is never the address of the private network.
 */
export function opsDashboardUrl(): string {
  return `${env.publicWebUrl}/admin/ops`;
}

/**
 * Publishes the event of a finding.
 *
 * The event carries the alarm into the catalogue of the platform, so the
 * back office shows it like any other message of the operator.
 */
async function publishFinding(finding: OpsFinding, now: Date): Promise<void> {
  const occurrence = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  switch (finding.type) {
    case 'ops.provisioning_stuck':
      await notifyOpsProvisioningStuck(finding.payload as { service: string; minutes: number }, occurrence);
      return;
    case 'ops.webhook_failures':
      await notifyOpsWebhookFailures(finding.payload as { count: number }, occurrence);
      return;
    case 'ops.delivery_failures':
      await notifyOpsDeliveryFailures(finding.payload as { count: number }, occurrence);
      return;
    case 'ops.backup_failed':
      await notifyOpsBackupFailed(finding.payload as { target: string; reason: string }, occurrence);
      return;
    case 'ops.offsite_backup_missing':
      await notifyOpsOffsiteBackupMissing(finding.payload as { target: string }, occurrence);
      return;
    case 'ops.restore_verification_failed':
      await notifyOpsRestoreVerificationFailed(finding.payload as { target: string; reason: string }, occurrence);
      return;
    case 'ops.mailcow_unhealthy':
      await notifyOpsMailcowUnhealthy(finding.payload as { reason: string }, occurrence);
      return;
    case 'ops.incident':
      await notifyOpsIncident(finding.payload as { message: string }, occurrence);
      return;
    case 'ops.capacity_critical':
      await notifyOpsCapacityCritical(finding.payload as { resource: string; value: string }, occurrence);
      return;
    case 'ops.dns_certificate_failure':
      await notifyOpsDnsCertificateFailure(finding.payload as { subject: string; reason: string }, occurrence);
      return;
    case 'ops.security_change':
      await notifyOpsSecurityChange(finding.payload as { subject: string; detail: string }, occurrence);
      return;
    default:
      console.error(`[ops] the event ${finding.type} has no publisher`);
  }
}

/**
 * Marks the findings that are not there any more as resolved.
 *
 * A finding that is not there any more is not forgotten: it is marked as
 * resolved, so that the same finding, when it comes back, is reported again
 * instead of being held back as if the operator already knew about it.
 *
 * The function returns how many findings were resolved.
 */
async function resolveMissingFindings(check: OpsCheckId, findings: OpsFinding[]): Promise<number> {
  const present = new Set(findings.map((finding) => finding.fingerprint));
  let resolved = 0;
  try {
    const keys = await redis.keys(`ops:state:${check}:*`);
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      let state: OpsAlertState;
      try {
        state = JSON.parse(raw) as OpsAlertState;
      } catch {
        continue;
      }
      if (state.status !== 'firing') continue;
      if (present.has(state.fingerprint)) continue;
      // The problem is over, and the operator is told. A finding that was
      // reported at least once was a problem somebody had to know about, and
      // the end of it is a thing the operator has to know about as well: a
      // platform that only talks about what is broken teaches the operator to
      // wait for the next message instead of reading the ones it gets.
      if (state.sends > 0) {
        await notifyOpsRecovered({
          check,
          title: state.title ?? state.fingerprint,
          detail: state.detail ?? '',
          occurrence: `${check}:${state.fingerprint}`,
        });
        // The end of a problem is a message of its own in the Discord
        // channel too: an operator who only sees the alarms of what is
        // broken cannot tell that the work is over.
        await pushDiscord(
          {
            at: new Date().toISOString(),
            check,
            fingerprint: state.fingerprint,
            severity: 'warning',
            title: state.title ?? state.fingerprint,
            detail: state.detail ?? '',
            channels: { journal: false, webhook: 'skipped', discord: 'skipped' },
          },
          'recovery',
        );
      }
      await writeState({ ...state, status: 'ok' });
      resolved += 1;
    }
  } catch (error) {
    console.error('[ops] the findings that were resolved could not be marked', (error as Error).message);
  }
  return resolved;
}

/**
 * The result of a sweep.
 */
export interface OpsSweepResult {
  checkedAt: string;
  checks: number;
  findings: number;
  sent: number;
  suppressed: number;
  recovered: number;
}

/**
 * Runs every check and sends the alarms that are due.
 *
 * The sweep is the only thing that sends an alarm, so an alarm is sent once
 * and only once for a finding, and the pause between two alarms of the same
 * finding grows with every one of them.
 */
export async function runOpsSweep(now: Date = new Date()): Promise<OpsSweepResult> {
  const checks = await runOpsChecks(now);
  let findings = 0;
  let sent = 0;
  let suppressed = 0;
  let recovered = 0;

  for (const check of checks) {
    // The findings that are not there any more are marked as resolved, so
    // that the same one can be reported again when it comes back.
    recovered += await resolveMissingFindings(check.id, check.findings);

    for (const finding of check.findings) {
      findings += 1;
      const state = await readState(check.id, finding.fingerprint);
      const decision = decideAlert(state, finding.fingerprint, now, finding.severity);

      if (decision.decision === 'suppress') {
        suppressed += 1;
        continue;
      }

      if (decision.decision === 'notify' || decision.decision === 'repeat') {
        const allowed = await claimAlertSlot();
        if (!allowed) {
          suppressed += 1;
          console.error('[ops] an alarm was held back: the limit of the hour was reached');
          continue;
        }
        await publishFinding(finding, now);
        const alert: OpsAlert = {
          at: now.toISOString(),
          check: check.id,
          fingerprint: finding.fingerprint,
          // A finding that has been reported again and again is a critical
          // one, and the alarm says so.
          severity: decision.severity,
          title: finding.title,
          detail: finding.detail,
          channels: { journal: false, webhook: 'skipped', discord: 'skipped' },
        };
        alert.channels.journal = await writeJournal(alert);
        alert.channels.webhook = await pushWebhook(alert);
        alert.channels.discord = await pushDiscord(alert);
        sent += 1;
        await writeState({
          check: check.id,
          fingerprint: finding.fingerprint,
          status: 'firing',
          since: state?.status === 'firing' ? state.since : now.toISOString(),
          lastSentAt: now.toISOString(),
          sends: (state?.status === 'firing' ? state.sends : 0) + 1,
          acknowledgedAt: state?.status === 'firing' ? state.acknowledgedAt : null,
          // The name of the finding is kept, so the message that says the
          // problem is over can name the problem.
          severity: decision.severity,
          title: finding.title,
          detail: finding.detail,
        });
      }
    }
  }

  return { checkedAt: now.toISOString(), checks: checks.length, findings, sent, suppressed, recovered };
}

/**
 * Says that an operator has taken a finding in hand.
 *
 * The alarm is not sent again until the finding changes, so an operator who
 * is working on a problem is not buried under it.
 */
export async function acknowledgeOpsFinding(check: OpsCheckId, fingerprint?: string): Promise<boolean> {
  const states = await listOpsAlerts(1);
  let found = false;
  for (const state of states.states) {
    if (state.check !== check) continue;
    if (fingerprint && state.fingerprint !== fingerprint) continue;
    await writeState({ ...state, acknowledgedAt: new Date().toISOString() });
    found = true;
  }
  if (!found && fingerprint) {
    // The state of one finding may be read even when the list of the states
    // is empty, for example right after a restart of the cache.
    const state = await readState(check, fingerprint);
    if (state) {
      await writeState({ ...state, acknowledgedAt: new Date().toISOString() });
      return true;
    }
  }
  return found;
}
