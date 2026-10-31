import { prisma } from '../db.js';
import { collectStatusComponents, type StatusComponent } from '../routes/health.js';

/**
 * The history behind the public status page.
 *
 * Every minute the worker measures each component and writes the result. From those rows the page
 * draws the uptime of the last 90 days, day by day. A component that was down for three checks in
 * a row opens an incident by itself, and one that has been fine for three checks closes it, so the
 * page tells the truth even when nobody is awake to write it.
 */
const RETENTION_DAYS = 100;
const STREAK = 3;

const IMPACT_OF: Record<string, string> = { down: 'major', degraded: 'minor' };

/** Measures everything and writes it down. Returns the components, for whoever wants them. */
export async function recordStatusChecks(): Promise<StatusComponent[]> {
  const components = await collectStatusComponents();
  await prisma.statusCheck.createMany({
    data: components.map((component) => ({ component: component.id, state: component.state, detail: component.detail.slice(0, 300) })),
  });
  for (const component of components) await followStreak(component);
  return components;
}

async function followStreak(component: StatusComponent): Promise<void> {
  const recent = await prisma.statusCheck.findMany({ where: { component: component.id }, orderBy: { createdAt: 'desc' }, take: STREAK, select: { state: true } });
  if (recent.length < STREAK) return;
  const open = await prisma.incident.findFirst({ where: { automatic: true, resolvedAt: null, components: { has: component.id } } });
  const allBad = recent.every((row) => row.state !== 'operational');
  const allGood = recent.every((row) => row.state === 'operational');

  if (allBad && !open) {
    const worst = recent.some((row) => row.state === 'down') ? 'down' : 'degraded';
    await prisma.incident.create({
      data: {
        title: `${component.name} is having problems`,
        status: 'investigating',
        impact: IMPACT_OF[worst] ?? 'minor',
        automatic: true,
        components: [component.id],
        updates: { create: { status: 'investigating', message: `Our checks found a problem with ${component.name.toLowerCase()}: ${component.detail} We are looking into it.` } },
      },
    });
  } else if (allGood && open) {
    await prisma.incident.update({
      where: { id: open.id },
      data: { status: 'resolved', resolvedAt: new Date(), updates: { create: { status: 'resolved', message: `${component.name} has been working normally for ${STREAK} checks in a row.` } } },
    });
  }
}

export async function pruneStatusChecks(): Promise<void> {
  await prisma.statusCheck.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) } } });
}

export interface DayCell { date: string; uptime: number | null }

/** The uptime of each component over 90 days, and day by day for the bars. A day with no check is null. */
export async function statusHistory(ids: string[]): Promise<{ uptime: Record<string, number | null>; days: Record<string, DayCell[]> }> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const rows = await prisma.$queryRaw<{ component: string; day: Date; total: bigint; good: bigint }[]>`
    SELECT "component", date_trunc('day', "createdAt") AS day, COUNT(*) AS total,
           COUNT(*) FILTER (WHERE "state" = 'operational') AS good
    FROM "StatusCheck"
    WHERE "createdAt" >= ${since} AND "component" = ANY(${ids})
    GROUP BY 1, 2`;
  const byComponent = new Map<string, Map<string, { total: number; good: number }>>();
  for (const row of rows) {
    const key = row.day.toISOString().slice(0, 10);
    const map = byComponent.get(row.component) ?? new Map();
    map.set(key, { total: Number(row.total), good: Number(row.good) });
    byComponent.set(row.component, map);
  }
  const uptime: Record<string, number | null> = {};
  const days: Record<string, DayCell[]> = {};
  for (const id of ids) {
    const map = byComponent.get(id) ?? new Map();
    let total = 0;
    let good = 0;
    const cells: DayCell[] = [];
    for (let offset = 89; offset >= 0; offset -= 1) {
      const date = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
      const cell = map.get(date);
      if (cell) {
        total += cell.total;
        good += cell.good;
      }
      cells.push({ date, uptime: cell ? Math.round((cell.good / cell.total) * 1000) / 10 : null });
    }
    uptime[id] = total ? Math.round((good / total) * 10000) / 100 : null;
    days[id] = cells;
  }
  return { uptime, days };
}

const publicIncident = (incident: { id: string; title: string; status: string; impact: string; components: string[]; startedAt: Date; resolvedAt: Date | null; updates: { id: string; status: string; message: string; createdAt: Date }[] }) => ({
  id: incident.id,
  title: incident.title,
  status: incident.status,
  impact: incident.impact,
  components: incident.components,
  startedAt: incident.startedAt,
  resolvedAt: incident.resolvedAt,
  updates: incident.updates.map((update) => ({ id: update.id, status: update.status, message: update.message, createdAt: update.createdAt })),
});

/** What is going on now: incidents not yet resolved. */
export async function activeIncidents() {
  const rows = await prisma.incident.findMany({ where: { resolvedAt: null }, orderBy: { startedAt: 'desc' }, include: { updates: { orderBy: { createdAt: 'desc' } } }, take: 20 });
  return rows.map(publicIncident);
}

/** The incidents of the last days that are over, for the history under the page. */
export async function pastIncidents(days = 30) {
  const rows = await prisma.incident.findMany({
    where: { resolvedAt: { not: null, gte: new Date(Date.now() - days * 86_400_000) } },
    orderBy: { startedAt: 'desc' },
    include: { updates: { orderBy: { createdAt: 'desc' } } },
    take: 50,
  });
  return rows.map(publicIncident);
}

/** The messages to show now: started, not ended, and switched on. */
export async function activeAnnouncements() {
  const now = new Date();
  const rows = await prisma.announcement.findMany({
    where: { active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    orderBy: { startsAt: 'desc' },
    take: 5,
  });
  return rows.map((row) => ({ id: row.id, title: row.title, body: row.body, severity: row.severity, startsAt: row.startsAt, endsAt: row.endsAt }));
}
