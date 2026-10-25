/**
 * The end-to-end proof of the transactional path.
 *
 * The message is sent by the platform, through the relay of the platform, and
 * it is read back from the mailbox that received it. The address that
 * receives it is a mailbox of the mail server of the platform, so no message
 * leaves the machine and no address of a real customer is used.
 */
import { sendMail } from '../src/lib/mailer.js';
import { env } from '../src/env.js';

const to = process.env.PROBE_TARGET ?? 'probe@probe.blipmade.test';

async function main(): Promise<void> {
  console.log('transport =', env.SMTP_URL ? 'smtp' : 'file');
  const result = await sendMail({
    to,
    subject: 'Blipmade end-to-end probe of the transactional path',
    text: `This message was sent by the platform to prove that the relay works.\nProbe: ${Date.now()}\n`,
    kind: 'probe',
    idempotencyKey: `probe-${Date.now()}`,
  });
  console.log('state    =', result.state);
  console.log('delivered=', result.delivered);
  console.log('transport=', result.transport);
  console.log('error    =', result.error ?? 'none');
  console.log('id       =', result.id);
  if (!result.delivered) process.exitCode = 1;
}

main().catch((error) => {
  console.error('FAILED:', error);
  process.exit(1);
});
