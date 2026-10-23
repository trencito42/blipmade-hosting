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
const BILLING: NavEntry = { to: '/app/billing', label: 'Billing', shortLabel: 'Billing', icon: 'card' };
const SUPPORT: NavEntry = { to: '/app/tickets', label: 'Support', shortLabel: 'Support', icon: 'doc' };
const SETTINGS: NavEntry = { to: '/app/settings', label: 'Settings', shortLabel: 'Settings', icon: 'shield' };

export const CUSTOMER_NAV: NavEntry[] = [OVERVIEW, DEPLOY, INSTANCES, DOMAINS, BILLING, SUPPORT, SETTINGS];

/** Phone bottom bar: Overview, Apps, Billing, Support. */
export const CUSTOMER_PHONE_TABS: NavEntry[] = [OVERVIEW, INSTANCES, BILLING, SUPPORT];

export const ADMIN_NAV: NavEntry[] = [
  { to: '/admin', label: 'Dashboard', shortLabel: 'Home', icon: 'chart', exact: true },
  { to: '/admin/customers', label: 'Customers', shortLabel: 'Users', icon: 'box' },
  { to: '/admin/orders', label: 'Orders', shortLabel: 'Orders', icon: 'card' },
  { to: '/admin/services', label: 'Services', shortLabel: 'Services', icon: 'rocket' },
  { to: '/admin/products', label: 'Catalog', shortLabel: 'Catalog', icon: 'db' },
  { to: '/admin/pricing', label: 'Pricing', shortLabel: 'Pricing', icon: 'bolt' },
  { to: '/admin/tickets', label: 'Support queue', shortLabel: 'Tickets', icon: 'doc' },
  { to: '/admin/promotions', label: 'Promotions', shortLabel: 'Promos', icon: 'shield' },
  { to: '/admin/infrastructure', label: 'Infrastructure', shortLabel: 'Infra', icon: 'globe' },
  { to: '/admin/audit', label: 'Audit log', shortLabel: 'Audit', icon: 'term' },
  { to: '/admin/staff', label: 'Staff', shortLabel: 'Staff', icon: 'bot' },
  { to: '/admin/settings', label: 'Settings', shortLabel: 'Settings', icon: 'restart' },
];

/** Phone bottom bar: Dashboard, Customers, Promotions, Audit log. */
export const ADMIN_PHONE_TABS: NavEntry[] = [
  ADMIN_NAV[0]!,
  ADMIN_NAV[1]!,
  ADMIN_NAV[6]!,
  ADMIN_NAV[9]!,
];
