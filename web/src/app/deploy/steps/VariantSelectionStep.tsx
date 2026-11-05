import type { OfferingVariant } from '../../../lib/deploy-studio';
import { StatusPill } from '../../../ui-app';
import { Icon } from '../../../icons';
import { ProductTile } from '../../../ui';

interface VariantSelectionStepProps {
  variants: OfferingVariant[];
  selectedVariantSlug: string;
  onSelectVariant: (slug: string) => void;
  title?: string;
  description?: string;
}

export function VariantSelectionStep({
  variants,
  selectedVariantSlug,
  onSelectVariant,
}: VariantSelectionStepProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {variants.map((v) => {
        const selected = v.slug === selectedVariantSlug;
        return (
          <button
            key={v.slug}
            type="button"
            onClick={() => v.orderable && onSelectVariant(v.slug)}
            disabled={!v.orderable}
            aria-pressed={selected}
            className={`group flex items-start gap-3.5 rounded-[20px] border p-4.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
              selected
                ? 'border-acc bg-acc/10 ring-2 ring-acc shadow-md shadow-acc/5'
                : v.orderable
                  ? 'border-line bg-card hover:border-ink/40 hover:bg-card/90'
                  : 'border-line/40 bg-card/40 opacity-60 cursor-not-allowed'
            }`}
          >
            <ProductTile slug={v.productSlug || v.slug} icon={v.icon || 'box'} size={40} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-ink">{v.label}</span>
                {v.orderable ? (
                  selected ? (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-acc text-on-acc">
                      <Icon name="check" size={10} />
                    </span>
                  ) : null
                ) : (
                  <StatusPill status="unavailable" label={v.availability.toLowerCase()} />
                )}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink3">{v.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

