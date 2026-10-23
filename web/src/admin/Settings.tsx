import { useEffect, useState } from 'react';
import { get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { ConfirmDialog, EmptyState, ErrorState, Field, LoadingBlock, Panel, useToast } from '../ui-app';
import { LiveRegion, can, denseDanger, denseGhost, denseInput, densePrimary, useStaffUser } from './Overview';

/**
 * System settings — GET /api/admin/settings, PUT /api/admin/settings
 *
 * The API stores an arbitrary key and value object and has no delete call, so
 * removing a stored key only hides it from this form. The confirmation says
 * exactly that.
 */

interface SettingRow {
  id: number;
  key: string;
  valueText: string;
  original: unknown;
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  return JSON.stringify(value);
}

/** Keeps the stored value unless the text was actually edited. */
function parseValue(row: SettingRow): unknown {
  if (row.valueText === toText(row.original)) return row.original;
  try {
    return JSON.parse(row.valueText);
  } catch {
    return row.valueText;
  }
}

export default function Settings() {
  const staff = useStaffUser();
  const toast = useToast();
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [removing, setRemoving] = useState<SettingRow | null>(null);
  const [nextId, setNextId] = useState(1);

  const state = useAsync((signal) => get<{ settings: Record<string, unknown> }>('/admin/settings', undefined, signal), []);
  const mayWrite = can(staff, 'settings.write');

  useEffect(() => {
    if (!state.data?.settings) return;
    const loaded = Object.entries(state.data.settings).map(([key, value], index) => ({
      id: index + 1,
      key,
      valueText: toText(value),
      original: value,
    }));
    setRows(loaded);
    setNextId(loaded.length + 1);
  }, [state.data]);

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

  const confirmRemove = () => {
    if (!removing) return;
    setRows((current) => current.filter((entry) => entry.id !== removing.id));
    setRemoving(null);
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
    <div className="grid gap-4">
      <LiveRegion message={`${rows.length} setting${rows.length === 1 ? '' : 's'}`} />
      <Panel
        title="Settings"
        description="Feature flags and provider switches. The API stores a free key and value object."
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
                      placeholder="providersEnabled"
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
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
              {save.error}
            </p>
          )}
        </div>
      </Panel>

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.key ?? ''}`}
        description={
          removing
            ? `The API stores settings and has no delete call. Removing the row hides ${removing.key} from this form, but the key stays on the server until it is changed there.`
            : undefined
        }
        confirmLabel="Remove the row"
        requireText={removing?.key}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
