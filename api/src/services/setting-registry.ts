import { z } from 'zod';
import { hasPermission, type Permission } from '../lib/permissions.js';
import { OPERATOR_SETTINGS, validateOperatorSetting } from './operator-settings.js';

/**
 * The registry of every key of the `Setting` table.
 *
 * The table is a key-value store that many parts of the platform read and a
 * few write. Before this registry the general endpoint wrote any key to
 * anyone holding `settings.write`, so that permission was also the permission
 * to change the rate card, the staff security rules, the capacity of the
 * nodes and the retention of customer data. Here every key names its owner:
 * the domain it belongs to, the permission that reads it, the permission that
 * writes it, and whether the general endpoint may write it at all.
 *
 * A key that is not in this registry cannot be written through the general
 * endpoint: the registry fails closed. Keys that carry customer data or
 * counters of the platform are hidden from every settings endpoint.
 */

export type SettingDomain =
  | 'company'
  | 'legal'
  | 'privacy'
  | 'refunds'
  | 'commitments'
  | 'contacts'
  | 'pricing'
  | 'security'
  | 'capacity'
  | 'infrastructure'
  | 'support'
  | 'mail'
  | 'backups'
  | 'platform';

export type SettingEffect = 'immediate' | 'cached' | 'operational';

export interface SettingPolicy {
  /** The key, or the prefix when `prefix` is set. */
  key: string;
  prefix?: boolean;
  /** The domain that owns the key. */
  domain: SettingDomain;
  /** The permission that reads the key. */
  read: Permission;
  /** The permission that writes the key. `null` means that no endpoint of the staff writes it. */
  write: Permission | null;
  /** Whether PUT and DELETE /admin/settings may write the key. */
  general: boolean;
  /** Hidden keys are never listed, never returned and never written by the staff area. */
  hidden?: boolean;
  /** Whether the value is shown on the public pages. */
  public: boolean;
  /** When a change takes effect. */
  effect: SettingEffect;
  /** Where the key is managed when it is not written by the general endpoint. */
  managedBy?: string;
  /** The shape of the value. A key without a schema is validated by the registry of the operator. */
  schema?: z.ZodTypeAny;
}

const nodeId = z.string().regex(/^\d{1,6}$/);

const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'Each entry must be a domain name such as example.com.');

const BY_DOMAIN: Record<string, SettingDomain> = {
  'Company & tax': 'company',
  'Public contacts': 'contacts',
  'Legal decisions': 'legal',
  'Privacy policy': 'privacy',
  'Refund policy': 'refunds',
  'Service commitments': 'commitments',
};

/** The settings of the operator: text and contacts the operator owns. */
const OPERATOR_POLICIES: SettingPolicy[] = OPERATOR_SETTINGS.map((definition) => ({
  key: definition.key,
  domain: BY_DOMAIN[definition.group] ?? 'company',
  read: 'settings.read',
  // The rate of the tax changes what a customer is charged, so it belongs to
  // the owner of the pricing and not to the owner of the settings.
  write: definition.key === 'billing.tax_rate' ? 'pricing.write' : 'settings.write',
  general: true,
  public: definition.public === true,
  effect: 'immediate',
}));

const POLICIES: SettingPolicy[] = [
  ...OPERATOR_POLICIES,

  // --- infrastructure policy that the operator may tune from the general page -------------
  {
    key: 'reserved_domains',
    domain: 'infrastructure',
    read: 'infrastructure.read',
    write: 'infrastructure.write',
    general: true,
    public: false,
    effect: 'immediate',
    schema: z.array(hostname).max(500),
  },
  {
    key: 'auto_delete_cancelled_instances',
    domain: 'infrastructure',
    read: 'infrastructure.read',
    write: 'infrastructure.write',
    general: true,
    public: false,
    effect: 'operational',
    schema: z.object({ enabled: z.boolean(), retentionDays: z.number().int().min(1).max(3650) }).strict(),
  },
  {
    key: 'capacity.node_cores',
    domain: 'capacity',
    read: 'infrastructure.read',
    write: 'infrastructure.write',
    general: true,
    public: false,
    effect: 'cached',
    schema: z.record(nodeId, z.number().int().min(1).max(1024)),
  },
  {
    key: 'capacity.cpu_oversubscription',
    domain: 'capacity',
    read: 'infrastructure.read',
    write: 'infrastructure.write',
    general: true,
    public: false,
    effect: 'cached',
    schema: z.object({ value: z.number().min(1).max(32) }).strict(),
  },
  {
    key: 'capacity.node_costs',
    domain: 'capacity',
    read: 'infrastructure.read',
    write: 'infrastructure.write',
    general: true,
    public: false,
    effect: 'cached',
    schema: z.record(nodeId, z.number().min(0).max(1_000_000)),
  },

  // --- the lifecycle of a VPS whose subscription is not paid ---------------------------------
  {
    key: 'vps.retention_days',
    domain: 'infrastructure',
    read: 'infrastructure.read',
    write: 'infrastructure.write',
    general: true,
    public: false,
    effect: 'immediate',
    // Never below the default: a shorter period would delete a customer's data sooner than the platform promises.
    schema: z.number().int().min(14).max(365),
  },
  {
    key: 'vps.payment_grace_days',
    domain: 'infrastructure',
    read: 'infrastructure.read',
    write: 'infrastructure.write',
    general: true,
    public: false,
    effect: 'immediate',
    schema: z.number().int().min(0).max(30),
  },

  {
    // The reduction of a yearly term of a game server. Zero means no reduction.
    key: 'pricing.yearly_discount_percent',
    domain: 'pricing',
    read: 'pricing.read',
    write: 'pricing.write',
    general: true,
    public: false,
    effect: 'cached',
    schema: z.object({ value: z.number().int().min(0).max(50) }).strict(),
  },

  // --- keys with a dedicated owner: the general endpoint never writes them ----------------
  {
    key: 'pricing_resources',
    domain: 'pricing',
    read: 'pricing.read',
    write: 'pricing.write',
    general: false,
    public: false,
    effect: 'cached',
    managedBy: 'PUT /admin/pricing',
  },
  {
    key: 'security.staff_2fa_required',
    domain: 'security',
    read: 'settings.read',
    write: 'staff.write',
    general: false,
    public: false,
    effect: 'immediate',
    managedBy: 'PUT /admin/security',
  },
  {
    key: 'security.admin_ip_allowlist',
    domain: 'security',
    read: 'settings.read',
    write: 'staff.write',
    general: false,
    public: false,
    effect: 'immediate',
    managedBy: 'PUT /admin/security',
  },
  {
    key: 'email.template.',
    prefix: true,
    domain: 'mail',
    read: 'settings.read',
    write: 'settings.write',
    general: false,
    public: false,
    effect: 'immediate',
    managedBy: 'PUT /admin/email-templates/:id',
  },
  {
    key: 'support.replies',
    domain: 'support',
    read: 'tickets.write',
    write: 'tickets.write',
    general: false,
    public: false,
    effect: 'immediate',
    managedBy: 'PUT /admin/support/replies',
  },
  {
    key: 'support.knowledge',
    domain: 'support',
    read: 'tickets.read',
    write: 'tickets.write',
    general: false,
    public: false,
    effect: 'immediate',
    managedBy: 'PUT /admin/support/knowledge',
  },
  {
    // The state of the destination is reported by the backup agent.
    key: 'offsite.destination',
    domain: 'backups',
    read: 'infrastructure.read',
    write: null,
    general: false,
    public: false,
    effect: 'immediate',
    managedBy: 'the backup agent',
  },

  // --- keys of the platform itself ---------------------------------------------------------
  {
    // The export of every cancelled customer lives in this record.
    key: 'catalog.studio_wizard.',
    prefix: true,
    domain: 'platform',
    read: 'products.read',
    write: 'products.write',
    general: false,
    public: false,
    effect: 'immediate',
    managedBy: 'PUT /admin/catalog/studio/:slug/wizard',
  },
  {
    // The export of every cancelled customer lives in this record.
    key: 'cancelled_instance_retention',
    domain: 'platform',
    read: 'settings.read',
    write: null,
    general: false,
    hidden: true,
    public: false,
    effect: 'operational',
  },
  {
    // The counters of the order numbers and the invoice numbers.
    key: 'internal.',
    prefix: true,
    domain: 'platform',
    read: 'settings.read',
    write: null,
    general: false,
    hidden: true,
    public: false,
    effect: 'operational',
  },
];

const exact = new Map(POLICIES.filter((policy) => !policy.prefix).map((policy) => [policy.key, policy]));
const prefixes = POLICIES.filter((policy) => policy.prefix);

/** The policy of a key, or `null` when the key is not registered. */
export function settingPolicy(key: string): SettingPolicy | null {
  return exact.get(key) ?? prefixes.find((policy) => key.startsWith(policy.key)) ?? null;
}

/** Whether the staff member may see the value of the key. Unregistered keys are never shown. */
export function mayReadSetting(key: string, role: string, granted: string[] | undefined): boolean {
  const policy = settingPolicy(key);
  if (!policy || policy.hidden) return false;
  return hasPermission(role, granted, policy.read);
}

/** Whether the staff member holds the permission that owns the key. */
export function mayWriteSetting(key: string, role: string, granted: string[] | undefined): boolean {
  const policy = settingPolicy(key);
  if (!policy || policy.write === null) return false;
  return hasPermission(role, granted, policy.write);
}

export class SettingRefusal extends Error {
  constructor(
    readonly kind: 'unknown' | 'dedicated' | 'protected' | 'permission' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Checks that the general endpoint may write the key, and returns the value
 * that has to be stored. It throws a `SettingRefusal` that says why not.
 *
 * `unchanged` is true when the value is the one already stored. An unchanged
 * value needs no permission, because the page of the settings sends back the
 * values of a whole group when one field changes.
 */
export function checkGeneralWrite(
  key: string,
  value: unknown,
  actor: { role: string; permissions?: string[] },
  unchanged: boolean,
): unknown {
  const policy = settingPolicy(key);
  if (!policy) throw new SettingRefusal('unknown', `"${key}" is not a registered setting, so it cannot be written here.`);
  if (policy.hidden || policy.write === null) {
    throw new SettingRefusal('protected', `"${key}" belongs to the platform and cannot be changed here.`);
  }
  if (!policy.general) {
    throw new SettingRefusal('dedicated', `"${key}" is managed by ${policy.managedBy ?? 'its own page'}, not by the general settings.`);
  }
  if (!unchanged && !hasPermission(actor.role, actor.permissions, policy.write)) {
    throw new SettingRefusal('permission', `Changing "${key}" needs the permission "${policy.write}".`);
  }
  try {
    return validateSettingValue(policy, value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new SettingRefusal('invalid', `The value of "${key}" is not valid: ${error.issues[0]?.message ?? 'wrong shape'}.`);
    }
    throw new SettingRefusal('invalid', error instanceof Error ? error.message : `The value of "${key}" is not valid.`);
  }
}

/** Checks the value of a registered key against its shape. */
export function validateSettingValue(policy: SettingPolicy, value: unknown): unknown {
  if (policy.schema) return policy.schema.parse(value);
  return validateOperatorSetting(policy.key, value);
}

/** The table the settings page shows: where every key lives and who may change it. */
export function settingControlMap(): { key: string; domain: SettingDomain; read: Permission; write: Permission | null; general: boolean; managedBy: string | null; effect: SettingEffect }[] {
  return POLICIES.filter((policy) => !policy.hidden).map((policy) => ({
    key: policy.prefix ? `${policy.key}*` : policy.key,
    domain: policy.domain,
    read: policy.read,
    write: policy.write,
    general: policy.general,
    managedBy: policy.managedBy ?? null,
    effect: policy.effect,
  }));
}
