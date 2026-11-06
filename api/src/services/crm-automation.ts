import { campaignMayDeliver, marketingDeliveryEnabled, type SegmentExpr, evalExpr, parseSegmentFilter, type SegmentContext } from './crm.js';

export const AUTOMATION_TRIGGERS = [
  'registration',
  'email_verified',
  'first_purchase',
  'service_active',
  'renewal',
  'expiry',
  'cancellation',
  'inactivity',
  'upgrade',
  'promotion_redeemed',
  'discord_linked',
  'segment_enter',
  'segment_exit',
  'ticket_opened',
  'ticket_closed',
] as const;

export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

const NODE_TYPES = new Set(['condition', 'wait', 'tag', 'task', 'message', 'promotion', 'stop']);
const MAX_NODES = 30;
const MAX_STEPS = 20;
const MAX_WAIT_MS = 30 * 24 * 60 * 60 * 1000;

export type AutoNode =
  | { id: string; type: 'condition'; expr: SegmentExpr }
  | { id: string; type: 'wait'; ms: number }
  | { id: string; type: 'tag'; add?: string[]; remove?: string[] }
  | { id: string; type: 'task'; title: string }
  | { id: string; type: 'message'; body: string }
  | { id: string; type: 'promotion'; code: string }
  | { id: string; type: 'stop' };

export interface AutoGraph {
  start: string;
  nodes: AutoNode[];
  edges: { from: string; to: string; branch?: 'yes' | 'no' }[];
}

export interface AutoState {
  nodeId: string;
  status: 'running' | 'waiting' | 'succeeded' | 'stopped' | 'failed' | 'dead';
  waitUntil: Date | null;
  attempts: number;
  lastError: string | null;
  applied: string[];
  steps: number;
}

export function parseGraph(raw: unknown): AutoGraph | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'The workflow graph is missing.' };
  const row = raw as AutoGraph;
  if (typeof row.start !== 'string' || !Array.isArray(row.nodes) || !Array.isArray(row.edges)) {
    return { error: 'The workflow graph is incomplete.' };
  }
  if (row.nodes.length < 1 || row.nodes.length > MAX_NODES) return { error: 'The workflow has too many nodes.' };
  const ids = new Set<string>();
  for (const entry of row.nodes) {
    if (!entry || typeof entry.id !== 'string' || !NODE_TYPES.has(entry.type)) return { error: 'A node type is not allowed.' };
    if (ids.has(entry.id)) return { error: 'Node ids must be unique.' };
    ids.add(entry.id);
    if (entry.type === 'wait' && (!Number.isFinite(entry.ms) || entry.ms < 0 || entry.ms > MAX_WAIT_MS)) {
      return { error: 'A wait step is out of bounds.' };
    }
    if (entry.type === 'condition') {
      try { parseSegmentFilter(entry.expr); } catch (error) {
        return { error: error instanceof Error ? error.message : 'The condition is not valid.' };
      }
    }
  }
  if (!ids.has(row.start)) return { error: 'The start node is missing.' };
  for (const edge of row.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) return { error: 'An edge points at a missing node.' };
  }
  for (const entry of row.nodes) {
    if (entry.type === 'condition') {
      const yes = row.edges.some((edge) => edge.from === entry.id && edge.branch === 'yes');
      const no = row.edges.some((edge) => edge.from === entry.id && edge.branch === 'no');
      if (!yes || !no) return { error: 'A condition needs both yes and no branches.' };
    }
  }
  const reachable = new Set<string>();
  const visiting = new Set<string>();
  const walk = (id: string): string | null => {
    if (visiting.has(id)) return 'The workflow contains a cycle.';
    if (reachable.has(id)) return null;
    visiting.add(id);
    const current = row.nodes.find((node) => node.id === id);
    const outs = row.edges.filter((edge) => edge.from === id);
    if (current?.type !== 'stop' && current?.type !== 'condition' && outs.length > 1 && outs.some((edge) => !edge.branch)) {
      return 'A step may only have one unbranched successor.';
    }
    for (const edge of outs) {
      const error = walk(edge.to);
      if (error) return error;
    }
    visiting.delete(id);
    reachable.add(id);
    return null;
  };
  const cycle = walk(row.start);
  if (cycle) return { error: cycle };
  if (reachable.size !== row.nodes.length) return { error: 'The workflow has unreachable nodes.' };
  return row;
}

function node(graph: AutoGraph, id: string): AutoNode | undefined {
  return graph.nodes.find((entry) => entry.id === id);
}

function nextId(graph: AutoGraph, from: string, branch?: 'yes' | 'no'): string | null {
  const edge = graph.edges.find((entry) => entry.from === from && (branch ? entry.branch === branch : !entry.branch));
  return edge?.to ?? null;
}

export function stepAutomation(input: {
  graph: AutoGraph;
  state: AutoState;
  ctx: SegmentContext;
  consent: boolean;
  now?: Date;
}): { state: AutoState; effects: { type: AutoNode['type']; payload?: unknown; nodeId: string }[] } {
  const now = input.now ?? new Date();
  const effects: { type: AutoNode['type']; payload?: unknown; nodeId: string }[] = [];
  let state: AutoState = { applied: [], steps: 0, ...input.state };
  if (state.status === 'waiting' && state.waitUntil && state.waitUntil > now) return { state, effects };
  if (state.status === 'succeeded' || state.status === 'stopped' || state.status === 'failed' || state.status === 'dead') return { state, effects };
  if (state.steps >= MAX_STEPS) return { state: { ...state, status: 'dead', lastError: 'The workflow exceeded its step limit.' }, effects };

  const current = node(input.graph, state.nodeId);
  if (!current) return { state: { ...state, status: 'failed', lastError: 'Unknown node.' }, effects };
  state = { ...state, steps: state.steps + 1 };

  if (current.type === 'wait') {
    const due = Boolean(state.waitUntil && state.waitUntil <= now);
    if (!due) {
      return { state: { ...state, status: 'waiting', waitUntil: state.waitUntil ?? new Date(now.getTime() + current.ms) }, effects };
    }
    const nxt = nextId(input.graph, current.id);
    if (!nxt) return { state: { ...state, status: 'succeeded', waitUntil: null }, effects };
    return stepAutomation({ ...input, state: { ...state, nodeId: nxt, status: 'running', waitUntil: null }, now });
  }
  if (current.type === 'condition') {
    const ok = evalExpr(current.expr, input.ctx, now);
    const nxt = nextId(input.graph, current.id, ok ? 'yes' : 'no');
    if (!nxt) return { state: { ...state, status: 'succeeded' }, effects };
    return stepAutomation({ ...input, state: { ...state, nodeId: nxt }, now });
  }
  if (current.type === 'stop') return { state: { ...state, status: 'stopped' }, effects };

  if (!state.applied.includes(current.id)) {
    if (current.type === 'message') {
      const gate = campaignMayDeliver({ status: 'approved', suppressed: false, marketingConsent: input.consent });
      effects.push({ type: 'message', nodeId: current.id, payload: { body: current.body, deliver: gate.deliver, reason: gate.reason } });
    } else {
      effects.push({ type: current.type, nodeId: current.id, payload: current });
    }
    state = { ...state, applied: [...state.applied, current.id] };
  }
  const nxt = nextId(input.graph, current.id);
  if (!nxt) return { state: { ...state, status: 'succeeded' }, effects };
  return stepAutomation({ ...input, state: { ...state, nodeId: nxt, status: 'running' }, now });
}

export function dedupeKey(automationId: string, userId: string, eventId: string): string {
  return `${automationId}:${userId}:${eventId}`;
}

export function backoffMs(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts));
}

export { marketingDeliveryEnabled, MAX_STEPS };
