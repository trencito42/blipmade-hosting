import { prisma } from '../../db.js';
import { vpsCustomerEligibleFromHosting } from './role-eligibility.js';

/** Admin-configurable entitlement rules. Role IDs live in DiscordRoleMapping, not here. */
export const DISCORD_RULE_CATALOG: Record<
  string,
  { label: string; description: string }
> = {
  verified_member: {
    label: 'Verified member',
    description: 'Blipmade account with a verified email address.',
  },
  active_customer: {
    label: 'Customer',
    description: 'At least one active hosting service (online or provisioning).',
  },
  minecraft_customer: {
    label: 'Minecraft customer',
    description: 'At least one active Minecraft server product.',
  },
  vps_customer: {
    label: 'VPS customer',
    description: 'At least one active VPS product.',
  },
  developer: {
    label: 'Developer',
    description: 'At least one active app or Discord bot hosting service.',
  },
};

export const DISCORD_RULE_KEYS = Object.keys(DISCORD_RULE_CATALOG);

const ACTIVE_STATUSES = ['ONLINE', 'PROVISIONING', 'RESTARTING', 'DEGRADED'] as const;
const VPS_ACTIVE_STATUSES = ['PENDING', 'PROVISIONING', 'ACTIVE'] as const;

export async function evaluateDiscordRoleRules(userId: string, ruleKeys: string[]): Promise<Set<string>> {
  const eligible = new Set<string>();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true, suspendedAt: true },
  });
  if (!user || user.suspendedAt) return eligible;

  const needInstances = ruleKeys.some((k) =>
    ['active_customer', 'minecraft_customer', 'vps_customer', 'developer'].includes(k),
  );
  const needVps = ruleKeys.some((k) => ['active_customer', 'vps_customer'].includes(k));
  let instances: { product: { slug: string } }[] = [];
  let vpsServices: { product: { slug: string } }[] = [];
  if (needInstances) {
    instances = await prisma.instance.findMany({
      where: { userId, status: { in: [...ACTIVE_STATUSES] } },
      select: { product: { select: { slug: true } } },
    });
  }
  if (needVps) {
    vpsServices = await prisma.vpsService.findMany({
      where: { userId, status: { in: [...VPS_ACTIVE_STATUSES] } },
      select: { product: { select: { slug: true } } },
    });
  }

  const hasVpsHosting = vpsCustomerEligibleFromHosting(instances, vpsServices);

  for (const rule of ruleKeys) {
    if (rule === 'verified_member' && user.emailVerifiedAt) eligible.add(rule);
    if (rule === 'active_customer' && (instances.length > 0 || vpsServices.length > 0)) eligible.add(rule);
    if (rule === 'minecraft_customer' && instances.some((i) => i.product.slug.startsWith('minecraft-'))) eligible.add(rule);
    if (rule === 'vps_customer' && hasVpsHosting) eligible.add(rule);
    if (rule === 'developer' && instances.some((i) => i.product.slug === 'discord-bot' || i.product.slug === 'nodejs')) {
      eligible.add(rule);
    }
  }
  return eligible;
}

export async function ensureDefaultDiscordRoleMappings(): Promise<void> {
  for (const ruleKey of DISCORD_RULE_KEYS) {
    await prisma.discordRoleMapping.upsert({
      where: { ruleKey },
      create: { ruleKey, discordRoleId: '', enabled: false },
      update: {},
    });
  }
}
