import { useState } from 'react';
import { del, get, post, put } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, Segmented, Select, SoftButton, TextInput, useToast } from '../../ui-app';
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
const WORLD_KEYS = new Set(['level-name', 'level-seed', 'level-type', 'generator-settings', 'allow-nether', 'generate-structures', 'max-world-size']);

interface Lag { running: boolean; verdict: 'good' | 'slow' | 'bad' | 'unknown'; tps: { m1: number; m5: number; m15: number } | null; memoryBytes?: number; memoryLimitMb?: number; cpuPercent?: number; lines: string[] }

/** Is the server lagging: the ticks a second, the memory and what to do. It asks the running server only when the button is pressed. */
function LagCheck({ instanceId }: { instanceId: string }) {
  const [result, setResult] = useState<Lag | null>(null);
  const check = useAction(async () => {
    setResult(await get<Lag>(`/instances/${encodeURIComponent(instanceId)}/minecraft/performance`));
  });
  const tone = result?.verdict === 'good' ? 'text-acc' : result?.verdict === 'unknown' ? 'text-ink2' : 'text-bad';
  return (
    <Panel title="Is the server lagging?" description="Asks the running server how many ticks a second it keeps (20 is healthy) and how full its memory is.">
      <SoftButton type="button" onClick={() => void check.run()} disabled={check.pending}>{check.pending ? 'Measuring…' : 'Measure now'}</SoftButton>
      {check.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{check.error}</p>}
      {result && (
        <div className="mt-4 grid gap-2">
          {result.tps && (
            <p className={`font-mono text-[22px] font-semibold tracking-[-0.03em] ${tone}`}>{result.tps.m1} <span className="text-[13px] font-normal text-ink3">ticks/s (1 min) · {result.tps.m5} (5 min) · {result.tps.m15} (15 min)</span></p>
          )}
          {typeof result.memoryBytes === 'number' && typeof result.memoryLimitMb === 'number' && result.memoryLimitMb > 0 && (
            <p className="text-[13.5px] text-ink2">Memory {Math.round(result.memoryBytes / 1024 / 1024)} of {result.memoryLimitMb} MB{typeof result.cpuPercent === 'number' ? ` · CPU ${result.cpuPercent}%` : ''}</p>
          )}
          <ul className="grid gap-1 text-[14px] text-ink2">
            {result.lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}
    </Panel>
  );
}

interface Cross { supported: boolean; note?: string; geyser?: boolean; floodgate?: boolean; joinPort?: number | null; steps?: { key: string; label: string; done: boolean }[] }

/** Bedrock players on this Java server: Geyser and Floodgate, step by step. Nothing is changed until a button is pressed. */
function Crossplay({ instanceId, gameVersion, address }: { instanceId: string; gameVersion: string; address: string | null }) {
  const toast = useToast();
  const base = `/instances/${encodeURIComponent(instanceId)}/minecraft`;
  const state = useAsync<Cross>((signal) => get(`${base}/crossplay`, undefined, signal), [instanceId]);
  const install = useAction(async (slug: string) => {
    const answer = await post<{ installed: string }>(`${base}/plugins`, { slug, version: gameVersion });
    toast.push(`${answer.installed} installed. Restart the server to load it.`, 'ok');
    state.reload();
  });
  const port = useAction(async () => {
    const answer = await post<{ note: string }>(`${base}/crossplay/port`, {});
    toast.push(answer.note, 'ok');
    state.reload();
  });
  if (state.data && !state.data.supported) return <Panel title="Bedrock players" description={state.data.note}><p className="text-[14px] text-ink2">{state.data.note}</p></Panel>;
  const steps = state.data?.steps ?? [];
  return (
    <Panel title="Bedrock players on this server" description="Geyser lets players on phones, consoles and Windows 10 Bedrock join this Java server. Floodgate lets them in without a Java account.">
      {state.loading ? <LoadingBlock rows={2} label="Reading the crossplay state" /> : (
        <div className="grid gap-3">
          <ol className="grid gap-1.5 text-[14px]">
            {steps.map((step) => <li key={step.key} className={step.done ? 'text-ink' : 'text-ink2'}><span aria-hidden="true" className={step.done ? 'text-acc' : 'text-ink3'}>{step.done ? '● ' : '○ '}</span>{step.label}</li>)}
          </ol>
          <div className="flex flex-wrap gap-2">
            <SoftButton type="button" disabled={install.pending || state.data?.geyser || !gameVersion} onClick={() => void install.run('geyser')}>Install Geyser</SoftButton>
            <SoftButton type="button" disabled={install.pending || state.data?.floodgate || !gameVersion} onClick={() => void install.run('floodgate')}>Install Floodgate</SoftButton>
            <SoftButton type="button" disabled={port.pending || !state.data?.geyser} onClick={() => void port.run()}>Use the game port{state.data?.joinPort ? ` ${state.data.joinPort}` : ''}</SoftButton>
          </div>
          {(install.error || port.error) && <p role="alert" className="text-[13.5px] font-medium text-bad">{install.error || port.error}</p>}
          <p className="text-[13px] text-ink3">Bedrock players add a server with the address {address ? <span className="font-mono text-ink2">{address.replace(/:\d+$/, '')}</span> : 'of this server'} and the port {state.data?.joinPort ?? 'of the server'}. The game port is open for them too: no second port is needed.</p>
        </div>
      )}
    </Panel>
  );
}

function WorldList({ instanceId }: { instanceId: string }) {
  const toast = useToast();
  const state = useAsync<{ worlds: { name: string; entries: number }[] }>((signal) => get(`/instances/${encodeURIComponent(instanceId)}/minecraft/worlds`, undefined, signal), [instanceId]);
  const [resetting, setResetting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [archive, setArchive] = useState('');
  const base = `/instances/${encodeURIComponent(instanceId)}/minecraft/worlds`;
  const backup = useAction(async () => {
    const answer = await post<{ note: string }>(`${base}/backup`, {});
    toast.push(answer.note, 'ok');
  });
  const reset = useAction(async () => {
    const answer = await post<{ note: string }>(`${base}/reset`, { confirm: 'reset the world' });
    toast.push(answer.note, 'ok');
    setResetting(false);
    state.reload();
  });
  const importWorld = useAction(async () => {
    const answer = await post<{ note: string }>(`${base}/import`, { archive: archive.trim(), confirm: 'replace the world' });
    toast.push(answer.note, 'ok');
    setImporting(false);
    setArchive('');
    state.reload();
  });
  return (
    <Panel title="World folders" description="These are the folders the server has created. A new seed does not rewrite them. Restore a world from Backups.">
      {(state.data?.worlds.length ?? 0) > 0 ? (
        <ul className="grid gap-1 text-[14px] text-ink2">
          {state.data!.worlds.map((world) => <li key={world.name}>{world.name} · {world.entries} entries</li>)}
        </ul>
      ) : <p className="text-[14px] text-ink3">{state.loading ? 'Looking for world folders.' : 'No world folder yet. Start the server once.'}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <SoftButton type="button" onClick={() => void backup.run()} disabled={backup.pending}>{backup.pending ? 'Backing up…' : 'Back up the world now'}</SoftButton>
        {(state.data?.worlds.length ?? 0) > 0 && <SoftButton type="button" onClick={() => setResetting(true)}>Start a new world…</SoftButton>}
        <SoftButton type="button" onClick={() => setImporting(true)}>Import a world from a ZIP…</SoftButton>
      </div>
      {importing && (
        <div className="mt-4 grid gap-2 rounded-2xl bg-s2 p-4">
          <p className="text-[13.5px] text-ink2">Upload the ZIP to the root of the server from Files first. The server must be stopped. A locked backup is made, the old world is removed, and the world from the ZIP takes its place. A ZIP with no <span className="font-mono">level.dat</span> changes nothing.</p>
          <TextInput label="Name of the ZIP in the root of the server" value={archive} onChange={(event) => setArchive(event.target.value)} placeholder="my-world.zip" autoComplete="off" />
          <div className="flex gap-2">
            <SoftButton type="button" onClick={() => { setImporting(false); setArchive(''); }}>Cancel</SoftButton>
            <PrimaryButton type="button" disabled={importWorld.pending || !archive.trim().toLowerCase().endsWith('.zip')} onClick={() => void importWorld.run()}>{importWorld.pending ? 'Importing…' : 'Replace the world'}</PrimaryButton>
          </div>
          {importWorld.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{importWorld.error}</p>}
        </div>
      )}
      {(backup.error || reset.error) && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{backup.error || reset.error}</p>}
      <ConfirmDialog
        open={resetting}
        title="Start a new world?"
        description="The server must be stopped. A locked backup is made first, and if it cannot be made nothing is removed. Then the world folders are removed and the server makes a new world when it starts."
        confirmLabel="Remove the world"
        requireText="reset the world"
        busy={reset.pending}
        onCancel={() => setResetting(false)}
        onConfirm={() => void reset.run()}
      />
    </Panel>
  );
}
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
  const [packQuery, setPackQuery] = useState('');
  const [packs, setPacks] = useState<PluginHit[]>([]);
  const [version, setVersion] = useState('');
  const [section, setSection] = useState<'players' | 'addons' | 'worlds' | 'performance' | 'crossplay' | 'settings'>('players');
  const versions = useAsync<{ supported: boolean; versions: string[]; current: string | null }>((signal) => get(`${base}/versions`, undefined, signal), [instance.id]);
  const capabilities = useAsync<{ profile: { capabilities: string[] } | null }>((signal) => get(`/instances/${encodeURIComponent(instance.id)}/game-capabilities`, undefined, signal), [instance.id]);
  const can = (capability: string) => Boolean(capabilities.data?.profile?.capabilities.includes(capability));
  const plugins = useAsync<{ installed: { name: string; size: number; enabled: boolean }[] }>((signal) => get(`${base}/plugins`, undefined, signal), [instance.id]);
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
  const searchPacks = useAction(async () => {
    const answer = await get<{ results: PluginHit[] }>(`${base}/modpacks/search`, { q: packQuery, version: gameVersion });
    setPacks(answer.results);
  });
  const installPack = useAction(async (slug: string) => {
    const answer = await post<{ installed: number; note: string }>(`${base}/modpacks`, { slug, version: gameVersion });
    push(`${answer.installed} mods downloaded. ${answer.note}`, 'ok');
  });
  const install = useAction(async (slug: string) => {
    const answer = await post<{ installed: string; note: string }>(`${base}/plugins`, { slug, version: gameVersion });
    push(`${answer.installed} installed. ${answer.note}`, 'ok');
    plugins.reload();
  });
  const removePlugin = useAction(async (name: string) => {
    const answer = await del<{ removed: string; note: string }>(`${base}/plugins`, { name });
    push(`${answer.removed} removed. ${answer.note}`, 'ok');
    plugins.reload();
  });
  const togglePlugin = useAction(async (name: string, enabled: boolean) => {
    const answer = await put<{ note: string }>(`${base}/plugins`, { name, enabled });
    push(`${enabled ? 'Enabled' : 'Disabled'}. ${answer.note}`, 'ok');
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
      <Segmented
        ariaLabel="Minecraft sections"
        value={section}
        onChange={setSection}
        options={[
          ...(can('minecraft-players') ? [{ value: 'players' as const, label: 'Players' }] : []),
          ...(can('minecraft-plugins') || can('minecraft-modpacks') ? [{ value: 'addons' as const, label: 'Add-ons' }] : []),
          ...(can('minecraft-worlds') ? [{ value: 'worlds' as const, label: 'Worlds' }] : []),
          ...(can('minecraft-performance') ? [{ value: 'performance' as const, label: 'Lag' }] : []),
          ...(can('minecraft-crossplay') ? [{ value: 'crossplay' as const, label: 'Bedrock players' }] : []),
          { value: 'settings', label: 'Settings' },
        ]}
      />

      {section === 'players' && <Panel title="Players" description="Needs the server to be running. The sample of online players is who answered the ping, not a full history.">
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
      </Panel>}

      {section === 'players' && <Panel title="Command" description="Any command, as if you typed it in the console. The answer shows in the Console tab.">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <TextInput label="Command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="say Hello" autoComplete="off" spellCheck={false} />
          </div>
          <PrimaryButton onClick={() => void run.run()} disabled={run.pending || !command.trim()}>Send</PrimaryButton>
        </div>
        {run.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{run.error}</p>}
      </Panel>}

      {section === 'settings' && <Panel title="Settings" description="The usual lines of server.properties. The server reads them when it starts, so restart it after saving. A profile saved here stays in this browser.">
        <div className="mb-3">
          <SoftButton onClick={() => { localStorage.setItem(`bm.mc.profile.${instance.id}`, JSON.stringify(data.properties)); push('Saved in this browser.', 'ok'); }}>Save profile</SoftButton>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(data.properties).filter(([key]) => !WORLD_KEYS.has(key)).map(([key, value]) => {
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
      </Panel>}

      {section === 'settings' && versions.data?.supported && (
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

      {section === 'addons' && can('minecraft-plugins') && versions.data?.supported && (
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
            {(togglePlugin.error || removePlugin.error) && <p role="alert" className="text-[13.5px] font-medium text-bad">{togglePlugin.error || removePlugin.error}</p>}
            {(plugins.data?.installed.length ?? 0) > 0 ? (
              <ul className="grid gap-1 text-[13px] text-ink2">
                {plugins.data!.installed.map((entry) => (
                  <li key={entry.name} className="flex items-center justify-between gap-2">
                    <span className={`font-mono ${entry.enabled ? '' : 'text-ink3 line-through'}`}>{entry.name.replace(/\.disabled$/, '')}{entry.enabled ? '' : ' (off)'}</span>
                    <span className="flex gap-3">
                      <button type="button" className="text-[13px] font-semibold text-acc" disabled={togglePlugin.pending} onClick={() => void togglePlugin.run(entry.name, !entry.enabled)}>{entry.enabled ? 'Disable' : 'Enable'}</button>
                      <button type="button" className="text-[13px] font-semibold text-acc" disabled={removePlugin.pending} onClick={() => { if (window.confirm(`Remove ${entry.name}? A backup is made first.`)) void removePlugin.run(entry.name); }}>Remove</button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No plugins installed." description="Search above, or upload a .jar in the Files tab, in the plugins folder." />
            )}
          </div>
        </Panel>
      )}
      {section === 'addons' && can('minecraft-modpacks') && (
        <Panel title="Modpacks" description="Forge modpacks from Modrinth. A backup is made first. Only files hosted on the Modrinth CDN are downloaded, at most 40.">
          <div className="grid gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <TextInput label="Search" value={packQuery} onChange={(event) => setPackQuery(event.target.value)} placeholder="All the Mods" autoComplete="off" />
              </div>
              <SoftButton onClick={() => void searchPacks.run()} disabled={searchPacks.pending || !packQuery.trim() || !gameVersion}>Search</SoftButton>
            </div>
            {searchPacks.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{searchPacks.error}</p>}
            {packs.map((hit) => (
              <div key={hit.slug} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">{hit.title}</p>
                  <p className="text-[12.5px] text-ink3">{hit.description}</p>
                </div>
                <SoftButton onClick={() => void installPack.run(hit.slug)} disabled={installPack.pending}>Install</SoftButton>
              </div>
            ))}
            {installPack.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{installPack.error}</p>}
          </div>
        </Panel>
      )}
      {section === 'addons' && !can('minecraft-plugins') && !can('minecraft-modpacks') && (
        <Panel title="Add-ons" description="This game has no verified installer here.">
          <p className="text-[14px] text-ink2">Use the Files tab for files this game actually loads. Nothing is simulated.</p>
        </Panel>
      )}
      {section === 'performance' && can('minecraft-performance') && <LagCheck instanceId={instance.id} />}
      {section === 'crossplay' && can('minecraft-crossplay') && <Crossplay instanceId={instance.id} gameVersion={gameVersion} address={data.address} />}
      {section === 'worlds' && can('minecraft-worlds') && <WorldList instanceId={instance.id} />}
      {section === 'worlds' && can('minecraft-worlds') && (
        <Panel title="Worlds" description="A new seed applies to a new world. It does not rewrite the world that is already there. Copies of the world are the Backups tab.">
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(data.properties).filter(([key]) => WORLD_KEYS.has(key)).map(([key, value]) => (
              <TextInput key={key} label={PROPERTY_LABELS[key] ?? key} value={changes[key] ?? value ?? ''} onChange={(event) => setChanges({ ...changes, [key]: event.target.value })} autoComplete="off" />
            ))}
          </div>
          {Object.entries(data.properties).every(([key]) => !WORLD_KEYS.has(key)) && <p className="text-[13.5px] text-ink3">This server has no world lines in server.properties yet.</p>}
          <div className="mt-3">
            <PrimaryButton onClick={() => void saveProps.run()} disabled={saveProps.pending || Object.keys(changes).length === 0}>Save world settings</PrimaryButton>
          </div>
        </Panel>
      )}
    </div>
  );
}
