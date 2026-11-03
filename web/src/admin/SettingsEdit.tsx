import { useEffect, useState } from 'react';
import { del, get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams } from '../router';
import { ConfirmDialog, EmptyState, ErrorState, Field, LoadingBlock, Panel, useToast } from '../ui-app';
import { PageEditorShell } from '../app/components/premium';
import { LiveRegion, can, denseDanger, denseGhost, denseInput, densePrimary, useAdminSession } from './Overview';
import {
  AccountingExportPanel, CompanyDetailsPanel, GROUP_DESCRIPTIONS, OperatorSettingsPanel, groupSlug, parseValue, toText,
  type ControlEntry, type OperatorField, type SettingRow,
} from './Settings';

const BACK_TO = '/admin/settings';

function AdvancedSettings({ settings, definitions, controlMap, mayWrite, onSaved }: { settings: Record<string, unknown>; definitions: OperatorField[]; controlMap: ControlEntry[]; mayWrite: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [removing, setRemoving] = useState<SettingRow | null>(null);
  const [nextId, setNextId] = useState(1);
  const state = { loading: false, error: null as Error | null, reload: onSaved };
  const generalKeys = new Set(controlMap.filter((entry) => entry.general).map((entry) => entry.key));
  const editableKeys = controlMap.filter((entry) => entry.general && !definitions.some((definition) => definition.key === entry.key));
  const structuredSettingKeys = new Set(definitions.map((definition) => definition.key));
  const operatorGroups = [...new Set(definitions.filter((definition) => definition.group !== 'Company & tax').map((definition) => definition.group))].map((title) => ({
    title,
    description: GROUP_DESCRIPTIONS[title] ?? 'Operator-owned configuration used by the platform.',
    fields: definitions.filter((definition) => definition.group === title),
  }));

  useEffect(() => {
    if (!settings) return;
    // The keys that start with "internal." belong to the platform itself: the
    // counter of the order numbers lives there. They are not a setting a
    // person edits, so they are not shown.
    const loaded = Object.entries(settings)
      .filter(([key]) => !key.startsWith('internal.'))
      .filter(([key]) => !structuredSettingKeys.has(key))
      .filter(([key]) => generalKeys.size === 0 || generalKeys.has(key))
      .map(([key, value], index) => ({
        id: index + 1,
        key,
        valueText: toText(value),
        original: value,
      }));
    setRows(loaded);
    setNextId(loaded.length + 1);
  }, [settings]);

  const save = useAction(async (payload: Record<string, unknown>) => {
    return put<{ settings: Record<string, unknown> }>('/admin/settings', payload);
  });

  const addRow = () => {
    setRows((current) => [...current, { id: nextId, key: '', valueText: '', original: undefined }]);
    setNextId((current) => current + 1);
  };

  const removeRow = (row: SettingRow) => {
    // A key the API already stores cannot be deleted through this API, so the
    // operator confirms first.
    if (row.original !== undefined) {
      setRemoving(row);
      return;
    }
    setRows((current) => current.filter((entry) => entry.id !== row.id));
  };

  const remove = useAction(async (key: string) => del(`/admin/settings/${encodeURIComponent(key)}`));

  const confirmRemove = async () => {
    if (!removing) return;
    if (removing.original !== undefined) {
      const result = await remove.run(removing.key);
      if (!result) return;
    }
    setRows((current) => current.filter((entry) => entry.id !== removing.id));
    setRemoving(null);
    toast.push('Setting removed.', 'ok');
    state.reload();
  };

  const submit = async () => {
    const payload: Record<string, unknown> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (!key) continue;
      payload[key] = parseValue(row);
    }
    const result = await save.run(payload);
    if (!result) return;
    toast.push('Settings saved', 'ok');
    state.reload();
  };
  return (
    <>
      <LiveRegion message={`${rows.length} setting${rows.length === 1 ? '' : 's'}`} />
      <Panel
        title="Settings"
        description="Advanced feature flags and provider switches that do not have a dedicated control above. Security rules and internal counters are deliberately unavailable here."
        actionBelow
        action={
          mayWrite ? (
            <button type="button" onClick={addRow} className={denseGhost}>
              Add a setting
            </button>
          ) : undefined
        }
      >
        <div className="grid gap-3">
          {state.loading ? (
            <LoadingBlock rows={3} label="Loading the settings" />
          ) : state.error ? (
            <ErrorState title="The settings could not be loaded" message={state.error.message} onRetry={state.reload} />
          ) : !rows.length ? (
            <EmptyState title="No settings stored." description="Add one to configure the platform." />
          ) : (
            <div className="grid gap-2.5">
              {rows.map((row) => (
                <div key={row.id} className="grid gap-2 rounded-2xl bg-s2 p-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] sm:items-end">
                  <Field label="Key" htmlFor={`setting-key-${row.id}`}>
                    <input
                      id={`setting-key-${row.id}`}
                      type="text"
                      autoComplete="off"
                      value={row.key}
                      disabled={!mayWrite}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((entry) => (entry.id === row.id ? { ...entry, key: event.target.value } : entry)),
                        )
                      }
                      placeholder="capacity.node_cores"
                      list="registered-setting-keys"
                      className={denseInput}
                    />
                  </Field>
                  <Field label="Value" htmlFor={`setting-value-${row.id}`} hint="JSON when it parses, plain text otherwise.">
                    <input
                      id={`setting-value-${row.id}`}
                      type="text"
                      autoComplete="off"
                      value={row.valueText}
                      disabled={!mayWrite}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((entry) => (entry.id === row.id ? { ...entry, valueText: event.target.value } : entry)),
                        )
                      }
                      placeholder="true"
                      className={denseInput}
                    />
                  </Field>
                  {mayWrite && (
                    <button
                      type="button"
                      onClick={() => removeRow(row)}
                      aria-label={`Remove ${row.key || 'this setting'}`}
                      className={denseDanger}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {mayWrite && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={submit} disabled={save.pending} className={densePrimary}>
                {save.pending ? 'Saving…' : 'Save settings'}
              </button>
              <button type="button" onClick={addRow} className={denseGhost}>
                Add a setting
              </button>
            </div>
          )}

          {!mayWrite && (
            <p className="px-1 text-[13px] text-ink3">
              Your role does not hold &quot;settings.write&quot;, so the settings are read-only for you.
            </p>
          )}

          {save.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
              {save.error}
            </p>
          )}
        </div>
      </Panel>
      <datalist id="registered-setting-keys">
        {editableKeys.map((entry) => <option key={entry.key} value={entry.key} />)}
      </datalist>
      <Panel title="Who owns each setting" description="Every stored key has one owner. A key with its own page is changed there; the general settings never write it.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-ink3"><tr><th className="py-2 pr-3 font-medium">Key</th><th className="py-2 pr-3 font-medium">Domain</th><th className="py-2 pr-3 font-medium">Changed with</th><th className="py-2 font-medium">Where</th></tr></thead>
            <tbody>
              {controlMap.filter((entry) => !definitions.some((definition) => definition.key === entry.key)).map((entry) => (
                <tr key={entry.key} className="border-t border-line/60">
                  <td className="py-2 pr-3 font-mono text-[12px] text-ink">{entry.key}</td>
                  <td className="py-2 pr-3 text-ink2">{entry.domain}</td>
                  <td className="py-2 pr-3 text-ink2">{entry.write ?? 'the platform'}</td>
                  <td className="py-2 text-ink2">{entry.general ? 'This page' : (entry.managedBy ?? 'the platform')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.key ?? ''}`}
        description={
          removing
            ? `Remove ${removing.key} from the platform settings? Code defaults will apply wherever this key is optional.`
            : undefined
        }
        confirmLabel="Remove the row"
        requireText={removing?.key}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}

/** One group of the platform settings on its own page: company and tax, an operator group, or the advanced keys. */
export default function SettingsEdit() {
  const { section = '' } = useParams();
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'settings.write');
  const state = useAsync((signal) => get<{ settings: Record<string, unknown>; definitions: OperatorField[]; controlMap?: ControlEntry[] }>('/admin/settings', undefined, signal), []);
  const definitions = state.data?.definitions ?? [];
  const groups = [...new Set(definitions.filter((definition) => definition.group !== 'Company & tax').map((definition) => definition.group))].map((title) => ({
    title,
    description: GROUP_DESCRIPTIONS[title] ?? 'Operator-owned configuration used by the platform.',
    fields: definitions.filter((definition) => definition.group === title),
  }));
  const group = groups.find((entry) => groupSlug(entry.title) === section);
  const title = section === 'company' ? 'Company & tax' : section === 'advanced' ? 'Advanced settings' : group?.title ?? 'Settings';
  const settings = state.data?.settings;
  return (
    <PageEditorShell eyebrow="Settings" title={title} description="Each group is saved on its own and written to the audit log." backTo={BACK_TO} backLabel="Back to settings" actions={null}>
      {(session.loading || state.loading) && !state.data ? <LoadingBlock rows={3} label="Loading the settings" />
        : state.error || !settings ? <ErrorState title="The settings could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />
        : section === 'company' ? <div className="grid gap-4"><CompanyDetailsPanel settings={settings} mayWrite={mayWrite} onSaved={state.reload} /><AccountingExportPanel /></div>
        : section === 'advanced' ? <AdvancedSettings settings={settings} definitions={definitions} controlMap={state.data?.controlMap ?? []} mayWrite={mayWrite} onSaved={state.reload} />
        : group ? <OperatorSettingsPanel group={group} settings={settings} mayWrite={mayWrite} onSaved={state.reload} />
        : <EmptyState title="No such settings group." description="Pick one from the settings page." />}
    </PageEditorShell>
  );
}
