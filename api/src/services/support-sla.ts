import { z } from 'zod';
import { prisma } from '../db.js';
import { addBusinessMinutes, businessMinutesBetween, type Hours } from './support-hours.js';

/**
 * The clocks of the answer times.
 *
 * A policy says, for a priority, how long the first answer of a person and the resolution may take. The clocks run in
 * business minutes when business hours are set, and in plain minutes when they are not. Only the answer of a person stops the first
 * answer clock: a greeting of a bot or a message of a rule does not. The deadline of an answer after a customer wrote again
 * is counted from that message. The clock of the resolution is not paused while the conversation waits for the customer:
 * the platform does not keep the intervals, so the policy says so and the numbers are not presented as more than they are.
 */

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export const policySchema = z.object({
  priority: z.enum(PRIORITIES),
  firstResponseMinutes: z.number().int().min(1).max(100_000),
  nextResponseMinutes: z.number().int().min(1).max(100_000).nullable().optional(),
  resolutionMinutes: z.number().int().min(1).max(1_000_000).nullable().optional(),
});
export const slaSchema = z.object({ policies: z.array(policySchema).max(4).refine((list) => new Set(list.map((p) => p.priority)).size === list.length, 'One policy for each priority.') });
export type Policy = z.infer<typeof policySchema>;

export async function readPolicies(): Promise<Policy[]> {
  const row = await prisma.setting.findUnique({ where: { key: 'support.sla' } });
  const parsed = slaSchema.safeParse(row?.value);
  return parsed.success ? parsed.data.policies : [];
}

export type ClockState = 'met' | 'ok' | 'at_risk' | 'breached' | 'none';

export interface Clock {
  state: ClockState;
  dueAt: Date | null;
}

const AT_RISK = 0.8;

function judge(hours: Hours | null, start: Date, minutes: number, doneAt: Date | null, now: Date): Clock {
  const dueAt = addBusinessMinutes(hours, start, minutes);
  if (doneAt) return { state: doneAt <= dueAt ? 'met' : 'breached', dueAt };
  if (now > dueAt) return { state: 'breached', dueAt };
  return { state: businessMinutesBetween(hours, start, now) >= minutes * AT_RISK ? 'at_risk' : 'ok', dueAt };
}

export interface TicketTimes {
  priority: (typeof PRIORITIES)[number];
  status: string;
  createdAt: Date;
  closedAt: Date | null;
  firstHumanResponseAt: Date | null;
  lastCustomerAt: Date | null;
  lastStaffAt: Date | null;
}

/** The clocks of one conversation under the policy of its priority. */
export function clocksOf(ticket: TicketTimes, policies: Policy[], hours: Hours | null, now = new Date()): { first: Clock; next: Clock; resolution: Clock } {
  const policy = policies.find((entry) => entry.priority === ticket.priority);
  const none: Clock = { state: 'none', dueAt: null };
  if (!policy) return { first: none, next: none, resolution: none };
  const first = judge(hours, ticket.createdAt, policy.firstResponseMinutes, ticket.firstHumanResponseAt, now);
  // The next answer only runs while the customer waits: they wrote after the last answer of the staff, and it is open.
  const waiting = ticket.status !== 'CLOSED' && ticket.firstHumanResponseAt !== null && ticket.lastCustomerAt !== null && (!ticket.lastStaffAt || ticket.lastCustomerAt > ticket.lastStaffAt);
  const next = policy.nextResponseMinutes && waiting ? judge(hours, ticket.lastCustomerAt!, policy.nextResponseMinutes, null, now) : none;
  const resolution = policy.resolutionMinutes ? judge(hours, ticket.createdAt, policy.resolutionMinutes, ticket.closedAt, now) : none;
  return { first, next, resolution };
}

/** A conversation is at risk or late when any of the clocks that still run says so. */
export function worstOpenState(clocks: ReturnType<typeof clocksOf>): ClockState {
  const states = [clocks.first, clocks.next, clocks.resolution].map((clock) => clock.state);
  if (states.includes('breached')) return 'breached';
  if (states.includes('at_risk')) return 'at_risk';
  return states.includes('ok') ? 'ok' : states.includes('met') ? 'met' : 'none';
}

export const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
};
