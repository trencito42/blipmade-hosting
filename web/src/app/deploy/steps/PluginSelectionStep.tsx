import { useState } from 'react';
import { get } from '../../../lib/api';
import { SoftButton, TextInput } from '../../../ui-app';
import { Icon } from '../../../icons';

export interface PluginPick {
  slug: string;
  title: string;
  version: string;
}

interface PluginSelectionStepProps {
  gameVersion: string;
  loader: 'paper' | 'forge' | 'bedrock';
  selectedPlugins: PluginPick[];
  onTogglePlugin: (plugin: PluginPick) => void;
}

export function PluginSelectionStep({
  gameVersion,
  loader,
  selectedPlugins,
  onTogglePlugin,
}: PluginSelectionStepProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ slug: string; title: string; description: string }[]>([]);

  const handleSearch = async () => {
    if (!query.trim() || !gameVersion || loader === 'bedrock') return;
    setSearching(true);
    try {
      const answer = await get<{ results: { slug: string; title: string; description: string }[] }>(
        '/catalog/minecraft/plugins/search',
        {
          q: query.trim(),
          version: gameVersion,
          loader,
        },
      );
      setResults(answer.results);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  if (loader === 'bedrock') {
    return (
      <div className="rounded-2xl border border-line bg-card p-5 text-center text-ink3">
        Bedrock servers use native behavior packs. Java Modrinth plugins do not apply.
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex gap-2">
        <div className="flex-1">
          <TextInput
            label="Search Modrinth community add-ons"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Geyser, LuckPerms, Essentials, WorldEdit…"
            onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
          />
        </div>
        <div className="flex items-end">
          <SoftButton type="button" onClick={() => void handleSearch()} disabled={searching || !query.trim()}>
            {searching ? 'Searching…' : 'Search'}
          </SoftButton>
        </div>
      </div>

      {/* Selected Plugins list */}
      {selectedPlugins.length > 0 && (
        <div className="grid gap-2">
          <p className="text-[12.5px] font-semibold text-ink3">Selected plugins ({selectedPlugins.length} of 15):</p>
          <div className="flex flex-wrap gap-2">
            {selectedPlugins.map((plug) => (
              <span
                key={plug.slug}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-s1 px-3 py-1.5 text-[13px] text-ink"
              >
                <span className="font-medium">{plug.title}</span>
                <button
                  type="button"
                  onClick={() => onTogglePlugin(plug)}
                  className="text-ink3 hover:text-bad"
                  aria-label={`Remove ${plug.title}`}
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search results */}
      {results.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {results.map((hit) => {
            const isPicked = selectedPlugins.some((p) => p.slug === hit.slug);
            return (
              <div
                key={hit.slug}
                className="flex items-start justify-between gap-3 rounded-xl border border-line bg-card p-3 text-left"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{hit.title}</p>
                  <p className="line-clamp-2 text-[12.5px] text-ink3">{hit.description}</p>
                </div>
                <SoftButton
                  type="button"
                  onClick={() => onTogglePlugin({ slug: hit.slug, title: hit.title, version: gameVersion })}
                  className="shrink-0"
                >
                  {isPicked ? 'Remove' : 'Add'}
                </SoftButton>
              </div>
            );
          })}
        </div>
      ) : query && !searching ? (
        <p className="text-[13px] text-ink3">No matching plugins found for this Minecraft release.</p>
      ) : null}
    </div>
  );
}
