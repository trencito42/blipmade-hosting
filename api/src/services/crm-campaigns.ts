import { prisma } from '../db.js';
import { campaignMayDeliver, compileSegmentWhere, marketingDeliveryEnabled } from './crm.js';

export async function queueCampaign(input: {
  campaignId: string;
  testEmails?: string[];
  cursor?: string;
}): Promise<{ planned: number; skipped: number; nextCursor: string | null; delivery: boolean; note: string | null }> {
  const campaign = await prisma.marketingCampaign.findUnique({ where: { id: input.campaignId } });
  if (!campaign) throw new Error('Campaign not found.');
  if (campaign.status !== 'approved') throw new Error('Only an approved campaign can be queued.');
  if (!campaign.segmentId && !input.testEmails?.length) throw new Error('Choose a segment or a test recipient list.');
  let where: Record<string, unknown> = { role: 'CUSTOMER' };
  if (campaign.segmentId) {
    const segment = await prisma.customerSegment.findUnique({ where: { id: campaign.segmentId } });
    if (!segment) throw new Error('The campaign segment was deleted.');
    where = compileSegmentWhere(segment.filter);
  }
  if (campaign.eligibility) where = compileSegmentWhere(campaign.eligibility, where);
  if (input.testEmails?.length) where = { AND: [where, { email: { in: input.testEmails } }] };
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      notificationPreference: { select: { marketing: true } },
      tickets: { where: { status: { not: 'CLOSED' } }, select: { id: true }, take: 1 },
    },
    take: 200,
    orderBy: { id: 'asc' },
    ...(input.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
  });
  let planned = 0;
  let skipped = 0;
  const since = campaign.frequencyHours ? new Date(Date.now() - campaign.frequencyHours * 3_600_000) : null;
  for (const user of users) {
    const consent = user.notificationPreference?.marketing === true;
    const gate = campaignMayDeliver({
      status: campaign.status,
      suppressed: campaign.suppressed,
      marketingConsent: consent,
      pausedAt: campaign.pausedAt,
      scheduledAt: campaign.scheduledAt,
      openTicket: user.tickets.length > 0,
    });
    let status = 'skipped';
    let skipReason = gate.reason;
    if (gate.ok && consent) {
      if (since) {
        const recent = await prisma.campaignSend.count({
          where: { userId: user.id, createdAt: { gte: since }, status: { in: ['planned', 'queued'] } },
        });
        if (recent > 0) {
          skipped += 1;
          skipReason = 'Frequency cap.';
          await prisma.campaignSend.upsert({
            where: { campaignId_userId: { campaignId: campaign.id, userId: user.id } },
            create: { campaignId: campaign.id, userId: user.id, status: 'skipped', consent, skipReason },
            update: { status: 'skipped', consent, skipReason },
          });
          continue;
        }
      }
      status = gate.deliver ? 'queued' : 'planned';
      skipReason = gate.deliver ? '' : gate.reason;
      planned += 1;
    } else skipped += 1;
    await prisma.campaignSend.upsert({
      where: { campaignId_userId: { campaignId: campaign.id, userId: user.id } },
      create: { campaignId: campaign.id, userId: user.id, status, consent, skipReason },
      update: { status, consent, skipReason },
    });
  }
  return {
    planned,
    skipped,
    nextCursor: users.at(-1)?.id ?? null,
    delivery: marketingDeliveryEnabled(),
    note: marketingDeliveryEnabled() ? null : 'Rows were planned. No message was sent.',
  };
}

export async function dispatchDueCampaigns(take = 5): Promise<number> {
  const due = await prisma.marketingCampaign.findMany({
    where: { status: 'approved', suppressed: false, scheduledAt: { lte: new Date() } },
    take,
    orderBy: { scheduledAt: 'asc' },
  });
  let n = 0;
  for (const campaign of due) {
    if (!campaign.segmentId) continue;
    await queueCampaign({ campaignId: campaign.id });
    n += 1;
  }
  return n;
}

export async function planCommunityAnnouncement(body: string): Promise<{ delivered: boolean; planned: boolean; adapter: string }> {
  const adapter = process.env.DISCORD_ANNOUNCE_ADAPTER === 'memory' ? 'memory' : 'off';
  if (adapter === 'memory') {
    const sink = (globalThis as { __crmAnnounce?: string[] }).__crmAnnounce ?? [];
    sink.push(body);
    (globalThis as { __crmAnnounce?: string[] }).__crmAnnounce = sink;
  }
  return { delivered: false, planned: true, adapter };
}
