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

export function BillingAddressFields({ value, onChange }: { value: BillingAddressValue; onChange: (value: BillingAddressValue) => void }) {
  const field = (key: keyof BillingAddressValue) => (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: event.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextInput label="Full name" value={value.fullName} onChange={field('fullName')} autoComplete="name" />
      <TextInput label="Company (optional)" value={value.companyName} onChange={field('companyName')} autoComplete="organization" />
      <div className="sm:col-span-2"><TextInput label="Address line 1" value={value.line1} onChange={field('line1')} autoComplete="address-line1" /></div>
      <div className="sm:col-span-2"><TextInput label="Address line 2 (optional)" value={value.line2} onChange={field('line2')} autoComplete="address-line2" /></div>
      <TextInput label="City" value={value.city} onChange={field('city')} autoComplete="address-level2" />
      <TextInput label="Region (optional)" value={value.region} onChange={field('region')} autoComplete="address-level1" />
      <TextInput label="Postal code" value={value.postalCode} onChange={field('postalCode')} autoComplete="postal-code" />
      <TextInput label="Country code" value={value.country} onChange={field('country')} placeholder="RO" autoComplete="country" />
      <div className="sm:col-span-2"><TextInput label="VAT / tax ID (optional)" value={value.taxId} onChange={field('taxId')} /></div>
    </div>
  );
}
