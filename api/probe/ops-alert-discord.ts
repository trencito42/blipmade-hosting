/**
 * The proof that the Discord channel of the operator works.
 *
 * The probe builds the alert that the platform builds when the mail system
 * does not answer, and it sends it through the same channel that the sweep
 * of the health uses. The mail system is not involved at all: the alert says
 * that the mail is down, and it still leaves the host.
 *
 * The address of the channel is a secret, so the probe never prints it. It
 * prints what Discord answered and nothing else.
 *
 *   npx tsx probe/ops-alert-discord.ts
 */
import { discordWebhookUrl, sendDiscordAlert, toDiscordAlert } from '../src/services/ops-alert-discord.js';

async function main(): Promise<void> {
  const url = discordWebhookUrl();
  if (!url) {
    console.error('No Discord channel is configured. Set OPS_DISCORD_WEBHOOK_URL or OPS_DISCORD_WEBHOOK_FILE.');
    process.exit(2);
  }
  console.log('a Discord channel is configured (the address is not shown).');

  const alert = toDiscordAlert({
    severity: 'critical',
    title: 'The mail system does not answer',
    detail: 'The check of the mail system failed three times in a row: the connection was refused.',
    check: 'mailcow',
    fingerprint: 'probe:mailcow:offline',
  });

  const delivery = await sendDiscordAlert(alert);
  console.log(`result       : ${delivery.status}`);
  console.log(`reason       : ${delivery.reason}`);
  if (delivery.httpStatus) console.log(`http status  : ${delivery.httpStatus}`);
  console.log(`attempts     : ${delivery.attempts}`);
  console.log(`incident     : ${alert.incidentId}`);

  if (delivery.status !== 'sent') {
    console.error('The message did not reach the channel.');
    process.exit(1);
  }
  console.log('The alert about the mail system reached the Discord channel.');
}

main().catch((error) => {
  console.error('The probe failed:', (error as Error).message);
  process.exitCode = 1;
});
