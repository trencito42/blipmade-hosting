import { prisma } from '../db.js';
import { parseGraph, stepAutomation, type AutoGraph, type AutoState, type AutomationTrigger } from './crm-automation.js';
import { deriveCustomerFacts } from './crm-facts.js';

export async function dispatchCrmEvent(input: { trigger: AutomationTrigger; userId: string; eventId: string }): Promise<void> {
  await deriveCustomerFacts(input.userId);
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
    const existing = await prisma.automationRun.findUnique({
      where: { automationId_userId_eventId: { automationId: automation.id, userId: input.userId, eventId: input.eventId } },
    });
    if (existing && existing.status !== 'failed') continue;
    await runAutomation({
      automationId: automation.id,
      graph: graph as AutoGraph,
      user,
      eventId: input.eventId,
      run: existing,
    });
  }
}

export async function resumeWaitingAutomations(take = 25): Promise<number> {
  const due = await prisma.automationRun.findMany({
    where: { status: 'waiting', waitUntil: { lte: new Date() } },
    take,
    include: { automation: true, user: { select: { id: true, tags: true, createdAt: true, notificationPreference: { select: { marketing: true } }, customerFacts: true } } },
  });
  for (const run of due) {
    const graph = parseGraph(run.automation.graph);
    if ('error' in graph) continue;
    await runAutomation({ automationId: run.automationId, graph: graph as AutoGraph, user: run.user, eventId: run.eventId, run });
  }
  return due.length;
}

async function runAutomation(input: {
  automationId: string;
  graph: AutoGraph;
  eventId: string;
  user: { id: string; tags: string[]; createdAt: Date; notificationPreference: { marketing: boolean } | null; customerFacts: { key: string; value: string; numericValue?: number | null; occurredAt?: Date | null }[] };
  run: { id: string; nodeId: string; attempts: number; waitUntil: Date | null; lastError: string | null; appliedNodes?: string[] } | null;
}): Promise<void> {
  const started = input.run
    ? await prisma.automationRun.update({
      where: { id: input.run.id },
      data: { status: 'running', attempts: { increment: 1 } },
    })
    : await prisma.automationRun.create({
      data: { automationId: input.automationId, userId: input.user.id, eventId: input.eventId, nodeId: input.graph.start, status: 'running' },
    });
  const stepped = stepAutomation({
    graph: input.graph,
    state: {
      nodeId: started.nodeId,
      status: 'running',
      waitUntil: started.waitUntil,
      attempts: started.attempts,
      lastError: started.lastError,
      applied: started.appliedNodes ?? input.run?.appliedNodes ?? [],
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
  for (const effect of stepped.effects) {
    if (effect.type === 'tag' && effect.payload && typeof effect.payload === 'object') {
      const payload = effect.payload as { add?: string[]; remove?: string[] };
      const latest = await prisma.user.findUnique({ where: { id: input.user.id }, select: { tags: true } });
      const tags = [...new Set([...(latest?.tags ?? []).filter((tag) => !(payload.remove ?? []).includes(tag)), ...(payload.add ?? [])])];
      await prisma.user.update({ where: { id: input.user.id }, data: { tags } });
    }
    if (effect.type === 'task' && effect.payload && typeof effect.payload === 'object' && 'title' in effect.payload) {
      const title = String((effect.payload as { title: string }).title);
      const exists = await prisma.crmTask.findFirst({ where: { userId: input.user.id, title, status: 'open' } });
      if (!exists) await prisma.crmTask.create({ data: { userId: input.user.id, title } });
    }
  }
  await prisma.automationRun.update({
    where: { id: started.id },
    data: {
      nodeId: stepped.state.nodeId,
      status: stepped.state.status,
      waitUntil: stepped.state.waitUntil,
      lastError: stepped.state.lastError,
      appliedNodes: stepped.state.applied,
    },
  });
}
