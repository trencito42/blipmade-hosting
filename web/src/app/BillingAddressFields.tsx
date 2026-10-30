import { TextInput } from '../ui-app';

export interface BillingAddressValue {
  fullName: string;
  companyName: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  taxId: string;
}

export const emptyBillingAddress: BillingAddressValue = {
  fullName: '', companyName: '', line1: '', line2: '', city: '', region: '', postalCode: '', country: '', taxId: '',
};

/**
 * What is wrong with an address, field by field, with the same rules as the server. A field that
 * is empty or wrong is named, so the form can mark it before anything is sent.
 */
export function validateBillingAddress(value: BillingAddressValue): Partial<Record<keyof BillingAddressValue, string>> {
  const errors: Partial<Record<keyof BillingAddressValue, string>> = {};
  const need = (key: keyof BillingAddressValue, min: number, label: string, article = '') => {
    const text = value[key].trim();
    if (text.length === 0) errors[key] = `${label} is required.`;
    else if (text.length < min) errors[key] = `${label} needs at least ${min} characters.${article}`;
  };
  need('fullName', 2, 'Full name');
  need('line1', 3, 'Address line 1');
  need('city', 2, 'City');
  need('postalCode', 2, 'Postal code');
  const country = value.country.trim();
  if (country.length === 0) errors.country = 'Country code is required, for example RO.';
  else if (!/^[A-Za-z]{2}$/.test(country)) errors.country = 'Country code must be two letters, for example RO.';
  return errors;
}

export function BillingAddressFields({
  value,
  onChange,
  errors = {},
}: {
  value: BillingAddressValue;
  onChange: (value: BillingAddressValue) => void;
  /** The message of each field that is wrong, by the name of the field. */
  errors?: Partial<Record<string, string>>;
}) {
  const field = (key: keyof BillingAddressValue) => (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: event.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextInput label="Full name" value={value.fullName} onChange={field('fullName')} autoComplete="name" error={errors.fullName} />
      <TextInput label="Company (optional)" value={value.companyName} onChange={field('companyName')} autoComplete="organization" error={errors.companyName} />
      <div className="sm:col-span-2"><TextInput label="Address line 1" value={value.line1} onChange={field('line1')} autoComplete="address-line1" error={errors.line1} /></div>
      <div className="sm:col-span-2"><TextInput label="Address line 2 (optional)" value={value.line2} onChange={field('line2')} autoComplete="address-line2" error={errors.line2} /></div>
      <TextInput label="City" value={value.city} onChange={field('city')} autoComplete="address-level2" error={errors.city} />
      <TextInput label="Region (optional)" value={value.region} onChange={field('region')} autoComplete="address-level1" error={errors.region} />
      <TextInput label="Postal code" value={value.postalCode} onChange={field('postalCode')} autoComplete="postal-code" error={errors.postalCode} />
      <TextInput label="Country code" value={value.country} onChange={field('country')} placeholder="RO" autoComplete="country" error={errors.country} />
      <div className="sm:col-span-2"><TextInput label="VAT / tax ID (optional)" value={value.taxId} onChange={field('taxId')} error={errors.taxId} /></div>
    </div>
  );
}
