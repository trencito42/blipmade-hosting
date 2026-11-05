import type { OfferingVariant } from '../../../lib/deploy-studio';
import { formatPrice, memLabel, periodSuffix } from '../../../lib/pricing';
import { StatusPill } from '../../../ui-app';
import { Icon } from '../../../icons';

interface PlanComparisonStepProps {
  variants: OfferingVariant[];
  selectedVariantSlug: string;
  onSelectVariant: (variantSlug: string) => void;
  period: 'MONTHLY' | 'YEARLY';
  onPeriodChange?: (period: 'MONTHLY' | 'YEARLY') => void;
  kind?: 'vps' | 'email' | 'family' | 'product';
}

export function PlanComparisonStep({
  variants,
  selectedVariantSlug,
  onSelectVariant,
  period,
  onPeriodChange,
  kind,
}: PlanComparisonStepProps) {
  const isYearly = period === 'YEARLY';

  return (
    <div className="grid gap-6">
      {onPeriodChange && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-card/60 p-3 sm:px-4">
          <div>
            <p className="text-[14px] font-medium text-ink">Billing period</p>
            <p className="text-[12.5px] text-ink3">Switch to yearly for significant savings.</p>
          </div>
          <div className="inline-flex rounded-xl bg-s1 p-1">
            <button
              type="button"
              onClick={() => onPeriodChange('MONTHLY')}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                !isYearly ? 'bg-card text-ink shadow-sm' : 'text-ink3 hover:text-ink'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => onPeriodChange('YEARLY')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                isYearly ? 'bg-card text-ink shadow-sm' : 'text-ink3 hover:text-ink'
              }`}
            >
              <span>Yearly</span>
              <span className="rounded bg-acc/20 px-1 py-0.5 text-[10.5px] font-bold text-acc">SAVE</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {variants.map((v) => {
          const selected = v.slug === selectedVariantSlug;
          const displayPrice = isYearly ? v.yearlyPrice ?? v.price : v.price;
          const priceAmount = displayPrice ? displayPrice.amount : null;
          const currency = displayPrice ? displayPrice.currency : 'EUR';

          return (
            <button
              key={v.slug}
              type="button"
              onClick={() => v.orderable && onSelectVariant(v.slug)}
              disabled={!v.orderable}
              aria-pressed={selected}
              className={`group relative grid content-between rounded-[22px] border p-5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
                selected
                  ? 'border-acc bg-acc/10 ring-2 ring-acc shadow-lg shadow-acc/5'
                  : v.orderable
                    ? 'border-line bg-card hover:border-ink/40 hover:bg-card/90'
                    : 'border-line/50 bg-card/40 opacity-60 cursor-not-allowed'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-display text-[19px] font-bold tracking-[-0.02em] text-ink">{v.label}</h4>
                  {v.orderable ? (
                    selected ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-acc text-on-acc">
                        <Icon name="check" size={12} />
                      </span>
                    ) : null
                  ) : (
                    <StatusPill status="unavailable" label={v.availability.toLowerCase()} />
                  )}
                </div>

                <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink3">{v.description}</p>

                {/* Specs List */}
                <div className="mt-4 border-t border-line/60 pt-4 grid gap-2 text-[13px]">
                  {kind === 'vps' || v.fulfilment === 'VPS' ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-ink3">vCPU</span>
                        <span className="font-medium text-ink">{v.minCpu} vCPU</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink3">Memory</span>
                        <span className="font-mono font-medium text-ink">{memLabel(v.minRam)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink3">NVMe Storage</span>
                        <span className="font-mono font-medium text-ink">{v.minDisk} GB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink3">Virtualization</span>
                        <span className="text-ink">KVM (Proxmox)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink3">Access</span>
                        <span className="text-ink">Root SSH & Console</span>
                      </div>
                    </>
                  ) : kind === 'email' || v.fulfilment === 'EMAIL' ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-ink3">Mailboxes</span>
                        <span className="font-medium text-ink">{v.mailLimits?.maxMailboxes ?? 'Unlimited'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink3">Storage quota</span>
                        <span className="font-mono font-medium text-ink">{v.mailLimits?.totalStorageMb ? memLabel(v.mailLimits.totalStorageMb) : 'Pooled'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink3">Custom domains</span>
                        <span className="font-medium text-ink">{v.mailLimits?.maxDomains ?? 1}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink3">Protocols</span>
                        <span className="text-ink">IMAP, POP3, SMTP</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-ink3">Included RAM</span>
                        <span className="font-mono font-medium text-ink">{memLabel(v.defaultRam)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink3">CPU Shares</span>
                        <span className="font-medium text-ink">{v.defaultCpu} vCPU</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink3">Disk Storage</span>
                        <span className="font-mono font-medium text-ink">{v.defaultDisk} GB</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Price Row */}
              <div className="mt-5 border-t border-line/60 pt-4">
                {priceAmount !== null ? (
                  <div>
                    <span className="font-display text-[22px] font-bold tracking-tight text-ink">
                      {formatPrice(priceAmount, currency)}
                    </span>
                    <span className="text-[12.5px] text-ink3"> {periodSuffix(isYearly ? 'YEARLY' : 'MONTHLY')}</span>
                  </div>
                ) : (
                  <span className="text-[13px] text-ink3">Pricing unavailable</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

