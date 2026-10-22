import type { NavEntry } from './ui-app';

export const CUSTOMER_NAV: NavEntry[] = [
  { to: '/app', label: 'Overview', icon: 'box', exact: true },
  { to: '/app/instances', label: 'Apps & databases', icon: 'rocket' },
  { to: '/app/domains', label: 'Domains', icon: 'globe' },
  { to: '/app/billing', label: 'Billing', icon: 'card' },
  { to: '/app/tickets', label: 'Support', icon: 'doc' },
  { to: '/app/settings', label: 'Settings', icon: 'shield' },
];

/** Phone bottom bar: Overview, Instances, Billing, Support. */
export const CUSTOMER_PHONE_TABS: NavEntry[] = [
  CUSTOMER_NAV[0]!,
  CUSTOMER_NAV[1]!,
  CUSTOMER_NAV[3]!,
  CUSTOMER_NAV[4]!,
];

export const ADMIN_NAV: NavEntry[] = [
  { to: '/admin', label: 'Dashboard', icon: 'chart', exact: true },
  { to: '/admin/customers', label: 'Customers', icon: 'box' },
  { to: '/admin/orders', label: 'Orders', icon: 'card' },
  { to: '/admin/services', label: 'Services', icon: 'rocket' },
  { to: '/admin/products', label: 'Catalog', icon: 'db' },
  { to: '/admin/pricing', label: 'Pricing', icon: 'bolt' },
  { to: '/admin/tickets', label: 'Support', icon: 'doc' },
  { to: '/admin/promotions', label: 'Promotions', icon: 'shield' },
  { to: '/admin/infrastructure', label: 'Infrastructure', icon: 'globe' },
  { to: '/admin/audit', label: 'Audit log', icon: 'term' },
  { to: '/admin/staff', label: 'Staff', icon: 'bot' },
  { to: '/admin/settings', label: 'Settings', icon: 'restart' },
];

export const ADMIN_PHONE_TABS: NavEntry[] = [
  ADMIN_NAV[0]!,
  ADMIN_NAV[1]!,
  ADMIN_NAV[6]!,
  ADMIN_NAV[9]!,
];
