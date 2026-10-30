import type { NavEntry } from './ui-app';

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
const BILLING: NavEntry = { to: '/app/billing', label: 'Billing', shortLabel: 'Billing', icon: 'card' };
const SUPPORT: NavEntry = { to: '/app/tickets', label: 'Support', shortLabel: 'Support', icon: 'doc' };
const SETTINGS: NavEntry = { to: '/app/settings', label: 'Settings', shortLabel: 'Settings', icon: 'shield' };

export const CUSTOMER_NAV: NavEntry[] = [OVERVIEW, DEPLOY, INSTANCES, VPS, DOMAINS, MAIL, BILLING, SUPPORT, SETTINGS];

/** Phone bottom bar: Overview, Apps, the round Deploy button, Support. The rest opens from More. */
export const CUSTOMER_PHONE_TABS: NavEntry[] = [OVERVIEW, INSTANCES, { ...DEPLOY, primary: true }, SUPPORT];

export const ADMIN_NAV: NavEntry[] = [
  { to: '/admin', label: 'Dashboard', shortLabel: 'Home', icon: 'chart', exact: true },
  { to: '/admin/customers', label: 'Customers', shortLabel: 'Users', icon: 'box' },
  { to: '/admin/orders', label: 'Orders', shortLabel: 'Orders', icon: 'card' },
  { to: '/admin/services', label: 'Services', shortLabel: 'Services', icon: 'rocket' },
  { to: '/admin/vps', label: 'Servers', shortLabel: 'VPS', icon: 'server' },
  { to: '/admin/products', label: 'Catalog', shortLabel: 'Catalog', icon: 'db' },
  { to: '/admin/pricing', label: 'Pricing', shortLabel: 'Pricing', icon: 'bolt' },
  { to: '/admin/tickets', label: 'Support queue', shortLabel: 'Tickets', icon: 'doc' },
  { to: '/admin/promotions', label: 'Promotions', shortLabel: 'Promos', icon: 'shield' },
  { to: '/admin/infrastructure', label: 'Infrastructure', shortLabel: 'Infra', icon: 'globe' },
  { to: '/admin/ops', label: 'Operations', shortLabel: 'Ops', icon: 'heart' },
  { to: '/admin/mail', label: 'Mail', shortLabel: 'Mail', icon: 'mail' },
  { to: '/admin/notifications', label: 'Email & notifications', shortLabel: 'Notifications', icon: 'bell' },
  { to: '/admin/audit', label: 'Audit log', shortLabel: 'Audit', icon: 'term' },
  { to: '/admin/staff', label: 'Staff', shortLabel: 'Staff', icon: 'bot' },
  { to: '/admin/settings', label: 'Settings', shortLabel: 'Settings', icon: 'restart' },
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

/** Phone bottom bar: Dashboard, Customers, Support queue, Audit log. */
export const ADMIN_PHONE_TABS: NavEntry[] = [
  adminTab('/admin'),
  adminTab('/admin/customers'),
  adminTab('/admin/tickets'),
  adminTab('/admin/audit'),
];
