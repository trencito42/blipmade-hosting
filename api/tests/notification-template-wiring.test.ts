import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The templates of the notification engine, and the triggers that fire them.
 *
 * The catalogue of the platform holds one template per event of the
 * notification engine. A template that no trigger can reach is a message the
 * platform will never send: it sits in the catalogue, it is shown in the back
 * office, and it looks ready.
 *
 * The suite of the platform renders every template with a made-up payload, so
 * it passes with a template that nothing can ever fire. This test closes that
 * hole: it follows every event of the registry to the place that publishes it
 * and then to the place that calls that publisher, and it fails when a
 * template is out of reach.
 *
 * The list of the templates that are known to be out of reach is written
 * down here, with the reason of each one. The list is the work that is left,
 * not a list that may grow: the test fails when a template is out of reach
 * and is not in the list, and it fails as well when a template of the list
 * becomes reachable, because then the list is out of date.
 */

const ROOT = resolve(process.cwd(), '..');
const SRC = join(ROOT, 'api', 'src');

/**
 * The templates that no trigger can reach today, and why.
 *
 * Every entry is a decision that is written down: either the message is
 * delivered by another path, or the feature that should fire it does not
 * exist yet.
 */
const KNOWN_UNREACHABLE: Record<string, string> = {
  // The message is delivered by the old hand-written template of the change
  // of the address (api/src/lib/email-templates.ts), so the event of the
  // catalogue would be a second message about the same thing.
  'account-email-change-requested': 'the message is delivered by the legacy template of the change of the address',
  // The cancellation of a subscription, the plan of the cancellation and the
  // reactivation already have their own events, so a general one would be a
  // second message about the same change.
  'subscription-changed': 'the specific events of the change already exist',
  // The lifecycle of the service is not swept yet: nothing asks the platform
  // whether a service is about to expire or has expired.
  'service-expiring': 'the sweep of the services that expire does not exist yet',
  'service-expired': 'the sweep of the services that expire does not exist yet',
  'service-canceled': 'the sweep of the services that expire does not exist yet',
  'service-deleted': 'the sweep of the services that expire does not exist yet',
  'service-unsuspended': 'the sweep of the services that expire does not exist yet',
  'service-provisioning-started': 'the start of the provisioning is not published',
  'service-incident': 'no incident of a service is published',
  'service-restored': 'no incident of a service is published',
  'service-upgrade-completed': 'the upgrade of a service publishes nothing',
  'service-upgrade-failed': 'the upgrade of a service publishes nothing',
  'subscription-grace-period': 'the grace period of a subscription is not swept',
  'subscription-suspension-warning': 'the grace period of a subscription is not swept',
  'invoice-reminder-due': 'the invoice that is due is not reminded',
  'account-deletion-requested': 'the closure of an account publishes nothing',
  'ticket-resolved': 'the ticket of a customer is closed with another event',
  // The mail of a customer is not delivered yet, so the events of the mail
  // boxes cannot fire.
  'mailbox-provisioning-failed': 'the mail of a customer is not delivered yet',
  'mailbox-password-reset': 'the mail of a customer is not delivered yet',
  'mailhosting-activated': 'the mail of a customer is not delivered yet',
  'mailhosting-canceled': 'the mail of a customer is not delivered yet',
  'mailhosting-renewal-reminder': 'the mail of a customer is not delivered yet',
  // The alarms of the operator are no longer in this list: the sweep of the
  // health of the platform (api/src/services/ops-health.ts) watches the
  // provisioning, the webhooks, the delivery of the messages, the backups,
  // the copy that leaves the host, the drill of the restore, the mail
  // server, the capacity, the certificates, the incidents and the changes
  // that touch the security, and it publishes them.
};

/** Every file of the source of the API. */
async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

/** The catalogue of the templates, read from the source. */
async function catalogue(): Promise<string[]> {
  const source = await readFile(join(SRC, 'lib', 'email-design.ts'), 'utf-8');
  const block = source.split('const CATALOGUE: TemplateDefinition[] = [')[1]?.split('\n];')[0] ?? '';
  return [...block.matchAll(/^\s{4}id: '([^']+)'/gm)].map((match) => match[1]);
}

/** The registry of the events, read from the source. */
async function registry(): Promise<{ type: string; template: string }[]> {
  const source = await readFile(join(SRC, 'services', 'notification-events.ts'), 'utf-8');
  const block = source.split('export const EVENT_DEFINITIONS: EventRegistry = {')[1] ?? '';
  const markers = [...block.matchAll(/'([a-z0-9_.]+)': definition\(\{/g)];
  return markers.map((marker, index) => {
    const untilNext = block.slice(marker.index, markers[index + 1]?.index ?? block.length);
    const template = untilNext.match(/template: '([^']+)'/);
    return { type: marker[1], template: template?.[1] ?? '' };
  });
}

/**
 * The publisher of every event, and whether it is called.
 *
 * A publisher lives in `notifications.ts` and is a function that publishes the
 * event. An event is reachable when the publisher is called from somewhere
 * else, because a publisher that nobody calls never publishes anything.
 */
async function reachability(): Promise<Map<string, { publisher: string | null; reachable: boolean }>> {
  const notifications = await readFile(join(SRC, 'services', 'notifications.ts'), 'utf-8');

  const others = (await sourceFiles(SRC))
    .filter((file) => !file.endsWith('notifications.ts') && !file.endsWith('notification-events.ts'))
    .map((file) => readFile(file, 'utf-8'));
  const corpus = (await Promise.all(others)).join('\n');

  // The source is split on the publishers themselves, so every publish call
  // belongs to the function that holds it and to no other one.
  const publishers = new Map<string, string>();
  for (const chunk of notifications.split(/export async function /).slice(1)) {
    const name = chunk.match(/^([a-zA-Z0-9_]+)/)?.[1];
    if (!name) continue;
    for (const call of chunk.matchAll(/publish\(\s*'([a-z0-9_.]+)'/g)) {
      publishers.set(call[1], name);
    }
  }

  const events = await registry();
  const result = new Map<string, { publisher: string | null; reachable: boolean }>();

  for (const event of events) {
    const publisher = publishers.get(event.type) ?? null;
    const reachable = publisher !== null && new RegExp(`\\b${publisher}\\(`).test(corpus);
    result.set(event.type, { publisher, reachable });
  }

  return result;
}

describe('the templates of the notification engine', () => {
  it('holds one template for every event of the registry', async () => {
    const ids = await catalogue();
    const events = await registry();

    expect(ids.length).toBe(72);
    expect(events.length).toBe(72);

    const templates = events.map((event) => event.template).sort();
    expect(templates).toEqual([...ids].sort());
  });

  it('fires every template that is not written down as out of reach', async () => {
    const events = await registry();
    const reach = await reachability();

    const unreachable = events
      .filter((event) => !reach.get(event.type)?.reachable)
      .map((event) => event.template)
      .sort();

    const known = Object.keys(KNOWN_UNREACHABLE).sort();

    // A template that nobody can fire is a message that is never sent. The
    // list of the known ones is the work that is left, so it may not grow.
    expect(unreachable).toEqual(known);
  });

  it('keeps the reason of every template that is out of reach', async () => {
    for (const [template, reason] of Object.entries(KNOWN_UNREACHABLE)) {
      expect(reason.length).toBeGreaterThan(10);
      expect(reason.trim()).toBe(reason);
    }
  });

  it('names the publisher of every event that is meant to be fired', async () => {
    const events = await registry();
    const reach = await reachability();

    for (const event of events) {
      if (KNOWN_UNREACHABLE[event.template]) continue;
      expect(reach.get(event.type)?.publisher, `the event ${event.type} has no publisher`).toBeTruthy();
    }
  });
});
