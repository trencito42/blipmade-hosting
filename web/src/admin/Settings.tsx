import { useEffect, useState } from 'react';
import { get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { ConfirmDialog, EmptyState, ErrorState, Field, LoadingBlock, Panel, useToast } from '../ui-app';
import { StaffSecurity } from './StaffSecurity';
import { LiveRegion, can, denseDanger, denseGhost, denseInput, densePrimary, useAdminSession } from './Overview';

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


const COMPANY_FIELDS = [
  { key: 'billing.company_name', label: 'Company name', placeholder: 'Your company SRL', hint: 'Written on every invoice as the seller.' },
  { key: 'billing.company_registration', label: 'Registration number', placeholder: 'J40/1234/2026', hint: 'The number under which the company is registered.' },
  { key: 'billing.tax_id', label: 'Tax ID (CUI / VAT number)', placeholder: 'RO12345678', hint: 'Without it no tax is added to the invoices the platform writes.' },
  { key: 'billing.tax_rate', label: 'Tax rate (%)', placeholder: '21', hint: 'A number, for example 21. Without it no tax is added.' },
  { key: 'billing.billing_address', label: 'Company address', placeholder: 'Street, city, county, country', hint: 'Written in the header of the invoice.' },
  { key: 'billing.support_email', label: 'Support email', placeholder: 'support@yourcompany.com', hint: 'Where customers send questions about invoices.' },
] as const;

/**
 * The details of the company that sells the service. They are written on the invoices, and the tax is added only when
 * the tax ID and the rate are both here. The platform never writes any of them by itself: they come from the operator.
 */
function CompanyDetailsPanel({ settings, mayWrite, onSaved }: { settings: Record<string, unknown>; mayWrite: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    setValues(Object.fromEntries(COMPANY_FIELDS.map((field) => [field.key, toText(settings[field.key])])));
  }, [settings]);
  const save = useAction(async () => {
    const rate = (values['billing.tax_rate'] ?? '').trim().replace(',', '.');
    if (rate !== '' && (!Number.isFinite(Number(rate)) || Number(rate) < 0 || Number(rate) > 100)) {
      throw new Error('The tax rate is a number between 0 and 100.');
    }
    const payload: Record<string, string> = {};
    for (const field of COMPANY_FIELDS) payload[field.key] = field.key === 'billing.tax_rate' ? rate : (values[field.key] ?? '').trim();
    await put('/admin/settings', payload);
    toast.push('The company details were saved.', 'ok');
    onSaved();
  });
  return (
    <Panel title="Company and tax" description="Who sells the service and which tax is added to the invoices. These details come from you: nothing is filled in by the platform.">
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {COMPANY_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} htmlFor={`company-${field.key}`} hint={field.hint}>
              <input
                id={`company-${field.key}`}
                type="text"
                autoComplete="off"
                value={values[field.key] ?? ''}
                disabled={!mayWrite}
                placeholder={field.placeholder}
                onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                className={denseInput}
              />
            </Field>
          ))}
        </div>
        {save.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{save.error}</p>}
        {mayWrite && (
          <div>
            <button type="button" className={densePrimary} disabled={save.pending} onClick={() => void save.run()}>{save.pending ? 'Saving…' : 'Save the company details'}</button>
          </div>
        )}
      </div>
    </Panel>
  );
}

export default function Settings() {
  const session = useAdminSession();
  const staff = session.staff;
  const toast = useToast();
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [removing, setRemoving] = useState<SettingRow | null>(null);
  const [nextId, setNextId] = useState(1);

  const state = useAsync((signal) => get<{ settings: Record<string, unknown> }>('/admin/settings', undefined, signal), []);
  const mayWrite = can(staff, 'settings.write');

  useEffect(() => {
    if (!state.data?.settings) return;
    // The keys that start with "internal." belong to the platform itself: the
    // counter of the order numbers lives there. They are not a setting a
    // person edits, so they are not shown.
    const loaded = Object.entries(state.data.settings)
      .filter(([key]) => !key.startsWith('internal.'))
      .map(([key, value], index) => ({
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

  if (session.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={3} label="Loading your permissions" />
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="grid gap-4">
        <ErrorState title="The session could not be read" message={session.error} onRetry={session.reload} />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <StaffSecurity mayWrite={can(session.staff, 'settings.write')} />
      {state.data && <CompanyDetailsPanel settings={state.data.settings} mayWrite={mayWrite} onSaved={state.reload} />}
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
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
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
