import { describe, expect, it } from 'vitest';
import {
  DKIM_SELECTOR,
  checkMailDns,
  lookupRecords,
  mailDnsRecords,
  type MailDnsLookup,
  type MailDnsLookupFunction,
  type MailDnsRecord,
} from '../src/services/mail-dns.js';

/**
 * The records of DNS of a domain of mail.
 *
 * The platform does not write these records: it tells the customer what to
 * publish and then it checks, with a real lookup, what is really published.
 * The check is written against a lookup that can be replaced, so the
 * comparison is tested against a DNS that is known, and not against whatever
 * the DNS of the world happens to answer on the day of the test.
 */

/** A DNS that answers with what the test tells it to answer. */
function fakeDns(answers: Record<string, string[]>): MailDnsLookupFunction {
  return async (name, type): Promise<MailDnsLookup> => {
    const values = answers[`${type}:${name}`] ?? [];
    return { values, error: null };
  };
}

const records = (dkim: string | null = 'thekey'): MailDnsRecord[] =>
  mailDnsRecords({
    domain: 'acme.ro',
    mailHostname: 'mail.blipmade.com',
    dkimPublic: dkim,
    fromAddress: 'postmaster@blipmade.com',
  });

describe('the records a domain of mail needs', () => {
  it('names the mail server in a record of MX', () => {
    const list = records();
    const mx = list.find((record) => record.type === 'MX');
    expect(mx?.name).toBe('acme.ro');
    expect(mx?.value).toBe('mail.blipmade.com');
    expect(mx?.priority).toBe(10);
  });

  it('says that only this mail server may send mail for the domain', () => {
    const list = records();
    const spf = list.find((record) => record.type === 'TXT' && record.name === 'acme.ro');
    expect(spf?.value).toBe('v=spf1 mx -all');
  });

  it('names a place where the reports of DMARC arrive', () => {
    const list = records();
    const dmarc = list.find((record) => record.name === '_dmarc.acme.ro');
    expect(dmarc?.type).toBe('TXT');
    expect(dmarc?.value).toContain('v=DMARC1');
    expect(dmarc?.value).toContain('postmaster@blipmade.com');
  });

  it('lets a mail client find the settings of the mailbox by itself', () => {
    const list = records();
    expect(list.find((record) => record.name === 'autodiscover.acme.ro')?.type).toBe('CNAME');
    expect(list.find((record) => record.name === 'autoconfig.acme.ro')?.type).toBe('CNAME');
  });

  it('asks for the key that signs the mail of the domain', () => {
    const list = records('thekey');
    const dkim = list.find((record) => record.name === `${DKIM_SELECTOR}._domainkey.acme.ro`);
    expect(dkim?.type).toBe('TXT');
    expect(dkim?.value).toContain('v=DKIM1');
    expect(dkim?.value).toContain('thekey');
  });

  it('does not ask for a key that does not exist', () => {
    // A record with an empty key would tell the customer to publish nothing,
    // and the mail would be signed by nobody.
    const list = records(null);
    expect(list.some((record) => record.name.includes('domainkey'))).toBe(false);
  });

  it('says what every record is for', () => {
    for (const record of records()) {
      expect(record.purpose.length).toBeGreaterThan(10);
    }
  });
});

describe('the check of what is published', () => {
  it('says that everything is there when every record is published', async () => {
    const list = records();
    const answer = await checkMailDns(list, fakeDns({
      'MX:acme.ro': ['mail.blipmade.com'],
      'TXT:acme.ro': ['v=spf1 mx -all'],
      'TXT:_dmarc.acme.ro': ['v=DMARC1; p=none; rua=mailto:postmaster@blipmade.com'],
      'CNAME:autodiscover.acme.ro': ['mail.blipmade.com'],
      'CNAME:autoconfig.acme.ro': ['mail.blipmade.com'],
      'TXT:dkim._domainkey.acme.ro': ['v=DKIM1; k=rsa; p=thekey'],
    }));
    expect(answer.verified).toBe(true);
    expect(answer.missing).toHaveLength(0);
  });

  it('names the records that are not published', async () => {
    const answer = await checkMailDns(records(), fakeDns({}));
    expect(answer.verified).toBe(false);
    const names = answer.missing.map((entry) => `${entry.type}:${entry.name}`);
    expect(names).toContain('MX:acme.ro');
    expect(names).toContain('TXT:acme.ro');
    expect(names).toContain('CNAME:autodiscover.acme.ro');
    expect(names).toContain('TXT:dkim._domainkey.acme.ro');
  });

  it('accepts a record of DKIM that carries more tags than the platform writes', async () => {
    // The mail server writes the record of DKIM with its own tags, and the
    // customer publishes that record. The key is the same and the record is
    // not, so the key is what is compared.
    const answer = await checkMailDns(records(), fakeDns({
      'MX:acme.ro': ['mail.blipmade.com'],
      'TXT:acme.ro': ['v=spf1 mx -all'],
      'TXT:_dmarc.acme.ro': ['v=DMARC1; p=none; rua=mailto:postmaster@blipmade.com'],
      'CNAME:autodiscover.acme.ro': ['mail.blipmade.com'],
      'CNAME:autoconfig.acme.ro': ['mail.blipmade.com'],
      'TXT:dkim._domainkey.acme.ro': ['v=DKIM1; k=rsa; t=s; s=email; p=thekey'],
    }));
    expect(answer.verified).toBe(true);
  });

  it('does not accept a record of DKIM with another key', async () => {
    const answer = await checkMailDns(records(), fakeDns({
      'TXT:dkim._domainkey.acme.ro': ['v=DKIM1; k=rsa; t=s; s=email; p=anotherkey'],
    }));
    expect(answer.verified).toBe(false);
    expect(answer.missing.some((entry) => entry.name === 'dkim._domainkey.acme.ro')).toBe(true);
  });

  it('does not care about the order of the parts of a record of TXT', async () => {    const answer = await checkMailDns(records(), fakeDns({
      'MX:acme.ro': ['mail.blipmade.com'],
      'TXT:acme.ro': ['v=spf1 mx -all'],
      'TXT:_dmarc.acme.ro': ['v=DMARC1; rua=mailto:postmaster@blipmade.com; p=none'],
      'CNAME:autodiscover.acme.ro': ['mail.blipmade.com'],
      'CNAME:autoconfig.acme.ro': ['mail.blipmade.com'],
      'TXT:dkim._domainkey.acme.ro': ['v=DKIM1; k=rsa; p=thekey'],
    }));
    expect(answer.verified).toBe(true);
  });

  it('accepts a record of MX that carries a trailing dot', async () => {
    const answer = await checkMailDns(records(), fakeDns({
      'MX:acme.ro': ['mail.blipmade.com.'],
      'TXT:acme.ro': ['v=spf1 mx -all'],
      'TXT:_dmarc.acme.ro': ['v=DMARC1; p=none; rua=mailto:postmaster@blipmade.com'],
      'CNAME:autodiscover.acme.ro': ['mail.blipmade.com.'],
      'CNAME:autoconfig.acme.ro': ['mail.blipmade.com.'],
      'TXT:dkim._domainkey.acme.ro': ['v=DKIM1; k=rsa; p=thekey'],
    }));
    expect(answer.verified).toBe(true);
  });

  it('says that a record is missing when the lookup failed', async () => {
    const answer = await checkMailDns(records(), async () => ({ values: [], error: 'the resolver timed out' }));
    expect(answer.verified).toBe(false);
    expect(answer.missing).toHaveLength(records().length);
  });

  it('does not accept a record of MX that points somewhere else', async () => {
    const answer = await checkMailDns(records(), fakeDns({
      'MX:acme.ro': ['mail.elsewhere.example'],
    }));
    const missing = answer.missing.filter((entry) => entry.type === 'MX');
    expect(missing).toHaveLength(1);
  });
});

describe('the real lookup', () => {
  it('says that a name that does not exist has nothing published', async () => {
    // The name is under ".test", which is reserved and never resolves. The
    // lookup still has to reach a resolver to learn that, and a resolver that
    // cannot be reached is an error and not a name without records.
    const answer = await lookupRecords('nothing-at-all.blipmade.test', 'MX');
    if (answer.error) {
      expect(answer.error.length).toBeGreaterThan(0);
      return;
    }
    expect(answer.values).toHaveLength(0);
  });
});
