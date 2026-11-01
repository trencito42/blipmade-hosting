import { z } from 'zod';

export type OperatorSettingDefinition = {
  key: string;
  group: string;
  label: string;
  hint: string;
  placeholder: string;
  multiline?: boolean;
  public?: boolean;
  format?: 'email' | 'text' | 'number';
};

/**
 * The registry of operator-owned configuration.
 *
 * A setting is added here before it is exposed in the admin area. This keeps
 * its UI, validation and public visibility in one place. Credentials,
 * internal counters and security invariants deliberately never enter this
 * registry.
 */
export const OPERATOR_SETTINGS: OperatorSettingDefinition[] = [
  { key: 'billing.company_name', group: 'Company & tax', label: 'Company name', placeholder: 'Your company SRL', hint: 'Written on invoices and public legal pages.', public: true },
  { key: 'billing.company_registration', group: 'Company & tax', label: 'Registration number', placeholder: 'J40/1234/2026', hint: 'The number under which the company is registered.', public: true },
  { key: 'billing.tax_id', group: 'Company & tax', label: 'Tax ID', placeholder: 'RO12345678', hint: 'CUI or VAT identifier.', public: true },
  { key: 'billing.tax_rate', group: 'Company & tax', label: 'Tax rate', placeholder: '21', hint: 'Percentage used by quotes and invoices.', format: 'number' },
  { key: 'billing.billing_address', group: 'Company & tax', label: 'Company address', placeholder: 'Street, city, county, country', hint: 'Invoice and registered address.', multiline: true, public: true },
  { key: 'billing.support_email', group: 'Company & tax', label: 'Billing/support email', placeholder: 'support@example.com', hint: 'Customer questions about invoices and service.', format: 'email', public: true },
  { key: 'legal.contact_email', group: 'Public contacts', label: 'Legal contact', placeholder: 'legal@example.com', hint: 'Terms, notices and legal questions.', format: 'email', public: true },
  { key: 'contact.privacy_email', group: 'Public contacts', label: 'Privacy contact', placeholder: 'privacy@example.com', hint: 'Personal-data requests.', format: 'email', public: true },
  { key: 'contact.cookies_email', group: 'Public contacts', label: 'Cookies contact', placeholder: 'privacy@example.com', hint: 'Questions about cookies.', format: 'email', public: true },
  { key: 'contact.abuse_email', group: 'Public contacts', label: 'Abuse contact', placeholder: 'abuse@example.com', hint: 'Reports about prohibited use.', format: 'email', public: true },
  { key: 'contact.sla_email', group: 'Public contacts', label: 'Service contact', placeholder: 'support@example.com', hint: 'Contact printed in the service-level page.', format: 'email', public: true },
  { key: 'legal.governing_law', group: 'Legal decisions', label: 'Governing law and courts', placeholder: 'Romanian law; competent courts of …', hint: 'Law and jurisdiction of the customer agreement.', multiline: true, public: true },
  { key: 'legal.notice_address', group: 'Legal decisions', label: 'Postal address for notices', placeholder: 'Full postal address', hint: 'Falls back to the company address.', multiline: true, public: true },
  { key: 'legal.liability_cap', group: 'Legal decisions', label: 'Liability cap', placeholder: 'Amount, period and exclusions', hint: 'Use legally reviewed wording.', multiline: true, public: true },
  { key: 'legal.indemnity', group: 'Legal decisions', label: 'Indemnity', placeholder: 'When the operator indemnifies a customer', hint: 'The complete rule.', multiline: true, public: true },
  { key: 'privacy.legal_bases', group: 'Privacy policy', label: 'Legal bases', placeholder: 'Contract for …; legitimate interest for …; consent for …', hint: 'Map purposes to their legal bases.', multiline: true, public: true },
  { key: 'privacy.subprocessors', group: 'Privacy policy', label: 'Other subprocessors', placeholder: 'Provider — purpose — country', hint: 'Providers not already named by the policy.', multiline: true, public: true },
  { key: 'privacy.retention', group: 'Privacy policy', label: 'Retention periods', placeholder: 'Orders …; invoices …; audit logs …', hint: 'Actual retention for each record.', multiline: true, public: true },
  { key: 'privacy.authority', group: 'Privacy policy', label: 'Data protection authority', placeholder: 'Authority name and website', hint: 'Authority customers can complain to.', public: true },
  { key: 'privacy.hosting_region', group: 'Privacy policy', label: 'Hosting region', placeholder: 'European Union — Germany', hint: 'Where customer data is hosted.', public: true },
  { key: 'privacy.minimum_age', group: 'Privacy policy', label: 'Minimum account age', placeholder: '18', hint: 'Number or complete parental-consent rule.', public: true },
  { key: 'refund.processing_time', group: 'Refund policy', label: 'Processing time', placeholder: 'Usually 5–10 business days', hint: 'Time for an approved refund to arrive.', public: true },
  { key: 'refund.window', group: 'Refund policy', label: 'Request window', placeholder: 'Within … days of payment', hint: 'When a refund can be requested.', public: true },
  { key: 'refund.exclusions', group: 'Refund policy', label: 'Exclusions', placeholder: 'Cases that are not refundable', hint: 'Complete list of exclusions.', multiline: true, public: true },
  { key: 'sla.availability', group: 'Service commitments', label: 'Availability and service credit', placeholder: 'Target and exact credit rule', hint: 'Leave empty when no numerical promise is made.', multiline: true, public: true },
  { key: 'sla.response_time', group: 'Service commitments', label: 'Support response commitment', placeholder: 'Priority and response-time table', hint: 'A commitment, not an internal goal.', multiline: true, public: true },
  { key: 'sla.maintenance_window', group: 'Service commitments', label: 'Maintenance window and notice', placeholder: 'Window, timezone and advance notice', hint: 'Planned maintenance policy.', multiline: true, public: true },
];

const byKey = new Map(OPERATOR_SETTINGS.map((definition) => [definition.key, definition]));
export const PUBLIC_OPERATOR_SETTING_KEYS = OPERATOR_SETTINGS.filter((definition) => definition.public).map((definition) => definition.key);

/** Validate a registered operator value; unregistered advanced keys remain JSON. */
export function validateOperatorSetting(key: string, value: unknown): unknown {
  const definition = byKey.get(key);
  if (!definition) return value;
  if (definition.format === 'number') {
    const text = z.union([z.string(), z.number()]).parse(value);
    const normalized = String(text).trim().replace(',', '.');
    if (!normalized) return '';
    const number = Number(normalized);
    if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error(`${definition.label} must be between 0 and 100.`);
    return String(number);
  }
  const text = z.string().trim().max(5000).parse(value);
  if (definition.format === 'email' && text) return z.string().email().parse(text);
  return text;
}
