import type { OfferingPreset } from '../../../lib/deploy-studio';

interface PresetSelectionStepProps {
  presets: OfferingPreset[];
  selectedPresetSlug: string | null;
  onSelectPreset: (slug: string | null) => void;
  allowBlank?: boolean;
}

export function PresetSelectionStep({
  presets,
  selectedPresetSlug,
  onSelectPreset,
  allowBlank = true,
}: PresetSelectionStepProps) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {allowBlank && (
        <button
          type="button"
          onClick={() => onSelectPreset(null)}
          aria-pressed={selectedPresetSlug === null}
          className={`grid content-start gap-1.5 rounded-[20px] border p-4.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
            selectedPresetSlug === null
              ? 'border-acc bg-acc/10 ring-2 ring-acc shadow-md shadow-acc/5'
              : 'border-line bg-card hover:border-ink/40 hover:bg-card/90'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-[16.5px] font-semibold text-ink">Blank / Clean Start</span>
            {selectedPresetSlug === null && <span className="text-[11.5px] font-bold text-acc">Selected</span>}
          </div>
          <p className="text-[13px] leading-relaxed text-ink3">
            Start with vanilla default configuration and no pre-installed community add-ons or mods.
          </p>
        </button>
      )}

      {presets.map((preset) => {
        const selected = preset.slug === selectedPresetSlug;
        return (
          <button
            key={preset.slug}
            type="button"
            onClick={() => onSelectPreset(preset.slug)}
            aria-pressed={selected}
            className={`grid content-start gap-1.5 rounded-[20px] border p-4.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
              selected
                ? 'border-acc bg-acc/10 ring-2 ring-acc shadow-md shadow-acc/5'
                : 'border-line bg-card hover:border-ink/40 hover:bg-card/90'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-[16.5px] font-semibold text-ink">{preset.name}</span>
              <span className="text-[11px] font-mono text-ink3">rev {preset.version}</span>
            </div>
            <p className="text-[13px] leading-relaxed text-ink3">{preset.summary}</p>
            {preset.plugins.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {preset.plugins.map((plug) => (
                  <span key={plug} className="rounded-md bg-s1 px-2 py-0.5 font-mono text-[11px] text-ink2">
                    {plug}
                  </span>
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

