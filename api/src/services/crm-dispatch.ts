import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { parseGraph, stepAutomation, type AutoGraph, type AutoState, type AutomationTrigger } from './crm-automation.js';
import { deriveCustomerFacts } from './crm-facts.js';
import { qualifyReferral } from './crm-referral.js';

const STALE_RUNNING_MS = 2 * 60_000;

export async function dispatchCrmEvent(input: { trigger: AutomationTrigger; userId: string; eventId: string }): Promise<void> {
  await deriveCustomerFacts(input.userId);
  if (input.trigger === 'first_purchase') {
    await qualifyReferral(input.userId, input.eventId.replace(/^order:/, ''));
  }
  const automations = await prisma.marketingAutomation.findMany({
    where: { trigger: input.trigger, paused: false, status: 'active' },
    take: 50,
  });
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, tags: true, createdAt: true, notificationPreference: { select: { marketing: true } }, customerFacts: true },
  });
  if (!user) return;
  for (const automation of automations) {
    const graph = parseGraph(automation.graph);
    if ('error' in graph) continue;
    await runAutomation({
      automationId: automation.id,
      graph: graph as AutoGraph,
      user,
      eventId: input.eventId,
    });
  }
}

export async function resumeWaitingAutomations(take = 25): Promise<number> {
  const due = await prisma.automationRun.findMany({
    where: {
      OR: [
        { status: 'waiting', waitUntil: { lte: new Date() } },
        { status: 'claimed' },
        { status: 'running', updatedAt: { lte: new Date(Date.now() - STALE_RUNNING_MS) } },
      ],
    },
    take,
    include: { automation: true, user: { select: { id: true, tags: true, createdAt: true, notificationPreference: { select: { marketing: true } }, customerFacts: true } } },
  });
  let claimed = 0;
  for (const run of due) {
    const graph = parseGraph(run.automation.graph);
    if ('error' in graph) continue;
    const ok = await runAutomation({
      automationId: run.automationId,
      graph: graph as AutoGraph,
      user: run.user,
      eventId: run.eventId,
      runId: run.id,
    });
    if (ok) claimed += 1;
  }
  return claimed;
}

export async function runAutomation(input: {
  automationId: string;
  graph: AutoGraph;
  eventId: string;
  user: { id: string; tags: string[]; createdAt: Date; notificationPreference: { marketing: boolean } | null; customerFacts: { key: string; value: string; numericValue?: number | null; occurredAt?: Date | null }[] };
  runId?: string;
}): Promise<boolean> {
  let started = input.runId
    ? await prisma.automationRun.findUnique({ where: { id: input.runId } })
    : await prisma.automationRun.findUnique({
      where: { automationId_userId_eventId: { automationId: input.automationId, userId: input.user.id, eventId: input.eventId } },
    });
  if (!started) {
    try {
      started = await prisma.automationRun.create({
        data: { automationId: input.automationId, userId: input.user.id, eventId: input.eventId, nodeId: input.graph.start, status: 'claimed' },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      started = await prisma.automationRun.findUnique({
        where: { automationId_userId_eventId: { automationId: input.automationId, userId: input.user.id, eventId: input.eventId } },
      });
    }
  }
  if (!started) return false;
  if (['succeeded', 'stopped', 'cancelled', 'dead'].includes(started.status)) return false;
  const stale = new Date(Date.now() - STALE_RUNNING_MS);
  const claimed = await prisma.automationRun.updateMany({
    where: {
      id: started.id,
      OR: [
        { status: { in: ['waiting', 'failed', 'claimed'] } },
        { status: 'running', updatedAt: { lte: stale } },
      ],
    },
    data: { status: 'running', attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return false;
  const row = await prisma.automationRun.findUnique({ where: { id: started.id } });
  if (!row) return false;
  const stepped = stepAutomation({
    graph: input.graph,
    state: {
      nodeId: row.nodeId,
      status: 'running',
      waitUntil: row.waitUntil,
      attempts: row.attempts,
      lastError: row.lastError,
      applied: row.appliedNodes,
      steps: 0,
    } as AutoState,
    ctx: {
      facts: input.user.customerFacts.map((row) => ({ key: row.key, value: row.value, numeric: row.numericValue, at: row.occurredAt })),
      tags: input.user.tags,
      marketing: input.user.notificationPreference?.marketing ?? false,
      createdAt: input.user.createdAt,
      userId: input.user.id,
    },
    consent: input.user.notificationPreference?.marketing === true,
  });
  await prisma.$transaction(async (tx) => {
    for (const effect of stepped.effects) {
      if (effect.type === 'tag' && effect.payload && typeof effect.payload === 'object') {
        const payload = effect.payload as { add?: string[]; remove?: string[] };
        const latest = await tx.user.findUnique({ where: { id: input.user.id }, select: { tags: true } });
        const tags = [...new Set([...(latest?.tags ?? []).filter((tag) => !(payload.remove ?? []).includes(tag)), ...(payload.add ?? [])])];
        await tx.user.update({ where: { id: input.user.id }, data: { tags } });
      }
      if (effect.type === 'task' && effect.payload && typeof effect.payload === 'object' && 'title' in effect.payload) {
        const title = String((effect.payload as { title: string }).title);
        const exists = await tx.crmTask.findFirst({ where: { userId: input.user.id, title, status: 'open' } });
        if (!exists) await tx.crmTask.create({ data: { userId: input.user.id, title } });
      }
    }
    await tx.automationRun.update({
      where: { id: row.id },
      data: {
        nodeId: stepped.state.nodeId,
        status: stepped.state.status,
        waitUntil: stepped.state.waitUntil,
        lastError: stepped.state.lastError,
        appliedNodes: stepped.state.applied,
      },
    });
  });
  return true;
}
