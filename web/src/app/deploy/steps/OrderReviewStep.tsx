import type { Quote } from '../../../lib/api';
import { formatPrice, memLabel } from '../../../lib/pricing';
import { PrimaryButton, SoftButton, TextInput } from '../../../ui-app';
import { BillingAddressFields, type BillingAddressValue } from '../../BillingAddressFields';
import { Turnstile, useTurnstileKey } from '../../../lib/turnstile';
import { Icon } from '../../../icons';

interface OrderReviewStepProps {
  offeringName: string;
  variantLabel: string;
  isMinecraft?: boolean;
  acceptEula: boolean;
  onAcceptEulaChange: (val: boolean) => void;
  period: 'MONTHLY' | 'YEARLY';
  onPeriodChange: (val: 'MONTHLY' | 'YEARLY') => void;
  promotionCode: string;
  onPromotionCodeChange: (code: string) => void;
  quote: Quote | null;
  quoteLoading: boolean;
  quoteError: string | null;
  billingAddress: BillingAddressValue;
  onBillingAddressChange: (val: BillingAddressValue) => void;
  humanToken: string | null;
  onHumanTokenChange: (token: string | null) => void;
  onPlaceOrder: () => void;
  orderPending: boolean;
  orderError: string | null;
  summaryDetails: { label: string; value: string }[];
}

export function OrderReviewStep({
  offeringName,
  variantLabel,
  isMinecraft = false,
  acceptEula,
  onAcceptEulaChange,
  period,
  onPeriodChange,
  promotionCode,
  onPromotionCodeChange,
  quote,
  quoteLoading,
  quoteError,
  billingAddress,
  onBillingAddressChange,
  humanToken,
  onHumanTokenChange,
  onPlaceOrder,
  orderPending,
  orderError,
  summaryDetails,
}: OrderReviewStepProps) {
  const turnstileKey = useTurnstileKey();
  const isZeroCost = quote && quote.total === 0;
  const needsTurnstile = isZeroCost && turnstileKey !== null;

  const canSubmit =
    !orderPending &&
    !quoteLoading &&
    quote !== null &&
    (!isMinecraft || acceptEula) &&
    (!needsTurnstile || Boolean(humanToken));

  return (
    <div className="grid gap-6">
      {/* Configuration Summary Card */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <h4 className="font-display text-[17px] font-semibold text-ink">Configuration Summary</h4>
        <dl className="mt-3 grid gap-2.5 text-[13.5px]">
          <div className="flex justify-between border-b border-line/60 pb-2">
            <dt className="text-ink3">Service Offering</dt>
            <dd className="font-semibold text-ink">{offeringName}</dd>
          </div>
          <div className="flex justify-between border-b border-line/60 pb-2">
            <dt className="text-ink3">Selected Variant / Plan</dt>
            <dd className="font-medium text-ink">{variantLabel}</dd>
          </div>
          {summaryDetails.map((detail, index) => (
            <div key={index} className="flex justify-between border-b border-line/60 pb-2">
              <dt className="text-ink3">{detail.label}</dt>
              <dd className="font-mono text-ink text-right">{detail.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Billing Cycle Selector */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <h4 className="font-display text-[17px] font-semibold text-ink">Billing Period</h4>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onPeriodChange('MONTHLY')}
            aria-pressed={period === 'MONTHLY'}
            className={`rounded-xl border p-3.5 text-left transition-all ${
              period === 'MONTHLY'
                ? 'border-acc bg-acc/10 ring-2 ring-acc text-ink'
                : 'border-line bg-s1 text-ink2 hover:border-ink/40'
            }`}
          >
            <span className="font-semibold text-[14px]">Monthly</span>
            <span className="block text-[12px] text-ink3">Pay as you go, cancel anytime.</span>
          </button>
          <button
            type="button"
            onClick={() => onPeriodChange('YEARLY')}
            aria-pressed={period === 'YEARLY'}
            className={`rounded-xl border p-3.5 text-left transition-all ${
              period === 'YEARLY'
                ? 'border-acc bg-acc/10 ring-2 ring-acc text-ink'
                : 'border-line bg-s1 text-ink2 hover:border-ink/40'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[14px]">Yearly</span>
              <span className="rounded bg-acc/20 px-1.5 py-0.5 text-[10px] font-bold text-acc">BEST VALUE</span>
            </div>
            <span className="block text-[12px] text-ink3">Includes annual discount.</span>
          </button>
        </div>
      </div>

      {/* Promotion Code Form */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <TextInput
          label="Promotion code"
          value={promotionCode}
          onChange={(e) => onPromotionCodeChange(e.target.value.toUpperCase())}
          placeholder="e.g. LAUNCH"
        />
        {quote?.promotion && (
          <p className={`mt-2 text-[12.5px] font-medium ${quote.promotion.valid ? 'text-good' : 'text-bad'}`}>
            {quote.promotion.valid
              ? `Promotion ${quote.promotion.code} applied successfully.`
              : (quote.promotion.reason ?? 'Invalid promotion code.')}
          </p>
        )}
      </div>

      {/* Authoritative Quote Breakdown */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <h4 className="font-display text-[17px] font-semibold text-ink">Authoritative Quote</h4>
        {quoteLoading ? (
          <p className="mt-3 text-[13px] text-ink3">Calculating live price from billing server…</p>
        ) : quoteError ? (
          <p className="mt-3 text-[13px] text-bad">{quoteError}</p>
        ) : quote ? (
          <div className="mt-3 grid gap-2 text-[13.5px]">
            <div className="flex justify-between text-ink3">
              <span>Subtotal</span>
              <span className="font-mono text-ink">{formatPrice(quote.subtotal, quote.currency)}</span>
            </div>
            {quote.discount > 0 && (
              <div className="flex justify-between text-good">
                <span>Discount</span>
                <span className="font-mono">-{formatPrice(quote.discount, quote.currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-3 font-semibold text-ink">
              <span className="font-display text-[17px]">Total Due Today</span>
              <span className="font-display text-[22px] font-bold text-acc">
                {formatPrice(quote.total, quote.currency)}
              </span>
            </div>
            <p className="text-[12px] text-ink3">Billed {period === 'YEARLY' ? 'annually' : 'monthly'}. Tax included where applicable.</p>
          </div>
        ) : null}
      </div>

      {/* Minecraft EULA acceptance */}
      {isMinecraft && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-card p-4.5">
          <input
            type="checkbox"
            checked={acceptEula}
            onChange={(e) => onAcceptEulaChange(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-line bg-s1 text-acc focus:ring-acc"
          />
          <span className="text-[13px] leading-relaxed text-ink2">
            I agree to the{' '}
            <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline">
              Minecraft End User License Agreement (EULA)
            </a>{' '}
            governed by Mojang AB.
          </span>
        </label>
      )}

      {/* Turnstile human check for free orders */}
      {needsTurnstile && turnstileKey && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <Turnstile siteKey={turnstileKey} onToken={onHumanTokenChange} />
        </div>
      )}

      {orderError && (
        <div className="rounded-2xl border border-bad/30 bg-bad/10 p-4 text-[13px] text-bad">
          {orderError}
        </div>
      )}

      {/* Submit Button */}
      <PrimaryButton
        type="button"
        disabled={!canSubmit}
        onClick={onPlaceOrder}
        className="w-full py-4 text-[16px] font-bold"
      >
        {orderPending ? 'Creating order…' : quote?.total === 0 ? 'Confirm & Deploy Service' : 'Pay & Deploy Service'}
      </PrimaryButton>
    </div>
  );
}
