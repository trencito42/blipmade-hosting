import type { OfferingAddon } from '../../../lib/deploy-studio';
import { formatPrice } from '../../../lib/pricing';

interface AddonSelectionStepProps {
  addons: OfferingAddon[];
  selectedOptionCodes: string[];
  onToggleOptionCode: (code: string) => void;
  hasDedicatedIpOption?: boolean;
  dedicatedIpSelected?: boolean;
  onToggleDedicatedIp?: () => void;
  dedicatedIpPrice?: { amount: number; currency: string } | null;
}

export function AddonSelectionStep({
  addons,
  selectedOptionCodes,
  onToggleOptionCode,
  hasDedicatedIpOption = false,
  dedicatedIpSelected = false,
  onToggleDedicatedIp,
  dedicatedIpPrice,
}: AddonSelectionStepProps) {
  const hasItems = addons.length > 0 || hasDedicatedIpOption;

  if (!hasItems) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6 text-center text-[13.5px] text-ink3">
        No additional add-ons or optional features are required for this service.
      </div>
    );
  }

  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {hasDedicatedIpOption && onToggleDedicatedIp && (
        <label
          className={`flex cursor-pointer items-start gap-3.5 rounded-[20px] border p-4.5 transition-all ${
            dedicatedIpSelected
              ? 'border-acc bg-acc/10 ring-2 ring-acc shadow-md shadow-acc/5'
              : 'border-line bg-card hover:border-ink/40'
          }`}
        >
          <input
            type="checkbox"
            checked={dedicatedIpSelected}
            onChange={onToggleDedicatedIp}
            className="mt-1 h-4 w-4 rounded border-line bg-s1 text-acc focus:ring-acc"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">Dedicated IPv4 Address</span>
              {dedicatedIpPrice && (
                <span className="font-mono text-[13px] font-bold text-ink">
                  +{formatPrice(dedicatedIpPrice.amount, dedicatedIpPrice.currency)}/mo
                </span>
              )}
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink3">
              Direct, unshared public IPv4 routing exclusively allocated to your virtual machine with all 65,535 ports open.
            </p>
          </div>
        </label>
      )}

      {addons.map((addon) => {
        const isSelected = addon.optionCode ? selectedOptionCodes.includes(addon.optionCode) : false;
        return (
          <label
            key={addon.slug}
            className={`flex cursor-pointer items-start gap-3.5 rounded-[20px] border p-4.5 transition-all ${
              isSelected
                ? 'border-acc bg-acc/10 ring-2 ring-acc shadow-md shadow-acc/5'
                : 'border-line bg-card hover:border-ink/40'
            }`}
          >
            {addon.optionCode ? (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleOptionCode(addon.optionCode!)}
                className="mt-1 h-4 w-4 rounded border-line bg-s1 text-acc focus:ring-acc"
              />
            ) : null}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{addon.name}</span>
                {addon.optionAmount ? (
                  <span className="font-mono text-[13px] font-bold text-ink">
                    +{formatPrice(addon.optionAmount, addon.optionCurrency ?? 'EUR')}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink3">{addon.summary}</p>
            </div>
          </label>
        );
      })}
    </div>
  );
}

