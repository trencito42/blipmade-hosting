import { useEffect, useState } from 'react';
import { get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { ButtonLink, ErrorState, Field, LoadingBlock, Panel, useToast } from '../ui-app';
import { StaffSecurity } from './StaffSecurity';
import { can, denseGhost, denseInput, densePrimary, useAdminSession } from './Overview';

/**
 * System settings — GET /api/admin/settings, PUT /api/admin/settings
 *
 * The API stores an arbitrary key and value object and has no delete call, so
 * removing a stored key only hides it from this form. The confirmation says
 * exactly that.
 */

export type ControlEntry = { key: string; domain: string; read: string; write: string | null; general: boolean; managedBy: string | null; effect: string };

export const groupSlug = (title: string) => title.toLowerCase().replaceAll(' ', '-');

export interface SettingRow {
  id: number;
  key: string;
  valueText: string;
  original: unknown;
}

export function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  return JSON.stringify(value);
}

/** Keeps the stored value unless the text was actually edited. */
export function parseValue(row: SettingRow): unknown {
  if (row.valueText === toText(row.original)) return row.original;
  try {
    return JSON.parse(row.valueText);
  } catch {
    return row.valueText;
  }
}


export const COMPANY_FIELDS = [
  { key: 'billing.company_name', label: 'Company name', placeholder: 'Your company SRL', hint: 'Written on every invoice as the seller.' },
  { key: 'billing.company_registration', label: 'Registration number', placeholder: 'J40/1234/2026', hint: 'The number under which the company is registered.' },
  { key: 'billing.tax_id', label: 'Tax ID (CUI / VAT number)', placeholder: 'RO12345678', hint: 'Without it no tax is added to the invoices the platform writes.' },
  { key: 'billing.tax_rate', label: 'Tax rate (%)', placeholder: '21', hint: 'A number, for example 21. Without it no tax is added.' },
  { key: 'billing.billing_address', label: 'Company address', placeholder: 'Street, city, county, country', hint: 'Written in the header of the invoice.' },
  { key: 'billing.support_email', label: 'Support email', placeholder: 'support@yourcompany.com', hint: 'Where customers send questions about invoices.' },
] as const;

export type OperatorField = { key: string; group: string; label: string; placeholder: string; hint: string; multiline?: boolean; public?: boolean; format?: string };
export type OperatorGroup = { title: string; description: string; fields: OperatorField[] };
export const GROUP_DESCRIPTIONS: Record<string, string> = {
  'Public contacts': 'Addresses published to customers. They may be separate mailboxes or aliases that reach the same team.',
  'Legal decisions': 'Jurisdiction and risk terms used in the Terms of service. Have the final wording reviewed for your company.',
  'Privacy policy': 'Facts used by the public privacy policy. They should describe the infrastructure and retention you actually operate.',
  'Refund policy': 'Customer-facing refund timing and eligibility. Provider processing time is not the same as your request window.',
  'Service commitments': 'Leave these empty if you make no numerical SLA promise.',
};

const CONTROL_AREAS = [
  ['/admin/products', 'Catalog', 'Products, visibility, deployability, resources and product-specific fields.'],
  ['/admin/pricing', 'Pricing', 'Resource rates, product prices and billing periods.'],
  ['/admin/promotions', 'Promotions', 'Campaign windows, eligibility, limits and redemption controls.'],
  ['/admin/infrastructure', 'Infrastructure', 'Nodes, capacity, runtime templates and synchronization.'],
  ['/admin/incidents', 'Incidents & announcements', 'Public incidents, maintenance notices and customer banners.'],
  ['/admin/mail/plans', 'Mail plans', 'Hosted-mail limits, quotas and plan prices.'],
  ['/admin/email-templates', 'Email wording', 'Preview the transactional templates customers receive.'],
  ['/admin/notifications', 'Email & notifications', 'Delivery health, categories, preferences and failed events.'],
  ['/admin/staff', 'Staff & permissions', 'Roles and the exact actions each operator may perform.'],
  ['/admin/settings/integrations', 'Integrations', 'OAuth providers, GitHub App health, Discord community sync and role mappings.'],
] as const;

/**
 * The details of the company that sells the service. They are written on the invoices, and the tax is added only when
 * the tax ID and the rate are both here. The platform never writes any of them by itself: they come from the operator.
 */
export function AccountingExportPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const bad = !from || !to || to < from;
  return (
    <Panel title="Accounting export" description="Every invoice of a period as a spreadsheet: number, date, customer, country, net, tax and total. Give it to your accountant or load it in your accounting program.">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From" htmlFor="acct-from">
          <input id="acct-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={denseInput} />
        </Field>
        <Field label="To" htmlFor="acct-to">
          <input id="acct-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className={denseInput} />
        </Field>
        <a
          className={`${densePrimary} ${bad ? 'pointer-events-none opacity-50' : ''}`}
          href={bad ? undefined : `/api/admin/accounting/invoices.csv?from=${from}&to=${to}`}
          download
        >
          Download CSV
        </a>
      </div>
    </Panel>
  );
}

export function CompanyDetailsPanel({ settings, mayWrite, onSaved }: { settings: Record<string, unknown>; mayWrite: boolean; onSaved: () => void }) {
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

export function OperatorSettingsPanel({ group, settings, mayWrite, onSaved }: { group: OperatorGroup; settings: Record<string, unknown>; mayWrite: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => setValues(Object.fromEntries(group.fields.map((field) => [field.key, toText(settings[field.key])]))), [group, settings]);
  const save = useAction(async () => {
    await put('/admin/settings', Object.fromEntries(group.fields.map((field) => [field.key, (values[field.key] ?? '').trim()])));
    toast.push(`${group.title} saved.`, 'ok');
    onSaved();
    return true;
  });
  return (
    <Panel title={group.title} description={group.description}>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {group.fields.map((field) => (
            <Field key={field.key} label={field.label} htmlFor={`operator-${field.key}`} hint={field.hint}>
              {field.multiline ? (
                <textarea id={`operator-${field.key}`} rows={3} value={values[field.key] ?? ''} disabled={!mayWrite} placeholder={field.placeholder} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} className={`${denseInput} min-h-24 resize-y`} />
              ) : (
                <input id={`operator-${field.key}`} type="text" autoComplete="off" value={values[field.key] ?? ''} disabled={!mayWrite} placeholder={field.placeholder} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} className={denseInput} />
              )}
            </Field>
          ))}
        </div>
        {save.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{save.error}</p>}
        {mayWrite && <div><button type="button" className={densePrimary} disabled={save.pending} onClick={() => void save.run()}>{save.pending ? 'Saving…' : `Save ${group.title.toLowerCase()}`}</button></div>}
      </div>
    </Panel>
  );
}

/** What a group holds now, read-only. The edit page changes it. */
function SettingsSummary({ title, description, fields, settings, editTo, mayWrite }: { title: string; description?: string; fields: { key: string; label: string }[]; settings: Record<string, unknown>; editTo: string; mayWrite: boolean }) {
  return (
    <Panel title={title} description={description} action={<ButtonLink to={editTo} variant="soft">{mayWrite ? 'Edit' : 'View'}</ButtonLink>}>
      <dl className="grid gap-3 text-[13.5px] sm:grid-cols-2">
        {fields.map((field) => {
          const value = toText(settings[field.key]).trim();
          return (
            <div key={field.key} className="min-w-0">
              <dt className="text-ink3">{field.label}</dt>
              <dd className={`mt-0.5 break-words ${value ? 'text-ink' : 'text-ink3'}`}>{value || 'Not set'}</dd>
            </div>
          );
        })}
      </dl>
    </Panel>
  );
}

export default function Settings() {
  const session = useAdminSession();
  const staff = session.staff;
  const toast = useToast();
  const [section, setSection] = useState('control-map');
  const state = useAsync((signal) => get<{ settings: Record<string, unknown>; definitions: OperatorField[]; controlMap?: ControlEntry[] }>('/admin/settings', undefined, signal), []);
  const mayWrite = can(staff, 'settings.write');
  const definitions = state.data?.definitions ?? [];
  const controlMap = state.data?.controlMap ?? [];
  // Only the keys the general endpoint may write are edited here. A key that
  // has its own page is listed below with the place where it is managed.
  const operatorGroups = [...new Set(definitions.filter((definition) => definition.group !== 'Company & tax').map((definition) => definition.group))].map((title) => ({
    title,
    description: GROUP_DESCRIPTIONS[title] ?? 'Operator-owned configuration used by the platform.',
    fields: definitions.filter((definition) => definition.group === title),
  }));

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
  const platformSettings = state.data?.settings;
  const publicDefinitions = definitions.filter((definition) => definition.public);
  const configuredPublic = publicDefinitions.filter((definition) => {
    const value = platformSettings?.[definition.key];
    return value !== undefined && value !== null && String(value).trim() !== '';
  }).length;
  const tabs = [
    ['control-map', 'Control map'],
    ['company', 'Company & tax'],
    ...operatorGroups.map((group) => [groupSlug(group.title), group.title]),
    ['staff-security', 'Staff security'],
    ['advanced', 'Advanced'],
  ] as const;

  return (
    <div className="grid gap-4">
      <Panel title="Configuration coverage" description="Business configuration comes from this registry. Empty public values stay visibly marked on the legal pages instead of silently falling back to invented text.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-ink2"><strong className="text-ink">{configuredPublic} of {publicDefinitions.length}</strong> public operator settings are complete.</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-s2 sm:w-56"><span className="block h-full rounded-full bg-acc" style={{ width: `${publicDefinitions.length ? (configuredPublic / publicDefinitions.length) * 100 : 0}%` }} /></div>
        </div>
      </Panel>
      <nav aria-label="Platform settings" className="-mx-1 overflow-x-auto px-1 no-scrollbar">
        <ul className="flex gap-1.5">
          {tabs.map(([id, label]) => (
            <li key={id} className="shrink-0">
              <button type="button" onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined} className={`${section === id ? densePrimary : denseGhost} whitespace-nowrap`}>{label}</button>
            </li>
          ))}
        </ul>
      </nav>
      {section === 'control-map' && (
        <Panel title="Where platform behaviour is configured" description="Use these controls instead of editing source files. Settings below hold global operator facts; product and operational configuration stays with the part of the platform it controls.">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {CONTROL_AREAS.map(([href, title, description]) => (
              <div key={href} className="grid content-between gap-3 rounded-2xl bg-s2 p-4">
                <div><p className="font-semibold text-ink">{title}</p><p className="mt-1 text-[13px] leading-relaxed text-ink2">{description}</p></div>
                <div><ButtonLink href={href} variant="soft">Open {title}</ButtonLink></div>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {section === 'staff-security' && <StaffSecurity mayWrite={can(session.staff, 'settings.write')} />}
      {section === 'company' && platformSettings && <SettingsSummary title="Company and tax" fields={COMPANY_FIELDS.map((field) => ({ key: field.key, label: field.label }))} settings={platformSettings} editTo="/admin/settings/company/edit" mayWrite={mayWrite} />}
      {platformSettings && operatorGroups.map((group) => section === groupSlug(group.title) ? <SettingsSummary key={group.title} title={group.title} description={group.description} fields={group.fields.map((field) => ({ key: field.key, label: field.label }))} settings={platformSettings} editTo={`/admin/settings/${groupSlug(group.title)}/edit`} mayWrite={mayWrite} /> : null)}
      {section === 'advanced' && (
        <Panel title="Advanced settings" description="Feature flags and provider switches that do not have a dedicated control. Security rules and internal counters are deliberately unavailable." action={<ButtonLink to="/admin/settings/advanced/edit" variant="soft">{mayWrite ? 'Edit' : 'View'}</ButtonLink>}>
          <p className="text-[13.5px] text-ink2">Who owns each key is listed on the edit page.</p>
        </Panel>
      )}
    </div>
  );
}
