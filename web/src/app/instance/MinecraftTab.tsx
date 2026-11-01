import { useState } from 'react';
import { get, post, put } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, Select, SoftButton, TextInput, useToast } from '../../ui-app';
import type { TabProps } from './common';

interface Minecraft {
  slug: string;
  address: string | null;
  status: { online: boolean; version?: string; motd?: string; players?: { online: number; max: number; sample: string[] } };
  properties: Record<string, string | null>;
  whitelist: string[];
  ops: string[];
  banned: string[];
}

interface PluginHit { slug: string; title: string; description: string; downloads: number }

const PROPERTY_LABELS: Record<string, string> = {
  motd: 'Message of the day', 'max-players': 'Max players', difficulty: 'Difficulty', gamemode: 'Game mode', pvp: 'Players can fight (pvp)',
  'white-list': 'Whitelist on', 'enforce-whitelist': 'Kick players not on the whitelist', 'view-distance': 'View distance', 'simulation-distance': 'Simulation distance',
  'spawn-protection': 'Spawn protection', 'allow-flight': 'Allow flight', 'online-mode': 'Online mode (Mojang accounts)', hardcore: 'Hardcore', 'level-seed': 'World seed (new worlds only)',
};
const CHOICES: Record<string, string[]> = {
  difficulty: ['peaceful', 'easy', 'normal', 'hard'], gamemode: ['survival', 'creative', 'adventure', 'spectator'],
  pvp: ['true', 'false'], 'white-list': ['true', 'false'], 'enforce-whitelist': ['true', 'false'], 'allow-flight': ['true', 'false'], 'online-mode': ['true', 'false'], hardcore: ['true', 'false'],
};

/**
 * Minecraft tools for a Java server: who is on, the whitelist, operators and bans, settings, the version, and plugins.
 * Everything goes through the panel, so it works while the server runs and needs no port or password of its own.
 */
export default function MinecraftTab({ instance }: TabProps) {
  const { push } = useToast();
  const base = `/instances/${encodeURIComponent(instance.id)}/minecraft`;
  const state = useAsync<Minecraft>((signal) => get<Minecraft>(base, undefined, signal), [instance.id]);
  const [player, setPlayer] = useState('');
  const [reason, setReason] = useState('');
  const [command, setCommand] = useState('');
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PluginHit[]>([]);
  const [version, setVersion] = useState('');
  const versions = useAsync<{ supported: boolean; versions: string[]; current: string | null }>((signal) => get(`${base}/versions`, undefined, signal), [instance.id]);
  const plugins = useAsync<{ installed: { name: string; size: number }[] }>((signal) => get(`${base}/plugins`, undefined, signal), [instance.id]);
  const data = state.data;
  const gameVersion = (data?.status.version ?? '').match(/\d+\.\d+(\.\d+)?/)?.[0] ?? versions.data?.current ?? '';

  const act = useAction(async (action: string, name?: string) => {
    await post(`${base}/player`, { action, player: name ?? player, ...(reason ? { reason } : {}) });
    push('Sent to the server.', 'ok');
    setTimeout(() => state.reload(), 1500);
  });
  const run = useAction(async () => {
    await post(`${base}/command`, { command });
    push('Sent to the server. The answer is in the Console tab.', 'ok');
    setCommand('');
  });
  const saveProps = useAction(async () => {
    const answer = await put<{ note: string }>(`${base}/properties`, { changes });
    push(answer.note, 'ok');
    setChanges({});
    state.reload();
  });
  const search = useAction(async () => {
    const answer = await get<{ results: PluginHit[] }>(`${base}/plugins/search`, { q: query, version: gameVersion });
    setHits(answer.results);
  });
  const install = useAction(async (slug: string) => {
    const answer = await post<{ installed: string; note: string }>(`${base}/plugins`, { slug, version: gameVersion });
    push(`${answer.installed} installed. ${answer.note}`, 'ok');
    plugins.reload();
  });
  const changeVersion = useAction(async () => {
    const answer = await put<{ note: string }>(`${base}/version`, { version });
    push(answer.note, 'ok');
    versions.reload();
  });

  if (state.loading && !data) return <LoadingBlock rows={2} label="Loading the Minecraft tools" />;
  if (state.error) return <ErrorState title="The Minecraft tools could not be loaded" message={state.error.message} onRetry={state.reload} />;
  if (!data) return null;

  const copy = async () => {
    if (!data.address) return;
    try {
      await navigator.clipboard.writeText(data.address);
      push('The address was copied.', 'ok');
    } catch {
      push('Select the address and copy it by hand.', 'error');
    }
  };
  const lists: { title: string; names: string[]; remove: string }[] = [
    { title: 'Whitelist', names: data.whitelist, remove: 'whitelist-remove' },
    { title: 'Operators', names: data.ops, remove: 'deop' },
    { title: 'Banned', names: data.banned, remove: 'pardon' },
  ];

  return (
    <div className="grid gap-4">
      <Panel title="Join and status" description="What players type in Multiplayer → Add server.">
        <div className="grid gap-2 text-[14px]">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-xl bg-s2 px-3 py-2 font-mono text-[14px] text-ink">{data.address ?? 'No address yet'}</code>
            {data.address && <SoftButton onClick={() => void copy()}>Copy</SoftButton>}
          </div>
          {data.status.online ? (
            <p className="text-ink2">
              Online · {data.status.version} · {data.status.players?.online ?? 0} of {data.status.players?.max ?? 0} players
              {data.status.players?.sample.length ? `: ${data.status.players.sample.join(', ')}` : ''}
            </p>
          ) : (
            <p className="text-ink3">The server is not answering. Start it, or wait a minute if it just started.</p>
          )}
        </div>
      </Panel>

      <Panel title="Players" description="Needs the server to be running. Names are Minecraft account names.">
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Player" value={player} onChange={(event) => setPlayer(event.target.value)} placeholder="Steve" autoComplete="off" spellCheck={false} />
            <TextInput label="Reason (for kick and ban)" value={reason} onChange={(event) => setReason(event.target.value)} autoComplete="off" />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['whitelist-add', 'op', 'kick', 'ban'] as const).map((action) => (
              <SoftButton key={action} onClick={() => void act.run(action)} disabled={act.pending || !player.trim()}>
                {{ 'whitelist-add': 'Add to whitelist', op: 'Make operator', kick: 'Kick', ban: 'Ban' }[action]}
              </SoftButton>
            ))}
          </div>
          {act.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{act.error}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            {lists.map((list) => (
              <div key={list.title} className="grid content-start gap-1.5 rounded-2xl bg-s2 p-3.5">
                <p className="text-[13.5px] font-semibold text-ink">{list.title} ({list.names.length})</p>
                {list.names.length === 0 ? <p className="text-[12.5px] text-ink3">Empty.</p> : list.names.slice(0, 50).map((name) => (
                  <div key={name} className="flex items-center justify-between gap-2 text-[13px] text-ink2">
                    <span className="break-all">{name}</span>
                    <button type="button" className="text-[12px] underline" onClick={() => void act.run(list.remove, name)}>remove</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Command" description="Any command, as if you typed it in the console. The answer shows in the Console tab.">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <TextInput label="Command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="say Hello" autoComplete="off" spellCheck={false} />
          </div>
          <PrimaryButton onClick={() => void run.run()} disabled={run.pending || !command.trim()}>Send</PrimaryButton>
        </div>
        {run.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{run.error}</p>}
      </Panel>

      <Panel title="Settings" description="The usual lines of server.properties. The server reads them when it starts, so restart it after saving.">
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(data.properties).map(([key, value]) => {
            const current = changes[key] ?? value ?? '';
            return CHOICES[key] ? (
              <Select key={key} label={PROPERTY_LABELS[key] ?? key} value={current} onChange={(event) => setChanges({ ...changes, [key]: event.target.value })}>
                {value === null && <option value="">(not set)</option>}
                {CHOICES[key]!.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
              </Select>
            ) : (
              <TextInput key={key} label={PROPERTY_LABELS[key] ?? key} value={current} onChange={(event) => setChanges({ ...changes, [key]: event.target.value })} autoComplete="off" />
            );
          })}
        </div>
        {saveProps.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{saveProps.error}</p>}
        <div className="mt-3">
          <PrimaryButton onClick={() => void saveProps.run()} disabled={saveProps.pending || Object.keys(changes).length === 0}>Save settings</PrimaryButton>
        </div>
      </Panel>

      {versions.data?.supported && (
        <Panel title="Version" description="A backup is made first and kept (locked). Your world and settings stay; only the server program is replaced. Plugins may need an update after a big jump.">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px]">
              <Select label={`Now: ${versions.data.current ?? 'unknown'}`} value={version} onChange={(event) => setVersion(event.target.value)}>
                <option value="">Choose a version</option>
                {versions.data.versions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </Select>
            </div>
            <PrimaryButton onClick={() => void changeVersion.run()} disabled={changeVersion.pending || !version || version === versions.data.current}>Back up and change</PrimaryButton>
          </div>
          {changeVersion.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{changeVersion.error}</p>}
        </Panel>
      )}

      {versions.data?.supported && (
        <Panel title="Plugins" description={gameVersion ? `From Modrinth, only files built for Minecraft ${gameVersion}. They are downloaded by the node to the plugins folder.` : 'Start the server once so the version is known.'}>
          <div className="grid gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <TextInput label="Search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="EssentialsX" autoComplete="off" />
              </div>
              <SoftButton onClick={() => void search.run()} disabled={search.pending || !query.trim() || !gameVersion}>Search</SoftButton>
            </div>
            {search.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{search.error}</p>}
            {hits.map((hit) => (
              <div key={hit.slug} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">{hit.title}</p>
                  <p className="text-[12.5px] text-ink3">{hit.description}</p>
                </div>
                <SoftButton onClick={() => void install.run(hit.slug)} disabled={install.pending}>Install</SoftButton>
              </div>
            ))}
            {install.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{install.error}</p>}
            {(plugins.data?.installed.length ?? 0) > 0 ? (
              <p className="text-[13px] text-ink2">Installed: {plugins.data!.installed.map((entry) => entry.name).join(', ')}</p>
            ) : (
              <EmptyState title="No plugins installed." description="Search above, or upload a .jar in the Files tab, in the plugins folder." />
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
