import { useState, type ReactNode } from 'react';
import { api, get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { EmptyState, ErrorState, Field, LoadingBlock, PrimaryButton, SoftButton, TextInput, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../../app/components/premium';
import { can, denseSelect, useAdminSession } from '../Overview';
import { CATALOG_GROUPS, DISCOVERY, type FamilyDetail } from './model';

const Err = ({ message }: { message: string | null | undefined }) => (message ? <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{message}</p> : null);

function useLeave(backTo: string, dirtyNow: boolean, question: string) {
  const { navigate } = useRouter();
  const [done, setDone] = useState(false);
  const dirty = !done && dirtyNow;
  useUnsavedChangesGuard(dirty, question);
  return {
    dirty,
    discard: () => { if (!dirty || window.confirm(question)) navigate(backTo); },
    finish: () => { setDone(true); navigate(backTo, { replace: true }); },
  };
}

function SelectField({ id, label, value, onChange, disabled, children }: { id: string; label: string; value: string; onChange: (value: string) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Field label={label} htmlFor={id}>
      <select id={id} className={denseSelect} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </Field>
  );
}

export function FamilyNew() {
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'products.write');
  const [draft, setDraft] = useState({ slug: '', name: '', summary: '', group: 'games', discovery: 'HIDDEN', sortOrder: '0' });
  const dirtyNow = draft.slug !== '' || draft.name !== '' || draft.summary !== '';
  const { dirty, discard, finish } = useLeave('/admin/catalog/families', dirtyNow, 'Discard this family?');
  const send = useAction(async () => post('/admin/catalog/families', {
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    summary: draft.summary.trim(),
    group: draft.group,
    discovery: draft.discovery,
    sortOrder: Number(draft.sortOrder),
    prepared: false,
  }));
  const slugOk = /^[a-z0-9-]{2,60}$/.test(draft.slug.trim());
  const ok = mayWrite && slugOk && draft.name.trim().length >= 2 && draft.summary.trim().length >= 2 && /^\d+$/.test(draft.sortOrder) && !send.pending;
  return (
    <PageEditorShell eyebrow="Catalogue" title="New family" description="Groups existing products. It does not change the public catalogue." backTo="/admin/catalog/families" backLabel="Back to families" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" disabled={!ok} onClick={() => void send.run().then((result) => { if (!result) return; toast.push('The family was created.', 'ok'); finish(); })}>{send.pending ? 'Creating…' : 'Create family'}</PrimaryButton></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Slug" value={draft.slug} autoComplete="off" disabled={!mayWrite} hint="Lowercase and dashes. It never changes." error={draft.slug !== '' && !slugOk ? 'Use lowercase letters, numbers and dashes.' : undefined} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} />
        <TextInput label="Name" value={draft.name} disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <div className="sm:col-span-2"><TextInput label="Summary" value={draft.summary} disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></div>
        <SelectField id="family-group" label="Group" value={draft.group} disabled={!mayWrite} onChange={(group) => setDraft({ ...draft, group })}>
          {CATALOG_GROUPS.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
        </SelectField>
        <SelectField id="family-discovery" label="Discovery" value={draft.discovery} disabled={!mayWrite} onChange={(discovery) => setDraft({ ...draft, discovery })}>
          {DISCOVERY.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </SelectField>
        <TextInput label="Sort order" inputMode="numeric" value={draft.sortOrder} disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })} />
        <div className="sm:col-span-2"><Err message={send.error} /></div>
      </div>
    </PageEditorShell>
  );
}

export function FamilyEdit() {
  const { id = '' } = useParams();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'products.write');
  const backTo = `/admin/catalog/families/${id}`;
  const state = useAsync<FamilyDetail>((signal) => get(`/admin/catalog/families/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const family = state.data?.family;
  const [name, setName] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<boolean | null>(null);
  const shown = {
    name: name ?? family?.name ?? '',
    summary: summary ?? family?.summary ?? '',
    group: group ?? family?.group ?? 'games',
    discovery: discovery ?? family?.discovery ?? 'HIDDEN',
    sortOrder: sortOrder ?? String(family?.sortOrder ?? 0),
    prepared: prepared ?? family?.prepared ?? false,
  };
  const changed = Boolean(family) && (shown.name !== family!.name || shown.summary !== family!.summary || shown.group !== family!.group || shown.discovery !== family!.discovery || Number(shown.sortOrder) !== family!.sortOrder || shown.prepared !== family!.prepared);
  const { dirty, discard, finish } = useLeave(backTo, changed, 'Discard the changes to this family?');
  const send = useAction(async () => api(`/admin/catalog/families/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name: shown.name.trim(), summary: shown.summary.trim(), group: shown.group, discovery: shown.discovery, sortOrder: Number(shown.sortOrder), prepared: shown.prepared } }));
  const ok = mayWrite && changed && shown.name.trim().length >= 2 && shown.summary.trim().length >= 2 && /^\d+$/.test(shown.sortOrder) && !send.pending;
  return (
    <PageEditorShell eyebrow="Catalogue" title={family?.name ?? 'Family'} description="Prepared still means off the public catalogue until the owner approves a projection." backTo={backTo} backLabel="Back to family" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" disabled={!ok} onClick={() => void send.run().then((result) => { if (!result) return; toast.push('The family was saved.', 'ok'); finish(); })}>{send.pending ? 'Saving…' : 'Save family'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the family" />
        : state.error ? <ErrorState title="The family could not be loaded" message={state.error.message} onRetry={state.reload} />
        : !family ? <EmptyState title="Family not found." />
        : (
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="font-mono text-[12.5px] text-ink3 sm:col-span-2">{family.slug}</p>
            <TextInput label="Name" value={shown.name} disabled={!mayWrite} onChange={(event) => setName(event.target.value)} />
            <TextInput label="Sort order" inputMode="numeric" value={shown.sortOrder} disabled={!mayWrite} onChange={(event) => setSortOrder(event.target.value)} />
            <div className="sm:col-span-2"><TextInput label="Summary" value={shown.summary} disabled={!mayWrite} onChange={(event) => setSummary(event.target.value)} /></div>
            <SelectField id="family-group" label="Group" value={shown.group} disabled={!mayWrite} onChange={setGroup}>
              {CATALOG_GROUPS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </SelectField>
            <SelectField id="family-discovery" label="Discovery" value={shown.discovery} disabled={!mayWrite} onChange={setDiscovery}>
              {DISCOVERY.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </SelectField>
            <label className="flex min-h-11 items-center gap-2 text-[14px] text-ink sm:col-span-2"><input type="checkbox" className="size-5" checked={shown.prepared} disabled={!mayWrite} onChange={(event) => setPrepared(event.target.checked)} />Mark prepared for a later projection</label>
            <div className="sm:col-span-2"><Err message={send.error} /></div>
          </div>
        )}
    </PageEditorShell>
  );
}

export function VariantNew() {
  const { id = '' } = useParams();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'products.write');
  const backTo = `/admin/catalog/families/${id}`;
  const state = useAsync<FamilyDetail>((signal) => get(`/admin/catalog/families/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const [draft, setDraft] = useState({ productId: '', slug: '', label: '', sortOrder: '0', active: false });
  const { dirty, discard, finish } = useLeave(backTo, draft.productId !== '' || draft.slug !== '' || draft.label !== '', 'Discard this variant?');
  const send = useAction(async () => post(`/admin/catalog/families/${encodeURIComponent(id)}/variants`, { productId: draft.productId, slug: draft.slug.trim(), label: draft.label.trim(), sortOrder: Number(draft.sortOrder), active: draft.active }));
  const products = state.data?.unmappedProducts ?? [];
  const ok = mayWrite && draft.productId !== '' && /^[a-z0-9-]{2,60}$/.test(draft.slug.trim()) && draft.label.trim().length >= 2 && /^\d+$/.test(draft.sortOrder) && !send.pending;
  return (
    <PageEditorShell eyebrow="Catalogue" title="New variant" description="Points at one existing product and does not change its price or visibility." backTo={backTo} backLabel="Back to family" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" disabled={!ok} onClick={() => void send.run().then((result) => { if (!result) return; toast.push('The variant was created.', 'ok'); finish(); })}>{send.pending ? 'Creating…' : 'Create variant'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={2} label="Loading products" />
        : state.error ? <ErrorState title="The family could not be loaded" message={state.error.message} onRetry={state.reload} />
        : products.length === 0 ? <EmptyState title="Every product is already mapped." description="A product can belong to one variant." />
        : (
          <div className="grid gap-3">
            <SelectField id="variant-product" label="Product" value={draft.productId} disabled={!mayWrite} onChange={(productId) => setDraft({ ...draft, productId })}>
              <option value="">Choose a product</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.slug})</option>)}
            </SelectField>
            <TextInput label="Slug" value={draft.slug} autoComplete="off" disabled={!mayWrite} hint="Unique inside this family. It never changes." onChange={(event) => setDraft({ ...draft, slug: event.target.value })} />
            <TextInput label="Label" value={draft.label} disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
            <TextInput label="Sort order" inputMode="numeric" value={draft.sortOrder} disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })} />
            <label className="flex min-h-11 items-center gap-2 text-[14px] text-ink"><input type="checkbox" className="size-5" checked={draft.active} disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />Active in this draft</label>
            <Err message={send.error} />
          </div>
        )}
    </PageEditorShell>
  );
}

export function VariantEdit() {
  const { id = '', variantId = '' } = useParams();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'products.write');
  const backTo = `/admin/catalog/families/${id}`;
  const state = useAsync<FamilyDetail>((signal) => get(`/admin/catalog/families/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const variant = state.data?.family.variants.find((row) => row.id === variantId);
  const [label, setLabel] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<string | null>(null);
  const [active, setActive] = useState<boolean | null>(null);
  const shownLabel = label ?? variant?.label ?? '';
  const shownSort = sortOrder ?? String(variant?.sortOrder ?? 0);
  const shownActive = active ?? variant?.active ?? false;
  const changed = Boolean(variant) && (shownLabel !== variant!.label || Number(shownSort) !== variant!.sortOrder || shownActive !== variant!.active);
  const { dirty, discard, finish } = useLeave(backTo, changed, 'Discard the changes to this variant?');
  const send = useAction(async () => api(`/admin/catalog/variants/${encodeURIComponent(variantId)}`, { method: 'PATCH', body: { label: shownLabel.trim(), sortOrder: Number(shownSort), active: shownActive } }));
  const ok = mayWrite && changed && shownLabel.trim().length >= 2 && /^\d+$/.test(shownSort) && !send.pending;
  return (
    <PageEditorShell eyebrow="Catalogue" title={variant?.label ?? 'Variant'} description="The linked product, its price and its visibility stay where they are." backTo={backTo} backLabel="Back to family" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" disabled={!ok} onClick={() => void send.run().then((result) => { if (!result) return; toast.push('The variant was saved.', 'ok'); finish(); })}>{send.pending ? 'Saving…' : 'Save variant'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={2} label="Loading the variant" />
        : state.error ? <ErrorState title="The family could not be loaded" message={state.error.message} onRetry={state.reload} />
        : !variant ? <EmptyState title="Variant not found." />
        : (
          <div className="grid gap-3">
            <p className="font-mono text-[12.5px] text-ink3">{variant.slug} · {variant.product.slug}</p>
            <TextInput label="Label" value={shownLabel} disabled={!mayWrite} onChange={(event) => setLabel(event.target.value)} />
            <TextInput label="Sort order" inputMode="numeric" value={shownSort} disabled={!mayWrite} onChange={(event) => setSortOrder(event.target.value)} />
            <label className="flex min-h-11 items-center gap-2 text-[14px] text-ink"><input type="checkbox" className="size-5" checked={shownActive} disabled={!mayWrite} onChange={(event) => setActive(event.target.checked)} />Active in this draft</label>
            <Err message={send.error} />
          </div>
        )}
    </PageEditorShell>
  );
}

/** The plugins of a preset, one Modrinth slug a line. */
function pluginList(text: string): string[] {
  return [...new Set(text.split(/[\n,]/).map((line) => line.trim()).filter(Boolean))];
}
function pluginsValid(text: string): boolean {
  const list = pluginList(text);
  return list.length <= 15 && list.every((slug) => /^[A-Za-z0-9_-]{2,64}$/.test(slug));
}
function PluginsField({ id, value, disabled, onChange }: { id: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const invalid = !pluginsValid(value);
  return (
    <Field label="Plugins installed with the server" htmlFor={id} hint="One Modrinth slug a line, at most 15 (for example essentialsx, luckperms). They are installed for the Minecraft version the customer picks. A published version never changes: a new version starts from this list." error={invalid ? 'Each plugin is a Modrinth slug: letters, numbers, - and _. At most 15.' : undefined}>
      <textarea id={id} className={`${denseSelect} h-28 py-2 font-mono`} value={value} disabled={disabled} spellCheck={false} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

export function PresetNew() {
  const { id = '' } = useParams();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'products.write');
  const backTo = `/admin/catalog/families/${id}`;
  const state = useAsync<FamilyDetail>((signal) => get(`/admin/catalog/families/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const [draft, setDraft] = useState({ slug: '', name: '', variantId: '', summary: '', notes: '', ram: '', cpu: '', disk: '', plugins: '', sortOrder: '0' });
  const { dirty, discard, finish } = useLeave(backTo, draft.slug !== '' || draft.name !== '' || draft.summary !== '', 'Discard this preset?');
  const send = useAction(async () => post(`/admin/catalog/families/${encodeURIComponent(id)}/presets`, {
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    variantId: draft.variantId || null,
    summary: draft.summary.trim(),
    notes: draft.notes.trim(),
    sortOrder: Number(draft.sortOrder),
    recommendedRamMb: draft.ram === '' ? null : Number(draft.ram),
    recommendedCpu: draft.cpu === '' ? null : Number(draft.cpu),
    recommendedDiskGb: draft.disk === '' ? null : Number(draft.disk),
    plugins: pluginList(draft.plugins),
  }));
  const ok = mayWrite && /^[a-z0-9-]{2,60}$/.test(draft.slug.trim()) && draft.name.trim().length >= 2 && draft.summary.trim().length >= 2 && /^\d+$/.test(draft.sortOrder) && (draft.ram === '' || /^\d+$/.test(draft.ram)) && (draft.cpu === '' || /^\d+(\.\d)?$/.test(draft.cpu)) && (draft.disk === '' || /^\d+$/.test(draft.disk)) && pluginsValid(draft.plugins) && !send.pending;
  return (
    <PageEditorShell eyebrow="Catalogue" title="New preset" description="Version 1 starts as a draft. Publishing it does not install anything." backTo={backTo} backLabel="Back to family" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" disabled={!ok} onClick={() => void send.run().then((result) => { if (!result) return; toast.push('The preset was created.', 'ok'); finish(); })}>{send.pending ? 'Creating…' : 'Create preset'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={2} label="Loading the family" />
        : state.error ? <ErrorState title="The family could not be loaded" message={state.error.message} onRetry={state.reload} />
        : (
          <div className="grid gap-3">
            <TextInput label="Slug" value={draft.slug} autoComplete="off" disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} />
            <TextInput label="Name" value={draft.name} disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            <SelectField id="preset-variant" label="Variant" value={draft.variantId} disabled={!mayWrite} onChange={(variantId) => setDraft({ ...draft, variantId })}>
              <option value="">Any variant in the family</option>
              {(state.data?.family.variants ?? []).map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}
            </SelectField>
            <TextInput label="Summary" value={draft.summary} disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
            <Field label="Notes" htmlFor="preset-notes"><textarea id="preset-notes" className={`${denseSelect} h-28 py-2`} value={draft.notes} disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Field>
            <TextInput label="Recommended RAM (MB)" inputMode="numeric" value={draft.ram} disabled={!mayWrite} hint="Optional. Leave empty when the product minimum is enough." onChange={(event) => setDraft({ ...draft, ram: event.target.value })} />
            <TextInput label="Recommended vCPU" inputMode="decimal" value={draft.cpu} disabled={!mayWrite} hint="Optional." onChange={(event) => setDraft({ ...draft, cpu: event.target.value })} />
            <TextInput label="Recommended disk (GB)" inputMode="numeric" value={draft.disk} disabled={!mayWrite} hint="Optional." onChange={(event) => setDraft({ ...draft, disk: event.target.value })} />
            <PluginsField id="preset-plugins" value={draft.plugins} disabled={!mayWrite} onChange={(plugins) => setDraft({ ...draft, plugins })} />
            <Err message={send.error} />
          </div>
        )}
    </PageEditorShell>
  );
}

export function PresetEdit() {
  const { id = '', presetId = '' } = useParams();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'products.write');
  const backTo = `/admin/catalog/families/${id}`;
  const state = useAsync<FamilyDetail>((signal) => get(`/admin/catalog/families/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const preset = state.data?.family.presets.find((row) => row.id === presetId);
  const latest = preset?.versions[0];
  const draftVersion = latest && !latest.publishedAt ? latest : null;
  const [summary, setSummary] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [plugins, setPlugins] = useState<string | null>(null);
  const [ram, setRam] = useState<string | null>(null);
  const [cpu, setCpu] = useState<string | null>(null);
  const [disk, setDisk] = useState<string | null>(null);
  const baseVersion = draftVersion ?? latest;
  const shownPlugins = plugins ?? (baseVersion?.plugins ?? []).join('\n');
  const shownRam = ram ?? String(baseVersion?.recommendedRamMb ?? '');
  const shownCpu = cpu ?? String(baseVersion?.recommendedCpu ?? '');
  const shownDisk = disk ?? String(baseVersion?.recommendedDiskGb ?? '');
  const shownSummary = summary ?? draftVersion?.summary ?? latest?.summary ?? '';
  const shownNotes = notes ?? draftVersion?.notes ?? latest?.notes ?? '';
  const touched = summary !== null || notes !== null || plugins !== null || ram !== null || cpu !== null || disk !== null;
  const changed = Boolean(preset) && (draftVersion ? shownSummary !== draftVersion.summary || shownNotes !== draftVersion.notes || shownPlugins !== draftVersion.plugins.join('\n') || shownRam !== String(draftVersion.recommendedRamMb ?? '') || shownCpu !== String(draftVersion.recommendedCpu ?? '') || shownDisk !== String(draftVersion.recommendedDiskGb ?? '') : touched);
  const { dirty, discard, finish } = useLeave(backTo, changed, 'Discard the preset draft?');
  const save = useAction(async () => {
    const body = {
      summary: shownSummary.trim(),
      notes: shownNotes.trim(),
      plugins: pluginList(shownPlugins),
      recommendedRamMb: shownRam === '' ? null : Number(shownRam),
      recommendedCpu: shownCpu === '' ? null : Number(shownCpu),
      recommendedDiskGb: shownDisk === '' ? null : Number(shownDisk),
    };
    if (draftVersion) return api(`/admin/catalog/preset-versions/${encodeURIComponent(draftVersion.id)}`, { method: 'PATCH', body });
    return post(`/admin/catalog/presets/${encodeURIComponent(presetId)}/versions`, body);
  });
  const publish = useAction(async () => post(`/admin/catalog/preset-versions/${encodeURIComponent(draftVersion!.id)}/publish`, {}));
  const rollback = useAction(async (versionId: string) => post(`/admin/catalog/preset-versions/${encodeURIComponent(versionId)}/rollback`, {}));
  const numbersOk = (shownRam === '' || /^\d+$/.test(shownRam)) && (shownCpu === '' || /^\d+(\.\d)?$/.test(shownCpu)) && (shownDisk === '' || /^\d+$/.test(shownDisk));
  const ok = mayWrite && changed && numbersOk && pluginsValid(shownPlugins) && shownSummary.trim().length >= 2 && !save.pending;
  return (
    <PageEditorShell eyebrow="Catalogue" title={preset?.name ?? 'Preset'} description="A published version stays as written. The next edit is a new version, and nothing is installed from here." backTo={backTo} backLabel="Back to family" dirty={dirty} stickyActions
      actions={<>
        <SoftButton type="button" onClick={discard} disabled={save.pending || publish.pending}>Discard</SoftButton>
        {draftVersion ? <SoftButton type="button" disabled={!mayWrite || publish.pending || changed} onClick={() => void publish.run().then((result) => { if (!result) return; toast.push('The version was published in the draft catalogue.', 'ok'); finish(); })}>{publish.pending ? 'Publishing…' : `Publish v${draftVersion.version}`}</SoftButton> : null}
        <PrimaryButton type="button" disabled={!ok} onClick={() => void save.run().then((result) => { if (!result) return; toast.push(draftVersion ? 'The draft was saved.' : 'A new draft version was created.', 'ok'); finish(); })}>{save.pending ? 'Saving…' : draftVersion ? 'Save draft' : 'Save as new version'}</PrimaryButton>
      </>}>
      {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the preset" />
        : state.error ? <ErrorState title="The family could not be loaded" message={state.error.message} onRetry={state.reload} />
        : !preset || !latest ? <EmptyState title="Preset not found." />
        : (
          <div className="grid gap-3">
            <p className="font-mono text-[12.5px] text-ink3">{preset.slug} · latest v{latest.version} {latest.publishedAt ? 'published' : 'draft'}</p>
            <ul className="grid gap-1 text-[13px] text-ink2">
              {preset.versions.map((version) => (
                <li key={version.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>v{version.version} · {version.publishedAt ? 'published' : 'draft'} · {version.summary}</span>
                  {mayWrite && version.publishedAt && !draftVersion ? (
                    <SoftButton type="button" disabled={rollback.pending} onClick={() => void rollback.run(version.id).then((result) => { if (!result) return; toast.push(`A draft was created from v${version.version}.`, 'ok'); state.reload(); })}>Roll back to v{version.version}</SoftButton>
                  ) : null}
                </li>
              ))}
            </ul>
            <TextInput label={draftVersion ? 'Draft summary' : 'New version summary'} value={shownSummary} disabled={!mayWrite} onChange={(event) => setSummary(event.target.value)} />
            <Field label="Notes" htmlFor="preset-notes"><textarea id="preset-notes" className={`${denseSelect} h-28 py-2`} value={shownNotes} disabled={!mayWrite} onChange={(event) => setNotes(event.target.value)} /></Field>
            <TextInput label="Recommended RAM (MB)" inputMode="numeric" value={shownRam} disabled={!mayWrite} onChange={(event) => setRam(event.target.value)} />
            <TextInput label="Recommended vCPU" inputMode="decimal" value={shownCpu} disabled={!mayWrite} onChange={(event) => setCpu(event.target.value)} />
            <TextInput label="Recommended disk (GB)" inputMode="numeric" value={shownDisk} disabled={!mayWrite} onChange={(event) => setDisk(event.target.value)} />
            <PluginsField id="preset-plugins" value={shownPlugins} disabled={!mayWrite} onChange={setPlugins} />
            <Err message={save.error ?? publish.error ?? rollback.error} />
          </div>
        )}
    </PageEditorShell>
  );
}

export function AddonNew() {
  const { id = '' } = useParams();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'products.write');
  const backTo = `/admin/catalog/families/${id}`;
  const family = useAsync<FamilyDetail>((signal) => get(`/admin/catalog/families/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const products = useAsync<{ products: { id: string; slug: string; name: string }[] }>((signal) => get('/admin/products', undefined, signal), []);
  const options = useAsync<{ options: { id: string; code: string; name: string }[] }>((signal) => get('/admin/options', undefined, signal), []);
  const [draft, setDraft] = useState({ slug: '', name: '', summary: '', kind: 'SOFTWARE', productId: '', productOptionId: '', variantId: '', project: '' });
  const { dirty, discard, finish } = useLeave(backTo, draft.slug !== '' || draft.name !== '', 'Discard this add-on?');
  const send = useAction(async () => post(`/admin/catalog/families/${encodeURIComponent(id)}/addons`, {
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    summary: draft.summary.trim(),
    kind: draft.kind,
    productId: draft.kind === 'MANAGED_SERVICE' ? draft.productId : null,
    productOptionId: draft.kind === 'PLATFORM_FEATURE' ? draft.productOptionId : null,
    variantIds: draft.variantId ? [draft.variantId] : [],
    active: false,
    installSpec: draft.kind === 'SOFTWARE' && draft.project.trim() ? { adapter: 'minecraft-plugin', project: draft.project.trim() } : null,
  }));
  const linkOk = draft.kind === 'SOFTWARE' || (draft.kind === 'MANAGED_SERVICE' && draft.productId !== '') || (draft.kind === 'PLATFORM_FEATURE' && draft.productOptionId !== '');
  const ok = mayWrite && linkOk && /^[a-z0-9-]{2,60}$/.test(draft.slug.trim()) && draft.name.trim().length >= 2 && draft.summary.trim().length >= 2 && !send.pending;
  const loading = (family.loading && !family.data) || (products.loading && !products.data) || (options.loading && !options.data);
  const error = family.error ?? products.error ?? options.error;
  return (
    <PageEditorShell eyebrow="Catalogue" title="New catalogue add-on" description="Software, a managed service and a priced feature are different. This page does not set a price." backTo={backTo} backLabel="Back to family" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" disabled={!ok} onClick={() => void send.run().then((result) => { if (!result) return; toast.push('The add-on was created.', 'ok'); finish(); })}>{send.pending ? 'Creating…' : 'Create add-on'}</PrimaryButton></>}>
      {loading ? <LoadingBlock rows={3} label="Loading add-on sources" />
        : error ? <ErrorState title="The form could not be loaded" message={error.message} onRetry={() => { family.reload(); products.reload(); options.reload(); }} />
        : (
          <div className="grid gap-3">
            <SelectField id="addon-kind" label="Kind" value={draft.kind} disabled={!mayWrite} onChange={(kind) => setDraft({ ...draft, kind })}>
              <option value="SOFTWARE">Software</option>
              <option value="MANAGED_SERVICE">Managed service</option>
              <option value="PLATFORM_FEATURE">Priced platform feature</option>
            </SelectField>
            <TextInput label="Slug" value={draft.slug} autoComplete="off" disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} />
            <TextInput label="Name" value={draft.name} disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            <TextInput label="Summary" value={draft.summary} disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
            {draft.kind === 'SOFTWARE' ? (
              <TextInput label="Modrinth project" value={draft.project} disabled={!mayWrite} hint="Paper plugin slug only. Leave empty when there is no verified installer." onChange={(event) => setDraft({ ...draft, project: event.target.value })} />
            ) : null}
            {draft.kind === 'MANAGED_SERVICE' ? (
              <SelectField id="addon-product" label="Product" value={draft.productId} disabled={!mayWrite} onChange={(productId) => setDraft({ ...draft, productId })}>
                <option value="">Choose the service product</option>
                {(products.data?.products ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </SelectField>
            ) : null}
            {draft.kind === 'PLATFORM_FEATURE' ? (
              <SelectField id="addon-option" label="Priced add-on" value={draft.productOptionId} disabled={!mayWrite} onChange={(productOptionId) => setDraft({ ...draft, productOptionId })}>
                <option value="">Choose the existing priced add-on</option>
                {(options.data?.options ?? []).map((option) => <option key={option.id} value={option.id}>{option.name} ({option.code})</option>)}
              </SelectField>
            ) : null}
            <SelectField id="addon-variant" label="Compatible variant" value={draft.variantId} disabled={!mayWrite} onChange={(variantId) => setDraft({ ...draft, variantId })}>
              <option value="">None yet</option>
              {(family.data?.family.variants ?? []).map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}
            </SelectField>
            <Err message={send.error} />
          </div>
        )}
    </PageEditorShell>
  );
}

export function AddonEdit() {
  const { id = '', addonId = '' } = useParams();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'products.write');
  const backTo = `/admin/catalog/families/${id}`;
  const state = useAsync<FamilyDetail>((signal) => get(`/admin/catalog/families/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const addon = state.data?.family.addons.find((row) => row.id === addonId);
  const [name, setName] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [active, setActive] = useState<boolean | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const shownName = name ?? addon?.name ?? '';
  const shownSummary = summary ?? addon?.summary ?? '';
  const shownActive = active ?? addon?.active ?? false;
  const shownVariant = variantId ?? addon?.variantIds[0] ?? '';
  const changed = Boolean(addon) && (shownName !== addon!.name || shownSummary !== addon!.summary || shownActive !== addon!.active || shownVariant !== (addon!.variantIds[0] ?? ''));
  const { dirty, discard, finish } = useLeave(backTo, changed, 'Discard the changes to this add-on?');
  const send = useAction(async () => api(`/admin/catalog/addons/${encodeURIComponent(addonId)}`, {
    method: 'PATCH',
    body: { name: shownName.trim(), summary: shownSummary.trim(), active: shownActive, variantIds: shownVariant ? [shownVariant] : [], expectedVersion: addon!.version },
  }));
  const ok = mayWrite && changed && shownName.trim().length >= 2 && shownSummary.trim().length >= 2 && (!shownActive || shownVariant !== '') && !send.pending;
  return (
    <PageEditorShell eyebrow="Catalogue" title={addon?.name ?? 'Add-on'} description="Saving creates the next version. The price stays on the priced add-on or the product, never here." backTo={backTo} backLabel="Back to family" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" disabled={!ok} onClick={() => void send.run().then((result) => { if (!result) return; toast.push('The add-on was saved.', 'ok'); finish(); })}>{send.pending ? 'Saving…' : 'Save add-on'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={2} label="Loading the add-on" />
        : state.error ? <ErrorState title="The family could not be loaded" message={state.error.message} onRetry={state.reload} />
        : !addon ? <EmptyState title="Add-on not found." />
        : (
          <div className="grid gap-3">
            <p className="font-mono text-[12.5px] text-ink3">{addon.slug} · {addon.kind.toLowerCase().replaceAll('_', ' ')} · v{addon.version}</p>
            <TextInput label="Name" value={shownName} disabled={!mayWrite} onChange={(event) => setName(event.target.value)} />
            <TextInput label="Summary" value={shownSummary} disabled={!mayWrite} onChange={(event) => setSummary(event.target.value)} />
            <SelectField id="addon-variant" label="Compatible variant" value={shownVariant} disabled={!mayWrite} onChange={setVariantId}>
              <option value="">None</option>
              {(state.data?.family.variants ?? []).map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}
            </SelectField>
            <label className="flex min-h-11 items-center gap-2 text-[14px] text-ink"><input type="checkbox" className="size-5" checked={shownActive} disabled={!mayWrite} onChange={(event) => setActive(event.target.checked)} />Active in this draft</label>
            <Err message={send.error} />
          </div>
        )}
    </PageEditorShell>
  );
}
