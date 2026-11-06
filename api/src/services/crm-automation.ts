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
  status: 'running' | 'waiting' | 'succeeded' | 'stopped' | 'failed';
  waitUntil: Date | null;
  attempts: number;
  lastError: string | null;
}

export function parseGraph(raw: unknown): AutoGraph | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'The workflow graph is missing.' };
  const row = raw as AutoGraph;
  if (!row.start || !Array.isArray(row.nodes) || !Array.isArray(row.edges)) return { error: 'The workflow graph is incomplete.' };
  if (!row.nodes.some((node) => node.id === row.start)) return { error: 'The start node is missing.' };
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
}): { state: AutoState; effects: { type: AutoNode['type']; payload?: unknown }[] } {
  const now = input.now ?? new Date();
  const effects: { type: AutoNode['type']; payload?: unknown }[] = [];
  let state = { ...input.state };
  if (state.status === 'waiting' && state.waitUntil && state.waitUntil > now) return { state, effects };
  if (state.status === 'succeeded' || state.status === 'stopped' || state.status === 'failed') return { state, effects };

  const current = node(input.graph, state.nodeId);
  if (!current) return { state: { ...state, status: 'failed', lastError: 'Unknown node.' }, effects };

  if (current.type === 'wait') {
    if (state.status !== 'waiting') {
      return { state: { ...state, status: 'waiting', waitUntil: new Date(now.getTime() + current.ms) }, effects };
    }
    const nxt = nextId(input.graph, current.id);
    if (!nxt) return { state: { ...state, status: 'succeeded', waitUntil: null }, effects };
    state = { ...state, nodeId: nxt, status: 'running', waitUntil: null };
    return stepAutomation({ ...input, state, now });
  }
  if (current.type === 'condition') {
    const ok = evalExpr(current.expr, input.ctx, now);
    const nxt = nextId(input.graph, current.id, ok ? 'yes' : 'no');
    if (!nxt) return { state: { ...state, status: 'succeeded' }, effects };
    return stepAutomation({ ...input, state: { ...state, nodeId: nxt }, now });
  }
  if (current.type === 'stop') return { state: { ...state, status: 'stopped' }, effects };
  if (current.type === 'message') {
    const gate = campaignMayDeliver({ status: 'approved', suppressed: false, marketingConsent: input.consent });
    effects.push({ type: 'message', payload: { body: current.body, deliver: gate.deliver, reason: gate.reason } });
  } else {
    effects.push({ type: current.type, payload: current });
  }
  const nxt = nextId(input.graph, current.id);
  if (!nxt) return { state: { ...state, status: 'succeeded' }, effects };
  return { state: { ...state, nodeId: nxt, status: 'running' }, effects };
}

export function dedupeKey(automationId: string, userId: string, eventId: string): string {
  return `${automationId}:${userId}:${eventId}`;
}

export function backoffMs(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts));
}

export { marketingDeliveryEnabled };
