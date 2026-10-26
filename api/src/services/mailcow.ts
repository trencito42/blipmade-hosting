import { createHash } from 'node:crypto';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { env } from '../env.js';

/**
 * The client of the mail system.
 *
 * The mail system is another program on another machine. It answers over
 * HTTPS, it refuses things, and it can be down. Everything the platform asks
 * of it goes through this module, so the rules live in one place:
 *
 *   - the answer is read as JSON and the status of the answer is checked,
 *   - a refusal of the mail system is an error with the words of the refusal,
 *     so the customer and the operator read what really happened,
 *   - the call never waits for ever,
 *   - the certificate of the mail system is checked against the fingerprint
 *     that the operator wrote down, when the certificate is not signed by an
 *     authority the machine already trusts.
 */

/** How long a call to the mail system may take. */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * The agent of the mail system.
 *
 * Two things are wanted from every connection to the mail system:
 *
 *   - the handshake is complete every time, because a session that is taken
 *     up again is a session in which the server does not send its certificate
 *     again, and a certificate that is not there cannot be compared with the
 *     fingerprint that the operator wrote down;
 *   - the connection is not kept between the calls, because the check of the
 *     certificate belongs to the connection that was opened, and a connection
 *     that is taken from the pool is a connection that is not checked again.
 *
 * The agent belongs to the mail system alone: the connections of the rest of
 * the platform are not touched by it.
 */
const mailcowAgent = new HttpsAgent({ keepAlive: false, maxCachedSessions: 0 });

/** The body of every answer of the mail system that carries a verdict. */
export interface MailcowEnvelope {
  /** "success", "danger" or "error". */
  type: string;
  /** The words of the verdict, in the order the mail system gave them. */
  msg: string[];
  /** What was asked and what was done, for the log of the mail system. */
  log?: unknown[];
}

/** A refusal of the mail system. */
export class MailcowError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The code of the refusal, e.g. "access_denied". */
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'MailcowError';
  }
}

/** True when the platform knows how to reach the mail system. */
export function mailcowConfigured(): boolean {
  return Boolean(env.MAILCOW_API_URL.trim() && env.MAILCOW_API_KEY.trim());
}

/**
 * The words of a refusal of the mail system.
 *
 * The mail system answers in two ways. A call that changes something answers
 * with a list of verdicts, each with a type and a list of words. A call that
 * reads answers with the thing that was read, and a thing that was read has
 * no type. The two are told apart by the type, and not by the shape of the
 * answer, because a list of domains and a list of verdicts are both lists.
 *
 * The words of a refusal are joined, because a customer reads a sentence and
 * not a list of codes.
 */
function verdictOf(payload: unknown): { type: string; words: string[] } | null {
  const list = Array.isArray(payload) ? payload : [payload];
  if (list.length === 0) return null;
  const first = list[0];
  if (!first || typeof first !== 'object' || !('type' in first)) return null;

  const words: string[] = [];
  for (const entry of list) {
    const msg = (entry as MailcowEnvelope | undefined)?.msg;
    if (Array.isArray(msg)) {
      for (const word of msg) if (typeof word === 'string') words.push(word);
    } else if (typeof msg === 'string') {
      words.push(msg);
    }
  }
  return { type: String((first as { type?: unknown }).type ?? 'error'), words };
}

/**
 * The fingerprint of the certificate of the mail system, in lower case hex.
 *
 * The fingerprint is the SHA-256 of the certificate. It is written down by
 * the operator, so a certificate that changes is a change that somebody has
 * to look at, and not a certificate that is accepted because somebody
 * answered on the wire.
 */
export function certificateFingerprint(expected: string): string {
  return expected.toLowerCase().replace(/[^0-9a-f]/g, '');
}

/**
 * The error of a certificate that is not the one that was expected.
 *
 * The error names both fingerprints, so the operator can see what is on the
 * wire and what was written down.
 */
export function certificateMismatch(actual: string, wanted: string): Error {
  return new Error(
    `The certificate of the mail system is not the one that was expected. It is ${actual} and ${wanted} was expected.`,
  );
}

/**
 * The error of a mail system that never showed its certificate.
 */
export function certificateMissing(): Error {
  return new Error('The mail system did not show a certificate.');
}

/**
 * Waits for the certificate of the mail system and compares it with the
 * fingerprint the operator wrote down.
 *
 * The certificate is not always on the socket the moment the handshake is
 * declared finished: with TLS 1.3 the certificate of the server travels after
 * the handshake that the client considers done, so the socket can be "secure"
 * a moment before the certificate is there. A check that reads the
 * certificate once would refuse a mail system that answered correctly, and
 * the refusal would look like a broken mail system.
 *
 * The certificate is therefore waited for, and the request is only refused
 * when the certificate that arrives is not the one that was expected, or when
 * no certificate arrives at all. The rule stays the same: a certificate that
 * is not the one that was written down is never accepted.
 */
export async function waitForPeerCertificate(
  read: () => Buffer | undefined,
  wanted: string,
  delay: (resolve: () => void, ms: number) => void = (resolve, ms) => {
    setTimeout(resolve, ms);
  },
  attempts = 20,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const raw = read();
    if (raw) {
      const actual = createHash('sha256').update(raw).digest('hex');
      if (actual !== wanted) throw certificateMismatch(actual, wanted);
      return;
    }
    await new Promise<void>((resolve) => delay(resolve, 25));
  }
  throw certificateMissing();
}

export interface MailcowCallOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
}

/**
 * Calls the administrative API of the mail system.
 *
 * The answer is returned as it is, because the shapes are different: the
 * calls that change something answer with a list of verdicts, the calls that
 * read answer with the list of what was read.
 */
export async function mailcowRequest<T>(path: string, options: MailcowCallOptions = {}): Promise<T> {
  if (!mailcowConfigured()) {
    throw new MailcowError('The mail system is not configured on this environment.', 0, 'not_configured');
  }

  const base = env.MAILCOW_API_URL.trim().replace(/\/$/, '');
  const url = new URL(`${base}/api/v1${path}`);
  const method = options.method ?? 'GET';
  const payload = options.body === undefined ? undefined : Buffer.from(JSON.stringify(options.body), 'utf-8');

  const fingerprint = env.MAILCOW_API_CERT_SHA256.trim();
  const wanted = fingerprint ? certificateFingerprint(fingerprint) : '';

  const answer = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: 'https:',
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method,
        servername: env.MAIL_HOSTNAME.trim() || url.hostname,
        agent: mailcowAgent,
        headers: {
          'X-API-Key': env.MAILCOW_API_KEY.trim(),
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        },
        /**
         * When the operator wrote down a fingerprint, the chain of the
         * certificate is not checked by the machine: the certificate of the
         * mail system is signed by nobody until the name of the machine is
         * published in the DNS. The fingerprint is the check instead, and it
         * is made by hand right after the handshake, on the certificate that
         * the machine really received.
         *
         * Without a fingerprint the ordinary check of the machine applies: the
         * certificate has to be signed by an authority the machine trusts.
         */
        ...(wanted ? { rejectUnauthorized: false } : {}),
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') }));
      },
    );

    if (wanted) {
      req.on('socket', (socket) => {
        // Every connection to the mail system is a connection of its own: the
        // agent of the mail system does not keep the connections alive and does
        // not take up a session again, so the certificate of every connection is
        // there to be checked. The listener is added only to a socket that is
        // being opened, so a socket that is already open does not gather
        // listeners.
        if (!(socket as { connecting?: boolean }).connecting) return;
        socket.once('secureConnect', () => {
          const peer = (socket as import('node:tls').TLSSocket).getPeerCertificate();
          const raw = peer?.raw;
          if (raw) {
            const actual = createHash('sha256').update(raw).digest('hex');
            if (actual !== wanted) {
              req.destroy(certificateMismatch(actual, wanted));
            }
            return;
          }
          // The certificate is not on the socket yet. The answer of the mail
          // system is held back until the certificate arrives, so a certificate
          // that is not the one that was expected is never read.
          socket.pause();
          waitForPeerCertificate(
            () => (socket as import('node:tls').TLSSocket).getPeerCertificate()?.raw,
            wanted,
          ).then(
            () => socket.resume(),
            (error: Error) => req.destroy(error),
          );
        });
      });
    }

    req.on('timeout', () => {
      req.destroy(new Error('The mail system did not answer in time.'));
    });
    req.on('error', (error) => reject(error));
    if (payload) req.write(payload);
    req.end();
  });

  let parsed: unknown = null;
  if (answer.body.trim()) {
    try {
      parsed = JSON.parse(answer.body);
    } catch {
      throw new MailcowError(
        `The mail system answered with something that is not JSON (status ${answer.status}).`,
        answer.status,
        'not_json',
      );
    }
  }

  if (answer.status === 401 || answer.status === 403) {
    throw new MailcowError('The mail system refused the key of the platform.', answer.status, 'access_denied');
  }

  // The calls that change something answer with a list of verdicts. A verdict
  // that is not a success is a refusal, and it carries the words of the mail
  // system. A call that only reads answers with the thing that was read, and
  // that thing is not a refusal.
  const verdict = verdictOf(parsed);
  if (verdict && verdict.type !== 'success' && verdict.type !== 'info') {
    throw new MailcowError(
      verdict.words.length ? verdict.words.join(' ') : `The mail system answered with "${verdict.type}".`,
      answer.status,
      verdict.words[0] ?? verdict.type,
    );
  }

  if (answer.status >= 400) {
    throw new MailcowError(
      verdict?.words.length ? verdict.words.join(' ') : `The mail system answered with the status ${answer.status}.`,
      answer.status,
      verdict?.words[0] ?? null,
    );
  }

  return parsed as T;
}

/** A domain as the mail system holds it. */
export interface MailcowDomain {
  domain_name: string;
  description: string | null;
  active: number;
  quota_used_in_domain: string;
  mboxes_in_domain: number;
  aliases_in_domain: number;
  max_num_mboxes_for_domain: number;
  max_num_aliases_for_domain: number;
  def_quota_for_mbox: number;
  max_quota_for_domain: number;
}

/** A mailbox as the mail system holds it. */
export interface MailcowMailbox {
  username: string;
  local_part: string;
  domain: string;
  active: number;
  quota: number;
  messages: number;
}

/** An alias as the mail system holds it. */
export interface MailcowAlias {
  id: number;
  /** The address of the alias, e.g. "info@acme.ro". */
  address: string;
  /** The mailbox it delivers to. */
  goto: string;
  domain: string;
  active: number;
}

/**
 * Reads an answer that may be a list or a map.
 *
 * The mail system answers with a list when there is something to show and with
 * an empty object when there is not. Both forms are read the same way, so the
 * caller never has to know which one it got.
 */
function asList<T>(answer: T[] | Record<string, unknown> | null | undefined): T[] {
  if (Array.isArray(answer)) return answer;
  if (!answer) return [];
  return Object.values(answer) as T[];
}

/**
 * Every domain of the mail system.
 *
 * The mail system answers with a list. When there is nothing to show it
 * answers with an empty object instead of an empty list, so both forms are
 * read the same way and the caller never has to know about it.
 */
export async function mailcowDomains(): Promise<MailcowDomain[]> {
  const answer = await mailcowRequest<MailcowDomain[] | Record<string, unknown>>('/get/domain/all');
  return asList<MailcowDomain>(answer);
}

/**
 * One domain of the mail system, or nothing.
 *
 * The mail system holds one domain for the whole platform, so the platform
 * has to be able to ask who holds it. The description of the domain is where
 * the platform writes the id of the service that owns it.
 */
export async function mailcowDomain(domain: string): Promise<MailcowDomain | null> {
  const answer = await mailcowRequest<MailcowDomain[] | Record<string, unknown>>('/get/domain/all');
  const found = asList<MailcowDomain>(answer).find(
    (row) => (row.domain_name ?? '').toLowerCase() === domain.toLowerCase(),
  );
  return found ?? null;
}

/**
 * The limit of sending of a domain.
 *
 * The mail system counts the messages a domain sends in a window of time:
 * an hour ("h"), a minute ("m") or a second ("s"). The limit of the plan of
 * the customer is written here, so the mail system refuses the mass mail that
 * the plan does not allow.
 */
export async function mailcowSetDomainRateLimit(
  domain: string,
  value: number,
  frame: 'h' | 'm' | 's',
): Promise<void> {
  await mailcowRequest('/edit/rl-domain/', {
    method: 'POST',
    body: {
      items: [domain],
      attr: { rl_value: String(Math.max(1, Math.trunc(value))), rl_frame: frame },
    },
  });
}

/**
 * Turns a domain of the mail system on or off.
 *
 * A suspended service is switched off here, so the mail stops at once, and
 * the data of the customer stays where it is.
 */
export async function mailcowSetDomainActive(domain: string, active: boolean): Promise<void> {
  await mailcowRequest('/edit/domain', {
    method: 'POST',
    body: { items: [domain], attr: { active: active ? '1' : '0' } },
  });
}

/** Every mailbox of the mail system. */
export async function mailcowMailboxes(): Promise<MailcowMailbox[]> {
  const answer = await mailcowRequest<MailcowMailbox[] | Record<string, unknown>>('/get/mailbox/all');
  return asList<MailcowMailbox>(answer);
}

/** Every alias of the mail system. */
export async function mailcowAliases(): Promise<MailcowAlias[]> {
  const answer = await mailcowRequest<MailcowAlias[] | Record<string, unknown>>('/get/alias/all');
  return asList<MailcowAlias>(answer);
}

/** The version of the mail system, for the health of the service. */
export async function mailcowVersion(): Promise<string> {
  const answer = await mailcowRequest<{ version?: string }>('/get/status/version');
  return String(answer?.version ?? 'unknown');
}

/** How much of the disk of the mail system is used. */
export async function mailcowDisk(): Promise<{ used: string; total: string; usedPercent: string } | null> {
  const answer = await mailcowRequest<{ used?: string; total?: string; used_percent?: string }>('/get/status/vmail');
  if (!answer || typeof answer !== 'object') return null;
  return {
    used: String(answer.used ?? ''),
    total: String(answer.total ?? ''),
    usedPercent: String(answer.used_percent ?? ''),
  };
}

/** Creates a domain in the mail system. */
export async function mailcowCreateDomain(input: {
  domain: string;
  description?: string;
  quotaMb: number;
  maxQuotaMb: number;
  defQuotaMb: number;
  mailboxes: number;
  aliases: number;
}): Promise<void> {
  await mailcowRequest('/add/domain', {
    method: 'POST',
    body: {
      domain: input.domain,
      description: input.description ?? 'Hosted by Blipmade',
      active: '1',
      quota: String(input.quotaMb),
      maxquota: String(input.maxQuotaMb),
      defquota: String(input.defQuotaMb),
      mailboxes: String(input.mailboxes),
      aliases: String(input.aliases),
    },
  });
}

/** Removes a domain from the mail system. */
export async function mailcowDeleteDomain(domain: string): Promise<void> {
  await mailcowRequest('/delete/domain', { method: 'POST', body: [domain] });
}

/**
 * The parts of the mail system that a removal of a domain needs.
 *
 * They are given to the removal so the rule can be checked without a mail
 * system, and the real ones are used when they are not given.
 */
export interface MailSystemRemovals {
  mailboxes: () => Promise<MailcowMailbox[]>;
  aliases: () => Promise<MailcowAlias[]>;
  deleteMailbox: (address: string) => Promise<void>;
  deleteAlias: (address: string) => Promise<void>;
  deleteDomain: (domain: string) => Promise<void>;
}

/**
 * Removes a domain from the mail system, with everything that is on it.
 *
 * The mail system refuses to delete a domain that still holds mailboxes or
 * aliases, and it is right to refuse: a domain that is deleted with its
 * mailboxes still in it is a domain whose mail is still on the server. So
 * the mailboxes and the aliases are taken away first, and the domain goes
 * last.
 *
 * The mail system is asked what it holds, and not the platform, because the
 * platform and the mail system can disagree about a mailbox that was made
 * outside of the platform.
 */
export async function removeDomainWithItsContent(
  domain: string,
  system: MailSystemRemovals = {
    mailboxes: () => mailcowMailboxes(),
    aliases: () => mailcowAliases(),
    deleteMailbox: (address: string) => mailcowDeleteMailbox(address),
    deleteAlias: (address: string) => mailcowDeleteAlias(address),
    deleteDomain: (name: string) => mailcowDeleteDomain(name),
  },
): Promise<void> {
  const wanted = domain.trim().toLowerCase();
  const mailboxes = await system.mailboxes();
  for (const mailbox of mailboxes) {
    if ((mailbox.domain ?? '').trim().toLowerCase() !== wanted) continue;
    await system.deleteMailbox(mailbox.username);
  }
  const aliases = await system.aliases();
  for (const alias of aliases) {
    if ((alias.domain ?? '').trim().toLowerCase() !== wanted) continue;
    await system.deleteAlias(alias.address);
  }
  await system.deleteDomain(domain);
}

/**
 * Removes a domain from the mail system, with everything that is on it.
 */
export async function mailcowDeleteDomainWithItsContent(domain: string): Promise<void> {
  await removeDomainWithItsContent(domain);
}

/** Creates a mailbox in the mail system. */
export async function mailcowCreateMailbox(input: {
  localPart: string;
  domain: string;
  password: string;
  quotaMb: number;
}): Promise<void> {
  await mailcowRequest('/add/mailbox', {
    method: 'POST',
    body: {
      local_part: input.localPart,
      domain: input.domain,
      password: input.password,
      password2: input.password,
      quota: String(input.quotaMb),
      active: '1',
      force_pw_update: '0',
    },
  });
}

/** Removes a mailbox from the mail system. */
export async function mailcowDeleteMailbox(address: string): Promise<void> {
  await mailcowRequest('/delete/mailbox', { method: 'POST', body: [address] });
}

/**
 * Creates an alias in the mail system.
 *
 * The mail system removes an alias by its address and not by a number of its
 * own, so the address is what the platform keeps.
 */
export async function mailcowCreateAlias(input: { alias: string; target: string }): Promise<void> {
  await mailcowRequest('/add/alias', {
    method: 'POST',
    body: { address: input.alias, goto: input.target, active: '1' },
  });
}

/** Removes an alias from the mail system, by its address. */
export async function mailcowDeleteAlias(address: string): Promise<void> {
  await mailcowRequest('/delete/alias', { method: 'POST', body: [address] });
}

/** The key of DKIM of a domain, as the mail system holds it. */
export interface MailcowDkim {
  /** The public part of the key, in base64. */
  pubkey: string;
  /** The whole record of TXT that the customer has to publish. */
  txt: string;
  /** The selector of the key, e.g. "dkim". */
  selector: string;
}

/**
 * Makes the key of DKIM of a domain and returns the public part of it.
 *
 * The mail system does not return the public part of the key when it makes
 * it, so the key is read afterwards. A domain that already has a key is not a
 * failure: the key that is there is read and returned.
 *
 * The public part is what the customer publishes in the DNS of the domain, and
 * without it the mail of the domain is signed by nobody.
 */
export async function mailcowEnsureDkim(domain: string, selector = 'dkim'): Promise<MailcowDkim | null> {
  try {
    await mailcowRequest('/add/dkim', {
      method: 'POST',
      body: { domains: [domain], dkim_selector: selector, key_size: 2048 },
    });
  } catch (error) {
    const exists =
      error instanceof MailcowError && error.code === 'dkim_domain_or_sel_exists';
    if (!exists) throw error;
  }

  const answer = await mailcowRequest<{ pubkey?: string; dkim_txt?: string; dkim_selector?: string }>(
    `/get/dkim/${encodeURIComponent(domain)}`,
  );
  if (!answer?.pubkey) return null;
  return {
    pubkey: answer.pubkey,
    txt: answer.dkim_txt ?? '',
    selector: answer.dkim_selector ?? selector,
  };
}

/** The key of DKIM of a domain, or nothing when it has none. */
export async function mailcowDkim(domain: string): Promise<MailcowDkim | null> {
  const answer = await mailcowRequest<{ pubkey?: string; dkim_txt?: string; dkim_selector?: string }>(
    `/get/dkim/${encodeURIComponent(domain)}`,
  );
  if (!answer?.pubkey) return null;
  return {
    pubkey: answer.pubkey,
    txt: answer.dkim_txt ?? '',
    selector: answer.dkim_selector ?? 'dkim',
  };
}

/**
 * Creates the key of DKIM for a domain and returns the public part.
 *
 * The mail system keeps the private part; the public part is what goes into
 * the DNS of the domain.
 */
export async function mailcowCreateDkim(domain: string, selector = 'dkim'): Promise<string | null> {
  const key = await mailcowEnsureDkim(domain, selector);
  return key ? key.pubkey : null;
}
