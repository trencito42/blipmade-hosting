import { Resolver } from 'node:dns/promises';

/**
 * The records of DNS that a domain of mail needs.
 *
 * The platform does not write these records. It tells the customer what to
 * publish and then it checks, with a real lookup, what is really published.
 * A record that the platform would write itself could overwrite something
 * that the customer needs, and the DNS of a domain belongs to the customer.
 */

/** A record of DNS that the customer publishes. */
export interface MailDnsRecord {
  /** The name of the record, e.g. "acme.ro" or "dkim._domainkey.acme.ro". */
  name: string;
  type: 'MX' | 'TXT' | 'CNAME';
  /** The value of the record. */
  value: string;
  /** The priority of a record of MX. */
  priority?: number;
  /** What the record is for, in words a customer understands. */
  purpose: string;
}

/** The name of the record that carries the key of DKIM. */
export const DKIM_SELECTOR = 'dkim';

/** How long the resolver may spend on a single lookup. */
const LOOKUP_TIMEOUT_MS = 5_000;

/**
 * The records a domain of mail needs.
 *
 * The key of DKIM is only in the list when the mail system has already made
 * one: a record with an empty key would tell the customer to publish
 * nothing, and the mail would be signed by nobody.
 */
export function mailDnsRecords(input: {
  domain: string;
  mailHostname: string;
  dkimPublic: string | null;
  fromAddress: string;
}): MailDnsRecord[] {
  const domain = input.domain.trim().toLowerCase();
  const mail = input.mailHostname.trim().toLowerCase();
  const from = input.fromAddress.trim().toLowerCase();

  const records: MailDnsRecord[] = [
    {
      name: domain,
      type: 'MX',
      value: mail,
      priority: 10,
      purpose: 'where the mail addressed to this domain is delivered',
    },
    {
      name: domain,
      type: 'TXT',
      value: 'v=spf1 mx -all',
      purpose: 'says that only this mail server may send mail for this domain',
    },
    {
      name: `_dmarc.${domain}`,
      type: 'TXT',
      value: `v=DMARC1; p=none; rua=mailto:${from || `postmaster@${domain}`}`,
      purpose: 'says what to do with the mail that does not pass the checks',
    },
    {
      name: `autodiscover.${domain}`,
      type: 'CNAME',
      value: mail,
      purpose: 'lets a mail client find the settings of the mailbox by itself',
    },
    {
      name: `autoconfig.${domain}`,
      type: 'CNAME',
      value: mail,
      purpose: 'lets a mail client set itself up by itself',
    },
  ];

  if (input.dkimPublic && input.dkimPublic.trim()) {
    records.push({
      name: `${DKIM_SELECTOR}._domainkey.${domain}`,
      type: 'TXT',
      value: `v=DKIM1; k=rsa; p=${input.dkimPublic.trim()}`,
      purpose: 'the key that signs the mail of this domain, so that it is not read as a forgery',
    });
  }

  return records;
}

/** What a lookup found. */
export interface MailDnsLookup {
  /** The values that are published under the name. */
  values: string[];
  /** Why the lookup could not be completed, if it could not. */
  error: string | null;
}

/** Reads the records of a name. */
export async function lookupRecords(name: string, type: 'MX' | 'TXT' | 'CNAME'): Promise<MailDnsLookup> {
  const resolver = new Resolver({ timeout: LOOKUP_TIMEOUT_MS, tries: 2 });
  try {
    if (type === 'MX') {
      const answer = await resolver.resolveMx(name);
      return { values: answer.map((entry) => entry.exchange), error: null };
    }
    if (type === 'TXT') {
      const answer = await resolver.resolveTxt(name);
      // The value of a record of TXT is published in pieces.
      return { values: answer.map((entry) => entry.join('')), error: null };
    }
    const answer = await resolver.resolveCname(name);
    return { values: answer, error: null };
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    // A name that does not exist yet is not an error: the customer simply
    // has not published the record yet.
    if (code === 'ENOTFOUND' || code === 'ENODATA') return { values: [], error: null };
    return { values: [], error: (error as Error).message };
  }
}

/**
 * What is really published for a domain of mail.
 */
export interface MailDnsStatus {
  /** The records the customer has to publish. */
  records: MailDnsRecord[];
  /** True when every record is published with the value the platform expects. */
  verified: boolean;
  /** The records that are not published yet, by name and type. */
  missing: { name: string; type: string; purpose: string }[];
}

/**
 * The lookup of a name.
 *
 * The check is written against this shape and not against the resolver, so a
 * test can answer with a DNS that is known and the check of the real DNS is
 * not needed to know whether the comparison is right.
 */
export type MailDnsLookupFunction = (
  name: string,
  type: 'MX' | 'TXT' | 'CNAME',
) => Promise<MailDnsLookup>;

/**
 * Checks, with real lookups, what a domain of mail has published.
 *
 * A record of MX is compared by the name of the mail server, because the
 * priority is what the customer chooses, not the platform. A record of TXT is
 * compared by the words it carries, because a customer may publish it with
 * the parts in another order.
 */
export async function checkMailDns(
  records: MailDnsRecord[],
  lookup: MailDnsLookupFunction = lookupRecords,
): Promise<MailDnsStatus> {
  const missing: MailDnsStatus['missing'] = [];

  for (const record of records) {
    const found = await lookup(record.name, record.type);
    if (found.error) {
      missing.push({ name: record.name, type: record.type, purpose: record.purpose });
      continue;
    }
    const expected = record.value.trim().toLowerCase();
    const present = found.values.some((value) => {
      const actual = value.trim().toLowerCase();
      if (record.type === 'TXT') {
        // A record of DKIM may carry more tags than the platform writes, so
        // the key itself is compared and not the whole record.
        const expectedKey = dkimKeyOf(expected);
        if (expectedKey) return dkimKeyOf(actual) === expectedKey;
        // The value of a record of TXT is published in pieces, and the parts
        // of a record like DMARC may be written in another order. The parts
        // are compared as a set, and not as a sentence.
        return sameParts(actual, expected);
      }
      // The name of a host may be written with a trailing dot or without it.
      // The two mean the same host.
      return sameHost(actual, expected);
    });
    if (!present) missing.push({ name: record.name, type: record.type, purpose: record.purpose });
  }

  return { records, verified: missing.length === 0, missing };
}

/**
 * The public key of a record of DKIM, when the record carries one.
 *
 * The record of DKIM is a text with tags, and the tag that carries the key
 * is the one that starts with "p=". The other tags say what the key may be
 * used for, and they are not the same in every mail server.
 */
function dkimKeyOf(value: string): string | null {
  const match = /(?:^|;)\s*p\s*=\s*([^;]+)/i.exec(value);
  return match ? match[1].trim() : null;
}

/**
 * True when two records of TXT carry the same parts.
 *
 * The parts are the pieces that a semicolon separates, and they are compared
 * without the order and without the spaces between them.
 */
function sameParts(actual: string, expected: string): boolean {
  const parts = (value: string) =>
    value
      .split(';')
      .map((part) => part.replace(/\s+/g, ''))
      .filter(Boolean)
      .sort();
  const left = parts(actual);
  const right = parts(expected);
  if (left.length !== right.length) return false;
  return left.every((part, index) => part === right[index]);
}

/**
 * True when two names are the same host.
 *
 * A name may be written with a trailing dot and the dot means nothing. A name
 * that is under the other one is the same host as well: "mail.blipmade.com"
 * is the host of "mail.blipmade.com." and the other way round.
 */
function sameHost(actual: string, expected: string): boolean {
  const left = actual.replace(/\.$/, '');
  const right = expected.replace(/\.$/, '');
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}
