import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { randomToken } from '../lib/tokens.js';
import * as gateway from './gateway.js';
import * as mailcow from './mailcow.js';
import { notifyDomainDnsIncomplete, notifyMailboxCreated, notifyMailboxProvisioningFailed } from './notifications.js';
import { checkMailDns, mailDnsRecords, type MailDnsStatus } from './mail-dns.js';

/**
 * The service of the hosted mail.
 *
 * The mail system holds the domains, the mailboxes and the aliases. The
 * platform holds the truth about the customer: which domains belong to them,
 * how many mailboxes the plan allows, and what every change did.
 *
 * Two rules hold everywhere in this module:
 *
 *   - every read and every change is bound to the customer that asked for it,
 *     so one customer can never see or touch the mail of another,
 *   - the plan is checked before the mail system is asked to do anything, so
 *     a customer that is at the limit is told so instead of being half
 *     served.
 */

/** The view of a domain of mail that the platform gives to the customer. */
export interface MailDomainView {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'error' | 'suspended';
  quotaMb: number;
  usedMb: number;
  maxMailboxes: number;
  maxAliases: number;
  mailboxes: number;
  aliases: number;
  dkimPublic: string | null;
  webmailUrl: string | null;
  lastError: string | null;
  createdAt: string;
}

/** The view of a mailbox. */
export interface MailboxView {
  id: string;
  address: string;
  status: 'active' | 'disabled';
  quotaMb: number;
  usedMb: number;
  /** Only on the answer that creates the mailbox, when the platform made the password. */
  password?: string;
  createdAt: string;
}

/** The view of an alias. */
export interface MailAliasView {
  id: string;
  alias: string;
  target: string;
  createdAt: string;
}

/** The name of a domain of mail, in the form the platform stores it. */
export function assertValidMailDomain(raw: string): string {
  const name = raw.trim().toLowerCase();
  if (!name) throw badRequest('Enter a domain.');
  if (name.length > 253) throw badRequest('That domain is too long.');
  if (name.includes('*')) throw badRequest('A wildcard cannot be hosted. Enter the domain you want to use.');
  if (!gateway.isValidHostname(name)) throw badRequest('Enter a valid domain, such as acme.ro.');
  return name;
}

/** The part before the "@", in the form the platform stores it. */
export function assertValidLocalPart(raw: string): string {
  const local = raw.trim().toLowerCase();
  if (!local) throw badRequest('Enter the name of the mailbox.');
  if (local.length > 64) throw badRequest('That name is too long.');
  if (!/^[a-z0-9][a-z0-9._+-]*$/.test(local)) {
    throw badRequest('The name of a mailbox may hold letters, digits and the characters . _ + -');
  }
  return local;
}

/** A password for a mailbox, made by the platform when the customer did not bring one. */
export function newMailboxPassword(): string {
  // 15 bytes give 20 characters of base64url, which is long enough and short
  // enough for a person to type.
  return randomToken(15);
}

/**
 * Undoes a change of the mail system when the platform cannot write it down.
 *
 * The mail system is asked first, because a domain that the mail system
 * refuses must not be written down as if it existed. The other way round is
 * worse: a change that the mail system made and the platform did not write
 * down is a thing that nobody can see and nobody can remove.
 *
 * The undo that fails is written in the journal of the platform. It is not
 * hidden, because a change that stayed behind has to be seen by somebody.
 */
async function undoMailChange(undo: () => Promise<unknown>): Promise<void> {
  try {
    await undo();
  } catch (error) {
    console.error('[mail] the change of the mail system could not be undone:', (error as Error).message);
  }
}

/** The domain of the customer, or an error that says it is not theirs. */
async function domainOf(userId: string, domainId: string) {
  const domain = await prisma.mailDomain.findFirst({ where: { id: domainId, userId } });
  if (!domain) throw notFound('That domain of mail was not found.');
  return domain;
}

/** The work the platform owes to the mail system. */
export type MailJobKind =
  | 'domain.create'
  | 'domain.delete'
  | 'mailbox.create'
  | 'mailbox.delete'
  | 'alias.create'
  | 'alias.delete';

/**
 * The kinds of work that can be tried again.
 *
 * The work that creates something cannot: the password of a mailbox is made
 * by the platform and shown to the customer once, and the platform keeps no
 * copy of it, so a mailbox that failed to be created cannot be created again
 * without a new password. The customer asks for a new mailbox instead. The
 * work that removes something can always be tried again, because a thing that
 * is not there is not a thing that has to be removed.
 */
export const RETRYABLE_JOB_KINDS: MailJobKind[] = ['domain.delete', 'mailbox.delete', 'alias.delete'];

/** True when the work of a job can be tried again. */
export function isRetryableJobKind(kind: string): boolean {
  return (RETRYABLE_JOB_KINDS as string[]).includes(kind);
}

/**
 * Runs one piece of work against the mail system and writes down what happened.
 *
 * The mail system is another program: it can refuse, it can be slow, it can
 * be down. The work is written down before it is done, so a failure is never
 * lost: the row stays with the reason of the refusal and the back office can
 * show it and try it again.
 *
 * The journal never holds a secret. A password of a mailbox is not part of the
 * payload of the job: the mail system keeps only its hash and the platform
 * keeps no copy of it, so a row of the journal cannot become a way to read
 * the mail of a customer.
 */
export async function withMailJob<T>(input: {
  kind: MailJobKind;
  domainId?: string | null;
  payload: Record<string, unknown>;
  run: () => Promise<T>;
  /**
   * Called when the work failed, with the row of the journal that holds the
   * failure. The caller that knows the customer uses it to tell the customer
   * what happened; the row is the occasion of that message.
   */
  onFailure?: (job: { id: string; error: unknown }) => Promise<void>;
}): Promise<T> {
  const job = await prisma.mailJob.create({
    data: {
      kind: input.kind,
      domainId: input.domainId ?? null,
      payload: input.payload as never,
      status: 'running',
      attempts: 1,
    },
  });

  try {
    const result = await input.run();
    await prisma.mailJob.update({ where: { id: job.id }, data: { status: 'done' } });
    return result;
  } catch (error) {
    await prisma.mailJob.update({
      where: { id: job.id },
      data: { status: 'failed', lastError: (error as Error).message },
    });
    if (input.onFailure) {
      try {
        await input.onFailure({ id: job.id, error });
      } catch (failure) {
        console.error('[mail] the failure of the work could not be told:', (failure as Error).message);
      }
    }
    throw error;
  }
}

/** How many domains of mail the customer already hosts. */
async function domainCount(userId: string): Promise<number> {
  return prisma.mailDomain.count({ where: { userId } });
}

/** The view of a domain, with the numbers that the customer sees. */
async function viewOf(domain: {
  id: string;
  name: string;
  status: string;
  quotaMb: number;
  usedMb: number;
  maxMailboxes: number;
  maxAliases: number;
  dkimPublic: string | null;
  lastError: string | null;
  createdAt: Date;
  _count?: { mailboxes: number; aliases: number };
}): Promise<MailDomainView> {
  const mailboxes = domain._count?.mailboxes ?? (await prisma.mailbox.count({ where: { domainId: domain.id } }));
  const aliases = domain._count?.aliases ?? (await prisma.mailAlias.count({ where: { domainId: domain.id } }));
  return {
    id: domain.id,
    name: domain.name,
    status: (domain.status.toLowerCase() as MailDomainView['status']) ?? 'pending',
    quotaMb: domain.quotaMb,
    usedMb: domain.usedMb,
    maxMailboxes: domain.maxMailboxes,
    maxAliases: domain.maxAliases,
    mailboxes,
    aliases,
    dkimPublic: domain.dkimPublic,
    webmailUrl: env.MAIL_WEBMAIL_URL.trim() || null,
    lastError: domain.lastError,
    createdAt: domain.createdAt.toISOString(),
  };
}

/** Every domain of mail of the customer. */
export async function listMailDomains(userId: string): Promise<MailDomainView[]> {
  const domains = await prisma.mailDomain.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { mailboxes: true, aliases: true } } },
  });
  return Promise.all(domains.map((domain) => viewOf(domain)));
}

/** One domain of mail of the customer. */
export async function getMailDomain(userId: string, domainId: string): Promise<MailDomainView> {
  const domain = await domainOf(userId, domainId);
  return viewOf(domain);
}

/**
 * Hosts a domain of mail for the customer.
 *
 * The domain is asked of the mail system first: a domain that the mail system
 * refuses must not be written down as if it existed. The key of DKIM is made
 * afterwards, because a domain without a key would be a domain whose mail
 * nobody can read as genuine.
 */
export async function createMailDomain(
  user: { id: string; email: string },
  rawName: string,
): Promise<MailDomainView> {
  const name = assertValidMailDomain(rawName);

  const existing = await prisma.mailDomain.findFirst({ where: { userId: user.id, name } });
  if (existing) throw conflict('That domain of mail is already hosted.');

  if (await domainCount(user.id) >= env.MAIL_MAX_DOMAINS_PER_CUSTOMER) {
    throw conflict(
      `Your plan allows ${env.MAIL_MAX_DOMAINS_PER_CUSTOMER} domains of mail. One of them has to go before another one is added.`,
    );
  }

  const domainInMail = await prisma.mailDomain.findFirst({ where: { name } });
  if (domainInMail) throw conflict('That domain is already hosted for another customer.');

  await withMailJob({
    kind: 'domain.create',
    payload: { domain: name },
    run: () =>
      mailcow.mailcowCreateDomain({
        domain: name,
        quotaMb: env.MAIL_MAX_QUOTA_MB_PER_DOMAIN,
        maxQuotaMb: env.MAIL_MAX_QUOTA_MB_PER_DOMAIN,
        defQuotaMb: env.MAIL_MAX_QUOTA_MB_PER_MAILBOX,
        mailboxes: env.MAIL_MAX_MAILBOXES_PER_DOMAIN,
        aliases: env.MAIL_MAX_ALIASES_PER_DOMAIN,
      }),
  });

  let dkimPublic: string | null = null;
  try {
    const key = await withMailJob({
      kind: 'domain.create',
      payload: { domain: name, part: 'dkim' },
      run: () => mailcow.mailcowEnsureDkim(name),
    });
    dkimPublic = key?.pubkey ?? null;
  } catch (error) {
    // The domain exists now, so it is written down. The key is missing, and
    // the customer is told that the mail will not be signed until it is made.
    await prisma.mailDomain.create({
      data: {
        userId: user.id,
        name,
        status: 'PENDING',
        quotaMb: env.MAIL_MAX_QUOTA_MB_PER_DOMAIN,
        maxMailboxes: env.MAIL_MAX_MAILBOXES_PER_DOMAIN,
        maxAliases: env.MAIL_MAX_ALIASES_PER_DOMAIN,
        lastError: `The key of DKIM could not be made: ${(error as Error).message}`,
      },
    });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'mail.domain.create',
      targetType: 'mail_domain',
      meta: { domain: name, dkim: false },
    });
    throw conflict(
      `The domain ${name} was added, but the key that signs its mail could not be made. The operator has to look at it.`,
    );
  }

  const created = await prisma.mailDomain
    .create({
      data: {
        userId: user.id,
        name,
        status: 'ACTIVE',
        quotaMb: env.MAIL_MAX_QUOTA_MB_PER_DOMAIN,
        maxMailboxes: env.MAIL_MAX_MAILBOXES_PER_DOMAIN,
        maxAliases: env.MAIL_MAX_ALIASES_PER_DOMAIN,
        dkimPublic,
      },
    })
    .catch(async (error) => {
      // The mail system holds the domain and the platform cannot write it
      // down, so the domain is taken away again. A domain that the platform
      // does not know about is a domain that nobody can remove.
      await undoMailChange(() => mailcow.mailcowDeleteDomain(name));
      throw error;
    });

  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'mail.domain.create',
    targetType: 'mail_domain',
    targetId: created.id,
    meta: { domain: name, dkim: true },
  });

  // The mail of the domain arrives only when the customer publishes the
  // records of DNS. The message names them once, so the customer knows
  // what the platform expects of them.
  const records = mailDnsRecords({
    domain: name,
    mailHostname: env.MAIL_HOSTNAME,
    dkimPublic: created.dkimPublic,
    fromAddress: env.MAIL_RUA_ADDRESS,
  });
  await notifyDomainDnsIncomplete({
    userId: user.id,
    domain: name,
    scope: 'mail',
    missing: records.map((record) => `${record.type} ${record.name}`),
  });

  return viewOf(created);
}

/**
 * Removes a domain of mail.
 *
 * The mail of the domain goes with it. The customer is asked to confirm in
 * the interface, and the truth about what was lost is written to the audit.
 */
export async function deleteMailDomain(
  user: { id: string; email: string },
  domainId: string,
): Promise<void> {
  const domain = await domainOf(user.id, domainId);
  await withMailJob({
    kind: 'domain.delete',
    domainId: domain.id,
    payload: { domain: domain.name },
    // The domain goes with the mailboxes and the aliases that are on it: the
    // mail system refuses to delete a domain that still holds them, and a
    // domain that is left behind with its mail is mail that nobody owns.
    run: () => mailcow.mailcowDeleteDomainWithItsContent(domain.name),
  });
  await prisma.mailDomain.delete({ where: { id: domain.id } });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'mail.domain.delete',
    targetType: 'mail_domain',
    targetId: domain.id,
    meta: { domain: domain.name },
  });
}

/** Every mailbox of a domain of the customer. */
export async function listMailboxes(userId: string, domainId: string): Promise<MailboxView[]> {
  const domain = await domainOf(userId, domainId);
  const mailboxes = await prisma.mailbox.findMany({
    where: { domainId: domain.id },
    orderBy: { createdAt: 'asc' },
  });
  return mailboxes.map((mailbox) => ({
    id: mailbox.id,
    address: mailbox.address,
    status: mailbox.status === 'disabled' ? 'disabled' : 'active',
    quotaMb: mailbox.quotaMb,
    usedMb: mailbox.usedMb,
    createdAt: mailbox.createdAt.toISOString(),
  }));
}

/**
 * Adds a mailbox to a domain of the customer.
 *
 * When the customer brings no password, the platform makes one and shows it
 * once. It is not written down anywhere: the mail system keeps only its
 * hash, and the platform keeps no copy of a password it cannot read again.
 */
export async function createMailbox(
  user: { id: string; email: string },
  domainId: string,
  rawLocalPart: string,
  password?: string,
): Promise<MailboxView> {
  const domain = await domainOf(user.id, domainId);
  const localPart = assertValidLocalPart(rawLocalPart);

  const count = await prisma.mailbox.count({ where: { domainId: domain.id } });
  if (count >= domain.maxMailboxes) {
    throw conflict(`This domain allows ${domain.maxMailboxes} mailboxes. One of them has to go before another one is added.`);
  }

  const address = `${localPart}@${domain.name}`;
  const existing = await prisma.mailbox.findUnique({ where: { address } });
  if (existing) throw conflict('That mailbox already exists.');

  const secret = password && password.length >= 10 ? password : newMailboxPassword();

  // The mailbox follows the limit of the plan, and it never asks for more than
  // the domain holds: the mail system refuses a mailbox that is larger than
  // the quota of its domain.
  const service = domain.serviceId
    ? await prisma.mailService.findUnique({ where: { id: domain.serviceId }, select: { mailboxQuotaMb: true } })
    : null;
  const mailboxQuotaMb = Math.max(
    1,
    Math.min(env.MAIL_MAX_QUOTA_MB_PER_MAILBOX, service?.mailboxQuotaMb ?? Infinity, domain.quotaMb),
  );

  await withMailJob({
    kind: 'mailbox.create',
    domainId: domain.id,
    // The password is not part of the journal. The platform keeps no copy of
    // it and the journal must not become one.
    payload: { address, domain: domain.name, quotaMb: mailboxQuotaMb },
    run: () =>
      mailcow.mailcowCreateMailbox({
        localPart,
        domain: domain.name,
        password: secret,
        quotaMb: mailboxQuotaMb,
      }),
    // The mailbox could not be made, so the customer is told. The row of the
    // journal is the occasion of the message: the failure of one attempt is
    // one message and a new attempt is a message of its own.
    onFailure: async (job) => {
      await notifyMailboxProvisioningFailed({
        userId: user.id,
        mailbox: address,
        domain: domain.name,
        reason: job.error instanceof Error ? job.error.message : String(job.error),
        occurrence: job.id,
      });
    },
  });

  const created = await prisma.mailbox
    .create({
      data: {
        domainId: domain.id,
        localPart,
        address,
        quotaMb: mailboxQuotaMb,
      },
    })
    .catch(async (error) => {
      await undoMailChange(() => mailcow.mailcowDeleteMailbox(address));
      throw error;
    });

  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'mail.mailbox.create',
    targetType: 'mailbox',
    targetId: created.id,
    meta: { address, domain: domain.name },
  });

  // The customer is told that the mailbox exists. The password is never part
  // of the message: it is shown once, in the answer of the request.
  await notifyMailboxCreated({
    userId: user.id,
    mailbox: address,
    domain: domain.name,
    occurrence: created.id,
  });

  return {
    id: created.id,
    address,
    status: 'active',
    quotaMb: created.quotaMb,
    usedMb: created.usedMb,
    password: secret,
    createdAt: created.createdAt.toISOString(),
  };
}

/**
 * Removes a mailbox of the customer.
 *
 * The aliases that deliver to the mailbox go first. The mail system removes
 * them by itself when the mailbox goes, and the platform has to know about it:
 * an alias that the platform shows and the mail system does not have is an
 * alias that delivers nowhere.
 */
export async function deleteMailbox(
  user: { id: string; email: string },
  domainId: string,
  mailboxId: string,
): Promise<void> {
  const domain = await domainOf(user.id, domainId);
  const mailbox = await prisma.mailbox.findFirst({ where: { id: mailboxId, domainId: domain.id } });
  if (!mailbox) throw notFound('That mailbox was not found.');

  const aliases = await prisma.mailAlias.findMany({ where: { domainId: domain.id, target: mailbox.address } });
  for (const alias of aliases) {
    await withMailJob({
      kind: 'alias.delete',
      domainId: domain.id,
      payload: { alias: alias.alias, domain: domain.name, reason: 'the mailbox went away' },
      run: () => mailcow.mailcowDeleteAlias(alias.alias),
    });
    await prisma.mailAlias.delete({ where: { id: alias.id } });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'mail.alias.delete',
      targetType: 'mail_alias',
      targetId: alias.id,
      meta: { alias: alias.alias, domain: domain.name, reason: 'the mailbox went away' },
    });
  }

  await withMailJob({
    kind: 'mailbox.delete',
    domainId: domain.id,
    payload: { address: mailbox.address, domain: domain.name },
    run: () => mailcow.mailcowDeleteMailbox(mailbox.address),
  });
  await prisma.mailbox.delete({ where: { id: mailbox.id } });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'mail.mailbox.delete',
    targetType: 'mailbox',
    targetId: mailbox.id,
    meta: { address: mailbox.address, domain: domain.name, aliasesRemoved: aliases.length },
  });
}

/** Every alias of a domain of the customer. */
export async function listAliases(userId: string, domainId: string): Promise<MailAliasView[]> {
  const domain = await domainOf(userId, domainId);
  const aliases = await prisma.mailAlias.findMany({
    where: { domainId: domain.id },
    orderBy: { createdAt: 'asc' },
  });
  return aliases.map((alias) => ({
    id: alias.id,
    alias: alias.alias,
    target: alias.target,
    createdAt: alias.createdAt.toISOString(),
  }));
}

/**
 * Adds an alias to a domain of the customer.
 *
 * The alias may be a plain name, in which case it is placed on the domain of
 * the customer. The target has to be a mailbox of the same domain: an alias
 * that delivers to another domain is a way to send mail for somebody else,
 * and the platform does not do that.
 */
export async function createAlias(
  user: { id: string; email: string },
  domainId: string,
  rawAlias: string,
  rawTarget: string,
): Promise<MailAliasView> {
  const domain = await domainOf(user.id, domainId);

  const localPart = assertValidLocalPart(rawAlias.includes('@') ? rawAlias.split('@')[0] : rawAlias);
  const alias = `${localPart}@${domain.name}`;

  const count = await prisma.mailAlias.count({ where: { domainId: domain.id } });
  if (count >= domain.maxAliases) {
    throw conflict(`This domain allows ${domain.maxAliases} aliases. One of them has to go before another one is added.`);
  }

  const targetRaw = rawTarget.trim().toLowerCase();
  if (!targetRaw) throw badRequest('Enter the mailbox the alias delivers to.');
  const target = targetRaw.includes('@') ? targetRaw : `${targetRaw}@${domain.name}`;
  if (!target.endsWith(`@${domain.name}`)) {
    throw badRequest('The alias can only deliver to a mailbox of the same domain.');
  }
  const mailbox = await prisma.mailbox.findFirst({ where: { domainId: domain.id, address: target } });
  if (!mailbox) throw badRequest('That mailbox is not on this domain.');

  const existing = await prisma.mailAlias.findFirst({ where: { domainId: domain.id, alias } });
  if (existing) throw conflict('That alias already exists.');

  await withMailJob({
    kind: 'alias.create',
    domainId: domain.id,
    payload: { alias, target, domain: domain.name },
    run: async () => {
      await mailcow.mailcowCreateAlias({ alias, target });
    },
  });

  const created = await prisma.mailAlias
    .create({
      data: { domainId: domain.id, alias, target },
    })
    .catch(async (error) => {
      // The mail system holds the alias and the platform cannot write it
      // down, so the alias is taken away again.
      await undoMailChange(() => mailcow.mailcowDeleteAlias(alias));
      throw error;
    });

  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'mail.alias.create',
    targetType: 'mail_alias',
    targetId: created.id,
    meta: { alias, target, domain: domain.name },
  });

  return {
    id: created.id,
    alias,
    target,
    createdAt: created.createdAt.toISOString(),
  };
}

/** Removes an alias of the customer. */
export async function deleteAlias(
  user: { id: string; email: string },
  domainId: string,
  aliasId: string,
): Promise<void> {
  const domain = await domainOf(user.id, domainId);
  const alias = await prisma.mailAlias.findFirst({ where: { id: aliasId, domainId: domain.id } });
  if (!alias) throw notFound('That alias was not found.');
  await withMailJob({
    kind: 'alias.delete',
    domainId: domain.id,
    payload: { alias: alias.alias, domain: domain.name },
    run: () => mailcow.mailcowDeleteAlias(alias.alias),
  });
  await prisma.mailAlias.delete({ where: { id: alias.id } });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'mail.alias.delete',
    targetType: 'mail_alias',
    targetId: alias.id,
    meta: { alias: alias.alias, domain: domain.name },
  });
}

/**
 * The records of DNS of a domain, and what is really published.
 *
 * The records are only checked when the customer asks for them: a lookup
 * costs the platform a trip to the DNS of the world, and nothing changes
 * between two checks of the same customer.
 */
export async function mailDnsStatus(userId: string, domainId: string): Promise<MailDnsStatus> {
  const domain = await domainOf(userId, domainId);
  const records = mailDnsRecords({
    domain: domain.name,
    mailHostname: env.MAIL_HOSTNAME,
    dkimPublic: domain.dkimPublic,
    fromAddress: env.MAIL_RUA_ADDRESS,
  });
  return checkMailDns(records);
}

/** True when the platform may serve the mail of the customers. */
export function mailServiceConfigured(): boolean {
  return mailcow.mailcowConfigured();
}

/** What the operator sees about a job of the mail. */
export interface MailJobView {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  lastError: string | null;
  retryable: boolean;
  domainId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** The view of a job. */
function jobView(job: {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  lastError: string | null;
  domainId: string | null;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}): MailJobView {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    lastError: job.lastError,
    retryable: isRetryableJobKind(job.kind),
    domainId: job.domainId,
    payload: (job.payload ?? {}) as Record<string, unknown>,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

/** One job of the mail, or an error that says it is not there. */
export async function getMailJob(jobId: string): Promise<MailJobView> {
  const job = await prisma.mailJob.findUnique({ where: { id: jobId } });
  if (!job) throw notFound('That job of mail was not found.');
  return jobView(job);
}

/**
 * Repeats a job of the mail that failed.
 *
 * Only the work that removes something can be repeated: the password of a
 * mailbox is made by the platform and shown once, and the platform keeps no
 * copy of it, so a mailbox that was not created cannot be created again
 * without a new password. The customer asks for a new mailbox instead.
 *
 * The repetition is the whole operation and not only the call to the mail
 * system: what was left behind in the platform is removed as well, so the two
 * sides tell the same story afterwards.
 */
export async function retryMailJob(
  jobId: string,
  operator: { id: string; email: string },
): Promise<MailJobView> {
  const job = await prisma.mailJob.findUnique({ where: { id: jobId } });
  if (!job) throw notFound('That job of mail was not found.');
  if (job.status !== 'failed') {
    throw conflict('That job of mail did not fail, so there is nothing to repeat.');
  }
  if (!isRetryableJobKind(job.kind)) {
    throw conflict('That job of mail cannot be repeated. The customer has to ask for it again.');
  }

  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const domainName = typeof payload.domain === 'string' ? payload.domain : '';

  try {
    if (job.kind === 'domain.delete') {
      await mailcow.mailcowDeleteDomain(domainName);
      const domain = job.domainId ? await prisma.mailDomain.findUnique({ where: { id: job.domainId } }) : null;
      if (domain) {
        await prisma.mailDomain.delete({ where: { id: domain.id } });
        await audit({
          actorId: operator.id,
          actorEmail: operator.email,
          action: 'mail.domain.delete',
          targetType: 'mail_domain',
          targetId: domain.id,
          meta: { domain: domain.name, repeated: true },
        });
      }
    } else if (job.kind === 'mailbox.delete') {
      const address = typeof payload.address === 'string' ? payload.address : '';
      await mailcow.mailcowDeleteMailbox(address);
      const mailbox = await prisma.mailbox.findFirst({ where: { address } });
      if (mailbox) {
        await prisma.mailbox.delete({ where: { id: mailbox.id } });
        await audit({
          actorId: operator.id,
          actorEmail: operator.email,
          action: 'mail.mailbox.delete',
          targetType: 'mailbox',
          targetId: mailbox.id,
          meta: { address, repeated: true },
        });
      }
    } else if (job.kind === 'alias.delete') {
      // The mail system removes an alias by its address.
      const aliasAddress = typeof payload.alias === 'string' ? payload.alias : '';
      await mailcow.mailcowDeleteAlias(aliasAddress);
      const alias = aliasAddress
        ? await prisma.mailAlias.findFirst({ where: { alias: aliasAddress } })
        : null;
      if (alias) {
        await prisma.mailAlias.delete({ where: { id: alias.id } });
        await audit({
          actorId: operator.id,
          actorEmail: operator.email,
          action: 'mail.alias.delete',
          targetType: 'mail_alias',
          targetId: alias.id,
          meta: { alias: alias.alias, repeated: true },
        });
      }
    }
  } catch (error) {
    await prisma.mailJob.update({
      where: { id: job.id },
      data: { status: 'failed', attempts: job.attempts + 1, lastError: (error as Error).message },
    });
    throw error;
  }

  const done = await prisma.mailJob.update({
    where: { id: job.id },
    data: { status: 'done', attempts: job.attempts + 1, lastError: null },
  });

  await audit({
    actorId: operator.id,
    actorEmail: operator.email,
    action: 'mail.job.retry',
    targetType: 'mail_job',
    targetId: job.id,
    meta: { kind: job.kind },
  });

  return jobView(done);
}

