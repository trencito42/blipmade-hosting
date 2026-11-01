#!/usr/bin/env node
/** Curated customer documentation for the workflows that change most often. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'web/src/content/docs/pages.json');
const pages = JSON.parse(readFileSync(path, 'utf8'));
const date = '2026-11-01';
const page = (id, summary, sections) => ({ summary, updated: date, sections });
const replacements = new Map(Object.entries({
  'getting-started': page('getting-started', 'Create your account, verify your email and secure the first session.', [
    { id: 'create-account', title: 'Create your account', blocks: [
      { t: 'p', text: 'Open Create account and enter your real name, email address and a unique password. One person should use one account; free promotions are protected against duplicate accounts and repeated payment identities.' },
      { t: 'steps', items: [
        { title: 'Submit the form', body: 'Complete the four fields and submit the registration form. The page explains any field that needs attention.' },
        { title: 'Verify your email', body: 'Open the verification message and follow its link. If it does not arrive, use Resend verification from Settings and check the delivery address and spam folder.' },
        { title: 'Sign in', body: 'Open Sign in. If two-factor authentication is enabled, complete the second step with your authenticator, passkey or recovery code.' },
      ] },
    ] },
    { id: 'secure-account', title: 'Secure the account', blocks: [
      { t: 'p', text: 'Settings shows email verification, password, two-factor authentication, passkeys and active sessions. Revoke any session you do not recognise. Staff will never ask for your password, recovery codes or API keys.' },
      { t: 'callout', tone: 'tip', text: 'Enable two-factor authentication before adding payment details or production services.' },
    ] },
    { id: 'next', title: 'Next', blocks: [{ t: 'p', text: 'Go to [Deploy your first app](/docs?p=first-app), or open the catalog first if you are still choosing a product.' }] },
  ]),
  'first-app': page('first-app', 'Choose a product, review its real requirements and follow provisioning to a working service.', [
    { id: 'choose', title: 'Choose the product', blocks: [
      { t: 'p', text: 'Open Deploy and select the product you actually want to run. Products are installed automatically from their own template; an app, a database, a game server, hosted email and a VPS do not all use the same image or setup.' },
      { t: 'p', text: 'The product page shows its minimum resources, editable settings and current availability. A product that has not passed its deployment checks is not offered for purchase.' },
    ] },
    { id: 'configure', title: 'Configure and review', blocks: [
      { t: 'steps', items: [
        { title: 'Choose resources', body: 'Set RAM, vCPU and storage inside the limits shown by the product. Fixed-plan products show their plan instead of resource sliders.' },
        { title: 'Complete product fields', body: 'Enter only the settings shown for that product, such as a server name, token, domain or EULA acceptance. Secret values are encrypted.' },
        { title: 'Review the order', body: 'Confirm the service, billing address, discount, tax, recurring total and renewal interval. Stripe handles card details; an eligible 100% discount can finish without a card charge.' },
      ] },
    ] },
    { id: 'provisioning', title: 'Follow provisioning', blocks: [
      { t: 'p', text: 'The order and service pages show provisioning progress. Do not repeat checkout because a service is still starting. If provisioning fails, the existing order remains visible and support can retry the idempotent delivery instead of creating a duplicate.' },
      { t: 'p', text: 'When the service is online, open Console for first-start output and use the product guide for its own setup. The generated app hostname works through HTTPS; verified custom domains can be attached later.' },
    ] },
  ]),
  dashboard: page('dashboard', 'Find services, billing, support, notifications and account security in the customer dashboard.', [
    { id: 'navigation', title: 'Where things are', blocks: [
      { t: 'spec', rows: [
        { k: 'Overview', v: 'Account totals, recent activity and anything that needs attention.' },
        { k: 'Apps & databases', v: 'Container services, state, usage and management tools.' },
        { k: 'Servers', v: 'VPS power, console connection details and plan management.' },
        { k: 'Domains and Email', v: 'Verified app hostnames and hosted email services.' },
        { k: 'Billing', v: 'Orders, invoices, subscriptions, renewal dates and payment portal.' },
        { k: 'Support', v: 'Tickets and attachments in one conversation.' },
        { k: 'Settings', v: 'Profile, billing address, password, 2FA, passkeys and sessions.' },
      ] },
    ] },
    { id: 'service-state', title: 'Read a service state', blocks: [{ t: 'p', text: 'The visible state combines the platform record with the latest node check. Starting means the product is still coming up; Online means the runtime and health check agree; stale means the node could not provide a fresh answer. Recent activity translates internal events into customer-facing sentences.' }] },
    { id: 'search', title: 'Search and notifications', blocks: [{ t: 'p', text: 'Use Ctrl+K (Cmd+K on macOS) to find pages, services, tickets and domains. Opening a notification marks it as read and takes you to the relevant page when a destination exists.' }] },
  ]),
  billing: page('billing', 'Understand checkout, invoices, subscriptions, renewals, discounts and payment methods.', [
    { id: 'checkout', title: 'Checkout', blocks: [{ t: 'p', text: 'Before payment, checkout shows every line, discount, tax, billing address, amount due now and recurring amount. Stripe collects card details. Blipmade stores provider identifiers and billing records, not your card number.' }] },
    { id: 'billing-page', title: 'Billing page', blocks: [{ t: 'p', text: 'Billing lists orders, invoices and one subscription per service. A new subscription may not have a renewal date until Stripe has confirmed its billing period; the page must show that as pending rather than inventing a date.' }, { t: 'p', text: 'Use the payment portal to update the card and provider billing details. The billing address saved in Settings is used for future checkout and invoices.' }] },
    { id: 'free-orders', title: 'Free and discounted orders', blocks: [{ t: 'p', text: 'A promotion can reduce an eligible order, including to 100%. Free campaigns can require a verified email, limit the product and term, and reject duplicate accounts or payment identities. The review page explains the applied code before you confirm.' }] },
    { id: 'problems', title: 'If billing and service state disagree', blocks: [{ t: 'p', text: 'Do not place the order again. Open the order in Billing and include its number in a support ticket. Staff can inspect the Stripe webhook, invoice, payment, fulfilment and service chain from the same order record.' }] },
  ]),
  domains: page('domains', 'Attach a hostname, prove ownership and route it safely to an app instance.', [
    { id: 'add', title: 'Add the hostname', blocks: [{ t: 'steps', items: [
      { title: 'Choose the service', body: 'Open the instance and its Domains or Network tab, then enter the full hostname you control.' },
      { title: 'Publish verification DNS', body: 'Copy the TXT record exactly to your DNS provider. Verification prevents another account from claiming your hostname.' },
      { title: 'Point traffic to Blipmade', body: 'Publish the target record shown by the dashboard. Keep proxying disabled while diagnosing DNS unless the page explicitly supports the proxy in front of the service.' },
      { title: 'Wait for Active', body: 'Blipmade verifies DNS, creates the gateway route and provisions HTTPS. DNS and certificate issuance can take several minutes.' },
    ] }] },
    { id: 'remove', title: 'Remove a hostname', blocks: [{ t: 'p', text: 'Remove it from the service before reusing it on another account. Then remove the DNS records you no longer need. Removing a hostname does not delete the service or its files.' }] },
  ]),
  ssl: page('ssl', 'How HTTPS is issued for generated app hostnames and verified custom domains.', [
    { id: 'automatic', title: 'Automatic HTTPS', blocks: [{ t: 'p', text: 'Generated `*.apps.blipmade.com` hostnames and verified custom app hostnames are routed by the gateway and receive HTTPS automatically. You do not upload a certificate in the dashboard.' }] },
    { id: 'pending', title: 'While a certificate is pending', blocks: [{ t: 'p', text: 'First confirm that DNS resolves to the target shown by Blipmade. A proxy, CAA restriction or old IPv6 record can prevent validation. Do not repeatedly remove and add the hostname; wait a few minutes and check again.' }] },
    { id: 'errors', title: 'TLS errors', blocks: [{ t: 'trouble', items: [
      { q: 'The browser reports an unsupported protocol', a: 'The hostname reached an endpoint that did not present a compatible certificate. Check that the service domain is Active and that DNS points to the current gateway target.' },
      { q: 'The certificate has the wrong name', a: 'DNS may still point to an old server or a proxy may be serving its own certificate. Compare the hostname and DNS records with the Domains tab.' },
    ] }] },
  ]),
  backups: page('backups', 'Create, download and restore manual backups of an app instance safely.', [
    { id: 'scope', title: 'What an instance backup contains', blocks: [{ t: 'p', text: 'A backup is an archive created by the service panel from the files of that app container. It is not a full account backup, a VPS snapshot or a guaranteed export of data stored in an external database.' }, { t: 'callout', tone: 'warning', text: 'A backup kept only on the same node is not an independent disaster-recovery copy. Download important backups and keep them elsewhere.' }] },
    { id: 'create', title: 'Create and download', blocks: [{ t: 'steps', items: [
      { title: 'Open Backups', body: 'Open the instance and select Backups. The current limit and existing archives are shown there.' },
      { title: 'Create the backup', body: 'Choose New backup, give it a useful name and wait for the background job to finish. Do not restart or reinstall the service while the archive is being created.' },
      { title: 'Download important copies', body: 'Download the finished archive and verify that the file is not empty before relying on it.' },
    ] }] },
    { id: 'restore', title: 'Restore', blocks: [{ t: 'p', text: 'Restore replaces the current container files with the selected archive. Stop writes to the service first, confirm you selected the correct backup and expect a restart. Files created after the backup can be lost.' }] },
    { id: 'failure', title: 'If creation fails', blocks: [{ t: 'p', text: 'Reload the list once, check the backup limit and try a short name. If it still fails, open a ticket linked to the service and include the time of the attempt; do not create repeated jobs continuously.' }] },
  ]),
  faq: page('faq', 'Short, current answers about products, billing, access, domains, backups and support.', [
    { id: 'service', title: 'Services', blocks: [{ t: 'trouble', items: [
      { q: 'Does Blipmade install the selected product?', a: 'Yes. Catalog products use their own tested installation template. You only provide the product-specific fields shown during checkout.' },
      { q: 'Can I resize later?', a: 'Configurable app instances can request new RAM, CPU and storage from their management page. Fixed plans and VPS products show their own upgrade options.' },
      { q: 'Do I get SSH?', a: 'VPS plans include SSH using your public key. Managed app containers use Files, Console and Startup in the dashboard instead of direct SSH.' },
    ] }] },
    { id: 'billing', title: 'Billing', blocks: [{ t: 'trouble', items: [
      { q: 'Who processes card payments?', a: 'Stripe. Blipmade does not receive or store the full card number.' },
      { q: 'Why is a renewal date missing?', a: 'Stripe may not have confirmed the subscription period yet, especially immediately after checkout or for a free order. Billing updates when the provider event arrives.' },
      { q: 'Can a promotion make an order free?', a: 'Yes, when the campaign and order are eligible. Free campaigns can require verified email and apply anti-abuse limits.' },
    ] }] },
    { id: 'operations', title: 'Domains, backups and support', blocks: [{ t: 'trouble', items: [
      { q: 'Do custom domains get HTTPS?', a: 'Yes. After DNS verification and routing, Blipmade provisions HTTPS automatically.' },
      { q: 'Are backups automatic?', a: 'Customer app backups are manual unless the product explicitly says otherwise. Download important copies off the node.' },
      { q: 'How do I contact support?', a: 'Open a ticket from the dashboard, attach the affected service and include relevant files or screenshots. Replies stay in the ticket and can also be delivered by email.' },
    ] }] },
  ]),
}));

for (const entry of pages) {
  const replacement = replacements.get(entry.id);
  if (replacement) Object.assign(entry, replacement);
}
// Keep cross-cutting operational answers aligned with the current product
// boundaries even when their surrounding page is not part of the rewrite.
const stale = new Map([
  ['The checkout of the platform is turned off. No session of payment is created and no card is charged; the order stays in the state Pending.', 'Checkout is temporarily unavailable. No payment session was created and no card was charged. Keep the existing order and try again later or contact support with its number.'],
  ['The operator cannot open a shell in your instance: there is no SSH and no SFTP in the platform. The file browser and the console are the way in.', 'Managed app containers use the file browser and console instead of direct SSH or SFTP. VPS plans are separate virtual machines and include SSH access with your key.'],
  ['The operator cannot restore the contents of an instance for you. The platform takes no automatic backup of the data inside your instance, so the copy you keep is yours.', 'Support cannot invent missing data. You can restore an existing manual app backup from the instance; important archives should also be downloaded and kept outside the node.'],
]);
const rewritten = JSON.parse(JSON.stringify(pages), (_key, value) => typeof value === 'string' && stale.has(value) ? stale.get(value) : value);
writeFileSync(path, `${JSON.stringify(rewritten, null, 2)}\n`);
console.log(`Rewrote ${replacements.size} core documentation pages.`);
