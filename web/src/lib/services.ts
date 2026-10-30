import type { AccountBillingSummary, Instance, MailServiceView, Subscription, VpsServerView } from './api';

/**
 * Everything an account runs, in one list.
 *
 * An account has apps and databases (instances), servers (VPS) and plans of
 * mail. The overview and the other pages that count "services" read this list
 * instead of each doing its own count, so the numbers agree.
 */

export type ServiceKind = 'app' | 'server' | 'mail';

export interface ServiceRow {
  key: string;
  kind: ServiceKind;
  id: string;
  name: string;
  /** What it is: the product, the plan. */
  typeLabel: string;
  /** For the product mark of an app. */
  slug: string | null;
  icon: string | null;
  /** The status in the words of the status pill. */
  status: string;
  statusLabel: string | null;
  /** The purchased limits, short. */
  limits: string[];
  /** The public address, when there is one. */
  address: string | null;
  to: string;
  /** The monthly price in cents, when the platform knows it. */
  price: number | null;
  currency: string | null;
  /** Why the customer has to look at it, or nothing when it is fine. */
  problem: string | null;
}

export function fmtMemory(mb: number): string {
  if (!Number.isFinite(mb)) return '—';
  if (mb < 1024) return `${mb} MB`;
  return `${Math.round((mb / 1024) * 100) / 100} GB`;
}

/** The subscription that pays for a service, found by the id the API gives it. */
function subscriptionOf(subscriptions: Subscription[], kind: 'server' | 'mail' | 'vps', id: string): Subscription | null {
  return subscriptions.find((subscription) => subscription.serviceKind === kind && subscription.serviceId === id) ?? null;
}

function appRow(instance: Instance, subscriptions: Subscription[]): ServiceRow {
  let problem: string | null = null;
  if (instance.status === 'failed') problem = 'The service failed.';
  else if (instance.status === 'degraded') problem = 'The service is degraded.';
  else if (instance.status === 'suspended') problem = 'The service is suspended.';
  else if (instance.subscription?.status === 'past_due') problem = 'The payment is past due.';
  const subscription = subscriptionOf(subscriptions, 'server', instance.id);
  return {
    key: `app:${instance.id}`,
    kind: 'app',
    id: instance.id,
    name: instance.name,
    typeLabel: instance.product.name,
    slug: instance.product.slug,
    icon: instance.product.icon,
    status: instance.status,
    statusLabel: null,
    limits: [fmtMemory(instance.ram), `${instance.cpu} vCPU`, `${instance.disk} GB`],
    address: instance.url,
    to: `/app/instances/${instance.id}`,
    price: instance.price ?? subscription?.amount ?? null,
    currency: instance.currency ?? subscription?.currency ?? null,
    problem,
  };
}

function serverRow(server: VpsServerView, subscriptions: Subscription[]): ServiceRow {
  let status: string;
  let problem: string | null = null;
  if (server.status === 'failed') {
    status = 'failed';
    problem = 'The server could not be built.';
  } else if (server.status === 'suspended') {
    status = 'suspended';
    problem = 'The server is stopped because the subscription is not paid.';
  } else if (server.status === 'pending' || server.status === 'provisioning') {
    status = 'provisioning';
  } else if (server.power === 'running') {
    status = 'online';
  } else if (server.power === 'stopped') {
    status = 'stopped';
  } else {
    // Proxmox could not be asked: the state is not known, so it is not drawn as running.
    status = 'neutral';
  }
  const subscription = subscriptionOf(subscriptions, 'vps', server.id);
  return {
    key: `server:${server.id}`,
    kind: 'server',
    id: server.id,
    name: server.name,
    typeLabel: server.plan.name,
    slug: null,
    icon: 'server',
    status,
    statusLabel: status === 'neutral' ? 'State unknown' : null,
    limits: [fmtMemory(server.ram), `${server.cpu} vCPU`, `${server.disk} GB`],
    address: server.publicIp ? (server.sshPort && server.sshPort !== 22 ? `${server.publicIp}:${server.sshPort}` : server.publicIp) : null,
    to: `/app/vps/${server.id}`,
    price: subscription?.amount ?? null,
    currency: subscription?.currency ?? null,
    problem,
  };
}

function mailRow(service: MailServiceView, subscriptions: Subscription[]): ServiceRow {
  let status = 'active';
  let statusLabel: string | null = null;
  let problem: string | null = null;
  switch (service.status) {
    case 'PENDING':
    case 'PROVISIONING':
      status = 'provisioning';
      break;
    case 'GRACE':
      status = 'past_due';
      statusLabel = 'Payment due';
      problem = 'The payment is late. The mail keeps working for a few days.';
      break;
    case 'SUSPENDED':
      status = 'suspended';
      problem = 'The mail is suspended because the subscription is not paid.';
      break;
    case 'CANCELLED':
      status = 'cancelled';
      break;
    default:
      status = 'active';
  }
  const subscription = subscriptionOf(subscriptions, 'mail', service.id);
  return {
    key: `mail:${service.id}`,
    kind: 'mail',
    id: service.id,
    name: service.plan.name,
    typeLabel: 'Email hosting',
    slug: null,
    icon: 'mail',
    status,
    statusLabel,
    limits: [`${service.usage.domains}/${service.limits.maxDomains} domains`, `${service.usage.mailboxes} mailboxes`],
    address: service.domains[0]?.name ?? null,
    to: '/app/mail',
    price: subscription?.amount ?? null,
    currency: subscription?.currency ?? null,
    problem,
  };
}

export function serviceRows(input: {
  instances: Instance[];
  servers: VpsServerView[];
  mail: MailServiceView[];
  summary: AccountBillingSummary | null;
}): ServiceRow[] {
  const subscriptions = input.summary?.subscriptions ?? [];
  return [
    ...input.instances.map((instance) => appRow(instance, subscriptions)),
    ...input.servers.filter((server) => server.status !== 'cancelled').map((server) => serverRow(server, subscriptions)),
    ...input.mail.filter((service) => service.status !== 'CANCELLED').map((service) => mailRow(service, subscriptions)),
  ];
}

/** The subscriptions whose payment is late, which need the customer even when the service still works. */
export function latePayments(summary: AccountBillingSummary | null): Subscription[] {
  return (summary?.subscriptions ?? []).filter((subscription) => subscription.status === 'past_due');
}

/** How the services are counted in one sentence: "2 apps · 1 server · 1 mail plan". */
export function countLine(rows: ServiceRow[]): string {
  const apps = rows.filter((row) => row.kind === 'app').length;
  const servers = rows.filter((row) => row.kind === 'server').length;
  const mail = rows.filter((row) => row.kind === 'mail').length;
  const parts = [
    apps ? `${apps} ${apps === 1 ? 'app or database' : 'apps and databases'}` : '',
    servers ? `${servers} ${servers === 1 ? 'server' : 'servers'}` : '',
    mail ? `${mail} mail ${mail === 1 ? 'plan' : 'plans'}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}
