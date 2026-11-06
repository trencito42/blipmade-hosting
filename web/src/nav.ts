import type { NavEntry, NavGroup } from './ui-app';

/**
 * The navigation of the customer area.
 *
 * "Deploy" is a section of its own: the customer picks a product there, and
 * the choice belongs to them. Every other entry is a place of the account.
 */
const OVERVIEW: NavEntry = { to: '/app', label: 'Overview', shortLabel: 'Overview', icon: 'chart', exact: true };
const DEPLOY: NavEntry = { to: '/app/deploy', label: 'Deploy', shortLabel: 'Deploy', icon: 'rocket' };
const INSTANCES: NavEntry = { to: '/app/instances', label: 'Apps & databases', shortLabel: 'Apps', icon: 'box' };
const DOMAINS: NavEntry = { to: '/app/domains', label: 'Domains', shortLabel: 'Domains', icon: 'globe' };
const MAIL: NavEntry = { to: '/app/mail', label: 'Email', shortLabel: 'Email', icon: 'mail' };
const VPS: NavEntry = { to: '/app/vps', label: 'Servers', shortLabel: 'Servers', icon: 'server' };
/** The phone tab for everything the customer owns: apps, servers, domains, email. A switch on the page moves between them. */
const SERVICES: NavEntry = { to: '/app/instances', label: 'Services', shortLabel: 'Services', icon: 'box', also: ['/app/vps', '/app/domains', '/app/mail'] };
const BILLING: NavEntry = { to: '/app/billing', label: 'Billing', shortLabel: 'Billing', icon: 'card' };
const SUPPORT: NavEntry = { to: '/app/tickets', label: 'Support', shortLabel: 'Support', icon: 'doc' };
const SETTINGS: NavEntry = { to: '/app/settings', label: 'Settings', shortLabel: 'Settings', icon: 'shield' };

export const CUSTOMER_NAV: NavEntry[] = [OVERVIEW, DEPLOY, INSTANCES, VPS, DOMAINS, MAIL, BILLING, SUPPORT, SETTINGS];

/**
 * The sidebar of the customer: the places that sell something or hold the account stand alone, and the services the
 * customer already has are one group that opens and closes.
 */
export const CUSTOMER_GROUPS: NavGroup[] = [
  { id: 'overview', label: OVERVIEW.label, icon: OVERVIEW.icon, items: [OVERVIEW] },
  { id: 'deploy', label: DEPLOY.label, icon: DEPLOY.icon, items: [DEPLOY] },
  { id: 'my-services', label: 'My services', icon: 'box', defaultOpen: true, items: [INSTANCES, VPS, DOMAINS, MAIL] },
  { id: 'billing', label: BILLING.label, icon: BILLING.icon, items: [BILLING] },
  { id: 'support', label: SUPPORT.label, icon: SUPPORT.icon, items: [SUPPORT] },
  { id: 'settings', label: SETTINGS.label, icon: SETTINGS.icon, items: [SETTINGS] },
];

/** Phone bottom bar: Overview, Services, the round Deploy button, Support. Billing and Settings open from More. */
export const CUSTOMER_PHONE_TABS: NavEntry[] = [OVERVIEW, SERVICES, { ...DEPLOY, primary: true }, SUPPORT];

/** The pages the Services tab holds, as a switch at the top of each on a phone. */
export const CUSTOMER_SERVICE_PAGES: NavEntry[] = [INSTANCES, VPS, DOMAINS, MAIL];

export const ADMIN_NAV: NavEntry[] = [
  { to: '/admin', label: 'Dashboard', shortLabel: 'Home', icon: 'chart', exact: true },
  { to: '/admin/customers', label: 'Customers', shortLabel: 'Users', icon: 'box' },
  { to: '/admin/orders', label: 'Orders', shortLabel: 'Orders', icon: 'card' },
  { to: '/admin/services', label: 'Services', shortLabel: 'Services', icon: 'rocket' },
  { to: '/admin/vps', label: 'Servers', shortLabel: 'VPS', icon: 'server' },
  { to: '/admin/products', label: 'Catalog', shortLabel: 'Catalog', icon: 'db' },
  { to: '/admin/catalog/families', label: 'Catalogue families', shortLabel: 'Families', icon: 'db' },
  { to: '/admin/pricing', label: 'Pricing', shortLabel: 'Pricing', icon: 'bolt' },
  { to: '/admin/support/analytics', label: 'Support numbers', shortLabel: 'Numbers', icon: 'chart' },
  { to: '/admin/support/automations', label: 'Support automations', shortLabel: 'Rules', icon: 'flow' },
  { to: '/admin/support/bots', label: 'Support bots', shortLabel: 'Bots', icon: 'bot' },
  { to: '/admin/support', label: 'Support console', shortLabel: 'Console', icon: 'doc' },
  { to: '/admin/tickets', label: 'Support queue', shortLabel: 'Tickets', icon: 'doc' },
  { to: '/admin/knowledge', label: 'Knowledge base', shortLabel: 'Know-how', icon: 'doc' },
  { to: '/admin/promotions', label: 'Promotions', shortLabel: 'Promos', icon: 'shield' },
  { to: '/admin/infrastructure', label: 'Infrastructure', shortLabel: 'Infra', icon: 'globe' },
  { to: '/admin/ops', label: 'Operations', shortLabel: 'Ops', icon: 'heart' },
  { to: '/admin/ops/backups', label: 'Backups & recovery', shortLabel: 'Backups', icon: 'heart' },
  { to: '/admin/ops/errors', label: 'Errors', shortLabel: 'Errors', icon: 'bolt' },
  { to: '/admin/incidents', label: 'Incidents', shortLabel: 'Incidents', icon: 'bolt' },
  { to: '/admin/abuse', label: 'Abuse reports', shortLabel: 'Abuse', icon: 'shield' },
  { to: '/admin/queues', label: 'Job queues', shortLabel: 'Queues', icon: 'restart' },
  { to: '/admin/reports', label: 'Reports', shortLabel: 'Reports', icon: 'chart' },
  { to: '/admin/mail', label: 'Mail', shortLabel: 'Mail', icon: 'mail' },
  { to: '/admin/notifications', label: 'Email & notifications', shortLabel: 'Notifications', icon: 'bell' },
  { to: '/admin/email-templates', label: 'Email wording', shortLabel: 'Wording', icon: 'mail' },
  { to: '/admin/content', label: 'Site content', shortLabel: 'Content', icon: 'doc' },
  { to: '/admin/tools', label: 'Operator tools', shortLabel: 'Tools', icon: 'restart' },
  { to: '/admin/audit', label: 'Audit log', shortLabel: 'Audit', icon: 'term' },
  { to: '/admin/activity', label: 'Activity', shortLabel: 'Activity', icon: 'term' },
  { to: '/admin/staff', label: 'Staff', shortLabel: 'Staff', icon: 'bot' },
  { to: '/admin/settings', label: 'Settings', shortLabel: 'Settings', icon: 'restart' },
  { to: '/admin/settings/integrations', label: 'Integrations', shortLabel: 'Integrations', icon: 'restart' },
];

/**
 * The entry of a route of the admin navigation.
 *
 * The phone bar picks its four entries by their route and not by their place
 * in the list, so a page that is added to the navigation cannot move the bar
 * under the feet of the operator.
 */
function adminTab(to: string): NavEntry {
  return ADMIN_NAV.find((entry) => entry.to === to) ?? ADMIN_NAV[0]!;
}

/** Phone bottom bar: Dashboard, Customers, Support console, Audit log. */
export const ADMIN_PHONE_TABS: NavEntry[] = [
  adminTab('/admin'),
  adminTab('/admin/customers'),
  adminTab('/admin/support'),
  adminTab('/admin/audit'),
];

const A = (to: string): NavEntry => {
  const entry = ADMIN_NAV.find((item) => item.to === to);
  if (!entry) throw new Error(`The admin page ${to} is not in the navigation.`);
  return entry;
};

/** 
 * Task-oriented admin navigation.
 *
 * Every route from ADMIN_NAV is preserved. Only the sidebar presentation changes:
 * short, focused groups keep unrelated workflows out of one long scrolling menu.
 * The active group opens automatically via GroupedNav.
 */
export const ADMIN_GROUPS: NavGroup[] = [
  { id: 'home', label: 'Dashboard', icon: 'chart', items: [A('/admin')] },
  { id: 'customers-sales', label: 'Customers & sales', icon: 'card', items: [A('/admin/customers'), A('/admin/orders'), A('/admin/promotions'), A('/admin/reports')] },
  { id: 'products-pricing', label: 'Products & pricing', icon: 'db', items: [A('/admin/products'), A('/admin/catalog/families'), A('/admin/pricing')] },
  { id: 'hosting-services', label: 'Hosting services', icon: 'rocket', items: [A('/admin/services'), A('/admin/vps'), A('/admin/mail'), A('/admin/infrastructure')] },
  { id: 'support-desk', label: 'Support desk', icon: 'doc', items: [A('/admin/support'), A('/admin/tickets'), A('/admin/knowledge')] },
  { id: 'support-workflows', label: 'Support workflows', icon: 'flow', items: [A('/admin/support/bots'), A('/admin/support/automations'), A('/admin/support/analytics')] },
  { id: 'trust-status', label: 'Trust & status', icon: 'shield', items: [A('/admin/abuse'), A('/admin/incidents')] },
  { id: 'platform-operations', label: 'Operations', icon: 'heart', items: [A('/admin/ops'), A('/admin/ops/backups'), A('/admin/ops/errors'), A('/admin/queues'), A('/admin/tools'), A('/admin/audit'), A('/admin/activity')] },
  { id: 'communications', label: 'Communications', icon: 'mail', items: [A('/admin/notifications'), A('/admin/email-templates'), A('/admin/content')] },
  { id: 'team-configuration', label: 'Team & settings', icon: 'shield', items: [A('/admin/staff'), A('/admin/settings'), A('/admin/settings/integrations')] },
];
