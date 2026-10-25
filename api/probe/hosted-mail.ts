/**
 * The end-to-end proof of the hosted mail.
 *
 * The platform asks the mail server for a domain, the domain really appears
 * in the mail server, the records of DNS that the customer has to publish are
 * produced and checked, and the domain is removed at the end. The domain of
 * the probe is under ".test", which is reserved and never resolves, so no
 * domain of a customer is touched.
 */
import { prisma } from '../src/db.js';
import * as mailcow from '../src/services/mailcow.js';
import * as mail from '../src/services/mail.js';
import { mailDnsRecords, checkMailDns } from '../src/services/mail-dns.js';
import { env } from '../src/env.js';

const DOMAIN = 'probe-e2e.blipmade.test';

async function main(): Promise<void> {
  console.log('api url      =', env.MAILCOW_API_URL);
  console.log('fingerprint  =', env.MAILCOW_API_CERT_SHA256 ? 'set' : 'NOT SET');
  console.log('key          =', env.MAILCOW_API_KEY ? 'set' : 'NOT SET');

  console.log('version      =', await mailcow.mailcowVersion());
  const disk = await mailcow.mailcowDisk();
  console.log('disk         =', disk ? `${disk.used} of ${disk.total} (${disk.usedPercent})` : 'none');

  const before = await mailcow.mailcowDomains();
  console.log('domains before =', before.length);

  // The disposable database is cleaned, so the probe starts from nothing.
  await prisma.mailJob.deleteMany({});
  await prisma.mailAlias.deleteMany({});
  await prisma.mailbox.deleteMany({});
  await prisma.mailDomain.deleteMany({});

  const account = await prisma.user.create({
    data: {
      email: `probe-${Date.now()}@example.com`,
      passwordHash: 'probe',
      firstName: 'Probe',
      lastName: 'Customer',
    },
  });
  const user = { id: account.id, email: account.email };

  const created = await mail.createMailDomain(user, DOMAIN);
  console.log('created      =', created.name, created.status);
  console.log('dkim public  =', created.dkimPublic ? created.dkimPublic.slice(0, 40) + '...' : 'none');

  const after = await mailcow.mailcowDomains();
  const inSystem = after.find((domain) => domain.domain_name === DOMAIN);
  console.log('domains after  =', after.length);
  console.log('in the mail server =', Boolean(inSystem));
  console.log('mailboxes allowed  =', inSystem?.max_num_mboxes_for_domain);
  console.log('aliases allowed    =', inSystem?.max_num_aliases_for_domain);

  const records = mailDnsRecords({
    domain: DOMAIN,
    mailHostname: env.MAIL_HOSTNAME,
    dkimPublic: created.dkimPublic,
    fromAddress: env.MAIL_RUA_ADDRESS,
  });
  console.log('--- the records the customer has to publish ---');
  for (const record of records) {
    console.log(`${record.type} ${record.name} -> ${record.value}`);
  }
  const status = await checkMailDns(records);
  console.log('dns verified =', status.verified, '(missing:', status.missing.length, ')');

  const mailbox = await mail.createMailbox(user, created.id, 'contact');
  console.log('mailbox      =', mailbox.address, 'password shown =', Boolean(mailbox.password));
  const alias = await mail.createAlias(user, created.id, 'info', 'contact');
  console.log('alias        =', alias.alias, '->', alias.target);

  const jobs = await prisma.mailJob.findMany({ orderBy: { createdAt: 'asc' } });
  console.log('--- the journal of the work ---');
  for (const job of jobs) console.log(`${job.kind}: ${job.status}${job.lastError ? ' (' + job.lastError + ')' : ''}`);

  await mail.deleteAlias(user, created.id, alias.id);
  await mail.deleteMailbox(user, created.id, mailbox.id);
  await mail.deleteMailDomain(user, created.id);

  const final = await mailcow.mailcowDomains();
  console.log('domains at the end =', final.length);
  console.log('the domain is gone =', !final.some((domain) => domain.domain_name === DOMAIN));
}

main()
  .catch((error) => {
    console.error('FAILED:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
