/**
 * CRM facts, segments and campaigns on top of User, billing, tickets and consent.
 * Delivery of campaigns stays off until MARKETING_DELIVERY_ENABLED is true.
 */

export type FactKey = 'lifecycle' | 'plan_family' | 'support_open' | 'marketing' | 'discord' | 'spend_band';

export interface SegmentFilter {
  facts?: Partial<Record<FactKey, string>>;
  marketing?: boolean;
  tags?: string[];
}

export interface CampaignGate {
  ok: boolean;
  reason: string;
  deliver: boolean;
}

export function marketingDeliveryEnabled(): boolean {
  return process.env.MARKETING_DELIVERY_ENABLED === 'true';
}

export function matchesSegment(
  input: { facts: Record<string, string>; tags: string[]; marketing: boolean },
  filter: SegmentFilter,
): boolean {
  if (filter.marketing === true && !input.marketing) return false;
  if (filter.marketing === false && input.marketing) return false;
  if (filter.tags?.length && !filter.tags.every((tag) => input.tags.includes(tag))) return false;
  for (const [key, value] of Object.entries(filter.facts ?? {})) {
    if (input.facts[key] !== value) return false;
  }
  return true;
}

export function campaignTransition(status: string, event: 'submit' | 'approve' | 'reject' | 'suppress'): { status: string } | { error: string } {
  if (event === 'suppress') return { status: 'suppressed' };
  if (status === 'draft' && event === 'submit') return { status: 'pending_approval' };
  if (status === 'pending_approval' && event === 'approve') return { status: 'approved' };
  if (status === 'pending_approval' && event === 'reject') return { status: 'draft' };
  return { error: `A campaign in ${status} cannot ${event}.` };
}

export function campaignMayDeliver(input: { status: string; suppressed: boolean; marketingConsent: boolean }): CampaignGate {
  if (input.suppressed || input.status === 'suppressed') {
    return { ok: false, reason: 'This campaign is suppressed.', deliver: false };
  }
  if (input.status !== 'approved') {
    return { ok: false, reason: 'Only an approved campaign can be sent.', deliver: false };
  }
  if (!input.marketingConsent) {
    return { ok: false, reason: 'This customer has not consented to marketing.', deliver: false };
  }
  if (!marketingDeliveryEnabled()) {
    return { ok: true, reason: 'Approved. Live delivery is off. Test pipeline only.', deliver: false };
  }
  return { ok: true, reason: 'Delivery is enabled.', deliver: true };
}

export function spendBand(cents: number): string {
  if (cents <= 0) return 'none';
  if (cents < 2000) return 'low';
  if (cents < 20000) return 'mid';
  return 'high';
}
