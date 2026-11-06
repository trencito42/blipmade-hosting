/**
 * CRM facts, nested segments, campaigns and promotion eligibility.
 * Live marketing send stays off until MARKETING_DELIVERY_ENABLED is true.
 * Security-classified facts never enter a segment.
 */

export type FactKind = 'enum' | 'string' | 'number' | 'boolean' | 'date';
export type FactClass = 'general' | 'consent' | 'identity' | 'security';

export interface FactDefinition {
  key: string;
  kind: FactKind;
  classification: FactClass;
  source: string;
  values?: string[];
  marketing: boolean;
}

/** Registry of facts that may be stored. Unknown keys are refused. */
export const FACT_REGISTRY: Record<string, FactDefinition> = {
  'core.lifecycle': { key: 'core.lifecycle', kind: 'enum', classification: 'general', source: 'account', values: ['lead', 'active', 'churned', 'suspended'], marketing: true },
  'core.plan_family': { key: 'core.plan_family', kind: 'string', classification: 'general', source: 'catalog', marketing: true },
  'core.plan_families': { key: 'core.plan_families', kind: 'string', classification: 'general', source: 'catalog', marketing: true },
  'billing.spend_cents': { key: 'billing.spend_cents', kind: 'number', classification: 'general', source: 'billing', marketing: true },
  'billing.spend_band': { key: 'billing.spend_band', kind: 'enum', classification: 'general', source: 'billing', values: ['none', 'low', 'mid', 'high'], marketing: true },
  'billing.paid_orders': { key: 'billing.paid_orders', kind: 'number', classification: 'general', source: 'billing', marketing: true },
  'support.open': { key: 'support.open', kind: 'enum', classification: 'general', source: 'tickets', values: ['yes', 'no'], marketing: true },
  'consent.marketing': { key: 'consent.marketing', kind: 'enum', classification: 'consent', source: 'consent', values: ['opt_in', 'opt_out'], marketing: true },
  'identity.discord': { key: 'identity.discord', kind: 'enum', classification: 'identity', source: 'discord', values: ['linked', 'none'], marketing: true },
  'identity.oauth': { key: 'identity.oauth', kind: 'enum', classification: 'identity', source: 'oauth', values: ['linked', 'none'], marketing: true },
  'account.verified': { key: 'account.verified', kind: 'enum', classification: 'general', source: 'account', values: ['yes', 'no'], marketing: true },
  'account.created_at': { key: 'account.created_at', kind: 'date', classification: 'general', source: 'account', marketing: true },
};

const ALIAS: Record<string, string> = {
  lifecycle: 'core.lifecycle',
  plan_family: 'core.plan_family',
  support_open: 'support.open',
  marketing: 'consent.marketing',
  discord: 'identity.discord',
  spend_band: 'billing.spend_band',
};

export type CmpOp =
  | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte'
  | 'contains' | 'not_contains' | 'in' | 'not_in'
  | 'exists' | 'not_exists' | 'older_than_days' | 'within_days';

export type SegmentExpr =
  | { op: 'and' | 'or'; children: SegmentExpr[] }
  | { op: 'not'; child: SegmentExpr }
  | { fact: string; cmp: CmpOp; value?: string; values?: string[]; days?: number }
  | { field: 'tags' | 'marketing' | 'created_at'; cmp: CmpOp; value?: string; values?: string[]; days?: number };

/** Legacy exact-match filter still accepted from saved rows. */
export interface SegmentFilter {
  facts?: Record<string, string>;
  marketing?: boolean;
  tags?: string[];
  expr?: SegmentExpr;
  kind?: 'dynamic' | 'manual';
  memberIds?: string[];
}

export interface CampaignGate {
  ok: boolean;
  reason: string;
  deliver: boolean;
}

export interface FactRow {
  key: string;
  value: string;
  numeric?: number | null;
  at?: Date | null;
}

export interface SegmentContext {
  facts: FactRow[];
  tags: string[];
  marketing: boolean;
  createdAt: Date;
  userId?: string;
}

export function marketingDeliveryEnabled(): boolean {
  return process.env.MARKETING_DELIVERY_ENABLED === 'true';
}

export function canonicalFactKey(key: string): string {
  return ALIAS[key] ?? key;
}

export function factDefinition(key: string): FactDefinition | null {
  return FACT_REGISTRY[canonicalFactKey(key)] ?? null;
}

export function assertMarketingFact(key: string): FactDefinition {
  const def = factDefinition(key);
  if (!def) throw new Error(`Unknown fact ${key}.`);
  if (def.classification === 'security') throw new Error('Security facts cannot be used in marketing segments.');
  if (!def.marketing) throw new Error(`Fact ${def.key} is not available for marketing.`);
  return def;
}

const CMPS: CmpOp[] = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'not_contains', 'in', 'not_in', 'exists', 'not_exists', 'older_than_days', 'within_days'];
const MAX_SEGMENT_DEPTH = 8;
const MAX_SEGMENT_NODES = 40;
const NUMERIC_CMP = new Set<CmpOp>(['gt', 'lt', 'gte', 'lte']);
const TEXT_CMP = new Set<CmpOp>(['contains', 'not_contains']);
const DATE_CMP = new Set<CmpOp>(['older_than_days', 'within_days']);

function asCmp(value: unknown): CmpOp {
  if (typeof value !== 'string' || !CMPS.includes(value as CmpOp)) throw new Error('That comparison is not supported.');
  return value as CmpOp;
}

function countExpr(expr: SegmentExpr): number {
  if ('op' in expr && (expr.op === 'and' || expr.op === 'or')) return 1 + expr.children.reduce((sum, child) => sum + countExpr(child), 0);
  if ('op' in expr && expr.op === 'not') return 1 + countExpr(expr.child);
  return 1;
}

function assertCmpForFact(def: FactDefinition, cmp: CmpOp): void {
  if (cmp === 'exists' || cmp === 'not_exists') return;
  if (def.kind === 'number' && (TEXT_CMP.has(cmp) || DATE_CMP.has(cmp))) throw new Error(`Fact ${def.key} is numeric.`);
  if (def.kind === 'enum' && (NUMERIC_CMP.has(cmp) || TEXT_CMP.has(cmp) || DATE_CMP.has(cmp))) throw new Error(`Fact ${def.key} is an enumeration.`);
  if (def.kind === 'date' && !DATE_CMP.has(cmp) && cmp !== 'eq' && cmp !== 'neq') throw new Error(`Fact ${def.key} is a date.`);
  if (def.kind === 'string' && NUMERIC_CMP.has(cmp)) throw new Error(`Fact ${def.key} is not numeric.`);
}

function parseExpr(raw: unknown, depth: number): SegmentExpr {
  if (depth > MAX_SEGMENT_DEPTH) throw new Error('The segment is nested too deeply.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The segment filter is not valid.');
  const row = raw as Record<string, unknown>;
  if ('expr' in row) return parseExpr(row.expr, depth + 1);
  if (row.op === 'and' || row.op === 'or') {
    if (!Array.isArray(row.children) || row.children.length < 1) throw new Error('A group must contain at least one condition.');
    return { op: row.op, children: row.children.map((child) => parseExpr(child, depth + 1)) };
  }
  if (row.op === 'not') return { op: 'not', child: parseExpr(row.child, depth + 1) };
  if (typeof row.fact === 'string') {
    const def = assertMarketingFact(row.fact);
    const cmp = asCmp(row.cmp ?? 'eq');
    assertCmpForFact(def, cmp);
    if ((cmp === 'in' || cmp === 'not_in') && !Array.isArray(row.values)) throw new Error('in / not in needs a list of values.');
    if (NUMERIC_CMP.has(cmp) && !Number.isFinite(Number(row.value))) throw new Error('A numeric comparison needs a number.');
    return { fact: def.key, cmp, value: typeof row.value === 'string' ? row.value : row.value != null ? String(row.value) : undefined, values: Array.isArray(row.values) ? row.values.map(String) : undefined, days: typeof row.days === 'number' ? row.days : undefined };
  }
  if (row.field === 'tags' || row.field === 'marketing' || row.field === 'created_at') {
    const cmp = asCmp(row.cmp ?? 'eq');
    if (row.field === 'marketing' && cmp !== 'eq' && cmp !== 'neq') throw new Error('Marketing consent only supports equals.');
    if (row.field === 'created_at' && !DATE_CMP.has(cmp)) throw new Error('Account age only supports duration comparisons.');
    return { field: row.field, cmp, value: typeof row.value === 'string' ? row.value : undefined, values: Array.isArray(row.values) ? row.values.map(String) : undefined, days: typeof row.days === 'number' ? row.days : undefined };
  }
  if (row.facts || row.marketing !== undefined || row.tags) {
    const children: SegmentExpr[] = [];
    for (const [key, value] of Object.entries((row.facts ?? {}) as Record<string, unknown>)) {
      if (typeof value !== 'string') throw new Error('Fact values must be strings.');
      const def = assertMarketingFact(key);
      children.push({ fact: def.key, cmp: 'eq', value });
    }
    if (row.marketing === true) children.push({ field: 'marketing', cmp: 'eq', value: 'true' });
    if (row.marketing === false) children.push({ field: 'marketing', cmp: 'eq', value: 'false' });
    if (Array.isArray(row.tags) && row.tags.length) children.push({ field: 'tags', cmp: 'in', values: row.tags.map(String) });
    if (!children.length) throw new Error('The segment has no conditions.');
    return { op: 'and', children };
  }
  throw new Error('The segment has no conditions.');
}

export function parseSegmentFilter(raw: unknown): SegmentExpr {
  const expr = parseExpr(raw, 0);
  if (countExpr(expr) > MAX_SEGMENT_NODES) throw new Error('The segment has too many conditions.');
  return expr;
}

function factValue(ctx: SegmentContext, key: string): FactRow | undefined {
  const canon = canonicalFactKey(key);
  return ctx.facts.find((row) => canonicalFactKey(row.key) === canon);
}

function cmpString(left: string, op: CmpOp, right?: string, values?: string[]): boolean {
  const hay = left.toLowerCase();
  const needle = (right ?? '').toLowerCase();
  if (op === 'eq') return hay === needle;
  if (op === 'neq') return hay !== needle;
  if (op === 'contains') return hay.includes(needle);
  if (op === 'not_contains') return !hay.includes(needle);
  if (op === 'in') return (values ?? []).map((item) => item.toLowerCase()).includes(hay);
  if (op === 'not_in') return !(values ?? []).map((item) => item.toLowerCase()).includes(hay);
  return false;
}

function cmpNumber(left: number, op: CmpOp, right: number): boolean {
  if (op === 'eq') return left === right;
  if (op === 'neq') return left !== right;
  if (op === 'gt') return left > right;
  if (op === 'gte') return left >= right;
  if (op === 'lt') return left < right;
  if (op === 'lte') return left <= right;
  return false;
}

export function evalExpr(expr: SegmentExpr, ctx: SegmentContext, now = new Date()): boolean {
  if ('op' in expr && (expr.op === 'and' || expr.op === 'or')) {
    if (!expr.children.length) return false;
    return expr.op === 'and' ? expr.children.every((child) => evalExpr(child, ctx, now)) : expr.children.some((child) => evalExpr(child, ctx, now));
  }
  if ('op' in expr && expr.op === 'not') return !evalExpr(expr.child, ctx, now);
  if ('field' in expr && !('fact' in expr)) {
    if (expr.field === 'marketing') return cmpString(ctx.marketing ? 'true' : 'false', expr.cmp, expr.value, expr.values);
    if (expr.field === 'tags') {
      if (expr.cmp === 'in' || expr.cmp === 'eq') return (expr.values ?? (expr.value ? [expr.value] : [])).every((tag) => ctx.tags.includes(tag));
      if (expr.cmp === 'not_in' || expr.cmp === 'neq') return !(expr.values ?? []).some((tag) => ctx.tags.includes(tag));
      if (expr.cmp === 'exists') return ctx.tags.length > 0;
      if (expr.cmp === 'not_exists') return ctx.tags.length === 0;
      if (expr.cmp === 'contains') return ctx.tags.some((tag) => tag.includes(expr.value ?? ''));
    }
    if (expr.field === 'created_at') {
      const days = (now.getTime() - ctx.createdAt.getTime()) / 86_400_000;
      if (expr.cmp === 'older_than_days') return days >= (expr.days ?? Number(expr.value ?? 0));
      if (expr.cmp === 'within_days') return days <= (expr.days ?? Number(expr.value ?? 0));
    }
    return false;
  }
  if (!('fact' in expr) || typeof expr.fact !== 'string') return false;
  const factNode = expr as Extract<SegmentExpr, { fact: string }>;
  const row = factValue(ctx, factNode.fact);
  if (factNode.cmp === 'exists') return Boolean(row);
  if (factNode.cmp === 'not_exists') return !row;
  if (!row) return false;
  if (factNode.cmp === 'older_than_days' || factNode.cmp === 'within_days') {
    const at = row.at ?? null;
    if (!at) return false;
    const days = (now.getTime() - at.getTime()) / 86_400_000;
    if (factNode.cmp === 'older_than_days') return days >= (factNode.days ?? Number(factNode.value ?? 0));
    return days <= (factNode.days ?? Number(factNode.value ?? 0));
  }
  const def = factDefinition(factNode.fact);
  if (def?.kind === 'number') {
    const left = row.numeric ?? Number(row.value);
    const right = Number(factNode.value ?? 0);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    return cmpNumber(left, factNode.cmp, right);
  }
  return cmpString(row.value, factNode.cmp, factNode.value, factNode.values);
}

export function matchesSegment(
  input: { facts: Record<string, string>; tags: string[]; marketing: boolean; createdAt?: Date; userId?: string },
  filter: SegmentFilter,
): boolean {
  if (filter.kind === 'manual' && filter.memberIds && input.userId) {
    return filter.memberIds.includes(input.userId);
  }
  const expr = parseSegmentFilter(filter);
  const facts = Object.entries(input.facts).map(([key, value]) => ({ key, value, numeric: Number(value) }));
  return evalExpr(expr, { facts, tags: input.tags, marketing: input.marketing, createdAt: input.createdAt ?? new Date(0), userId: input.userId });
}

type PrismaWhere = Record<string, unknown>;

function factWhere(node: Extract<SegmentExpr, { fact: string }>): PrismaWhere {
  const key = canonicalFactKey(node.fact);
  assertMarketingFact(key);
  if (node.cmp === 'exists') return { customerFacts: { some: { key } } };
  if (node.cmp === 'not_exists') return { customerFacts: { none: { key } } };
  if (node.cmp === 'eq') return { customerFacts: { some: { key, value: node.value ?? '' } } };
  if (node.cmp === 'neq') return { NOT: { customerFacts: { some: { key, value: node.value ?? '' } } } };
  if (node.cmp === 'contains') return { customerFacts: { some: { key, value: { contains: node.value ?? '', mode: 'insensitive' } } } };
  if (node.cmp === 'not_contains') return { NOT: { customerFacts: { some: { key, value: { contains: node.value ?? '', mode: 'insensitive' } } } } };
  if (node.cmp === 'in') return { customerFacts: { some: { key, value: { in: node.values ?? [] } } } };
  if (node.cmp === 'not_in') return { NOT: { customerFacts: { some: { key, value: { in: node.values ?? [] } } } } };
  const amount = Number(node.value ?? 0);
  if (node.cmp === 'gt') return { customerFacts: { some: { key, numericValue: { gt: amount } } } };
  if (node.cmp === 'gte') return { customerFacts: { some: { key, numericValue: { gte: amount } } } };
  if (node.cmp === 'lt') return { customerFacts: { some: { key, numericValue: { lt: amount } } } };
  if (node.cmp === 'lte') return { customerFacts: { some: { key, numericValue: { lte: amount } } } };
  const days = node.days ?? amount;
  const since = new Date(Date.now() - days * 86_400_000);
  if (node.cmp === 'older_than_days') return { customerFacts: { some: { key, occurredAt: { lte: since } } } };
  if (node.cmp === 'within_days') return { customerFacts: { some: { key, occurredAt: { gte: since } } } };
  throw new Error(`Operator ${node.cmp} is not supported.`);
}

function fieldWhere(node: Extract<SegmentExpr, { field: string }>): PrismaWhere {
  if (node.field === 'marketing') {
    const wanted = node.value === 'true';
    return { notificationPreference: { is: { marketing: wanted } } };
  }
  if (node.field === 'tags') {
    const tags = node.values ?? (node.value ? [node.value] : []);
    if (node.cmp === 'in' || node.cmp === 'eq') return { tags: { hasEvery: tags } };
    if (node.cmp === 'not_in' || node.cmp === 'neq') return { NOT: { tags: { hasSome: tags } } };
    if (node.cmp === 'exists') return { NOT: { tags: { isEmpty: true } } };
    if (node.cmp === 'not_exists') return { tags: { isEmpty: true } };
  }
  if (node.field === 'created_at') {
    const days = node.days ?? Number(node.value ?? 0);
    const since = new Date(Date.now() - days * 86_400_000);
    if (node.cmp === 'older_than_days') return { createdAt: { lte: since } };
    if (node.cmp === 'within_days') return { createdAt: { gte: since } };
  }
  throw new Error(`Field ${node.field} does not support ${node.cmp}.`);
}

export function compileSegmentWhere(filter: unknown, extra?: PrismaWhere): PrismaWhere {
  const parsed = filter && typeof filter === 'object' ? filter as SegmentFilter : {};
  if (parsed.kind === 'manual') {
    return { role: 'CUSTOMER', id: { in: parsed.memberIds ?? [] }, ...extra };
  }
  const expr = parseSegmentFilter(filter);
  const compiled = compileExpr(expr);
  return { role: 'CUSTOMER', AND: [compiled, extra].filter(Boolean) as PrismaWhere[] };
}

function compileExpr(expr: SegmentExpr): PrismaWhere {
  if ('op' in expr && (expr.op === 'and' || expr.op === 'or')) {
    const parts = expr.children.map(compileExpr);
    if (!parts.length) return {};
    return expr.op === 'and' ? { AND: parts } : { OR: parts };
  }
  if ('op' in expr && expr.op === 'not') return { NOT: compileExpr(expr.child) };
  if ('fact' in expr) return factWhere(expr);
  if ('field' in expr) return fieldWhere(expr);
  return {};
}

export function explainMatch(ctx: SegmentContext, filter: unknown): string[] {
  const expr = parseSegmentFilter(filter);
  const lines: string[] = [];
  const walk = (node: SegmentExpr, prefix: string) => {
    if ('op' in node && (node.op === 'and' || node.op === 'or')) {
      lines.push(`${prefix}${node.op.toUpperCase()} group`);
      node.children.forEach((child) => walk(child, `${prefix}  `));
      return;
    }
    const ok = evalExpr(node, ctx);
    lines.push(`${prefix}${ok ? 'match' : 'no match'}: ${JSON.stringify(node)}`);
  };
  walk(expr, '');
  return lines;
}

export function campaignTransition(
  status: string,
  event: 'submit' | 'approve' | 'reject' | 'suppress' | 'pause' | 'resume' | 'cancel',
): { status: string } | { error: string } {
  if (event === 'suppress') return { status: 'suppressed' };
  if (event === 'cancel' && status !== 'sent') return { status: 'cancelled' };
  if (status === 'draft' && event === 'submit') return { status: 'pending_approval' };
  if (status === 'pending_approval' && event === 'approve') return { status: 'approved' };
  if (status === 'pending_approval' && event === 'reject') return { status: 'draft' };
  if (status === 'approved' && event === 'pause') return { status: 'paused' };
  if (status === 'paused' && event === 'resume') return { status: 'approved' };
  return { error: `A campaign in ${status} cannot ${event}.` };
}

export function campaignMayDeliver(input: {
  status: string;
  suppressed: boolean;
  marketingConsent: boolean;
  pausedAt?: Date | null;
  scheduledAt?: Date | null;
  now?: Date;
  openTicket?: boolean;
}): CampaignGate {
  const now = input.now ?? new Date();
  if (input.suppressed || input.status === 'suppressed' || input.status === 'cancelled') {
    return { ok: false, reason: 'This campaign is suppressed.', deliver: false };
  }
  if (input.status === 'paused' || input.pausedAt) {
    return { ok: false, reason: 'This campaign is paused.', deliver: false };
  }
  if (input.status !== 'approved') {
    return { ok: false, reason: 'Only an approved campaign can be sent.', deliver: false };
  }
  if (input.scheduledAt && input.scheduledAt > now) {
    return { ok: false, reason: 'This campaign is scheduled for later.', deliver: false };
  }
  if (input.openTicket) {
    return { ok: false, reason: 'This customer has an open support ticket.', deliver: false };
  }
  if (!input.marketingConsent) {
    return { ok: false, reason: 'This customer has not consented to marketing.', deliver: false };
  }
  if (!marketingDeliveryEnabled()) {
    return { ok: true, reason: 'Approved. Live delivery is off. Test pipeline only.', deliver: false };
  }
  return { ok: true, reason: 'Delivery is enabled.', deliver: true };
}

export function monthlyRecurringCents(amount: number, period: 'MONTHLY' | 'YEARLY' | string | null | undefined): number {
  if (period === 'YEARLY') return Math.round(amount / 12);
  return amount;
}

export function spendBand(cents: number): string {
  if (cents <= 0) return 'none';
  if (cents < 2000) return 'low';
  if (cents < 20000) return 'mid';
  return 'high';
}

const TEMPLATE_VAR = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
const ALLOWED_VARS = new Set(['email', 'firstName', 'lastName']);

export function validateTemplate(body: string): { ok: true } | { ok: false; reason: string } {
  for (const match of body.matchAll(TEMPLATE_VAR)) {
    if (!ALLOWED_VARS.has(match[1]!)) return { ok: false, reason: `Unknown template variable ${match[1]}.` };
  }
  return { ok: true };
}

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(TEMPLATE_VAR, (_, name: string) => vars[name] ?? '');
}

export function promotionCrmGate(input: {
  firstPurchaseOnly: boolean;
  paidOrders: number;
  privateCode: boolean;
  assignedUserId: string | null;
  userId: string | null;
  familySlug: string | null;
  orderFamily: string | null;
  inSegment: boolean;
  hasSegment: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.hasSegment && !input.inSegment) return { ok: false, reason: 'This code is not available for your account.' };
  if (input.firstPurchaseOnly && input.paidOrders > 0) return { ok: false, reason: 'This code is only for a first purchase.' };
  if (input.privateCode && (!input.userId || input.assignedUserId !== input.userId)) {
    return { ok: false, reason: 'This code is assigned to another account.' };
  }
  if (input.familySlug) {
    if (!input.orderFamily) return { ok: false, reason: 'The product family of this order is unknown, so the code cannot apply.' };
    if (input.familySlug !== input.orderFamily) return { ok: false, reason: 'This code does not apply to this product family.' };
  }
  return { ok: true };
}

export function opportunityFromFacts(input: { lifecycle: string; planFamily: string | null; spendCents: number }): { title: string; family: string | null; reason: string } | null {
  if (input.lifecycle === 'active' && input.planFamily && input.spendCents > 0) {
    return { title: 'Cross-sell adjacent family', family: input.planFamily, reason: 'The account already pays for a service in this family.' };
  }
  if (input.lifecycle === 'lead' && input.spendCents === 0) {
    return { title: 'First paid service', family: null, reason: 'The account has no succeeded payment yet.' };
  }
  return null;
}
