import { useEffect, useState } from 'react';

/**
 * The marker of a value the operator still has to supply.
 *
 * Some statements of a legal page depend on a decision the operator has not
 * made yet: the legal name of the company, the country it is established in,
 * the address of the support, the length of a refund window. The platform
 * cannot know those values, and a page that invents one is worse than a page
 * that admits it is missing.
 *
 * Every such value is written with this marker. The marker is visible on the
 * page, so a reader knows the sentence is not final, and it is searchable in
 * the code, so the operator can find every one of them with a single search
 * for `TODO(operator)`.
 *
 * The text of the marker is passed in by the caller on purpose: the marker
 * itself has to be findable, and a single string inside this component would
 * be found once instead of once per value.
 */
export function OperatorPlaceholder({ label }: { label: string }) {
  const fact = factOf(label);
  const [settings, setSettings] = useState<PublicSettings | null>(cached);
  useEffect(() => { if (!settings) void loadSettings().then(setSettings); }, [settings]);
  const keys = SETTING_FOR_FACT[fact] ?? [];
  const value = keys.map((key) => settings?.[key]).find((candidate) => typeof candidate === 'string' ? candidate.trim() : candidate !== undefined && candidate !== null);
  if (value !== undefined && value !== null && String(value).trim()) {
    return <span data-operator-setting={keys[0]}>{String(value)}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-warn/12 px-1.5 py-0.5 align-middle font-mono text-[12px] font-medium leading-[1.45] text-warn">
      <span aria-hidden="true">⚑</span>
      {label}
    </span>
  );
}

type PublicSettings = Record<string, unknown>;
let cached: PublicSettings | null = null;
let loading: Promise<PublicSettings> | null = null;

const SETTING_FOR_FACT: Record<string, string[]> = {
  'the legal name of the operator': ['billing.company_name'],
  'the registered address of the operator': ['billing.billing_address'],
  'the company registration number': ['billing.company_registration'],
  'the VAT identifier': ['billing.tax_id'],
  'the governing law and the jurisdiction of the courts': ['legal.governing_law'],
  'the cap of our liability (the amount and the period it is limited to), and the claims that are excluded from it': ['legal.liability_cap'],
  'whether the operator indemnifies the customer, and against what': ['legal.indemnity'],
  'the email address for legal and support questions': ['legal.contact_email', 'billing.support_email'],
  'the postal address for notices': ['legal.notice_address', 'billing.billing_address'],
  'the email address for data questions': ['contact.privacy_email'],
  'the legal basis for each purpose (contract, legitimate interest, consent)': ['privacy.legal_bases'],
  'any other recipient or subprocessor the operator appoints': ['privacy.subprocessors'],
  'how long the orders, the invoices and the audit log are kept': ['privacy.retention'],
  'the data protection authority you can complain to': ['privacy.authority'],
  'the country or region where the data is hosted': ['privacy.hosting_region'],
  'the minimum age to open an account': ['privacy.minimum_age'],
  'the email address for questions about privacy and cookies': ['contact.cookies_email', 'contact.privacy_email'],
  'the email address for abuse reports': ['contact.abuse_email'],
  'the expected time for the money to appear, if the operator wants to state one': ['refund.processing_time'],
  'the period in which a refund can be asked for': ['refund.window'],
  'the cases in which no refund is given': ['refund.exclusions'],
  'the email address for billing questions': ['billing.support_email'],
  'the availability figure and the service credit, if any is to be offered': ['sla.availability'],
  'the response time for a support ticket, if one is to be committed to': ['sla.response_time'],
  'the email address for support': ['contact.sla_email', 'billing.support_email'],
  'the maintenance window and the notice given before it, if any is to be committed to': ['sla.maintenance_window'],
  'the support email address': ['billing.support_email'],
};

function factOf(label: string): string {
  return label.replace(/^TODO\(operator\):\s*/, '').trim();
}

function loadSettings(): Promise<PublicSettings> {
  if (cached) return Promise.resolve(cached);
  if (!loading) {
    loading = fetch('/api/platform/settings', { credentials: 'same-origin' })
      .then(async (response) => response.ok ? (await response.json() as { settings?: PublicSettings }).settings ?? {} : {})
      .catch(() => ({}))
      .then((settings) => (cached = settings));
  }
  return loading;
}
