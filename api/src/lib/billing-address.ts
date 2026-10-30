import { z } from 'zod';

/** Billing details saved on an account and copied onto each new invoice. */
export const billingAddressSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(120).default(''),
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).default(''),
  city: z.string().trim().min(2).max(100),
  region: z.string().trim().max(100).default(''),
  postalCode: z.string().trim().min(2).max(30),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Country code must be two letters, for example RO.'),
  taxId: z.string().trim().max(50).default(''),
});

export type BillingAddress = z.infer<typeof billingAddressSchema>;
