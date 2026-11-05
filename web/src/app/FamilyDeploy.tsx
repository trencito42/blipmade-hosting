import { useEffect, useMemo, useState } from 'react';
import { get, type MailPlanView } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { deployPathFor, type ResourceConfiguration } from '../lib/pricing-contract';
import { mailCheckoutPath, MailPlanLimitList } from './EmailHosting';
import { EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, SoftButton, TextInput } from '../ui-app';
import { ProductWizardShell, type WizardStep } from './deploy/ProductWizardShell';
import { memLabel, formatPrice, periodSuffix } from '../lib/pricing';

interface FamilyVariant {
  slug: string;
  label: string;
  product: { slug: string; name: string; fulfilment?: string; defaultRam: number; defaultCpu: number; defaultDisk: number; orderable: boolean; availability: string; description?: string };
}
interface FamilyPreset {
  slug: string;
  name: string;
  variantSlug: string | null;
  version: number;
  summary: string;
  recommendedRamMb: number | null;
  recommendedCpu: number | null;
  recommendedDiskGb: number | null;
}
interface FamilyAddon {
  slug: string;
  name: string;
  summary: string;
  kind: string;
  variantSlugs: string[];
  optionCode: string | null;
}
interface PublicFamily {
  slug: string;
  name: string;
  summary: string;
  group: string;
  variants: FamilyVariant[];
  presets: FamilyPreset[];
  addons: FamilyAddon[];
}

interface PluginPick { slug: string; title: string; version: string }

const MINECRAFT_SOFTWARE: Record<string, { title: string; body: string }> = {
  'minecraft-paper': {
    title: 'Paper (Java)',
    body: 'High-performance Java server with plugin support (Spigot/Bukkit APIs). Best for SMP, minigames and Modrinth plugins.',
  },
  'minecraft-folia': {
    title: 'Folia (Java)',
    body: 'Region-threaded Java server for very large player counts. Not compatible with standard Paper plugins.',
  },
  'minecraft-forge': {
    title: 'Forge (Java mods)',
    body: 'Modded Java server. Uses mods and modpacks — not Paper plugins.',
  },
  'minecraft-bedrock': {
    title: 'Bedrock',
    body: 'Cross-platform Bedrock edition. Add-ons follow Bedrock rules; Java plugins do not apply.',
  },
};

function ChoiceCard({ selected, title, body, meta, onSelect }: { selected: boolean; title: string; body: string; meta?: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`grid content-start gap-2 rounded-[20px] p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
        selected ? 'bg-acc/15 ring-2 ring-acc' : 'bg-s1 hover:bg-ink/10'
      }`}
    >
      <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-ink">{title}</span>
      <span className="text-[13.5px] leading-relaxed text-ink2">{body}</span>
      {meta ? <span className="text-[12.5px] font-medium text-ink3">{meta}</span> : null}
    </button>
  );
}

function MinecraftWizard({ family }: { family: PublicFamily }) {
  const { navigate } = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [variantSlug, setVariantSlug] = useState(family.variants[0]?.slug ?? '');
  const variant = family.variants.find((entry) => entry.slug === variantSlug) ?? family.variants[0] ?? null;
  const productSlug = variant?.product.slug ?? '';
  const isBedrock = productSlug === 'minecraft-bedrock';
  const isForge = productSlug === 'minecraft-forge';
  const versionsState = useAsync<{ product: string; supported: boolean; versions: string[]; note?: string }>(
    async (signal) => {
      if (!productSlug) return { product: '', supported: false, versions: [] };
      const answer = await get<{ supported: boolean; versions: string[]; note?: string }>('/catalog/minecraft/versions', { product: productSlug }, signal);
      return { ...answer, product: productSlug };
    },
    [productSlug],
  );
  // The state keeps the list of the software that was on screen before until the new one arrives.
  const versionList = versionsState.data?.product === productSlug ? versionsState.data : undefined;
  const [gameVersion, setGameVersion] = useState('');
  // The versions belong to the software: while the list of another software is on screen, or the choice is not in
  // the list, the newest version is picked.
  useEffect(() => {
    if (!versionList) {
      if (gameVersion) setGameVersion('');
      return;
    }
    if (versionList.versions.length && !versionList.versions.includes(gameVersion)) setGameVersion(versionList.versions[0]);
  }, [versionList, gameVersion]);
  const [pluginQuery, setPluginQuery] = useState('');
  const [pluginHits, setPluginHits] = useState<{ slug: string; title: string; description: string }[]>([]);
  const [pluginSearchPending, setPluginSearchPending] = useState(false);
  const [plugins, setPlugins] = useState<PluginPick[]>([]);
  const presets = useMemo(
    () => family.presets.filter((preset) => preset.variantSlug === null || preset.variantSlug === variant?.slug),
    [family.presets, variant?.slug],
  );
  const [presetSlug, setPresetSlug] = useState<string | null>(null);
  const preset = presets.find((entry) => entry.slug === presetSlug) ?? null;
  const [ram, setRam] = useState(variant?.product.defaultRam ?? 2048);
  const [cpu, setCpu] = useState(variant?.product.defaultCpu ?? 1);
  const [disk, setDisk] = useState(variant?.product.defaultDisk ?? 10);
  useEffect(() => {
    if (!variant) return;
    setRam(preset?.recommendedRamMb ?? variant.product.defaultRam);
    setCpu(preset?.recommendedCpu ?? variant.product.defaultCpu);
    setDisk(preset?.recommendedDiskGb ?? variant.product.defaultDisk);
  }, [variant?.slug, preset?.slug]);

  const steps: WizardStep[] = useMemo(() => {
    const base: WizardStep[] = [
      { id: 'software', title: 'Edition & software', description: 'Java and Bedrock are different games. Forge mods and Paper plugins are not interchangeable.' },
      { id: 'version', title: 'Minecraft version', description: 'Only versions the installer can download for this software are listed.' },
    ];
    if (!isBedrock) {
      base.push({
        id: 'addons',
        title: isForge ? 'Mods & modpacks' : 'Plugins & templates',
        description: isForge ? 'Search Forge modpacks from Modrinth. Optional — skip to deploy without mods.' : 'Search Paper-compatible plugins from Modrinth, or pick a preset template. Optional.',
      });
    }
    base.push(
      { id: 'resources', title: 'Resources', description: 'More RAM helps larger worlds and mod/plugin load. Player counts depend on gameplay and cannot be guaranteed.' },
      { id: 'review', title: 'Review', description: 'Confirm software, version, add-ons and sizing before checkout.' },
    );
    return base;
  }, [isBedrock, isForge]);

  const searchPlugins = async () => {
    if (!pluginQuery.trim() || !gameVersion) return;
    setPluginSearchPending(true);
    try {
      const answer = await get<{ results: { slug: string; title: string; description: string }[] }>('/catalog/minecraft/plugins/search', {
        q: pluginQuery.trim(),
        version: gameVersion,
        loader: isForge ? 'forge' : 'paper',
      });
      setPluginHits(answer.results);
    } finally {
      setPluginSearchPending(false);
    }
  };

  const config: ResourceConfiguration = { ram, cpu, disk };
  const canContinue = (() => {
    const step = steps[stepIndex]?.id;
    if (step === 'software') return Boolean(variant?.product.orderable);
    if (step === 'version') return isBedrock || Boolean(gameVersion);
    if (step === 'resources') return ram >= 512 && cpu >= 0.5 && disk >= 5;
    return true;
  })();

  const finish = () => {
    if (!variant?.product.orderable) return;
    if (variant.product.fulfilment === 'EMAIL') {
      navigate(mailCheckoutPath(variant.product.slug));
      return;
    }
    const extra: Record<string, string> = {
      family: family.slug,
      variant: variant.slug,
      ...(preset ? { preset: preset.slug, presetVersion: String(preset.version) } : {}),
      ...(gameVersion ? { mcVersion: gameVersion } : {}),
      ...(plugins.length ? { mcPlugins: plugins.map((entry) => `${entry.slug}:${entry.version}`).join(',') } : {}),
    };
    navigate(deployPathFor(variant.product.slug, config, [], extra));
  };

  const onContinue = () => {
    if (steps[stepIndex]?.id === 'review') {
      finish();
      return;
    }
    setStepIndex((value) => Math.min(value + 1, steps.length - 1));
  };

  const summary = (
    <dl className="grid gap-2 text-[13px]">
      <div><dt className="text-ink3">Software</dt><dd className="font-medium text-ink">{variant?.label}</dd></div>
      {gameVersion ? <div><dt className="text-ink3">Game version</dt><dd className="font-mono text-ink">{gameVersion}</dd></div> : null}
      {preset ? <div><dt className="text-ink3">Preset</dt><dd className="text-ink">{preset.name} <span className="text-ink3">(revision {preset.version})</span></dd></div> : null}
      {plugins.length ? <div><dt className="text-ink3">Add-ons</dt><dd className="text-ink">{plugins.map((entry) => entry.title).join(', ')}</dd></div> : null}
      <div><dt className="text-ink3">Resources</dt><dd className="font-mono text-ink">{memLabel(ram)} · {cpu} vCPU · {disk} GB</dd></div>
    </dl>
  );

  const stepId = steps[stepIndex]?.id;

  return (
    <ProductWizardShell
      eyebrow="Games"
      title={family.name}
      description={family.summary}
      backTo="/app/deploy"
      backLabel="All products"
      steps={steps}
      stepIndex={stepIndex}
      onStep={setStepIndex}
      canContinue={canContinue}
      onContinue={onContinue}
      summary={summary}
    >
      {stepId === 'software' && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {family.variants.map((entry) => {
            const copy = MINECRAFT_SOFTWARE[entry.product.slug] ?? { title: entry.label, body: entry.product.name };
            return (
              <li key={entry.slug}>
                <ChoiceCard
                  selected={variantSlug === entry.slug}
                  title={copy.title}
                  body={copy.body}
                  meta={entry.product.orderable ? 'Ready to order' : entry.product.availability.toLowerCase()}
                  onSelect={() => { setVariantSlug(entry.slug); setPresetSlug(null); setPlugins([]); }}
                />
              </li>
            );
          })}
        </ul>
      )}
      {stepId === 'version' && (
        <Panel title={isBedrock ? 'Bedrock version' : 'Supported releases'}>
          {isBedrock ? (
            <p className="text-[14px] text-ink2">Bedrock installs the newest official server build. You set up worlds and add-ons after the server is online.</p>
          ) : !versionList && !versionsState.error ? (
            <LoadingBlock rows={2} label="Loading versions" />
          ) : versionsState.error || !versionList?.versions.length ? (
            <ErrorState
              title="Versions could not be loaded"
              message="The list of versions did not load. Try again in a moment."
              onRetry={versionsState.reload}
            />
          ) : (
            <fieldset className="grid gap-3">
              <legend className="sr-only">Minecraft version</legend>
              {versionList?.note ? <p className="text-[13px] text-ink3">{versionList?.note}</p> : null}
              <div className="flex max-h-80 flex-wrap gap-2 overflow-y-auto">
                {versionList?.versions.map((version, index) => (
                  <label
                    key={version}
                    className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 font-mono text-[13.5px] transition-colors focus-within:ring-2 focus-within:ring-acc ${
                      gameVersion === version ? 'bg-acc text-bg font-semibold' : 'bg-s1 text-ink hover:bg-ink/10'
                    }`}
                  >
                    <input type="radio" name="mc-version" className="sr-only" checked={gameVersion === version} onChange={() => setGameVersion(version)} />
                    {version}
                    {index === 0 ? <span className="font-sans text-[11px] font-semibold uppercase tracking-wide opacity-70">newest</span> : null}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </Panel>
      )}
      {stepId === 'addons' && (
        <div className="grid gap-4">
          {presets.length > 0 && (
            <Panel title="Preset template" description="Preset revision is not the Minecraft game version.">
              <div className="grid gap-2">
                <label className="flex min-h-10 items-center gap-3 rounded-xl bg-s1 px-3 text-[14px]">
                  <input type="radio" name="preset" checked={presetSlug === null} onChange={() => setPresetSlug(null)} />
                  No preset
                </label>
                {presets.map((entry) => (
                  <label key={entry.slug} className="flex min-h-10 items-center gap-3 rounded-xl bg-s1 px-3 text-[14px]">
                    <input type="radio" name="preset" checked={presetSlug === entry.slug} onChange={() => setPresetSlug(entry.slug)} />
                    <span>{entry.name}<span className="mt-0.5 block text-[12.5px] text-ink3">Revision {entry.version}. {entry.summary}</span></span>
                  </label>
                ))}
              </div>
            </Panel>
          )}
          <Panel title={isForge ? 'Modpack search' : 'Plugin search'} description="Optional. Nothing is installed if you skip this step.">
            <div className="flex flex-wrap gap-2">
              <div className="min-w-[200px] flex-1">
                <TextInput label="Search Modrinth" value={pluginQuery} onChange={(event) => setPluginQuery(event.target.value)} placeholder={isForge ? 'All the mods' : 'Essentials'} />
              </div>
              <SoftButton type="button" onClick={() => void searchPlugins()} disabled={pluginSearchPending || !pluginQuery.trim() || !gameVersion}>
                {pluginSearchPending ? 'Searching…' : 'Search'}
              </SoftButton>
            </div>
            <ul className="mt-3 grid gap-2">
              {pluginHits.map((hit) => (
                <li key={hit.slug} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-s1 px-3 py-2">
                  <div>
                    <p className="font-medium text-ink">{hit.title}</p>
                    <p className="text-[12.5px] text-ink3 line-clamp-2">{hit.description}</p>
                  </div>
                  <SoftButton
                    type="button"
                    disabled={plugins.some((entry) => entry.slug === hit.slug)}
                    onClick={() => setPlugins((current) => [...current, { slug: hit.slug, title: hit.title, version: gameVersion }])}
                  >
                    Add
                  </SoftButton>
                </li>
              ))}
            </ul>
            {plugins.length > 0 && (
              <p className="mt-3 text-[13px] text-ink2">Selected: {plugins.map((entry) => entry.title).join(', ')}</p>
            )}
          </Panel>
        </div>
      )}
      {stepId === 'resources' && (
        <Panel title="Server size">
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Quick sizes">
            {[2048, 4096, 6144, 8192].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setRam(size)}
                aria-pressed={ram === size}
                className={`min-h-11 rounded-full px-4 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${ram === size ? 'bg-acc text-bg' : 'bg-s1 text-ink hover:bg-ink/10'}`}
              >
                {memLabel(size)}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput label="RAM (MB)" value={String(ram)} onChange={(event) => setRam(Number(event.target.value) || ram)} inputMode="numeric" />
            <TextInput label="vCPU" value={String(cpu)} onChange={(event) => setCpu(Number(event.target.value) || cpu)} inputMode="decimal" />
            <TextInput label="Disk (GB)" value={String(disk)} onChange={(event) => setDisk(Number(event.target.value) || disk)} inputMode="numeric" />
          </div>
        </Panel>
      )}
      {stepId === 'review' && (
        <Panel title="What happens next">
          <p className="text-[14px] leading-relaxed text-ink2">
            You continue to checkout with this configuration. After payment, the server installs Minecraft {gameVersion || '…'} on {variant?.label}.
            {plugins.length ? ` Modrinth downloads ${plugins.length} add-on(s) during provisioning.` : ''}
            {' '}You must accept the Minecraft EULA on the checkout page.
          </p>
        </Panel>
      )}
    </ProductWizardShell>
  );
}

function EmailHostingWizard({ family }: { family: PublicFamily }) {
  const { navigate } = useRouter();
  const plansState = useAsync<{ plans: MailPlanView[] }>((signal) => get('/mail/plans', undefined, signal), []);
  const plans = plansState.data?.plans ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const plan = plans.find((entry) => entry.slug === selected) ?? plans.find((entry) => family.variants.some((variant) => variant.product.slug === entry.slug));
  const steps: WizardStep[] = [
    { id: 'plan', title: 'Compare plans', description: 'Limits and price come from the platform catalog — nothing is invented here.' },
    { id: 'review', title: 'Continue', description: 'Domain setup and billing happen on the mail checkout page.' },
  ];
  const [stepIndex, setStepIndex] = useState(0);
  return (
    <ProductWizardShell
      eyebrow="Email hosting"
      title={family.name}
      description={family.summary}
      backTo="/app/deploy"
      steps={steps}
      stepIndex={stepIndex}
      onStep={setStepIndex}
      canContinue={Boolean(plan?.availability.orderable)}
      onContinue={() => {
        if (stepIndex === 0) setStepIndex(1);
        else if (plan) navigate(mailCheckoutPath(plan.slug));
      }}
      summary={plan ? (
        <div className="grid gap-2">
          <p className="font-semibold text-ink">{plan.name}</p>
          {plan.price ? (
            <p className="font-mono text-[15px] text-ink">{formatPrice(plan.price.amount, plan.price.currency)}{periodSuffix(plan.price.period)}</p>
          ) : null}
          <MailPlanLimitList limits={plan.limits} />
        </div>
      ) : null}
    >
      {plansState.loading ? <LoadingBlock rows={3} label="Loading mail plans" /> : (
        <ul className="grid gap-3 lg:grid-cols-3">
          {plans.map((entry) => {
            const active = (selected ?? plan?.slug) === entry.slug;
            return (
              <li key={entry.slug}>
                <ChoiceCard
                  selected={active}
                  title={entry.name}
                  body={entry.description}
                  meta={entry.availability.orderable ? 'Available' : entry.availability.state}
                  onSelect={() => setSelected(entry.slug)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </ProductWizardShell>
  );
}

function GenericFamilyWizard({ family }: { family: PublicFamily }) {
  const { navigate } = useRouter();
  const [variantSlug, setVariantSlug] = useState(family.variants[0]?.slug ?? '');
  const variant = family.variants.find((entry) => entry.slug === variantSlug) ?? null;
  const presets = family.presets.filter((preset) => preset.variantSlug === null || preset.variantSlug === variant?.slug);
  const [presetSlug, setPresetSlug] = useState<string | null>(null);
  const preset = presets.find((entry) => entry.slug === presetSlug) ?? null;
  const [stepIndex, setStepIndex] = useState(0);
  const steps: WizardStep[] = [
    { id: 'product', title: 'Choose product', description: family.summary || 'Pick the runtime that matches your workload.' },
    { id: 'preset', title: 'Configuration', description: 'Presets apply after the server is online. Revision numbers are catalog versions, not application versions.' },
    { id: 'review', title: 'Review', description: 'Resources and pricing are confirmed on the product checkout page.' },
  ];
  const config: ResourceConfiguration | null = variant
    ? {
        ram: preset?.recommendedRamMb ?? variant.product.defaultRam,
        cpu: preset?.recommendedCpu ?? variant.product.defaultCpu,
        disk: preset?.recommendedDiskGb ?? variant.product.defaultDisk,
      }
    : null;

  const finish = () => {
    if (!variant || !config || !variant.product.orderable) return;
    if (variant.product.fulfilment === 'EMAIL') {
      navigate(mailCheckoutPath(variant.product.slug));
      return;
    }
    if (variant.product.fulfilment === 'VPS') {
      navigate(`/app/vps/new?plan=${encodeURIComponent(variant.product.slug)}`);
      return;
    }
    navigate(
      deployPathFor(variant.product.slug, config, [], {
        family: family.slug,
        variant: variant.slug,
        ...(preset ? { preset: preset.slug, presetVersion: String(preset.version) } : {}),
      }),
    );
  };

  return (
    <ProductWizardShell
      eyebrow={family.group}
      title={family.name}
      description={family.summary}
      backTo="/app/deploy"
      steps={steps}
      stepIndex={stepIndex}
      onStep={setStepIndex}
      canContinue={Boolean(variant?.product.orderable)}
      onContinue={() => (steps[stepIndex]?.id === 'review' ? finish() : setStepIndex((value) => value + 1))}
      summary={
        variant ? (
          <dl className="grid gap-2 text-[13px]">
            <div><dt className="text-ink3">Product</dt><dd className="font-medium text-ink">{variant.label}</dd></div>
            {preset ? <div><dt className="text-ink3">Preset</dt><dd className="text-ink">{preset.name}</dd></div> : null}
            {config ? <div><dt className="text-ink3">Starting resources</dt><dd className="font-mono text-ink">{memLabel(config.ram)} · {config.cpu} vCPU · {config.disk} GB</dd></div> : null}
          </dl>
        ) : null
      }
    >
      {steps[stepIndex]?.id === 'product' && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {family.variants.map((entry) => (
            <li key={entry.slug}>
              <ChoiceCard
                selected={variantSlug === entry.slug}
                title={entry.label}
                body={entry.product.description ?? entry.product.name}
                meta={entry.product.orderable ? 'Ready' : entry.product.availability}
                onSelect={() => { setVariantSlug(entry.slug); setPresetSlug(null); }}
              />
            </li>
          ))}
        </ul>
      )}
      {steps[stepIndex]?.id === 'preset' && (
        <Panel title="Optional preset">
          {presets.length === 0 ? (
            <p className="text-[14px] text-ink2">No presets for this product. Continue to size the server on checkout.</p>
          ) : (
            <div className="grid gap-2">
              <label className="flex min-h-10 items-center gap-3 rounded-xl bg-s1 px-3 text-[14px]">
                <input type="radio" name="preset" checked={presetSlug === null} onChange={() => setPresetSlug(null)} /> No preset
              </label>
              {presets.map((entry) => (
                <label key={entry.slug} className="flex min-h-10 items-center gap-3 rounded-xl bg-s1 px-3 text-[14px]">
                  <input type="radio" name="preset" checked={presetSlug === entry.slug} onChange={() => setPresetSlug(entry.slug)} />
                  <span>{entry.name}<span className="mt-0.5 block text-[12.5px] text-ink3">Revision {entry.version}. {entry.summary}</span></span>
                </label>
              ))}
            </div>
          )}
        </Panel>
      )}
      {steps[stepIndex]?.id === 'review' && (
        <Panel title="Next step">
          <p className="text-[14px] text-ink2">Checkout validates availability, quotes the exact monthly price, and provisions the service after payment.</p>
          <PrimaryButton type="button" className="mt-4" onClick={finish} disabled={!variant?.product.orderable}>
            Continue to checkout
          </PrimaryButton>
        </Panel>
      )}
    </ProductWizardShell>
  );
}

/** Family-specific configuration wizards before the shared product checkout. */
export default function FamilyDeploy() {
  const { slug = '' } = useParams();
  const state = useAsync<{ family: PublicFamily }>((signal) => get(`/catalog/families/${encodeURIComponent(slug)}`, undefined, signal), [slug]);
  const family = state.data?.family;

  if (state.loading && !family) return <LoadingBlock rows={3} label="Loading the family" />;
  if (state.error) return <ErrorState title="This family is not available" message={state.error.message} onRetry={state.reload} />;
  if (!family || family.variants.length === 0) {
    return <EmptyState title="Nothing is ready in this family." description="Browse the catalog for individual products." />;
  }

  if (family.slug === 'minecraft') return <MinecraftWizard family={family} />;
  if (family.slug === 'email-hosting') return <EmailHostingWizard family={family} />;
  return <GenericFamilyWizard family={family} />;
}
