import { useEffect, useState } from 'react';
import { get } from '../../../lib/api';
import { useAsync } from '../../../lib/useAsync';
import { LoadingBlock, TextInput } from '../../../ui-app';

interface SoftwareVersionStepProps {
  productSlug: string;
  selectedVersion: string;
  onSelectVersion: (version: string) => void;
}

export function SoftwareVersionStep({
  productSlug,
  selectedVersion,
  onSelectVersion,
}: SoftwareVersionStepProps) {
  const [filter, setFilter] = useState('');

  const versionsState = useAsync<{ product: string; supported: boolean; versions: string[]; note?: string }>(
    async (signal) => {
      if (!productSlug) return { product: '', supported: false, versions: [] };
      if (productSlug.startsWith('minecraft-')) {
        const answer = await get<{ supported: boolean; versions: string[]; note?: string }>(
          '/catalog/minecraft/versions',
          { product: productSlug },
          signal,
        );
        return { ...answer, product: productSlug };
      }
      return { product: productSlug, supported: true, versions: ['latest', 'stable'] };
    },
    [productSlug],
  );

  const versions = versionsState.data?.versions ?? [];
  const filtered = filter.trim()
    ? versions.filter((v) => v.toLowerCase().includes(filter.trim().toLowerCase()))
    : versions;

  useEffect(() => {
    if (versions.length > 0 && !selectedVersion) {
      onSelectVersion(versions[0]!);
    }
  }, [versions, selectedVersion, onSelectVersion]);

  if (versionsState.loading && versions.length === 0) {
    return <LoadingBlock rows={3} label="Loading supported software releases…" />;
  }

  return (
    <div className="grid gap-4">
      {versions.length > 10 && (
        <TextInput
          label="Filter versions"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="e.g. 1.21 or 1.20.4"
        />
      )}

      {versionsState.data?.note && (
        <p className="text-[13px] text-ink3">{versionsState.data.note}</p>
      )}

      <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {filtered.map((ver) => {
          const selected = ver === selectedVersion;
          return (
            <button
              key={ver}
              type="button"
              onClick={() => onSelectVersion(ver)}
              aria-pressed={selected}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
                selected
                  ? 'border-acc bg-acc/15 font-semibold text-ink ring-2 ring-acc'
                  : 'border-line bg-card text-ink2 hover:border-ink/40 hover:bg-card/90'
              }`}
            >
              <span className="font-mono text-[14px]">{ver}</span>
              {selected && <span className="text-[11.5px] font-bold text-acc">Selected</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

